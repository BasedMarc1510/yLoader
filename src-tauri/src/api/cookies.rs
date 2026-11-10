use axum::{Json, Router, extract::State as ExtractState, http::StatusCode, routing::get};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};
use tokio::process::Command;

use super::{ApiError, db_task};
use crate::data::{State, read_setting, write_setting};

const KEY: &str = "ytDlp.cookies.settings.v1";
const BROWSERS: &[&str] = &[
    "brave", "chrome", "chromium", "edge", "firefox", "opera", "safari", "vivaldi", "whale",
];
const KEYRINGS: &[&str] = &[
    "basictext",
    "gnomekeyring",
    "kwallet",
    "kwallet5",
    "kwallet6",
];

#[derive(Default, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Cookies {
    cookies_file_enabled: bool,
    cookies_file_path: String,
    cookies_from_browser_enabled: bool,
    browser_name: String,
    browser_keyring: String,
    browser_profile: String,
    browser_container: String,
}

fn browsers() -> impl Iterator<Item = &'static str> {
    BROWSERS
        .iter()
        .copied()
        .filter(|browser| cfg!(target_os = "macos") || *browser != "safari")
}

fn normalize_text(value: &str, limit: usize) -> String {
    value
        .chars()
        .filter(|c| *c != '\0')
        .map(|c| if c.is_control() { ' ' } else { c })
        .collect::<String>()
        .trim()
        .chars()
        .take(limit)
        .collect()
}

impl Cookies {
    fn normalize(mut self) -> Self {
        self.cookies_file_path = normalize_text(&self.cookies_file_path, 4096);
        self.browser_profile = normalize_text(&self.browser_profile, 1024);
        self.browser_container = normalize_text(&self.browser_container, 256);
        self.browser_name = self.browser_name.trim().to_ascii_lowercase();
        self.browser_keyring = self.browser_keyring.trim().to_ascii_lowercase();
        if !browsers().any(|name| name == self.browser_name) {
            self.browser_name.clear();
            self.browser_profile.clear();
            self.cookies_from_browser_enabled = false;
        }
        if matches!(self.browser_name.as_str(), "firefox" | "safari" | "")
            || !KEYRINGS.contains(&self.browser_keyring.as_str())
        {
            self.browser_keyring.clear();
        }
        if self.browser_name != "firefox" {
            self.browser_container.clear();
        }
        if self.cookies_from_browser_enabled {
            self.cookies_file_enabled = false;
        }
        self
    }

    fn response(&self) -> Value {
        let mut response = serde_json::to_value(self).expect("cookie settings are serializable");
        response["runtimeTarget"] = json!("tauri");
        response["browserImportSupported"] = json!(true);
        response["supportedBrowsers"] = json!(browsers().collect::<Vec<_>>());
        response["supportedKeyrings"] = json!(KEYRINGS);
        response
    }

    pub fn add_args(
        &self,
        command: &mut Command,
    ) -> Result<Option<tempfile::NamedTempFile>, ApiError> {
        if self.cookies_from_browser_enabled {
            let mut spec = self.browser_name.clone();
            for (separator, value) in [
                ("+", &self.browser_keyring),
                (":", &self.browser_profile),
                ("::", &self.browser_container),
            ] {
                if !value.is_empty() {
                    spec.push_str(separator);
                    spec.push_str(value);
                }
            }
            command.args(["--cookies-from-browser", &spec]);
        }
        if self.cookies_file_enabled {
            // yt-dlp writes its cookie jar on exit. Pass a private snapshot to keep the original untouched.
            use std::io::Read;
            let error = || ApiError(StatusCode::BAD_REQUEST, "Could not read cookie file");
            let source = std::fs::File::open(&self.cookies_file_path).map_err(|_| error())?;
            let metadata = source.metadata().map_err(|_| error())?;
            if !metadata.is_file() || metadata.len() > 10 * 1024 * 1024 {
                return Err(error());
            }
            let mut snapshot = tempfile::NamedTempFile::new().map_err(|_| error())?;
            if std::io::copy(&mut source.take(10 * 1024 * 1024 + 1), &mut snapshot)
                .map_err(|_| error())?
                > 10 * 1024 * 1024
            {
                return Err(error());
            }
            command.arg("--cookies").arg(snapshot.path());
            return Ok(Some(snapshot));
        }
        Ok(None)
    }
}

pub async fn load(state: State) -> Result<Cookies, ApiError> {
    db_task(state, |db| {
        let stored = read_setting(db, KEY)?;
        Ok(serde_json::from_value::<Cookies>(stored)
            .unwrap_or_default()
            .normalize())
    })
    .await
}

async fn read(ExtractState(state): ExtractState<State>) -> Result<Json<Value>, ApiError> {
    Ok(Json(load(state).await?.response()))
}

async fn update(
    ExtractState(state): ExtractState<State>,
    Json(patch): Json<Map<String, Value>>,
) -> Result<Json<Value>, ApiError> {
    db_task(state, move |db| {
        let stored = read_setting(db, KEY)?;
        let current = serde_json::from_value::<Cookies>(stored).unwrap_or_default();
        let mut object = serde_json::to_value(current)
            .unwrap()
            .as_object()
            .unwrap()
            .clone();
        object.extend(patch);
        let Ok(settings) = serde_json::from_value::<Cookies>(Value::Object(object)) else {
            return Ok(Err(ApiError(
                StatusCode::BAD_REQUEST,
                "Invalid cookie settings",
            )));
        };
        let settings = settings.normalize();
        if settings.cookies_file_enabled && settings.cookies_file_path.is_empty() {
            return Ok(Err(ApiError(
                StatusCode::BAD_REQUEST,
                "Cookie file path is required when cookie file import is enabled",
            )));
        }
        write_setting(db, KEY, &serde_json::to_value(&settings).unwrap())?;
        Ok(Ok(Json(settings.response())))
    })
    .await?
}

pub fn routes() -> Router<State> {
    Router::new().route("/api/yt-dlp/cookies/settings", get(read).put(update))
}
