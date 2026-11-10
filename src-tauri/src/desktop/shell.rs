use serde_json::{Value, json};
use tauri::{
    AppHandle, Manager, Window, WindowEvent,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};
use tauri_plugin_autostart::ManagerExt;

use crate::data::{
    AUTOSTART_MIGRATION_KEY, SHELL_SETTINGS_KEY, State, read_setting, write_setting,
};

const TRAY: &str = "yloader";
pub const AUTOSTART_ARGUMENT: &str = "--yloader-tauri-auto-launch";

fn saved(state: &State) -> Value {
    state
        .db
        .lock()
        .ok()
        .and_then(|db| read_setting(&db, SHELL_SETTINGS_KEY).ok())
        .unwrap_or_default()
}

fn mode(value: &Value) -> &'static str {
    if value == "minimized" {
        "minimized"
    } else {
        "normal"
    }
}

fn snapshot(app: &AppHandle, state: &State) -> Value {
    let stored = saved(state);
    let startup = app.autolaunch().is_enabled();
    json!({
        "closeToTrayOnWindowClose": stored["closeToTrayOnWindowClose"] == true,
        "startupWindowMode": mode(&stored["startupWindowMode"]),
        "startupSupported": startup.is_ok(),
        "startOnSystemStartup": startup.unwrap_or(false)
    })
}

#[tauri::command]
pub fn desktop_settings_get(app: AppHandle, state: tauri::State<'_, State>) -> Value {
    snapshot(&app, &state)
}

#[tauri::command]
pub fn desktop_settings_update(
    app: AppHandle,
    state: tauri::State<'_, State>,
    patch: Value,
) -> Result<Value, &'static str> {
    let current = snapshot(&app, &state);
    let close = patch["closeToTrayOnWindowClose"]
        .as_bool()
        .unwrap_or(current["closeToTrayOnWindowClose"] == true);
    let startup_mode = patch
        .get("startupWindowMode")
        .map(mode)
        .unwrap_or_else(|| mode(&current["startupWindowMode"]));
    if let Some(startup) = patch["startOnSystemStartup"].as_bool()
        && startup != (current["startOnSystemStartup"] == true)
    {
        let manager = app.autolaunch();
        let result = if startup {
            manager.enable()
        } else {
            manager.disable()
        };
        result.map_err(|_| "Could not change autostart registration")?;
    }
    let db = state
        .db
        .lock()
        .map_err(|_| "Could not save desktop preferences")?;
    write_setting(
        &db,
        SHELL_SETTINGS_KEY,
        &json!({"closeToTrayOnWindowClose": close, "startupWindowMode": startup_mode}),
    )
    .map_err(|_| "Could not save desktop preferences")?;
    if patch["startOnSystemStartup"].is_boolean() {
        write_setting(&db, AUTOSTART_MIGRATION_KEY, &Value::Bool(false))
            .map_err(|_| "Could not save desktop preferences")?;
    }
    drop(db);
    Ok(snapshot(&app, &state))
}

pub fn reveal(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

pub fn starts_minimized(state: &State) -> bool {
    std::env::args_os().any(|arg| arg == AUTOSTART_ARGUMENT || arg == "--yloader-auto-launch")
        && saved(state)["startupWindowMode"] == "minimized"
}

pub fn migrate_autostart(app: &AppHandle, state: &State) -> crate::data::StartupResult<()> {
    let db = state
        .db
        .lock()
        .map_err(|_| "Could not read desktop preferences")?;
    if read_setting(&db, AUTOSTART_MIGRATION_KEY)? == true {
        let startup = app.autolaunch();
        if startup.is_enabled().unwrap_or(false) || startup.enable().is_ok() {
            write_setting(&db, AUTOSTART_MIGRATION_KEY, &Value::Bool(false))?;
        }
    }
    Ok(())
}

pub fn window_event(window: &Window, event: &WindowEvent) {
    if let WindowEvent::CloseRequested { api, .. } = event
        && let Some(state) = window.try_state::<State>()
        && window.app_handle().tray_by_id(TRAY).is_some()
        && saved(&state)["closeToTrayOnWindowClose"] == true
        && window.hide().is_ok()
    {
        api.prevent_close();
    }
}

pub fn configure(app: &AppHandle) -> tauri::Result<()> {
    let Some(icon) = app.default_window_icon() else {
        return Ok(());
    };
    TrayIconBuilder::with_id(TRAY)
        .icon(icon.clone())
        .tooltip("yLoader")
        .menu(&Menu::new(app)?)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => reveal(app),
            "quit" => app.exit(0),
            _ => (),
        })
        .on_tray_icon_event(|tray, event| {
            if matches!(
                event,
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                }
            ) {
                reveal(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

#[tauri::command]
pub fn desktop_tray_labels(app: AppHandle, quit: String) -> Result<(), String> {
    let Some(tray) = app.tray_by_id(TRAY) else {
        return Ok(());
    };
    let make_menu = || -> tauri::Result<()> {
        let show = MenuItem::with_id(&app, "show", "yLoader", true, None::<&str>)?;
        let separator = PredefinedMenuItem::separator(&app)?;
        let quit = MenuItem::with_id(&app, "quit", quit, true, None::<&str>)?;
        tray.set_menu(Some(Menu::with_items(&app, &[&show, &separator, &quit])?))
    };
    make_menu().map_err(|error| error.to_string())
}
