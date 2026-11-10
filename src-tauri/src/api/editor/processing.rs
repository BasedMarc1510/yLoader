use std::path::Path;

use serde::Serialize;
use serde_json::Value;

use crate::tools::{ToolError, capture, command};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Media {
    pub duration: f64,
    pub has_video: bool,
    pub has_audio: bool,
}

pub async fn probe(ffprobe: &Path, input: &Path) -> Result<Media, ToolError> {
    let mut probe = command(ffprobe);
    probe
        .args([
            "-v",
            "error",
            "-show_format",
            "-show_streams",
            "-of",
            "json",
        ])
        .arg(input);
    let output = capture(probe, 30, 2 * 1024 * 1024).await?;
    let data: Value = serde_json::from_slice(&output).map_err(|_| ToolError::Failed)?;
    let streams = data["streams"].as_array().ok_or(ToolError::Failed)?;
    let has_video = streams.iter().any(|stream| {
        stream["codec_type"] == "video" && stream["disposition"]["attached_pic"] != 1
    });
    let has_audio = streams.iter().any(|stream| stream["codec_type"] == "audio");
    let duration: f64 = data["format"]["duration"]
        .as_str()
        .and_then(|duration| duration.parse().ok())
        .ok_or(ToolError::Failed)?;
    if !duration.is_finite() || duration <= 0.0 || !(has_video || has_audio) {
        return Err(ToolError::Failed);
    }
    Ok(Media {
        duration,
        has_video,
        has_audio,
    })
}

pub struct Edit {
    start: f64,
    pub end: f64,
    volume: f64,
    fade_in: f64,
    fade_out: f64,
    mute: bool,
    pub audio_only: bool,
}

impl Edit {
    pub fn parse(body: &Value, media: &Media) -> Option<Self> {
        let body = body.as_object()?;
        let number = |key, default, min, max| {
            let value = match body.get(key) {
                Some(value) => value.as_f64()?,
                None => default,
            };
            (min..=max).contains(&value).then_some(value)
        };
        let boolean = |key| match body.get(key) {
            Some(value) => value.as_bool(),
            None => Some(false),
        };
        let start = number("start", 0.0, 0.0, media.duration)?;
        let end = number("end", media.duration, 0.0, media.duration)?;
        let volume = number("volume", 100.0, 0.0, 200.0)?;
        let fade_in = number("fadeIn", 0.0, 0.0, 10.0)?;
        let fade_out = number("fadeOut", 0.0, 0.0, 10.0)?;
        let mute = boolean("mute")?;
        let audio_only = boolean("audioOnly")? || !media.has_video;
        if end - start < 0.05
            || fade_in + fade_out > end - start
            || (audio_only && (!media.has_audio || mute))
            || (!media.has_audio && (volume != 100.0 || fade_in != 0.0 || fade_out != 0.0))
        {
            return None;
        }
        Some(Self {
            start,
            end,
            volume,
            fade_in,
            fade_out,
            mute,
            audio_only,
        })
    }

    pub fn duration(&self) -> f64 {
        self.end - self.start
    }

    pub async fn render(
        &self,
        ffmpeg: &Path,
        input: &Path,
        output: &Path,
        media: &Media,
    ) -> Result<(), ToolError> {
        let duration = self.duration();
        let mut render = command(ffmpeg);
        render
            .args([
                "-nostdin",
                "-hide_banner",
                "-loglevel",
                "error",
                "-n",
                "-ss",
                &self.start.to_string(),
                "-i",
            ])
            .arg(input)
            .args(["-t", &duration.to_string(), "-map_metadata", "0"]);
        if self.audio_only {
            render.arg("-vn");
        } else {
            render.args([
                "-map",
                "0:V:0",
                "-c:v",
                "libx264",
                "-preset",
                "veryfast",
                "-crf",
                "20",
                "-pix_fmt",
                "yuv420p",
                "-vf",
                "pad=ceil(iw/2)*2:ceil(ih/2)*2",
            ]);
        }
        if self.mute || !media.has_audio {
            render.arg("-an");
        } else {
            let mut filters = vec![format!("volume={}", self.volume / 100.0)];
            if self.fade_in > 0.0 {
                filters.push(format!("afade=t=in:d={}", self.fade_in));
            }
            if self.fade_out > 0.0 {
                filters.push(format!(
                    "afade=t=out:st={}:d={}",
                    duration - self.fade_out,
                    self.fade_out
                ));
            }
            render.args([
                "-map",
                "0:a:0",
                "-af",
                &filters.join(","),
                "-c:a",
                "aac",
                "-b:a",
                "192k",
            ]);
        }
        render.args(["-movflags", "+faststart"]).arg(output);
        capture(render, 30 * 60, 0).await?;
        Ok(())
    }
}
