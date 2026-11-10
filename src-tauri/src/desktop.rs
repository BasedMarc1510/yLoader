pub mod app_updates;
pub mod links;
pub mod shell;

use std::path::{Path, PathBuf};

use serde_json::{Value, json};
use tauri::{Manager, WebviewWindow};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

fn directory(window: &WebviewWindow, raw: &str) -> Option<PathBuf> {
    let path = Path::new(raw.trim());
    let start = if path.is_dir() {
        Some(path)
    } else {
        path.parent().filter(|parent| parent.is_dir())
    };
    start
        .filter(|path| path.is_absolute())
        .map(Path::to_owned)
        .or_else(|| window.path().download_dir().ok())
}

#[tauri::command]
pub async fn desktop_pick(
    window: WebviewWindow,
    mode: String,
    initial_path: String,
    suggested_name: String,
) -> Result<Value, &'static str> {
    let mut dialog = window.dialog().file().set_parent(&window);
    if let Some(path) = directory(&window, &initial_path) {
        dialog = dialog.set_directory(path);
    }
    if !suggested_name.is_empty() {
        let name = suggested_name
            .chars()
            .filter(|c| !c.is_control() && !"/\\:*?\"<>|".contains(*c))
            .take(180)
            .collect::<String>();
        dialog = dialog.set_file_name(name);
    }
    let choice = match mode.as_str() {
        "directory" => dialog.blocking_pick_folder(),
        "file" => dialog.blocking_pick_file(),
        "save" => dialog.blocking_save_file(),
        _ => return Err("Unsupported dialog type"),
    }
    .and_then(|path| path.into_path().ok());
    Ok(match choice {
        Some(path) => json!({"canceled": false, "path": path}),
        None => json!({"canceled": true, "path": ""}),
    })
}

#[tauri::command]
pub async fn desktop_inspect(path: String) -> Value {
    let path = Path::new(path.trim());
    let metadata = path
        .is_absolute()
        .then(|| std::fs::metadata(path).ok())
        .flatten();
    let is_file = metadata.as_ref().is_some_and(|m| m.is_file());
    let is_directory = metadata.as_ref().is_some_and(|m| m.is_dir());
    let readable = is_file && std::fs::File::open(path).is_ok();
    let writable = is_directory && tempfile::NamedTempFile::new_in(path).is_ok();
    json!({"path": path, "exists": metadata.is_some(), "isFile": is_file, "isDirectory": is_directory,
        "readable": readable, "writable": writable, "valid": readable || writable})
}

#[tauri::command]
pub async fn desktop_reveal(window: WebviewWindow, path: String) -> Value {
    let path = PathBuf::from(path);
    if !path.is_absolute() || !path.exists() {
        return json!({"ok": false});
    }
    let result = if path.is_dir() {
        window
            .opener()
            .open_path(path.to_string_lossy().into_owned(), None::<&str>)
    } else {
        window.opener().reveal_item_in_dir(&path)
    };
    json!({"ok": result.is_ok(), "path": path})
}

#[tauri::command]
pub async fn desktop_save_download(
    window: WebviewWindow,
    state: tauri::State<'_, crate::data::State>,
    id: i64,
) -> Result<(), &'static str> {
    let missing = "File not found";
    let entry = crate::api::history::get_download(state.inner().clone(), id)
        .await
        .map_err(|_| missing)?
        .ok_or(missing)?;
    let source = entry.file(&state).ok_or(missing)?;
    let name = source
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("download");
    let choice = desktop_pick(
        window,
        "save".into(),
        state.system_downloads.to_string_lossy().into_owned(),
        name.into(),
    )
    .await?;
    let Some(destination) = choice["path"].as_str().filter(|path| !path.is_empty()) else {
        return Ok(());
    };
    let destination = PathBuf::from(destination);
    let failed = "Could not save file";
    tokio::task::spawn_blocking(move || {
        if destination.canonicalize().ok() == source.canonicalize().ok() {
            return Ok(());
        }
        let parent = destination
            .parent()
            .filter(|path| path.is_absolute())
            .ok_or(failed)?;
        let mut staged = tempfile::NamedTempFile::new_in(parent).map_err(|_| failed)?;
        let mut input = std::fs::File::open(source).map_err(|_| failed)?;
        std::io::copy(&mut input, &mut staged).map_err(|_| failed)?;
        staged.persist(destination).map_err(|_| failed)?;
        Ok(())
    })
    .await
    .map_err(|_| failed)?
}
