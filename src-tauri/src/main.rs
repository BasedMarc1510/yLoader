#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod api;
mod data;
mod desktop;
mod legacy_preferences;
mod tools;

use tauri::{Manager, Url, WebviewUrl, WebviewWindowBuilder, webview::NewWindowResponse};
use tauri_plugin_opener::OpenerExt;
use uuid::Uuid;

fn is_app_origin(url: &Url) -> bool {
    matches!(
        (url.scheme(), url.host_str()),
        ("tauri", Some("localhost")) | ("http" | "https", Some("tauri.localhost"))
    ) && url.port().is_none()
}

fn is_api_attachment(url: &Url, api_base: &str) -> bool {
    let Some(path) = url.as_str().strip_prefix(api_base) else {
        return false;
    };
    if url.query().is_some() || url.fragment().is_some() {
        return false;
    }
    if let Some(file) = path.strip_prefix("/api/download/file/") {
        return !file.is_empty() && !file.contains('/');
    }
    path.strip_prefix("/api/downloads/")
        .and_then(|path| path.strip_suffix("/file"))
        .is_some_and(|id| !id.is_empty() && id.bytes().all(|byte| byte.is_ascii_digit()))
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| desktop::shell::reveal(app)))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_autostart::Builder::new().app_name("yLoader").arg(desktop::shell::AUTOSTART_ARGUMENT).build())
        .on_window_event(desktop::shell::window_event)
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![desktop::desktop_pick, desktop::desktop_inspect, desktop::desktop_reveal, desktop::desktop_save_download,
            desktop::links::desktop_pending_links, desktop::shell::desktop_settings_get,
            desktop::shell::desktop_settings_update, desktop::shell::desktop_tray_labels,
            desktop::app_updates::desktop_app_update_get,
            desktop::app_updates::desktop_app_update_check,
            desktop::app_updates::desktop_app_update_download,
            desktop::app_updates::desktop_app_update_install,
            desktop::app_updates::desktop_app_update_auto])
        .setup(|app| {
            let paths = app.path();
            let legacy_root = paths.config_dir()?.join("yLoader").join("runtime");
            let data_root = paths.app_data_dir()?;
            let downloads = paths.download_dir().unwrap_or_else(|_| data_root.join("downloads"));
            let state = data::State::open(&data_root, &legacy_root, downloads)?;
            let legacy_preferences = state.legacy_web_preferences();
            desktop::shell::migrate_autostart(app.handle(), &state)?;
            let starts_minimized = desktop::shell::starts_minimized(&state);
            app.manage(state.clone());
            app.manage(desktop::app_updates::AppUpdates::default());
            tauri::async_runtime::spawn(desktop::app_updates::schedule(app.handle().clone()));
            desktop::links::configure(app)?;
            let listener = std::net::TcpListener::bind(("127.0.0.1", 0))?;
            listener.set_nonblocking(true)?;
            let address = listener.local_addr()?;
            let token = Uuid::new_v4().simple().to_string();
            let routes = api::router(state.clone(), &token);
            tauri::async_runtime::spawn(api::tool_updates::schedule(state.clone()));
            tauri::async_runtime::spawn(async move {
                let listener = tokio::net::TcpListener::from_std(listener)
                    .expect("failed to register desktop API listener");
                if let Err(error) = axum::serve(listener, routes).await {
                    eprintln!("Desktop API stopped: {error}");
                }
            });

            let api_base = format!("http://{address}/{token}");
            let runtime = serde_json::json!({
                "kind": "tauri",
                "isDesktop": true,
                "apiBase": api_base,
                "downloadsPath": state.system_downloads,
                "platform": match std::env::consts::OS {
                    "macos" => "darwin",
                    "windows" => "win32",
                    os => os,
                },
            });
            let initialization_script = format!(
                "if (location.protocol === 'tauri:' || location.hostname === 'tauri.localhost') {{ const runtime = {runtime}; const legacyPreferences = {legacy_preferences};\n{}\n}}",
                include_str!("desktop-bridge.js"),
            );
            let handle = app.handle().clone();
            let internal_port = address.port();
            let window_builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("yLoader")
                .decorations(cfg!(target_os = "macos"))
                .visible(!starts_minimized)
                .inner_size(1320.0, 860.0)
                .min_inner_size(1024.0, 700.0)
                .initialization_script(initialization_script)
                .on_navigation(move |url| is_app_origin(url) || is_api_attachment(url, &api_base))
                .on_new_window(move |url, _| {
                    if matches!(url.scheme(), "http" | "https") && !is_app_origin(&url)
                        && !(url.host_str() == Some("127.0.0.1") && url.port() == Some(internal_port)) {
                        let _ = handle.opener().open_url(url.as_str(), None::<&str>);
                    }
                    NewWindowResponse::Deny
                });
            #[cfg(target_os = "macos")]
            let window_builder = window_builder
                .title_bar_style(tauri::TitleBarStyle::Overlay)
                .hidden_title(true)
                .traffic_light_position(tauri::LogicalPosition::new(14.0, 16.0))
                .accept_first_mouse(true);
            let window = window_builder.build()?;
            desktop::shell::configure(app.handle())?;
            if starts_minimized {
                window.minimize()?;
                window.show()?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to run yLoader");
}
