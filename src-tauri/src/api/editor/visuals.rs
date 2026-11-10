use std::{path::Path, process::Stdio, time::Duration};

use base64::{Engine, engine::general_purpose::STANDARD};
use serde_json::{Value, json};
use tokio::{io::AsyncReadExt, time::timeout};

use super::processing::Media;
use crate::tools::{ToolError, capture, command};

const FRAME_COUNT: usize = 10;
const WAVEFORM_BINS: usize = 480;
const SAMPLE_RATE: usize = 8000;

async fn filmstrip(ffmpeg: &Path, input: &Path, duration: f64) -> Result<Vec<Value>, ToolError> {
    let mut frames = Vec::with_capacity(FRAME_COUNT);
    for index in 0..FRAME_COUNT {
        let time = duration * (index as f64 + 0.5) / FRAME_COUNT as f64;
        let mut frame = command(ffmpeg);
        frame
            .args([
                "-nostdin",
                "-hide_banner",
                "-loglevel",
                "error",
                "-threads",
                "2",
                "-ss",
                &time.to_string(),
                "-i",
            ])
            .arg(input)
            .args([
                "-map",
                "0:V:0",
                "-an",
                "-frames:v",
                "1",
                "-vf",
                "scale=160:90:force_original_aspect_ratio=decrease,pad=160:90:(ow-iw)/2:(oh-ih)/2",
                "-c:v",
                "mjpeg",
                "-threads",
                "1",
                "-q:v",
                "5",
                "-f",
                "image2pipe",
                "pipe:1",
            ]);
        let output = capture(frame, 20, 512 * 1024).await?;
        if output.is_empty() {
            return Err(ToolError::Failed);
        }
        frames.push(json!({"time": time, "image": format!("data:image/jpeg;base64,{}", STANDARD.encode(output))}));
    }
    Ok(frames)
}

async fn waveform(ffmpeg: &Path, input: &Path, duration: f64) -> Result<Vec<f64>, ToolError> {
    timeout(Duration::from_secs(120), async {
        let mut child = command(ffmpeg)
            .args([
                "-nostdin",
                "-hide_banner",
                "-loglevel",
                "error",
                "-threads",
                "2",
                "-i",
            ])
            .arg(input)
            .args([
                "-map", "0:a:0", "-vn", "-ac", "1", "-ar", "8000", "-f", "s16le", "pipe:1",
            ])
            .stdout(Stdio::piped())
            .spawn()?;
        let mut stdout = child.stdout.take().ok_or(ToolError::Failed)?;
        let samples_per_bin =
            ((duration * SAMPLE_RATE as f64 / WAVEFORM_BINS as f64).ceil() as usize).max(1);
        let mut peaks = vec![0.0_f64; WAVEFORM_BINS];
        let mut sample_index = 0;
        let mut buffer = [0u8; 8192];
        let mut offset = 0;
        loop {
            let count = stdout.read(&mut buffer[offset..]).await?;
            if count == 0 {
                break;
            }
            let length = count + offset;
            let (samples, remainder) = buffer[..length].as_chunks::<2>();
            for &pair in samples {
                let sample = i16::from_le_bytes(pair);
                if let Some(peak) = peaks.get_mut(sample_index / samples_per_bin) {
                    *peak = peak.max(f64::from(sample).abs() / 32768.0);
                }
                sample_index += 1;
            }
            offset = remainder.len();
            if offset != 0 {
                buffer[0] = buffer[length - 1];
            }
        }
        if !child.wait().await?.success() {
            return Err(ToolError::Failed);
        }
        Ok(peaks
            .into_iter()
            .map(|peak| (peak * 10000.0).round() / 10000.0)
            .collect())
    })
    .await
    .map_err(|_| ToolError::Failed)?
}

pub async fn create(ffmpeg: &Path, input: &Path, media: &Media) -> Value {
    let (frames, peaks) = tokio::join!(
        async {
            if media.has_video {
                filmstrip(ffmpeg, input, media.duration).await
            } else {
                Ok(vec![])
            }
        },
        async {
            if media.has_audio {
                waveform(ffmpeg, input, media.duration).await
            } else {
                Ok(vec![])
            }
        },
    );
    let incomplete = frames.is_err() || peaks.is_err();
    json!({"frames": frames.unwrap_or_default(), "peaks": peaks.unwrap_or_default(), "incomplete": incomplete})
}
