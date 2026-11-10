use std::{
    fs,
    io::ErrorKind,
    path::{Path, PathBuf},
};

use tauri::{Manager, WebviewWindow};
use tauri_plugin_dialog::DialogExt;

fn locations(home: &Path, browser: &str, profile: &str) -> Vec<PathBuf> {
    // Match yt-dlp's macOS search paths. Safari's profile argument is a file.
    let default = match browser {
        "brave" => "BraveSoftware/Brave-Browser",
        "chrome" => "Google/Chrome",
        "chromium" => "Chromium",
        "edge" => "Microsoft Edge",
        "firefox" => "Firefox/Profiles",
        "opera" => "com.operasoftware.Opera",
        "safari" => "",
        "vivaldi" => "Vivaldi",
        "whale" => "Naver/Whale",
        _ => return Vec::new(),
    };
    if let Some(path) = profile.strip_prefix("~/") {
        return vec![home.join(path)];
    }
    if profile.contains('/') || (browser == "safari" && !profile.is_empty()) {
        return std::path::absolute(profile).into_iter().collect();
    }
    if browser == "safari" {
        return [
            "Library/Cookies/Cookies.binarycookies",
            "Library/Containers/com.apple.Safari/Data/Library/Cookies/Cookies.binarycookies",
        ]
        .into_iter()
        .map(|path| home.join(path))
        .collect();
    }
    let root = home.join("Library/Application Support").join(default);
    if profile.is_empty() || browser == "opera" {
        vec![root]
    } else {
        vec![root.join(profile)]
    }
}

fn check(path: &Path, file: bool) -> std::io::Result<()> {
    if file {
        if !path.metadata()?.is_file() {
            return Err(ErrorKind::NotFound.into());
        }
        fs::File::open(path).map(|_| ())
    } else {
        fs::read_dir(path)?.next().transpose().map(|_| ())
    }
}

pub(super) fn request(
    window: &WebviewWindow,
    browser: &str,
    profile: &str,
    title: String,
) -> &'static str {
    if profile.len() > 4096 || profile.chars().any(char::is_control) || title.len() > 512 {
        return "unavailable";
    }
    let Ok(home) = window.path().home_dir() else {
        return "unavailable";
    };
    let file = browser == "safari";
    let mut blocked = None;
    for path in locations(&home, browser, profile.trim()) {
        match check(&path, file) {
            Ok(()) => return "ready",
            Err(error) if error.kind() == ErrorKind::PermissionDenied => blocked = Some(path),
            Err(_) => {}
        }
    }
    let Some(path) = blocked else {
        return "missing";
    };

    let mut dialog = window.dialog().file().set_parent(window).set_title(title);
    let start = if file {
        path.parent()
    } else {
        Some(path.as_path())
    };
    if let Some(start) = start {
        dialog = dialog.set_directory(start);
    }
    let choice = if file {
        dialog.blocking_pick_file()
    } else {
        dialog.blocking_pick_folder()
    };
    let Some(selected) = choice.and_then(|choice| choice.into_path().ok()) else {
        return "canceled";
    };
    let selected_matches = selected == path
        || selected.canonicalize().ok().is_some_and(|selected| {
            path.canonicalize()
                .is_ok_and(|expected| selected == expected)
        });
    if !selected_matches {
        return "wrongLocation";
    }
    if check(&path, file).is_ok() {
        "ready"
    } else {
        "denied"
    }
}
