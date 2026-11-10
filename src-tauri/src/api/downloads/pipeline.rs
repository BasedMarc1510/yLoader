mod cuts;

use std::{
    path::{Path, PathBuf},
    process::Stdio,
    time::Duration,
};

use axum::http::StatusCode;
use base64::{Engine, engine::general_purpose::STANDARD};
use serde_json::Value;
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    process::Command,
    sync::mpsc,
};
use url::Url;

use super::{FAILED, IMAGE, Job, Kind, progress};
use crate::{
    api::{
        ApiError,
        metadata::{field, first, http_url, tool_error, yt_command, yt_dlp_error},
    },
    data::State,
    tools::{Tool, capture, command, read_stderr},
};

const IMAGE_LIMIT: usize = 15 * 1024 * 1024;

async fn ffmpeg(state: &State) -> Result<Command, ApiError> {
    let path = state.tools.ensure(Tool::Ffmpeg).await.map_err(tool_error)?;
    let mut cmd = command(&path);
    cmd.args(["-nostdin", "-hide_banner", "-loglevel", "error", "-y"]);
    Ok(cmd)
}

async fn fetch_image(url: &Url, output: &Path) -> Result<(), ApiError> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()
        .map_err(|_| FAILED)?;
    let mut response = client
        .get(url.clone())
        .send()
        .await
        .map_err(|_| FAILED)?
        .error_for_status()
        .map_err(|_| FAILED)?;
    if response
        .content_length()
        .is_some_and(|length| length > IMAGE_LIMIT as u64)
    {
        return Err(ApiError(
            StatusCode::PAYLOAD_TOO_LARGE,
            "Thumbnail is too large",
        ));
    }
    let mut file = tokio::fs::File::create(output).await.map_err(|_| FAILED)?;
    let mut total = 0;
    let mut signature = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| FAILED)? {
        total += chunk.len();
        if total > IMAGE_LIMIT {
            return Err(ApiError(
                StatusCode::PAYLOAD_TOO_LARGE,
                "Thumbnail is too large",
            ));
        }
        if signature.len() < 12 {
            signature.extend_from_slice(&chunk[..chunk.len().min(12 - signature.len())]);
        }
        file.write_all(&chunk).await.map_err(|_| FAILED)?;
    }
    if !is_image(&signature) {
        return Err(ApiError(StatusCode::BAD_GATEWAY, "Invalid thumbnail image"));
    }
    file.flush().await.map_err(|_| FAILED)
}

fn is_image(bytes: &[u8]) -> bool {
    bytes.starts_with(b"\xFF\xD8\xFF")
        || bytes.starts_with(b"\x89PNG\r\n\x1a\n")
        || bytes.starts_with(b"GIF87a")
        || bytes.starts_with(b"GIF89a")
        || (bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP"))
        || bytes.get(4..12) == Some(b"ftypavif")
}

pub async fn image(
    state: &State,
    url: &Url,
    ext: Option<&str>,
    temp: &tempfile::TempDir,
) -> Result<(PathBuf, String), ApiError> {
    let ext = match ext.unwrap_or("jpg").trim().to_ascii_lowercase().as_str() {
        "jpeg" | "" => "jpg".to_owned(),
        ext if IMAGE.contains(&ext) => ext.to_owned(),
        _ => {
            return Err(ApiError(
                StatusCode::BAD_REQUEST,
                "Unsupported image format",
            ));
        }
    };
    let source = temp.path().join("image-source");
    fetch_image(url, &source).await?;
    let output = temp.path().join(format!("thumbnail.{ext}"));
    let mut cmd = ffmpeg(state).await?;
    cmd.args(["-protocol_whitelist", "file,pipe", "-i"])
        .arg(source)
        .args(["-frames:v", "1"])
        .arg(&output);
    capture(cmd, 45, 0).await.map_err(tool_error)?;
    Ok((output, ext))
}

fn selector(job: &Job) -> String {
    let (field_name, cap_name, constraint, preferred, best) = if job.kind == Kind::Audio {
        (
            "audioFormat",
            "maxAudioBitrateKbps",
            "abr",
            "bestaudio",
            "best",
        )
    } else {
        (
            "videoFormat",
            "maxVideoHeight",
            "height",
            "bestvideo",
            "best",
        )
    };
    let selected = field(&job.body, field_name);
    let chosen = if selected.is_empty() || selected == "best" {
        preferred
    } else {
        selected
    };
    let audio = if job.kind == Kind::Video {
        "+bestaudio"
    } else {
        ""
    };
    let cap = job.settings[cap_name].as_u64().unwrap_or_default();
    if cap > 0 {
        format!(
            "{chosen}[{constraint}<={cap}]{audio}/{preferred}[{constraint}<={cap}]{audio}/{best}[{constraint}<={cap}]/{chosen}{audio}/{best}"
        )
    } else {
        format!("{chosen}{audio}/{chosen}/{best}")
    }
}

async fn download(
    state: &State,
    job: &Job,
    temp: &tempfile::TempDir,
    sender: &mpsc::Sender<axum::response::sse::Event>,
) -> Result<(PathBuf, Value), ApiError> {
    let (mut cmd, _cookies) = yt_command(state, job.url.as_str()).await?;
    cmd.current_dir(temp.path()).args([
        "--no-playlist",
        "--playlist-end",
        "1",
        "--newline",
        "--progress",
        "--progress-delta",
        "0.25",
        "--progress-template",
        "download:YLPROGRESS:%(progress._percent_str)s",
        "--print",
        "after_move:YLMEDIA:%(.{id,title,uploader,channel,duration,thumbnail,filepath})j",
        "--no-simulate",
        "-o",
        "source.%(ext)s",
        "-f",
        &selector(job),
    ]);
    if job.kind == Kind::Video {
        cmd.args(["--merge-output-format", "mkv"]);
    }
    let ffmpeg = state.tools.ensure(Tool::Ffmpeg).await.map_err(tool_error)?;
    state
        .tools
        .ensure(Tool::Ffprobe)
        .await
        .map_err(tool_error)?;
    cmd.arg("--ffmpeg-location").arg(ffmpeg);
    let mut child = cmd
        .arg("--")
        .arg(job.url.as_str())
        .stdout(Stdio::piped())
        .spawn()
        .map_err(|error| tool_error(error.into()))?;
    let mut stdout = BufReader::new(child.stdout.take().ok_or(FAILED)?).lines();
    let read_stdout = async {
        let mut info = None;
        let mut previous = 2.0_f64;
        while let Some(line) = stdout.next_line().await.map_err(|_| FAILED)? {
            if let Some(raw) = line.strip_prefix("YLPROGRESS:") {
                if let Ok(percent) = raw.trim().trim_end_matches('%').parse::<f64>()
                    && percent.is_finite()
                {
                    let percent = (2.0 + percent.clamp(0.0, 100.0) * 0.73).max(previous);
                    previous = percent;
                    progress(sender, percent, "downloading").await?;
                }
            } else if let Some(raw) = line.strip_prefix("YLMEDIA:") {
                info = serde_json::from_str::<Value>(raw).ok();
            }
        }
        Ok(info)
    };
    let stderr = child.stderr.take();
    let (info, diagnostics) = tokio::try_join!(read_stdout, async {
        read_stderr(stderr).await.map_err(|_| FAILED)
    })?;
    if !child.wait().await.map_err(|_| FAILED)?.success() {
        return Err(yt_dlp_error(
            &diagnostics,
            ApiError(
                StatusCode::BAD_GATEWAY,
                "yt-dlp could not download this source",
            ),
        ));
    }
    let info = info.ok_or(FAILED)?;
    let path = PathBuf::from(field(&info, "filepath"));
    let root = temp.path().canonicalize().map_err(|_| FAILED)?;
    let path = if path.is_absolute() {
        path
    } else {
        root.join(path)
    }
    .canonicalize()
    .map_err(|_| FAILED)?;
    if !path.starts_with(root) || !path.is_file() {
        return Err(FAILED);
    }
    Ok((path, info))
}

async fn cover(
    state: &State,
    job: &Job,
    info: &Value,
    temp: &tempfile::TempDir,
) -> Result<Option<PathBuf>, ApiError> {
    let options = &job.body["cover"];
    if !options["enabled"]
        .as_bool()
        .unwrap_or(job.settings["defaultEmbedCoverArt"] == true)
    {
        return Ok(None);
    }
    if !matches!(job.container.as_str(), "mp3" | "m4a" | "flac" | "opus") {
        return Ok(None);
    }
    let source = temp.path().join("cover-source");
    let upload = options["source"] == "upload";
    if upload {
        let raw = first(&options["upload"], &["dataUrl", "data"]);
        let data = raw
            .split_once(";base64,")
            .map(|(_, data)| data)
            .unwrap_or(raw);
        let invalid = || ApiError(StatusCode::BAD_REQUEST, "Could not read cover image");
        if data.len() > 14 * 1024 * 1024 {
            return Err(invalid());
        }
        let image = STANDARD.decode(data).map_err(|_| invalid())?;
        if image.len() > 10 * 1024 * 1024 || !is_image(&image) {
            return Err(invalid());
        }
        tokio::fs::write(&source, image).await.map_err(|_| FAILED)?;
    } else {
        let Some(url) = job
            .image
            .clone()
            .or_else(|| http_url(field(info, "thumbnail")))
        else {
            return Ok(None);
        };
        if fetch_image(&url, &source).await.is_err() {
            return Ok(None);
        }
    }
    let output = temp.path().join("cover.jpg");
    let mut cmd = ffmpeg(state).await?;
    cmd.args(["-protocol_whitelist", "file,pipe", "-i"])
        .arg(source)
        .args(["-frames:v", "1"])
        .arg(&output);
    match capture(cmd, 45, 0).await {
        Ok(_) => Ok(Some(output)),
        Err(error) if upload => Err(tool_error(error)),
        Err(_) => Ok(None),
    }
}

async fn probe(state: &State, source: &Path) -> Option<Value> {
    let mut cmd = command(&state.tools.ensure(Tool::Ffprobe).await.ok()?);
    cmd.args([
        "-v",
        "error",
        "-show_format",
        "-show_streams",
        "-of",
        "json",
    ])
    .arg(source);
    serde_json::from_slice(&capture(cmd, 30, 2 * 1024 * 1024).await.ok()?).ok()
}

pub async fn duration(state: &State, source: &Path, job: &Job, info: &Value) -> Option<f64> {
    if job.kind == Kind::Thumbnail {
        return job.body["duration"].as_f64();
    }
    let probe = probe(state, source).await;
    probe
        .as_ref()
        .and_then(probe_duration)
        .or_else(|| info["duration"].as_f64())
        .or_else(|| job.body["duration"].as_f64())
}

fn probe_duration(probe: &Value) -> Option<f64> {
    probe["format"]["duration"]
        .as_str()?
        .parse::<f64>()
        .ok()
        .filter(|v| v.is_finite() && *v > 0.0)
}

fn video_profile(cmd: &mut Command, ext: &str, maximum: bool, has_cuts: bool) {
    if !has_cuts {
        cmd.args(["-vf", "pad=ceil(iw/2)*2:ceil(ih/2)*2"]);
    }
    cmd.args(["-pix_fmt", "yuv420p"]);
    match ext {
        "webm" => {
            cmd.args([
                "-c:v",
                "libvpx",
                "-crf",
                "10",
                "-b:v",
                "0",
                "-deadline",
                "good",
                "-cpu-used",
                "2",
                "-c:a",
                "libvorbis",
                "-q:a",
                "5",
            ]);
        }
        "avi" => {
            cmd.args([
                "-c:v",
                "mpeg4",
                "-q:v",
                "3",
                "-vtag",
                "XVID",
                "-c:a",
                "libmp3lame",
                "-b:a",
                "192k",
            ]);
        }
        _ => {
            cmd.args([
                "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-c:a", "aac", "-b:a", "192k",
            ]);
            if maximum {
                cmd.args(["-profile:v", "baseline", "-profile:a", "aac_low"]);
            }
            if ext != "mkv" {
                cmd.args(["-tag:v", "avc1", "-movflags", "+faststart"]);
            }
        }
    }
    if maximum {
        cmd.args(["-ac", "2", "-ar", "48000"]);
    }
}

fn audio_profile(cmd: &mut Command, ext: &str, bitrate: u64) {
    let codec = match ext {
        "mp3" => "libmp3lame",
        "m4a" => "aac",
        "wav" => "pcm_s16le",
        "ogg" => "libvorbis",
        "flac" => "flac",
        _ => "libopus",
    };
    cmd.args(["-c:a", codec]);
    if bitrate > 0 && !matches!(ext, "wav" | "flac") {
        cmd.args(["-b:a", &format!("{bitrate}k")]);
    }
}

pub async fn process(
    state: &State,
    job: &Job,
    temp: &tempfile::TempDir,
    sender: &mpsc::Sender<axum::response::sse::Event>,
) -> Result<(PathBuf, Value), ApiError> {
    if job.kind == Kind::Thumbnail {
        let (path, _) = image(
            state,
            job.image.as_ref().ok_or(FAILED)?,
            Some(&job.container),
            temp,
        )
        .await?;
        return Ok((path, Value::Null));
    }
    let (source, info) = download(state, job, temp, sender).await?;
    progress(sender, 78.0, "processing").await?;
    let output = temp.path().join(format!("output.{}", job.container));
    let is_audio = job.kind == Kind::Audio;
    let maximum = !is_audio && job.body["maximumCompatibility"] == true;
    let cut_options = job.body.get("cuts").or_else(|| {
        job.body
            .get(if is_audio { "audioCuts" } else { "videoCuts" })
    });
    let has_cuts = cut_options.is_some_and(|options| options["enabled"] == true);
    if !is_audio && !maximum && !has_cuts {
        let mut cmd = ffmpeg(state).await?;
        cmd.arg("-i")
            .arg(&source)
            .args(["-map", "0:V:0", "-map", "0:a:0?", "-c", "copy"])
            .arg(&output);
        if capture(cmd, 30 * 60, 0).await.is_ok() {
            return Ok((output, info));
        }
    }

    let mut cmd = ffmpeg(state).await?;
    cmd.arg("-i").arg(&source);
    let picture = if is_audio {
        cover(state, job, &info, temp).await?
    } else {
        None
    };
    if let Some(path) = &picture {
        cmd.arg("-i").arg(path);
    }
    if has_cuts {
        let data = probe(state, &source).await.ok_or(FAILED)?;
        let duration = probe_duration(&data).ok_or(FAILED)?;
        let has_audio = data["streams"]
            .as_array()
            .into_iter()
            .flatten()
            .any(|stream| stream["codec_type"] == "audio");
        cuts::apply(
            &mut cmd,
            cut_options.unwrap(),
            duration,
            !is_audio,
            has_audio,
        )?;
    } else if is_audio {
        cmd.args(["-map", "0:a:0"]);
    } else {
        cmd.args(["-map", "0:V:0", "-map", "0:a:0?"]);
    }
    if is_audio {
        audio_profile(
            &mut cmd,
            &job.container,
            job.settings["maxAudioBitrateKbps"].as_u64().unwrap_or(0),
        );
        let metadata = &job.body["metadata"];
        for (key, fallback) in [
            ("title", "videoTitle"),
            ("artist", "videoAuthor"),
            ("album", ""),
        ] {
            let value = if let Some(value) = metadata[key].as_str() {
                value
            } else {
                field(&job.body, fallback)
            };
            if !value.is_empty() {
                let value = value
                    .chars()
                    .filter(|c| !c.is_control())
                    .take(500)
                    .collect::<String>();
                cmd.args(["-metadata", &format!("{key}={value}")]);
            }
        }
        if picture.is_some() {
            if job.container == "opus" {
                let bytes = tokio::fs::read(temp.path().join("cover.jpg"))
                    .await
                    .map_err(|_| FAILED)?;
                let art = cuts::opus_art(&bytes);
                cmd.args(["-metadata", &format!("METADATA_BLOCK_PICTURE={art}")]);
            } else {
                cmd.args([
                    "-map",
                    "1:v:0",
                    "-c:v",
                    "mjpeg",
                    "-disposition:v:0",
                    "attached_pic",
                    "-metadata:s:v:0",
                    "title=Album cover",
                    "-metadata:s:v:0",
                    "comment=Cover (front)",
                ]);
            }
        }
    } else {
        video_profile(&mut cmd, &job.container, maximum, has_cuts);
    }
    cmd.arg(&output);
    capture(cmd, 30 * 60, 0).await.map_err(tool_error)?;
    Ok((output, info))
}
