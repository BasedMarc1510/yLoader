use std::{collections::VecDeque, sync::Mutex};

use serde_json::{Value, json};
use tauri::{App, AppHandle, Emitter, Manager, State, Url};
use tauri_plugin_deep_link::DeepLinkExt;

const SCHEME: &str = "yloader";
pub const EVENT: &str = "desktop-deep-link";

#[derive(Default)]
pub struct LinkQueue(Mutex<VecDeque<Value>>);

fn parse(link: &Url) -> Option<Value> {
    if link.scheme() != SCHEME || link.as_str().len() > 256 * 1024 {
        return None;
    }
    let pairs = link.query_pairs().collect::<Vec<_>>();
    let first = |key: &str| {
        pairs
            .iter()
            .find(|(k, _)| k == key)
            .map(|(_, v)| v.as_ref())
            .unwrap_or_default()
    };
    let mut urls = Vec::new();
    let mut push = |candidate: &str| {
        if urls.len() < 50
            && candidate.len() <= 4096
            && let Ok(url) = Url::parse(candidate.trim())
            && matches!(url.scheme(), "http" | "https")
            && url.username().is_empty()
            && url.password().is_none()
        {
            let url = url.to_string();
            if !urls.contains(&url) {
                urls.push(url);
            }
        }
    };
    for (_, value) in pairs.iter().filter(|(key, _)| key == "url") {
        push(value);
    }
    for (_, value) in pairs.iter().filter(|(key, _)| key == "urls") {
        if let Ok(batch) = serde_json::from_str::<Vec<String>>(value) {
            for item in batch {
                push(&item);
            }
        } else {
            for item in value.split(['\r', '\n']) {
                push(item);
            }
        }
    }
    push(first("source"));
    let action = link
        .host_str()
        .filter(|host| !host.is_empty())
        .or_else(|| link.path_segments()?.find(|s| !s.is_empty()))
        .unwrap_or("open");
    Some(json!({
        "id": uuid::Uuid::new_v4().to_string(), "action": action.to_ascii_lowercase(),
        "target": if matches!(first("target").to_ascii_lowercase().as_str(), "current" | "current-tab") { "current-tab" } else { "new-tab" },
        "service": first("service").chars().take(40).collect::<String>().to_ascii_lowercase(),
        "urls": urls
    }))
}

fn enqueue(app: &AppHandle, urls: Vec<Url>) {
    let state = app.state::<LinkQueue>();
    let mut queue = state.0.lock().unwrap_or_else(|e| e.into_inner());
    let previous = queue.len();
    queue.extend(urls.iter().filter_map(parse));
    if queue.len() == previous {
        return;
    }
    while queue.len() > 40 {
        queue.pop_front();
    }
    drop(queue);
    super::shell::reveal(app);
    let _ = app.emit_to("main", EVENT, ());
}

pub fn configure(app: &App) -> tauri_plugin_deep_link::Result<()> {
    app.manage(LinkQueue::default());
    if let Some(initial) = app.deep_link().get_current()? {
        enqueue(app.handle(), initial);
    }
    let handle = app.handle().clone();
    app.deep_link()
        .on_open_url(move |event| enqueue(&handle, event.urls()));
    Ok(())
}

#[tauri::command]
pub fn desktop_pending_links(state: State<'_, LinkQueue>) -> Vec<Value> {
    state
        .0
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .drain(..)
        .collect()
}
