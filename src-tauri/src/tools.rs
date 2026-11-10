use std::{
    collections::{HashMap, HashSet},
    path::{Path, PathBuf},
    process::{ExitStatus, Stdio},
    sync::{Arc, atomic::AtomicBool},
    time::{Duration, Instant, SystemTime},
};

use tokio::{
    io::AsyncReadExt,
    process::{ChildStderr, Command},
    sync::Mutex,
    time::timeout,
};

pub mod install;
mod probe;
mod yt_dlp;

use probe::{ffmpeg_encoders, version};
pub use yt_dlp::YtDlpSource;
use yt_dlp::update_external_yt_dlp;

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Tool {
    YtDlp,
    Ffmpeg,
    Ffprobe,
    QuickJs,
}

impl Tool {
    const ALL: [Self; 4] = [Self::YtDlp, Self::Ffmpeg, Self::Ffprobe, Self::QuickJs];

    pub fn name(self) -> &'static str {
        match self {
            Self::YtDlp => "yt-dlp",
            Self::Ffmpeg => "ffmpeg",
            Self::Ffprobe => "ffprobe",
            Self::QuickJs => "qjs",
        }
    }
}

type ReleaseCache = HashMap<&'static str, (Instant, install::Release)>;

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum ToolSource {
    Path,
    Managed,
    Cache,
}

#[derive(Clone)]
pub struct ResolvedTool {
    pub path: PathBuf,
    pub version: String,
    pub source: ToolSource,
}

struct Probe {
    checked: Instant,
    modified: Option<SystemTime>,
    len: u64,
    version: Option<String>,
    encoders: Option<HashSet<String>>,
}

#[derive(Clone)]
pub struct Tools {
    search_dirs: Vec<PathBuf>,
    fallbacks: [Vec<PathBuf>; 4],
    managed: PathBuf,
    prefer_managed_yt_dlp: Arc<AtomicBool>,
    probes: Arc<[Mutex<HashMap<PathBuf, Probe>>; 4]>,
    install_lock: Arc<Mutex<()>>,
    releases: Arc<Mutex<ReleaseCache>>,
}

impl Tools {
    pub fn locate(legacy_root: &Path, managed: PathBuf) -> Self {
        let platform = match std::env::consts::OS {
            "macos" => "darwin",
            "windows" => "win32",
            os => os,
        };
        let arch = match std::env::consts::ARCH {
            "aarch64" => "arm64",
            "x86_64" => "x64",
            arch => arch,
        };
        let configured = std::env::var_os("YLOADER_TAURI_TOOLS_DIR")
            .map(PathBuf::from)
            .filter(|path| path.is_absolute());
        let legacy = legacy_root.join("tools");
        #[cfg(all(debug_assertions, not(test)))]
        let dev = Some(Path::new(env!("CARGO_MANIFEST_DIR")).join("../.tools"));
        #[cfg(not(all(debug_assertions, not(test))))]
        let dev: Option<PathBuf> = None;
        let ffmpeg = PathBuf::from("ffmpeg-bin")
            .join(format!("{platform}-{arch}"))
            .join("bin");
        let fallbacks = Tool::ALL.map(|tool| {
            let directory = match tool {
                Tool::YtDlp => Path::new("yt-dlp-bin"),
                Tool::Ffmpeg | Tool::Ffprobe => &ffmpeg,
                Tool::QuickJs => Path::new("quickjs-bin"),
            };
            configured
                .iter()
                .chain(std::iter::once(&legacy))
                .chain(dev.iter())
                .map(|root| root.join(directory).join(executable(tool)))
                .collect()
        });
        Self {
            search_dirs: search_dirs(),
            fallbacks,
            managed,
            prefer_managed_yt_dlp: Default::default(),
            probes: Default::default(),
            install_lock: Default::default(),
            releases: Default::default(),
        }
    }

    #[cfg(test)]
    pub fn set_search_dirs(&mut self, dirs: Vec<PathBuf>) {
        self.search_dirs = dirs;
    }

    pub async fn ensure(&self, tool: Tool) -> Result<PathBuf, ToolError> {
        self.ensure_with(tool, &[]).await
    }

    pub async fn ensure_ffmpeg(&self, encoders: &[&str]) -> Result<PathBuf, ToolError> {
        self.ensure_with(Tool::Ffmpeg, encoders).await
    }

    async fn ensure_with(&self, tool: Tool, encoders: &[&str]) -> Result<PathBuf, ToolError> {
        if let Some(found) = self.existing_with(tool, encoders).await {
            return Ok(found.path);
        }
        let _guard = self.install_lock.lock().await;
        if let Some(found) = self.existing_with(tool, encoders).await {
            return Ok(found.path);
        }
        let destination = self.managed.join(executable(tool));
        if !encoders.is_empty()
            && destination.is_file()
            && self.probes[tool as usize]
                .lock()
                .await
                .get(&destination)
                .is_some_and(|probe| probe.encoders.is_some())
        {
            return Err(ToolError::Failed);
        }
        self.install_locked(tool, false).await?;
        if encoders.is_empty() {
            return Ok(destination);
        }
        self.existing_with(tool, encoders)
            .await
            .map(|found| found.path)
            .ok_or(ToolError::Failed)
    }

    pub async fn existing(&self, tool: Tool) -> Option<ResolvedTool> {
        self.existing_with(tool, &[]).await
    }

    async fn existing_with(&self, tool: Tool, encoders: &[&str]) -> Option<ResolvedTool> {
        let managed_only = tool == Tool::YtDlp && self.yt_dlp_source() == YtDlpSource::Managed;
        self.probe_candidates(tool, encoders, managed_only).await
    }

    async fn probe_candidates(
        &self,
        tool: Tool,
        encoders: &[&str],
        managed_only: bool,
    ) -> Option<ResolvedTool> {
        let mut cached = self.probes[tool as usize].lock().await;
        let name = executable(tool);
        let path_candidates = || {
            self.search_dirs
                .iter()
                .map(|directory| (directory.join(&name), ToolSource::Path))
        };
        let mut candidates = Vec::new();
        if !managed_only && tool != Tool::QuickJs {
            candidates.extend(path_candidates());
        }
        candidates.push((self.managed.join(&name), ToolSource::Managed));
        if !managed_only {
            candidates.extend(
                self.fallbacks[tool as usize]
                    .iter()
                    .cloned()
                    .map(|path| (path, ToolSource::Cache)),
            );
            if tool == Tool::QuickJs {
                candidates.extend(path_candidates());
            }
        }
        for (path, source) in candidates {
            let Ok(metadata) = path.metadata() else {
                continue;
            };
            if !metadata.is_file() {
                continue;
            }
            let modified = metadata.modified().ok();
            let len = metadata.len();
            let known = cached.get(&path).is_some_and(|probe| {
                probe.checked.elapsed() < Duration::from_secs(30)
                    && probe.modified == modified
                    && probe.len == len
            });
            if !known {
                cached.insert(
                    path.clone(),
                    Probe {
                        checked: Instant::now(),
                        modified,
                        len,
                        version: version(tool, &path).await.ok(),
                        encoders: None,
                    },
                );
            }
            let probe = cached.get_mut(&path).expect("tool was probed");
            let Some(version) = &probe.version else {
                continue;
            };
            if !encoders.is_empty() {
                if probe.encoders.is_none() {
                    probe.encoders = Some(ffmpeg_encoders(&path).await.unwrap_or_default());
                }
                if !encoders.iter().all(|encoder| {
                    probe
                        .encoders
                        .as_ref()
                        .is_some_and(|available| available.contains(*encoder))
                }) {
                    continue;
                }
            }
            let source = if path.parent() == Some(self.managed.as_path()) {
                ToolSource::Managed
            } else {
                source
            };
            return Some(ResolvedTool {
                path,
                version: version.clone(),
                source,
            });
        }
        None
    }

    pub async fn update(
        &self,
        tool: Tool,
        automatic: bool,
    ) -> Result<Option<String>, &'static str> {
        let _guard = self.install_lock.lock().await;
        let source = self.existing(tool).await;
        if automatic
            && source
                .as_ref()
                .is_none_or(|found| found.source != ToolSource::Managed)
        {
            return Ok(None);
        }
        if let Some(found) = source.filter(|found| found.source == ToolSource::Path) {
            if tool != Tool::YtDlp {
                return Err("managed_externally");
            }
            let updated = update_external_yt_dlp(&found.path).await;
            self.probes[tool as usize].lock().await.remove(&found.path);
            return updated
                .map(|version| (version != found.version).then_some(version))
                .map_err(|_| "external_yt_dlp_update_failed");
        }
        self.install_locked(tool, true)
            .await
            .map(Some)
            .map_err(|_| "tool_update_failed")
    }

    pub fn installing(&self) -> bool {
        self.install_lock.try_lock().is_err()
    }

    pub async fn latest(&self, tool: Tool, force: bool) -> Result<install::Release, ToolError> {
        let (repo, _) = install::source(tool).ok_or(ToolError::Missing)?;
        let mut releases = self.releases.lock().await;
        if !force
            && let Some((fetched, release)) = releases.get(repo)
            && fetched.elapsed() < Duration::from_secs(10 * 60)
        {
            return Ok(release.clone());
        }
        let release = install::release(&install::client()?, repo).await?;
        releases.insert(repo, (Instant::now(), release.clone()));
        Ok(release)
    }

    async fn install_locked(&self, tool: Tool, explicit: bool) -> Result<String, ToolError> {
        let client = install::client()?;
        let release = self.latest(tool, explicit).await?;
        let destination = |tool: Tool| self.managed.join(executable(tool));
        if explicit
            && tool == Tool::Ffmpeg
            && !self
                .existing(Tool::Ffprobe)
                .await
                .is_some_and(|found| found.source == ToolSource::Path)
        {
            install::download(
                &client,
                Tool::Ffprobe,
                &release,
                &destination(Tool::Ffprobe),
            )
            .await?;
            self.probes[Tool::Ffprobe as usize]
                .lock()
                .await
                .remove(&destination(Tool::Ffprobe));
        }
        let path = destination(tool);
        install::download(&client, tool, &release, &path).await?;
        self.probes[tool as usize].lock().await.remove(&path);
        version(tool, &path).await
    }
}

fn executable(tool: Tool) -> String {
    format!("{}{}", tool.name(), std::env::consts::EXE_SUFFIX)
}

fn search_dirs() -> Vec<PathBuf> {
    std::env::var_os("PATH")
        .map(|directories| {
            std::env::split_paths(&directories)
                .filter(|dir| dir.is_absolute())
                .collect()
        })
        .unwrap_or_default()
}

pub fn available_path(path: PathBuf) -> Option<PathBuf> {
    if path.is_absolute() {
        return path.is_file().then_some(path);
    }
    search_dirs()
        .iter()
        .map(|dir| dir.join(&path))
        .find(|file| file.is_file())
}

#[derive(Debug)]
pub enum ToolError {
    Missing,
    Failed,
}

impl From<std::io::Error> for ToolError {
    fn from(error: std::io::Error) -> Self {
        if error.kind() == std::io::ErrorKind::NotFound {
            Self::Missing
        } else {
            Self::Failed
        }
    }
}

impl From<reqwest::Error> for ToolError {
    fn from(_: reqwest::Error) -> Self {
        Self::Failed
    }
}

pub fn command(path: &Path) -> Command {
    let mut command = Command::new(path);
    command
        .kill_on_drop(true)
        .stdin(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(windows)]
    command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    command
}

pub async fn capture(command: Command, seconds: u64, limit: u64) -> Result<Vec<u8>, ToolError> {
    let (status, output, _) = capture_output(command, seconds, limit).await?;
    if !status.success() {
        return Err(ToolError::Failed);
    }
    Ok(output)
}

pub async fn read_stderr(stderr: Option<ChildStderr>) -> std::io::Result<Vec<u8>> {
    let mut diagnostics = Vec::new();
    if let Some(mut stderr) = stderr {
        (&mut stderr)
            .take(64 * 1024)
            .read_to_end(&mut diagnostics)
            .await?;
        tokio::io::copy(&mut stderr, &mut tokio::io::sink()).await?;
    }
    Ok(diagnostics)
}

pub async fn capture_output(
    mut command: Command,
    seconds: u64,
    limit: u64,
) -> Result<(ExitStatus, Vec<u8>, Vec<u8>), ToolError> {
    timeout(Duration::from_secs(seconds), async {
        let mut child = command.stdout(Stdio::piped()).spawn()?;
        let mut stdout = child
            .stdout
            .take()
            .ok_or(ToolError::Failed)?
            .take(limit + 1);
        let mut output = Vec::new();
        let read_stdout = async {
            stdout.read_to_end(&mut output).await?;
            if output.len() as u64 > limit {
                return Err(std::io::Error::other("Media tool output exceeded limit"));
            }
            Ok(())
        };
        let (_, diagnostics) = tokio::try_join!(read_stdout, read_stderr(child.stderr.take()))?;
        Ok((child.wait().await?, output, diagnostics))
    })
    .await
    .map_err(|_| ToolError::Failed)?
}
