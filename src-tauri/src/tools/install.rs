use std::{path::Path, time::Duration};

use serde::Deserialize;
use sha2::{Digest, Sha256};
use tokio::io::AsyncWriteExt;

use super::{Tool, ToolError, version};

const MAX_BINARY_SIZE: u64 = 160 * 1024 * 1024;

#[derive(Clone, Deserialize)]
pub struct Release {
    pub tag_name: String,
    pub html_url: String,
    assets: Vec<Asset>,
}

#[derive(Clone, Deserialize)]
struct Asset {
    name: String,
    browser_download_url: String,
    digest: Option<String>,
    size: u64,
}

pub fn source(tool: Tool) -> Option<(&'static str, String)> {
    let os = std::env::consts::OS;
    let arch = std::env::consts::ARCH;
    let suffix = std::env::consts::EXE_SUFFIX;
    let (repo, asset) = match tool {
        Tool::YtDlp => (
            "yt-dlp/yt-dlp",
            match (os, arch) {
                ("macos", "x86_64" | "aarch64") => "yt-dlp_macos",
                ("windows", "x86_64") => "yt-dlp.exe",
                ("linux", "x86_64") => "yt-dlp_linux",
                ("linux", "aarch64") => "yt-dlp_linux_aarch64",
                _ => return None,
            }
            .to_owned(),
        ),
        Tool::Ffmpeg | Tool::Ffprobe => {
            let platform = match os {
                "macos" => "darwin",
                "windows" => "win32",
                "linux" => "linux",
                _ => return None,
            };
            let architecture = match arch {
                "aarch64" => "arm64",
                "x86_64" => "x64",
                _ => return None,
            };
            (
                "eugeneware/ffmpeg-static",
                format!("{}-{platform}-{architecture}", tool.name()),
            )
        }
        Tool::QuickJs => {
            let platform = match os {
                "macos" => "darwin",
                "windows" | "linux" => os,
                _ => return None,
            };
            let architecture = if os == "macos" && arch == "aarch64" {
                "arm64"
            } else {
                arch
            };
            (
                "quickjs-ng/quickjs",
                format!("qjs-{platform}-{architecture}{suffix}"),
            )
        }
    };
    Some((repo, asset))
}

pub fn client() -> Result<reqwest::Client, ToolError> {
    reqwest::Client::builder()
        .https_only(true)
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(180))
        .redirect(reqwest::redirect::Policy::limited(5))
        .user_agent("yLoader-Tauri")
        .build()
        .map_err(|_| ToolError::Failed)
}

pub async fn release(client: &reqwest::Client, repo: &str) -> Result<Release, ToolError> {
    let mut response = client
        .get(format!(
            "https://api.github.com/repos/{repo}/releases/latest"
        ))
        .send()
        .await?
        .error_for_status()?;
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await? {
        if bytes.len() + chunk.len() > 2 * 1024 * 1024 {
            return Err(ToolError::Failed);
        }
        bytes.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&bytes).map_err(|_| ToolError::Failed)
}

pub async fn download(
    client: &reqwest::Client,
    tool: Tool,
    release: &Release,
    destination: &Path,
) -> Result<(), ToolError> {
    let (repo, name) = source(tool).ok_or(ToolError::Missing)?;
    let asset = release
        .assets
        .iter()
        .find(|asset| asset.name == name)
        .ok_or(ToolError::Missing)?;
    let expected_url = format!(
        "https://github.com/{repo}/releases/download/{}/{name}",
        release.tag_name
    );
    let expected_hash = asset
        .digest
        .as_deref()
        .and_then(|digest| digest.strip_prefix("sha256:"))
        .filter(|digest| digest.len() == 64)
        .ok_or(ToolError::Failed)?;
    if asset.size == 0 || asset.size > MAX_BINARY_SIZE || asset.browser_download_url != expected_url
    {
        return Err(ToolError::Failed);
    }
    let mut response = client.get(expected_url).send().await?.error_for_status()?;
    let directory = destination.parent().ok_or(ToolError::Failed)?;
    tokio::fs::create_dir_all(directory).await?;
    let staged = tempfile::Builder::new()
        .suffix(std::env::consts::EXE_SUFFIX)
        .tempfile_in(directory)?;
    let mut output = tokio::fs::File::from_std(staged.reopen()?);
    let mut received = 0;
    let mut digest = Sha256::new();
    while let Some(chunk) = response.chunk().await? {
        received += chunk.len() as u64;
        if received > asset.size {
            return Err(ToolError::Failed);
        }
        digest.update(&chunk);
        output.write_all(&chunk).await?;
    }
    if received != asset.size || format!("{:x}", digest.finalize()) != expected_hash {
        return Err(ToolError::Failed);
    }
    output.flush().await?;
    drop(output);
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        staged
            .as_file()
            .set_permissions(std::fs::Permissions::from_mode(0o755))?;
    }
    let staged = staged.into_temp_path();
    version(tool, &staged).await?;
    staged.persist(destination).map_err(|_| ToolError::Failed)?;
    Ok(())
}
