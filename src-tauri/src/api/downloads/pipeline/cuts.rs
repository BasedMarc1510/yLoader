use axum::http::StatusCode;
use base64::{Engine, engine::general_purpose::STANDARD};
use serde_json::Value;
use tokio::process::Command;

use crate::api::ApiError;

fn ranges(options: &Value, duration: f64) -> Vec<(f64, f64)> {
    let start = options["trimStart"]
        .as_f64()
        .unwrap_or(0.0)
        .clamp(0.0, duration);
    let end = options["trimEnd"]
        .as_f64()
        .unwrap_or(duration)
        .clamp(start, duration);
    let mut segments = options["segments"]
        .as_array()
        .or(options["removals"].as_array())
        .into_iter()
        .flatten()
        .take(200)
        .filter_map(|segment| {
            let a = segment["start"].as_f64()?.clamp(start, end);
            let b = segment["end"].as_f64()?.clamp(start, end);
            (a < b).then_some((a, b))
        })
        .collect::<Vec<_>>();
    segments.sort_by(|left, right| left.0.total_cmp(&right.0));
    let mut joined: Vec<(f64, f64)> = Vec::new();
    for segment in segments {
        if let Some(last) = joined.last_mut()
            && segment.0 <= last.1
        {
            last.1 = last.1.max(segment.1);
        } else {
            joined.push(segment);
        }
    }
    if options["mode"] == "keep" {
        return if joined.is_empty() && start < end {
            vec![(start, end)]
        } else {
            joined
        };
    }
    let mut keeps = Vec::new();
    let mut cursor = start;
    for (from, to) in joined {
        if cursor < from {
            keeps.push((cursor, from));
        }
        cursor = to;
    }
    if cursor < end {
        keeps.push((cursor, end));
    }
    keeps
}

pub fn apply(
    cmd: &mut Command,
    options: &Value,
    duration: f64,
    video: bool,
    audio: bool,
) -> Result<(), ApiError> {
    let keeps = ranges(options, duration);
    if keeps.is_empty() || !(video || audio) {
        return Err(ApiError(
            StatusCode::BAD_REQUEST,
            "No media remains after applying cuts",
        ));
    }
    let mut filters = Vec::new();
    let mut inputs = String::new();
    for (i, (start, end)) in keeps.iter().enumerate() {
        if video {
            filters.push(format!(
                "[0:V:0]trim=start={start}:end={end},setpts=PTS-STARTPTS,pad=ceil(iw/2)*2:ceil(ih/2)*2[v{i}]"
            ));
            inputs.push_str(&format!("[v{i}]"));
        }
        if audio {
            filters.push(format!(
                "[0:a:0]atrim=start={start}:end={end},asetpts=PTS-STARTPTS[a{i}]"
            ));
            inputs.push_str(&format!("[a{i}]"));
        }
    }
    let outputs = format!(
        "{}{}",
        if video { "[video]" } else { "" },
        if audio { "[audio]" } else { "" }
    );
    filters.push(format!(
        "{inputs}concat=n={}:v={}:a={}{outputs}",
        keeps.len(),
        u8::from(video),
        u8::from(audio)
    ));
    cmd.args(["-filter_complex", &filters.join(";")]);
    if video {
        cmd.args(["-map", "[video]"]);
    }
    if audio {
        cmd.args(["-map", "[audio]"]);
    }
    Ok(())
}

pub fn opus_art(image: &[u8]) -> String {
    let mime = b"image/jpeg";
    let mut block = Vec::new();
    for field in [3_u32, mime.len() as u32] {
        block.extend(field.to_be_bytes());
    }
    block.extend(mime);
    // Description length, width, height, depth and indexed-color count may be zero.
    block.extend([0_u8; 20]);
    block.extend((image.len() as u32).to_be_bytes());
    block.extend(image);
    STANDARD.encode(block)
}
