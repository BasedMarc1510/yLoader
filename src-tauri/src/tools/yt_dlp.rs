use std::{
    path::{Path, PathBuf},
    process::Stdio,
    sync::atomic::Ordering,
    time::Duration,
};

use serde::{Deserialize, Serialize};
use tokio::time::timeout;

use super::{Tool, ToolError, Tools, command, version};

#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum YtDlpSource {
    #[default]
    Automatic,
    Managed,
}

impl Tools {
    pub fn yt_dlp_source(&self) -> YtDlpSource {
        if self.prefer_managed_yt_dlp.load(Ordering::Relaxed) {
            YtDlpSource::Managed
        } else {
            YtDlpSource::Automatic
        }
    }

    pub fn set_yt_dlp_source(&self, source: YtDlpSource) {
        self.prefer_managed_yt_dlp
            .store(source == YtDlpSource::Managed, Ordering::Relaxed);
    }

    pub async fn prepare_managed_yt_dlp(&self) -> Result<(), ToolError> {
        let _guard = self.install_lock.lock().await;
        if self
            .probe_candidates(Tool::YtDlp, &[], true)
            .await
            .is_none()
        {
            self.install_locked(Tool::YtDlp, false).await?;
        }
        Ok(())
    }
}

fn homebrew_for_yt_dlp(path: &Path) -> Option<PathBuf> {
    let resolved = path.canonicalize().ok()?;
    let cellar = resolved.ancestors().find_map(|dir| {
        let parent = dir.parent()?;
        (dir.file_name()? == "yt-dlp" && parent.file_name()? == "Cellar").then_some(parent)
    })?;
    let brew = cellar.parent()?.join("bin/brew");
    brew.is_file().then_some(brew)
}

pub(super) async fn update_external_yt_dlp(path: &Path) -> Result<String, ToolError> {
    let mut cmd = if let Some(brew) = homebrew_for_yt_dlp(path) {
        let mut cmd = command(&brew);
        cmd.args(["upgrade", "yt-dlp"]);
        cmd
    } else {
        let mut cmd = command(path);
        cmd.args(["--ignore-config", "--update"]);
        cmd
    };
    let status = timeout(Duration::from_secs(300), cmd.stdout(Stdio::null()).status())
        .await
        .map_err(|_| ToolError::Failed)??;
    if !status.success() {
        return Err(ToolError::Failed);
    }
    version(Tool::YtDlp, path).await
}
