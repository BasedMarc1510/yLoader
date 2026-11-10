use tokio::process::Command;

pub(super) fn video_encoders(ext: &str) -> [&'static str; 2] {
    match ext {
        "webm" => ["libvpx", "libvorbis"],
        "avi" => ["mpeg4", "libmp3lame"],
        _ => ["libx264", "aac"],
    }
}

pub(super) fn video_profile(cmd: &mut Command, ext: &str, maximum: bool, has_cuts: bool) {
    if !has_cuts {
        cmd.args(["-vf", "pad=ceil(iw/2)*2:ceil(ih/2)*2"]);
    }
    let [video, audio] = video_encoders(ext);
    cmd.args(["-pix_fmt", "yuv420p", "-c:v", video, "-c:a", audio]);
    match ext {
        "webm" => {
            cmd.args([
                "-crf",
                "10",
                "-b:v",
                "0",
                "-deadline",
                "good",
                "-cpu-used",
                "2",
                "-q:a",
                "5",
            ]);
        }
        "avi" => {
            cmd.args(["-q:v", "3", "-vtag", "XVID", "-b:a", "192k"]);
        }
        _ => {
            cmd.args(["-preset", "medium", "-crf", "18", "-b:a", "192k"]);
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

pub(super) fn audio_encoder(ext: &str) -> &'static str {
    match ext {
        "mp3" => "libmp3lame",
        "m4a" => "aac",
        "wav" => "pcm_s16le",
        "ogg" => "libvorbis",
        "flac" => "flac",
        _ => "libopus",
    }
}

pub(super) fn audio_profile(cmd: &mut Command, ext: &str, bitrate: u64) {
    cmd.args(["-c:a", audio_encoder(ext)]);
    if bitrate > 0 && !matches!(ext, "wav" | "flac") {
        cmd.args(["-b:a", &format!("{bitrate}k")]);
    }
}
