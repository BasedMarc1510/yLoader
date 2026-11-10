use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    process::Stdio,
    sync::Arc,
    time::Duration,
    time::Instant,
};

use tokio::{io::AsyncReadExt, process::Command, time::timeout};

pub mod install;

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Tool {
    YtDlp,
    Ffmpeg,
    Ffprobe,
    QuickJs,
}

impl Tool {
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

#[derive(Clone)]
pub struct Tools {
    pub yt_dlp: PathBuf,
    pub ffmpeg: PathBuf,
    pub ffprobe: PathBuf,
    quickjs: PathBuf,
    managed: PathBuf,
    install_lock: Arc<tokio::sync::Mutex<()>>,
    releases: Arc<tokio::sync::Mutex<ReleaseCache>>,
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
        let locate = |directory: &Path, name: &str| {
            let executable = format!("{name}{}", std::env::consts::EXE_SUFFIX);
            configured
                .iter()
                .chain(std::iter::once(&legacy))
                .map(|root| root.join(directory).join(&executable))
                .find(|file| file.is_file())
                .unwrap_or_else(|| PathBuf::from(executable))
        };
        let ffmpeg = PathBuf::from("ffmpeg-bin")
            .join(format!("{platform}-{arch}"))
            .join("bin");
        Self {
            yt_dlp: locate(Path::new("yt-dlp-bin"), "yt-dlp"),
            ffmpeg: locate(&ffmpeg, "ffmpeg"),
            ffprobe: locate(&ffmpeg, "ffprobe"),
            quickjs: locate(Path::new("quickjs-bin"), "qjs"),
            managed,
            install_lock: Default::default(),
            releases: Default::default(),
        }
    }

    pub fn path(&self, tool: Tool) -> PathBuf {
        let managed = self
            .managed
            .join(format!("{}{}", tool.name(), std::env::consts::EXE_SUFFIX));
        if managed.is_file() {
            return managed;
        }
        match tool {
            Tool::YtDlp => &self.yt_dlp,
            Tool::Ffmpeg => &self.ffmpeg,
            Tool::Ffprobe => &self.ffprobe,
            Tool::QuickJs => &self.quickjs,
        }
        .clone()
    }

    pub fn managed(&self, path: &Path) -> bool {
        path.parent() == Some(self.managed.as_path())
    }

    pub async fn ensure(&self, tool: Tool) -> Result<PathBuf, ToolError> {
        let existing = self.path(tool);
        if let Some(path) = available_path(existing) {
            return Ok(path);
        }
        let _guard = self.install_lock.lock().await;
        if let Some(path) = available_path(self.path(tool)) {
            return Ok(path);
        }
        self.install_locked(tool, false).await?;
        Ok(self.path(tool))
    }

    pub async fn install(&self, tool: Tool) -> Result<String, ToolError> {
        let _guard = self.install_lock.lock().await;
        self.install_locked(tool, true).await
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
        let destination = |tool: Tool| {
            self.managed
                .join(format!("{}{}", tool.name(), std::env::consts::EXE_SUFFIX))
        };
        if explicit && tool == Tool::Ffmpeg {
            install::download(
                &client,
                Tool::Ffprobe,
                &release,
                &destination(Tool::Ffprobe),
            )
            .await?;
        }
        let path = destination(tool);
        install::download(&client, tool, &release, &path).await?;
        version(tool, &path).await
    }
}

pub fn available_path(path: PathBuf) -> Option<PathBuf> {
    if path.is_absolute() {
        return path.is_file().then_some(path);
    }
    std::env::var_os("PATH").and_then(|directories| {
        std::env::split_paths(&directories)
            .filter(|directory| directory.is_absolute())
            .map(|directory| directory.join(&path))
            .find(|file| file.is_file())
    })
}

pub async fn version(tool: Tool, path: &Path) -> Result<String, ToolError> {
    let mut cmd = command(path);
    if tool == Tool::QuickJs {
        cmd.args(["-e", "print('QuickJS')"]);
    } else {
        cmd.arg(if tool == Tool::YtDlp {
            "--version"
        } else {
            "-version"
        });
    }
    let output = capture(cmd, 20, 64 * 1024).await?;
    let text = std::str::from_utf8(&output).map_err(|_| ToolError::Failed)?;
    let line = text
        .lines()
        .next()
        .filter(|line| !line.is_empty())
        .ok_or(ToolError::Failed)?;
    if matches!(tool, Tool::Ffmpeg | Tool::Ffprobe) {
        return line
            .split_whitespace()
            .nth(2)
            .map(str::to_owned)
            .ok_or(ToolError::Failed);
    }
    Ok(line.trim().to_owned())
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

pub async fn capture(mut command: Command, seconds: u64, limit: u64) -> Result<Vec<u8>, ToolError> {
    timeout(Duration::from_secs(seconds), async {
        let mut child = command.stdout(Stdio::piped()).spawn()?;
        let mut stdout = child
            .stdout
            .take()
            .ok_or(ToolError::Failed)?
            .take(limit + 1);
        let mut output = Vec::new();
        stdout.read_to_end(&mut output).await?;
        if output.len() as u64 > limit || !child.wait().await?.success() {
            return Err(ToolError::Failed);
        }
        Ok(output)
    })
    .await
    .map_err(|_| ToolError::Failed)?
}
