use std::{collections::HashSet, path::Path};

use super::{Tool, ToolError, capture, command};

pub(super) async fn version(tool: Tool, path: &Path) -> Result<String, ToolError> {
    let mut cmd = command(path);
    match tool {
        Tool::YtDlp => cmd.args(["--ignore-config", "--version"]),
        Tool::QuickJs => cmd.args(["-e", "print('QuickJS')"]),
        Tool::Ffmpeg | Tool::Ffprobe => cmd.arg("-version"),
    };
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

pub(super) async fn ffmpeg_encoders(path: &Path) -> Result<HashSet<String>, ToolError> {
    let mut cmd = command(path);
    cmd.args(["-hide_banner", "-encoders"]);
    let output = capture(cmd, 20, 256 * 1024).await?;
    Ok(String::from_utf8_lossy(&output)
        .lines()
        .filter_map(|line| {
            let mut parts = line.split_whitespace();
            let flags = parts.next()?;
            if flags.len() == 6 && matches!(flags.as_bytes()[0], b'V' | b'A' | b'S') {
                parts.next().map(str::to_owned)
            } else {
                None
            }
        })
        .collect())
}
