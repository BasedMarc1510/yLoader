use axum::{Json, Router, extract::State as ExtractState, http::StatusCode, routing::get};
use serde_json::{Map, Value, json};

use super::{ApiError, db_task};
use crate::data::{State, read_setting, write_setting};

#[derive(Clone, Copy)]
pub(crate) enum Setting {
    Tabs,
    AutoDownload,
    Downloads,
}

impl Setting {
    pub(crate) fn key(self) -> &'static str {
        match self {
            Self::Tabs => "ui.tabs.state.v1",
            Self::AutoDownload => "ui.autoDownload.settings.v1",
            Self::Downloads => "ui.download.settings.v1",
        }
    }

    fn defaults(self, downloads: &str) -> Value {
        match self {
            Self::Tabs => json!({
                "tabs": [{"id": "tab-home", "path": "/", "search": "", "pageTitle": "", "runtime": {}}],
                "activeTabId": "tab-home"
            }),
            Self::AutoDownload => json!({
                "useMetadata": true, "embedCoverArt": true, "maxAudioBitrateKbps": 0,
                "maxVideoHeight": 0, "useFixedDownloadPath": false, "fixedDownloadPath": downloads
            }),
            Self::Downloads => json!({
                "maxConcurrentDownloads": 3, "staggerDownloadsMs": 150,
                "defaultAudioContainer": "mp3", "defaultVideoContainer": "mp4",
                "defaultEmbedCoverArt": true, "maxAudioBitrateKbps": 0, "maxVideoHeight": 0,
                "audioFilenamePattern": "{title}", "videoFilenamePattern": "{title}",
                "thumbnailFilenamePattern": "{title}", "downloadLocationMode": "all",
                "globalDownloadPath": downloads, "globalAlwaysAsk": true,
                "audioDownloadPath": downloads, "videoDownloadPath": downloads,
                "thumbnailDownloadPath": downloads, "audioAlwaysAsk": true,
                "videoAlwaysAsk": true, "thumbnailAlwaysAsk": true
            }),
        }
    }

    pub(crate) fn normalize(
        self,
        downloads: &str,
        stored: &Value,
        update: Option<&Value>,
    ) -> Value {
        let mut result = self.defaults(downloads);
        if matches!(self, Self::Tabs) {
            return normalize_tabs(update.unwrap_or(stored)).unwrap_or(result);
        }
        let defaults = result.as_object_mut().unwrap();
        for (key, value) in defaults.iter_mut() {
            if let Some(input) = update
                .and_then(|patch| patch.get(key))
                .or_else(|| stored.get(key))
                && let Some(valid) = validate_setting(key, input)
            {
                *value = valid;
            }
        }
        result
    }
}

fn normalize_tabs(input: &Value) -> Option<Value> {
    let tabs = input.get("tabs")?.as_array()?;
    let mut normalized = Vec::new();
    let mut ids = std::collections::HashSet::new();
    for (index, tab) in tabs.iter().take(30).enumerate() {
        let id = tab["id"]
            .as_str()
            .unwrap_or_default()
            .trim()
            .chars()
            .take(80)
            .collect::<String>();
        let id = if id.is_empty() {
            format!("tab-{}", index + 1)
        } else {
            id
        };
        if !ids.insert(id.clone()) {
            continue;
        }
        let path = match tab["path"].as_str().unwrap_or_default() {
            path @ ("/" | "/search" | "/downloads" | "/support") => path,
            _ => "/",
        };
        let search = tab["search"]
            .as_str()
            .unwrap_or_default()
            .chars()
            .take(8192)
            .collect::<String>();
        let title = tab["pageTitle"]
            .as_str()
            .unwrap_or_default()
            .chars()
            .take(300)
            .collect::<String>();
        let runtime = tab["runtime"].as_object().cloned().unwrap_or_default();
        normalized.push(json!({"id": id, "path": path, "search": search, "pageTitle": title, "runtime": runtime}));
    }
    let first = normalized.first()?.get("id")?;
    let active = input
        .get("activeTabId")
        .filter(|id| id.as_str().is_some_and(|id| ids.contains(id)))
        .unwrap_or(first);
    Some(json!({ "tabs": normalized, "activeTabId": active }))
}

fn validate_setting(key: &str, input: &Value) -> Option<Value> {
    let allowed_numbers: &[u64] = match key {
        "maxConcurrentDownloads" => &[1, 2, 3, 4, 5, 6, 7, 8],
        "staggerDownloadsMs" => &[0, 100, 150, 250, 500, 1000],
        "maxAudioBitrateKbps" => &[0, 96, 128, 160, 192, 256, 320],
        "maxVideoHeight" => &[0, 360, 480, 720, 1080, 1440, 2160],
        _ => &[],
    };
    if !allowed_numbers.is_empty() {
        let number = input.as_u64().or_else(|| input.as_str()?.parse().ok())?;
        return allowed_numbers.contains(&number).then(|| json!(number));
    }

    let choices: &[&str] = match key {
        "defaultAudioContainer" => &["mp3", "m4a", "wav", "ogg", "flac", "opus"],
        "defaultVideoContainer" => &["mp4", "webm", "mkv", "avi", "mov"],
        "downloadLocationMode" => &["all", "separate"],
        _ => &[],
    };
    if !choices.is_empty() {
        let value = input.as_str()?.trim().to_ascii_lowercase();
        return choices.contains(&value.as_str()).then(|| json!(value));
    }
    if key.ends_with("FilenamePattern") || key.ends_with("Path") {
        let value = input.as_str()?.trim();
        let limit = if key.ends_with("Path") { 4096 } else { 180 };
        return (!value.is_empty() && !value.chars().any(char::is_control))
            .then(|| json!(value.chars().take(limit).collect::<String>()));
    }
    input.as_bool().map(Value::Bool)
}

async fn read(state: State, setting: Setting) -> Result<Json<Value>, ApiError> {
    let downloads = state.system_downloads.to_string_lossy().into_owned();
    db_task(state, move |db| {
        let stored = read_setting(db, setting.key())?;
        Ok(Json(setting.normalize(&downloads, &stored, None)))
    })
    .await
}

async fn update(
    state: State,
    setting: Setting,
    patch: Map<String, Value>,
) -> Result<Json<Value>, ApiError> {
    let patch = Value::Object(patch);
    let downloads = state.system_downloads.to_string_lossy().into_owned();
    if matches!(setting, Setting::Tabs) && !patch["tabs"].is_array() {
        return Err(ApiError(StatusCode::BAD_REQUEST, "Invalid tab state"));
    }
    db_task(state, move |db| {
        let stored = read_setting(db, setting.key())?;
        let updated = setting.normalize(&downloads, &stored, Some(&patch));
        write_setting(db, setting.key(), &updated)?;
        Ok(Json(updated))
    })
    .await
}

pub fn routes() -> Router<State> {
    Router::new()
        .route(
            "/api/tabs/state",
            get(|ExtractState(state)| read(state, Setting::Tabs))
                .put(|ExtractState(state), Json(patch)| update(state, Setting::Tabs, patch)),
        )
        .route(
            "/api/auto-download/settings",
            get(|ExtractState(state)| read(state, Setting::AutoDownload)).put(
                |ExtractState(state), Json(patch)| update(state, Setting::AutoDownload, patch),
            ),
        )
        .route(
            "/api/download/settings",
            get(|ExtractState(state)| read(state, Setting::Downloads))
                .put(|ExtractState(state), Json(patch)| update(state, Setting::Downloads, patch)),
        )
}
