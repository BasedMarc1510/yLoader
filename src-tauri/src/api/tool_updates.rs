use std::{
    path::Path,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use axum::{
    Json, Router,
    extract::{Query, State as ExtractState},
    response::{
        IntoResponse, Response,
        sse::{Event, KeepAlive, Sse},
    },
    routing::{get, post},
};
use serde::Deserialize;
use serde_json::{Value, json};
use tokio_stream::wrappers::ReceiverStream;

use super::{ApiError, db_task};
use crate::{
    data::{State, read_setting, write_setting},
    tools::{Tool, available_path, install, version},
};

const KEY: &str = "tools.updater.settings.v1";

fn enabled_key(tool: Tool) -> &'static str {
    if tool == Tool::YtDlp {
        "ytDlpAutoUpdate"
    } else {
        "ffmpegAutoUpdate"
    }
}

fn normalize(stored: &Value, patch: &Value) -> Value {
    let enabled = |key: &str| {
        patch[key]
            .as_bool()
            .or(stored[key].as_bool())
            .unwrap_or(true)
    };
    json!({
        "ytDlpAutoUpdate": enabled("ytDlpAutoUpdate"),
        "ffmpegAutoUpdate": enabled("ffmpegAutoUpdate")
    })
}

async fn settings(state: &State) -> Result<Value, ApiError> {
    db_task(state.clone(), |db| {
        Ok(normalize(&read_setting(db, KEY)?, &Value::Null))
    })
    .await
}

async fn get_settings(ExtractState(state): ExtractState<State>) -> Result<Json<Value>, ApiError> {
    Ok(Json(settings(&state).await?))
}

async fn put_settings(
    ExtractState(state): ExtractState<State>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    db_task(state, move |db| {
        let next = normalize(&read_setting(db, KEY)?, &body);
        write_setting(db, KEY, &next)?;
        Ok(Json(next))
    })
    .await
}

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StatusQuery {
    local_only: Option<String>,
    force_latest: Option<String>,
}

fn flag(value: Option<String>) -> bool {
    matches!(value.as_deref(), Some("true" | "1"))
}

fn bytes(path: &Path) -> Option<u64> {
    path.metadata().ok().map(|metadata| metadata.len())
}

fn size(length: Option<u64>) -> String {
    length
        .map(|bytes| format!("{:.1} MiB", bytes as f64 / (1024.0 * 1024.0)))
        .unwrap_or_default()
}

async fn status(state: &State, tool: Tool, options: StatusQuery, settings: &Value) -> Value {
    let path = available_path(state.tools.path(tool));
    let (current, project_managed) = if let Some(path) = &path {
        (version(tool, path).await.ok(), state.tools.managed(path))
    } else {
        (None, true)
    };
    let remote = if flag(options.local_only) {
        None
    } else {
        state
            .tools
            .latest(tool, flag(options.force_latest))
            .await
            .ok()
    };
    let (latest, tag, url) = remote
        .as_ref()
        .map(|release| {
            let version = release.tag_name.trim_start_matches(['v', 'b']);
            (
                version,
                release.tag_name.as_str(),
                release.html_url.as_str(),
            )
        })
        .unwrap_or_default();
    let outdated = current.as_ref().is_some_and(|current| {
        !latest.is_empty() && current.split('-').next().unwrap_or(current) != latest
    });
    let length = path.as_deref().and_then(bytes);
    let probe_path = available_path(state.tools.path(Tool::Ffprobe));
    let probe_version = if tool == Tool::Ffmpeg {
        if let Some(path) = &probe_path {
            version(Tool::Ffprobe, path).await.ok()
        } else {
            None
        }
    } else {
        None
    };
    let supported = install::source(tool).is_some();
    json!({
        "available": current.is_some(), "currentVersion": current.as_deref().unwrap_or_default(),
        "version": current.as_deref().unwrap_or_default(), "latestVersion": latest,
        "latestReleaseTag": tag, "latestHtmlUrl": url, "outdated": outdated,
        "updateAvailable": outdated, "updateSupported": supported, "updateInProgress": state.tools.installing(),
        "autoUpdateEnabled": settings[enabled_key(tool)], "projectManaged": project_managed,
        "path": path, "binaryPath": path, "fileSizeHuman": size(length), "binarySizeHuman": size(length),
        "ffprobePath": probe_path, "ffprobeVersion": probe_version,
        "latestSource": if remote.is_some() { "github-release" } else { "none" },
        "lastUpdatedAt": state.tool_updates.last_update(tool),
    })
}

async fn yt_status(
    ExtractState(state): ExtractState<State>,
    Query(query): Query<StatusQuery>,
) -> Result<Json<Value>, ApiError> {
    let settings = settings(&state).await?;
    Ok(Json(status(&state, Tool::YtDlp, query, &settings).await))
}

async fn ff_status(
    ExtractState(state): ExtractState<State>,
    Query(query): Query<StatusQuery>,
) -> Result<Json<Value>, ApiError> {
    let settings = settings(&state).await?;
    Ok(Json(status(&state, Tool::Ffmpeg, query, &settings).await))
}

async fn summary(state: &State, force: bool) -> Result<Json<Value>, ApiError> {
    let settings = settings(state).await?;
    let query = || StatusQuery {
        force_latest: force.then(|| "1".into()),
        ..Default::default()
    };
    let (yt, ff) = tokio::join!(
        status(state, Tool::YtDlp, query(), &settings),
        status(state, Tool::Ffmpeg, query(), &settings)
    );
    Ok(Json(json!({
        "anyUpdateAvailable": yt["outdated"] == true || ff["outdated"] == true,
        "anyUpdateInProgress": state.tools.installing(),
        "ytDlp": yt, "ffmpeg": ff
    })))
}

async fn get_summary(ExtractState(state): ExtractState<State>) -> Result<Json<Value>, ApiError> {
    summary(&state, false).await
}

async fn force_check(ExtractState(state): ExtractState<State>) -> Result<Json<Value>, ApiError> {
    summary(&state, true).await
}

#[derive(Default)]
pub struct UpdateState {
    notifications: std::sync::Mutex<Vec<Value>>,
    timestamps: [std::sync::atomic::AtomicU64; 2],
}

impl UpdateState {
    fn last_update(&self, tool: Tool) -> u64 {
        self.timestamps[usize::from(tool == Tool::Ffmpeg)]
            .load(std::sync::atomic::Ordering::Relaxed)
    }

    fn notify(&self, tool: Tool, version: &str) {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;
        self.timestamps[usize::from(tool == Tool::Ffmpeg)]
            .store(now, std::sync::atomic::Ordering::Relaxed);
        let mut notifications = self.notifications.lock().unwrap_or_else(|e| e.into_inner());
        notifications.push(json!({
            "id": uuid::Uuid::new_v4().to_string(), "type": "updated", "version": version,
            "tool": if tool == Tool::YtDlp { "ytDlp" } else { "ffmpeg" }, "createdAt": now
        }));
        if notifications.len() > 40 {
            notifications.remove(0);
        }
    }
}

#[derive(Deserialize)]
struct NotificationQuery {
    peek: Option<String>,
}

async fn notifications(
    ExtractState(state): ExtractState<State>,
    Query(query): Query<NotificationQuery>,
) -> Json<Value> {
    let mut notifications = state
        .tool_updates
        .notifications
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    let entries = if flag(query.peek) {
        notifications.clone()
    } else {
        std::mem::take(&mut *notifications)
    };
    Json(json!({"notifications": entries}))
}

pub async fn schedule(state: State) {
    tokio::time::sleep(Duration::from_secs(30)).await;
    loop {
        if let Ok(settings) = settings(&state).await {
            for tool in [Tool::YtDlp, Tool::Ffmpeg] {
                if settings[enabled_key(tool)] != true
                    || !state.tools.managed(&state.tools.path(tool))
                {
                    continue;
                }
                let status = status(&state, tool, StatusQuery::default(), &settings).await;
                if status["outdated"] == true
                    && let Ok(version) = state.tools.install(tool).await
                {
                    state.tool_updates.notify(tool, &version);
                }
            }
        }
        tokio::time::sleep(Duration::from_secs(6 * 60 * 60)).await;
    }
}

fn update_stream(state: State, tool: Tool) -> Response {
    let (sender, receiver) = tokio::sync::mpsc::channel(4);
    tokio::spawn(async move {
        let mut update = std::pin::pin!(state.tools.install(tool));
        let mut heartbeat = tokio::time::interval(Duration::from_secs(15));
        heartbeat.tick().await;
        let result = loop {
            tokio::select! {
                result = &mut update => break result,
                _ = sender.closed() => return,
                _ = heartbeat.tick() => {
                    if sender.send(Ok(Event::default().data(tool.name()))).await.is_err() {
                        return;
                    }
                }
            }
        };
        let end = match result {
            Ok(version) => {
                state.tool_updates.notify(tool, &version);
                let _ = sender.send(Ok(Event::default().data(version))).await;
                "done"
            }
            Err(_) => "failed",
        };
        let _ = sender
            .send(Ok(Event::default().event("end").data(end)))
            .await;
    });
    Sse::new(ReceiverStream::<Result<Event, std::convert::Infallible>>::new(receiver))
        .keep_alive(KeepAlive::default())
        .into_response()
}

pub fn routes() -> Router<State> {
    Router::new()
        .route(
            "/api/tool-updates/settings",
            get(get_settings).put(put_settings),
        )
        .route("/api/tool-updates/summary", get(get_summary))
        .route("/api/tool-updates/check", post(force_check))
        .route("/api/tool-updates/notifications", get(notifications))
        .route("/api/yt-dlp/status", get(yt_status))
        .route("/api/ffmpeg/status", get(ff_status))
        .route(
            "/api/yt-dlp/update/stream",
            get(|ExtractState(state)| async { update_stream(state, Tool::YtDlp) }),
        )
        .route(
            "/api/ffmpeg/update/stream",
            get(|ExtractState(state)| async { update_stream(state, Tool::Ffmpeg) }),
        )
}
