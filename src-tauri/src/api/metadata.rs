use std::process::Stdio;

use axum::{
    Json, Router,
    extract::{Query, State as ExtractState},
    http::StatusCode,
    routing::get,
};
use serde::Deserialize;
use serde_json::{Value, json};
use tokio::process::Command;
use url::Url;

use super::{ApiError, cookies};
use crate::{
    data::State,
    tools::{Tool, ToolError, available_path, capture_output, command},
};

pub fn http_url(value: &str) -> Option<Url> {
    if value.len() > 16 * 1024 {
        return None;
    }
    let url = Url::parse(value.trim()).ok()?;
    (matches!(url.scheme(), "https" | "http")
        && url.has_host()
        && url.username().is_empty()
        && url.password().is_none())
    .then_some(url)
}

pub fn field<'a>(value: &'a Value, key: &str) -> &'a str {
    value[key].as_str().unwrap_or_default().trim()
}

pub fn first<'a>(value: &'a Value, keys: &[&str]) -> &'a str {
    keys.iter()
        .map(|key| field(value, key))
        .find(|v| !v.is_empty())
        .unwrap_or_default()
}

pub async fn yt_command(
    state: &State,
    target: &str,
) -> Result<(Command, Option<tempfile::NamedTempFile>), ApiError> {
    let path = state.tools.ensure(Tool::YtDlp).await.map_err(tool_error)?;
    let mut command = command(&path);
    command.stderr(Stdio::piped()).args([
        "--ignore-config",
        "--no-warnings",
        "--no-colors",
        "--js-runtimes",
        "deno",
    ]);
    let youtube = target.starts_with("ytsearch")
        || http_url(target).is_some_and(|url| {
            url.host_str().is_some_and(|host| {
                matches!(host, "youtube.com" | "youtu.be" | "youtube-nocookie.com")
                    || host.ends_with(".youtube.com")
                    || host.ends_with(".youtube-nocookie.com")
            })
        });
    if youtube && available_path(format!("deno{}", std::env::consts::EXE_SUFFIX).into()).is_none() {
        let quickjs = state
            .tools
            .ensure(Tool::QuickJs)
            .await
            .map_err(tool_error)?;
        let mut runtime = std::ffi::OsString::from("quickjs:");
        runtime.push(quickjs);
        command.arg("--js-runtimes").arg(runtime);
    }
    let cookies = cookies::load(state.clone()).await?.add_args(&mut command)?;
    Ok((command, cookies))
}

pub fn tool_error(error: ToolError) -> ApiError {
    match error {
        ToolError::Missing => ApiError(
            StatusCode::SERVICE_UNAVAILABLE,
            "Required media tool is missing",
        ),
        ToolError::Failed => ApiError(
            StatusCode::BAD_GATEWAY,
            "The media tool could not process this request",
        ),
    }
}

pub fn yt_dlp_error(stderr: &[u8], fallback: ApiError) -> ApiError {
    for line in String::from_utf8_lossy(stderr).lines() {
        let Some(message) = line.strip_prefix("ERROR: [Reddit] ") else {
            continue;
        };
        let reason = if message.contains("Private subreddit") {
            "Private subreddit"
        } else if message.contains("Account authentication is required")
            || message.contains("Quarantined subreddit")
        {
            "Account authentication required"
        } else if message.contains("unable to access the Reddit API")
            || message.contains("HTTP Error 403")
        {
            "Reddit API access denied (HTTP 403)"
        } else if message.contains("HTTP Error 429") {
            "Reddit API rate limited (HTTP 429)"
        } else {
            continue;
        };
        return ApiError(StatusCode::BAD_GATEWAY, reason);
    }
    fallback
}

async fn query_json(state: &State, args: &[&str], target: &str) -> Result<Value, ApiError> {
    let (mut command, _cookies) = yt_command(state, target).await?;
    command
        .arg("--dump-single-json")
        .args(args)
        .arg("--")
        .arg(target);
    let (status, output, stderr) = capture_output(command, 90, 32 * 1024 * 1024)
        .await
        .map_err(tool_error)?;
    if !status.success() {
        return Err(yt_dlp_error(&stderr, tool_error(ToolError::Failed)));
    }
    serde_json::from_slice(&output).map_err(|_| tool_error(ToolError::Failed))
}

#[derive(Deserialize)]
struct MetadataQuery {
    url: Option<String>,
    source: Option<String>,
}

async fn media(state: &State, query: MetadataQuery) -> Result<Value, ApiError> {
    let url = query
        .url
        .or(query.source)
        .and_then(|url| http_url(&url))
        .ok_or(ApiError(StatusCode::BAD_REQUEST, "Invalid URL"))?;
    let data = query_json(state, &["--no-playlist", "--skip-download"], url.as_str()).await?;
    if let Some(entry) = data["entries"]
        .as_array()
        .and_then(|entries| entries.iter().find(|e| e["formats"].is_array()))
    {
        return Ok(entry.clone());
    }
    Ok(data)
}

fn duration_label(duration: Option<f64>) -> Option<String> {
    let total = duration?.round() as u64;
    let (h, m, s) = (total / 3600, total / 60 % 60, total % 60);
    Some(if h > 0 {
        format!("{h}:{m:02}:{s:02}")
    } else {
        format!("{m:02}:{s:02}")
    })
}

fn thumbnails(data: &Value) -> Vec<Value> {
    let mut list: Vec<Value> = data["thumbnails"].as_array().into_iter().flatten().filter_map(|item| {
        let url = http_url(field(item, "url"))?;
        let width = item["width"].as_u64().unwrap_or(0);
        let height = item["height"].as_u64().unwrap_or(0);
        Some(json!({"id": field(item, "id"), "url": url.as_str(), "width": width, "height": height}))
    }).collect();
    let area = |item: &Value| {
        item["width"]
            .as_u64()
            .unwrap_or(0)
            .saturating_mul(item["height"].as_u64().unwrap_or(0))
    };
    list.sort_by_key(|item| std::cmp::Reverse(area(item)));
    let mut seen = std::collections::HashSet::new();
    list.retain(|item| seen.insert(field(item, "url").to_owned()));
    if list.is_empty()
        && let Some(url) = http_url(field(data, "thumbnail"))
    {
        list.push(json!({"id": "default", "url": url.as_str(), "width": 0, "height": 0}));
    }
    list.truncate(7);
    list
}

pub fn format_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 160
        && value
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"_.,:+-/=~*".contains(&c))
}

fn metadata_payload(data: &Value) -> Value {
    let mut audio = Vec::new();
    let mut video = Vec::new();
    let mut audio_ids = std::collections::HashSet::new();
    let mut video_ids = std::collections::HashSet::new();
    for item in data["formats"].as_array().into_iter().flatten().rev() {
        let id = field(item, "format_id");
        let ext = field(item, "ext");
        if !format_id(id) || id.starts_with("sb") || ext == "mhtml" {
            continue;
        }
        let acodec = item["acodec"].as_str().unwrap_or("none");
        let vcodec = item["vcodec"].as_str().unwrap_or("none");
        let width = item["width"].as_u64().unwrap_or(0);
        let height = item["height"].as_u64().unwrap_or(0);
        let filesize = item["filesize"]
            .as_u64()
            .or(item["filesize_approx"].as_u64())
            .unwrap_or(0);
        let unknown_codecs = item["vcodec"].is_null() && item["acodec"].is_null();
        let direct_video = unknown_codecs && matches!(ext, "mp4" | "webm" | "mkv" | "avi" | "mov");
        let direct_audio = unknown_codecs
            && matches!(ext, "mp3" | "m4a" | "wav" | "ogg" | "flac" | "opus" | "aac");
        if vcodec != "none" || height > 0 || direct_video {
            let vcodec = if direct_video { "unknown" } else { vcodec };
            let acodec = if direct_video { "unknown" } else { acodec };
            if video_ids.insert((id, ext, acodec)) {
                video.push(json!({"formatId": id, "ext": ext, "acodec": acodec, "vcodec": vcodec,
                    "width": width, "height": height, "filesize": filesize, "fps": item["fps"].as_f64().unwrap_or(0.0),
                    "resolution": item["resolution"], "requiresMerge": acodec == "none"}));
            }
        } else if (acodec != "none" || direct_audio) && audio_ids.insert((id, ext)) {
            let abr = item["abr"].as_f64().or(item["tbr"].as_f64()).unwrap_or(0.0);
            audio.push(json!({"formatId": id, "ext": ext, "acodec": acodec, "filesize": filesize, "abr": abr.round()}));
        }
    }
    let thumbs = thumbnails(data);
    let thumbnail = http_url(field(data, "thumbnail"))
        .map(|u| u.to_string())
        .or_else(|| thumbs.first().map(|item| field(item, "url").to_owned()));
    let duration = data["duration"].as_f64().filter(|value| *value >= 0.0);
    json!({
        "title": field(data, "title"), "author": first(data, &["uploader", "channel", "creator", "uploader_id"]),
        "extractor": first(data, &["extractor_key", "extractor"]), "thumbnail": thumbnail, "thumbnails": thumbs,
        "duration": duration, "durationString": duration_label(duration), "audioFormats": audio, "videoFormats": video
    })
}

async fn formats(
    ExtractState(state): ExtractState<State>,
    Query(query): Query<MetadataQuery>,
) -> Result<Json<Value>, ApiError> {
    Ok(Json(metadata_payload(&media(&state, query).await?)))
}

async fn duration(
    ExtractState(state): ExtractState<State>,
    Query(query): Query<MetadataQuery>,
) -> Result<Json<Value>, ApiError> {
    let data = media(&state, query).await?;
    let duration = data["duration"].as_f64().filter(|value| *value >= 0.0);
    Ok(Json(
        json!({"duration": duration, "durationString": duration_label(duration)}),
    ))
}

async fn thumbs(
    ExtractState(state): ExtractState<State>,
    Query(query): Query<MetadataQuery>,
) -> Result<Json<Value>, ApiError> {
    let mut payload = metadata_payload(&media(&state, query).await?);
    for key in ["duration", "durationString", "audioFormats", "videoFormats"] {
        payload.as_object_mut().unwrap().remove(key);
    }
    Ok(Json(payload))
}

#[derive(Deserialize)]
struct SearchQuery {
    q: Option<String>,
    query: Option<String>,
    from: Option<String>,
    service: Option<String>,
    offset: Option<String>,
}

async fn search(
    ExtractState(state): ExtractState<State>,
    Query(input): Query<SearchQuery>,
) -> Result<Json<Value>, ApiError> {
    let query = input.q.or(input.query).unwrap_or_default();
    let query = query.trim();
    if query.is_empty() || query.chars().count() > 300 {
        return Err(ApiError(
            StatusCode::BAD_REQUEST,
            "Search query must contain 1–300 characters",
        ));
    }
    let provider = input
        .from
        .or(input.service)
        .unwrap_or_default()
        .trim()
        .to_ascii_lowercase();
    let provider = match provider.as_str() {
        provider @ ("soundcloud" | "spotify" | "youtubemusic") => provider,
        _ => "youtube",
    };
    let offset = input
        .offset
        .and_then(|offset| offset.parse::<i32>().ok())
        .unwrap_or(0)
        .clamp(0, 500);
    let start = (offset + 1).to_string();
    let end = (offset + 10).to_string();
    let target = match provider {
        "soundcloud" => format!("scsearch{end}:{query}"),
        "spotify" => format!("spsearch{end}:{query}"),
        provider => {
            let (base, key) = if provider == "youtube" {
                ("https://www.youtube.com/results", "search_query")
            } else {
                ("https://music.youtube.com/search", "q")
            };
            let mut url = Url::parse(base).unwrap();
            url.query_pairs_mut()
                .append_pair(key, query)
                .append_pair("sp", "EgIQAQ%3D%3D");
            url.to_string()
        }
    };
    let data = query_json(
        &state,
        &[
            "--flat-playlist",
            "--playlist-start",
            &start,
            "--playlist-end",
            &end,
        ],
        &target,
    )
    .await?;
    let service = if provider == "youtubemusic" {
        "youtube"
    } else {
        provider
    };
    let entries = data["entries"].as_array().into_iter().flatten().filter_map(|entry| {
        let id = field(entry, "id");
        let url = ["webpage_url", "url"].iter().find_map(|key| http_url(field(entry, key))).or_else(|| {
            if id.is_empty() { return None; }
            let mut url = match service {
                "youtube" => Url::parse("https://www.youtube.com/watch").ok()?,
                "spotify" => Url::parse("https://open.spotify.com/track/").ok()?,
                _ => Url::parse("https://soundcloud.com/").ok()?,
            };
            match service {
                "youtube" => { url.query_pairs_mut().append_pair("v", id); },
                "spotify" => { url.path_segments_mut().ok()?.pop_if_empty().push(id); },
                _ => { return url.join(field(entry, "url").trim_start_matches('/')).ok().filter(|url| !field(entry, "url").is_empty() && url.host_str() == Some("soundcloud.com")); }
            }
            Some(url)
        })?;
        let duration = entry["duration"].as_f64().filter(|value| *value >= 0.0);
        let thumbnail = thumbnails(entry).first().map(|item| field(item, "url").to_owned()).unwrap_or_default();
        Some(json!({
            "id": if id.is_empty() { url.as_str() } else { id },
            "title": if field(entry, "title").is_empty() { url.as_str() } else { field(entry, "title") },
            "url": url.as_str(), "service": service, "uploader": first(entry, &["uploader", "channel", "artist"]),
            "thumbnail": thumbnail, "duration": duration, "durationString": duration_label(duration)
        }))
    }).take(10).collect::<Vec<_>>();
    Ok(Json(
        json!({"query": query, "from": provider, "offset": offset, "limit": 10, "hasMore": entries.len() == 10, "entries": entries}),
    ))
}

pub fn routes() -> Router<State> {
    Router::new()
        .route("/api/search", get(search))
        .route("/api/meta/duration", get(duration))
        .route("/api/meta/formats", get(formats))
        .route("/api/meta/thumbnails", get(thumbs))
}
