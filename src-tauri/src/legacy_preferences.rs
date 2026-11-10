use std::{fs, path::Path};

use rusty_leveldb::{DB, Options};
use serde_json::{Map, Value};

use crate::data::StartupResult;

const KEYS: &[&str] = &[
    "theme-mode",
    "app-language",
    "sidebarCollapsed",
    "yloader-settings-advanced-mode",
    "yloader.downloads.ui.v2",
    "yloader.home.autoDownload.prefs.v1",
    "yloader.notification-history.v2",
    "yloader.ui.tabs.state.v1",
];

pub fn read(profile: &Path) -> StartupResult<Map<String, Value>> {
    let source = profile.join("session-data/Local Storage/leveldb");
    if !source.join("CURRENT").is_file() {
        return Ok(Map::new());
    }

    // LevelDB may replay journals on open. Work on a bounded temporary copy.
    let snapshot = tempfile::tempdir()?;
    let mut remaining: u64 = 32 * 1024 * 1024;
    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if !entry.file_type()?.is_file()
            || !(name == "CURRENT"
                || name.starts_with("MANIFEST-")
                || [".ldb", ".sst", ".log"]
                    .iter()
                    .any(|ext| name.ends_with(ext)))
        {
            continue;
        }
        remaining = remaining
            .checked_sub(entry.metadata()?.len())
            .ok_or("Previous desktop UI preference database is too large")?;
        fs::copy(entry.path(), snapshot.path().join(entry.file_name()))?;
    }

    let mut db = DB::open(
        snapshot.path(),
        Options {
            create_if_missing: false,
            ..Options::default()
        },
    )?;
    for origin in ["file://", "http://127.0.0.1:5173", "http://127.0.0.1:5174"] {
        let preferences: Map<_, _> = KEYS
            .iter()
            .filter_map(|key| {
                let storage_key = format!("_{origin}\0\x01{key}");
                let value = decode(&db.get(storage_key.as_bytes())?)?;
                Some((key.to_string(), Value::String(value)))
            })
            .collect();
        if !preferences.is_empty() {
            return Ok(preferences);
        }
    }
    Ok(Map::new())
}

fn decode(value: &[u8]) -> Option<String> {
    match value.split_first()? {
        (1, bytes) => Some(bytes.iter().map(|&byte| char::from(byte)).collect()),
        (0, bytes) if bytes.len() % 2 == 0 => {
            let units: Vec<_> = bytes
                .chunks_exact(2)
                .map(|pair| u16::from_le_bytes([pair[0], pair[1]]))
                .collect();
            String::from_utf16(&units).ok()
        }
        _ => None,
    }
}
