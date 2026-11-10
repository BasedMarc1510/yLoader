use std::{
    sync::Mutex,
    time::{Duration, Instant},
};

use serde_json::{Value, json};
use tauri::{AppHandle, Emitter, Manager, Url};
use tauri_plugin_updater::{Update, UpdaterExt};

use crate::data::{State, UPDATE_SETTINGS_KEY, read_setting, write_setting};

const EVENT: &str = "desktop-app-updater";

fn configuration() -> Option<(Url, &'static str)> {
    let url = Url::parse(option_env!("YLOADER_TAURI_UPDATE_ENDPOINT")?).ok()?;
    let key = option_env!("YLOADER_TAURI_UPDATE_PUBKEY")?.trim();
    (url.scheme() == "https" && !key.is_empty()).then_some((url, key))
}

pub fn enabled() -> bool {
    configuration().is_some()
}

#[derive(Default)]
pub struct AppUpdates {
    operation: tokio::sync::Mutex<()>,
    update: Mutex<UpdateState>,
}

#[derive(Default)]
struct UpdateState {
    phase: &'static str,
    release: Option<Update>,
    archive: Option<Vec<u8>>,
    transferred: u64,
    total: u64,
    rate: u64,
    error: String,
}

fn auto_enabled(app: &AppHandle) -> bool {
    let state = app.state::<State>();
    state
        .db
        .lock()
        .ok()
        .and_then(|db| read_setting(&db, UPDATE_SETTINGS_KEY).ok())
        .and_then(|value| value.as_bool())
        .unwrap_or(true)
}

fn snapshot(app: &AppHandle) -> Value {
    let updates = app.state::<AppUpdates>();
    let state = updates.update.lock().unwrap_or_else(|e| e.into_inner());
    let version = state
        .release
        .as_ref()
        .map(|release| release.version.as_str())
        .unwrap_or_default();
    json!({
        "currentVersion": app.package_info().version.to_string(),
        "phase": if state.phase.is_empty() { "idle" } else { state.phase },
        "availableVersion": version,
        "downloadedVersion": if state.archive.is_some() { version } else { "" },
        "error": state.error,
        "canCheckForUpdates": enabled(), "canAutoUpdate": enabled(), "autoUpdateEnabled": auto_enabled(app),
        "runtimeTarget": "tauri", "deploymentTarget": "desktop",
        "closeBlocked": state.phase == "installing",
        "progress": {
            "percent": if state.total > 0 { 100.0 * state.transferred as f64 / state.total as f64 } else { 0.0 },
            "transferred": state.transferred, "total": state.total, "bytesPerSecond": state.rate
        }
    })
}

fn change(app: &AppHandle, apply: impl FnOnce(&mut UpdateState)) {
    let updates = app.state::<AppUpdates>();
    apply(&mut updates.update.lock().unwrap_or_else(|e| e.into_inner()));
    let _ = app.emit_to("main", EVENT, json!({"state": snapshot(app)}));
}

fn failure(app: &AppHandle, message: &str) -> Value {
    change(app, |state| {
        state.phase = "error";
        state.error = message.to_owned();
    });
    json!({"ok": false, "error": message})
}

async fn download(app: &AppHandle, update: Update) -> Value {
    change(app, |state| {
        state.phase = "downloading";
        state.error.clear();
        state.transferred = 0;
        state.total = 0;
        state.rate = 0;
    });
    let started = Instant::now();
    let mut last_event = Instant::now();
    let mut bytes = 0_u64;
    let result = update
        .download(
            |chunk, total| {
                bytes += chunk as u64;
                if last_event.elapsed() >= Duration::from_millis(200) {
                    last_event = Instant::now();
                    change(app, |state| {
                        state.transferred = bytes;
                        state.total = total.unwrap_or_default();
                        state.rate = (bytes as f64 / started.elapsed().as_secs_f64()) as u64;
                    });
                }
            },
            || {},
        )
        .await;
    match result {
        Ok(archive) => {
            change(app, |state| {
                state.phase = "downloaded";
                state.total = archive.len() as u64;
                state.transferred = state.total;
                state.archive = Some(archive);
            });
            json!({"ok": true})
        }
        Err(error) => failure(app, &error.to_string()),
    }
}

#[tauri::command]
pub fn desktop_app_update_get(app: AppHandle) -> Value {
    snapshot(&app)
}

#[tauri::command]
pub async fn desktop_app_update_check(app: AppHandle) -> Value {
    let Some((url, key)) = configuration() else {
        return json!({"ok": false, "reason": "unsupported"});
    };
    let updates = app.state::<AppUpdates>();
    let Ok(_operation) = updates.operation.try_lock() else {
        return json!({"ok": false, "reason": "busy"});
    };
    if updates
        .update
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .archive
        .is_some()
    {
        return json!({"ok": true});
    }
    change(&app, |state| {
        state.phase = "checking";
        state.error.clear();
    });
    let updater = app
        .updater_builder()
        .pubkey(key)
        .endpoints(vec![url])
        .and_then(|builder| builder.build());
    let result = match updater {
        Ok(updater) => updater.check().await,
        Err(error) => Err(error),
    };
    match result {
        Ok(release) => {
            change(&app, |state| {
                state.phase = if release.is_some() {
                    "update-available"
                } else {
                    "up-to-date"
                };
                state.release = release.clone();
            });
            if let Some(release) = release
                && auto_enabled(&app)
            {
                return download(&app, release).await;
            }
            json!({"ok": true})
        }
        Err(error) => failure(&app, &error.to_string()),
    }
}

#[tauri::command]
pub async fn desktop_app_update_download(app: AppHandle) -> Value {
    let updates = app.state::<AppUpdates>();
    let Ok(_operation) = updates.operation.try_lock() else {
        return json!({"ok": false, "reason": "busy"});
    };
    let release = {
        let state = updates.update.lock().unwrap_or_else(|e| e.into_inner());
        if state.archive.is_some() {
            return json!({"ok": true});
        }
        state.release.clone()
    };
    match release {
        Some(release) => download(&app, release).await,
        None => json!({"ok": false, "reason": "unsupported"}),
    }
}

#[tauri::command]
pub async fn desktop_app_update_install(app: AppHandle) -> Value {
    let updates = app.state::<AppUpdates>();
    let Ok(_operation) = updates.operation.try_lock() else {
        return json!({"ok": false, "reason": "busy"});
    };
    let installation = {
        let mut state = updates.update.lock().unwrap_or_else(|e| e.into_inner());
        state.release.clone().zip(state.archive.take())
    };
    let Some((release, archive)) = installation else {
        return json!({"ok": false, "reason": "unsupported"});
    };
    change(&app, |state| state.phase = "installing");
    match tokio::task::spawn_blocking(move || release.install(archive)).await {
        Ok(Ok(())) => app.restart(),
        Ok(Err(error)) => failure(&app, &error.to_string()),
        Err(error) => failure(&app, &error.to_string()),
    }
}

#[tauri::command]
pub async fn desktop_app_update_auto(app: AppHandle, enabled: bool) -> Result<Value, &'static str> {
    {
        let state = app.state::<State>();
        let db = state
            .db
            .lock()
            .map_err(|_| "Could not save update preferences")?;
        write_setting(&db, UPDATE_SETTINGS_KEY, &json!(enabled))
            .map_err(|_| "Could not save update preferences")?;
    }
    change(&app, |_| ());
    if enabled {
        tauri::async_runtime::spawn(desktop_app_update_check(app));
    }
    Ok(json!({"ok": true, "autoUpdateEnabled": enabled}))
}

pub async fn schedule(app: AppHandle) {
    if enabled() {
        tokio::time::sleep(Duration::from_secs(30)).await;
        loop {
            desktop_app_update_check(app.clone()).await;
            tokio::time::sleep(Duration::from_secs(6 * 60 * 60)).await;
        }
    }
}
