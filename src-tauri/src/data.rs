use std::{
    fs,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::Duration,
};

use rusqlite::{Connection, Error, ErrorCode, MAIN_DB, OpenFlags, OptionalExtension, ffi};
use serde_json::{Value, json};
use tokio::sync::Semaphore;

use crate::tools::{Tools, YtDlpSource};

pub type StartupResult<T> = Result<T, Box<dyn std::error::Error>>;
pub const SHELL_SETTINGS_KEY: &str = "desktop.shell.settings.v1";
pub const UPDATE_SETTINGS_KEY: &str = "desktop.app-update.settings.v1";
pub const AUTOSTART_MIGRATION_KEY: &str = "desktop.autostart-migration.v1";
pub const YT_DLP_SOURCE_KEY: &str = "desktop.yt-dlp.source.v1";
const LEGACY_WEB_PREFERENCES_KEY: &str = "desktop.legacy-web-preferences.v1";

#[derive(Clone)]
pub struct State {
    pub db: Arc<Mutex<Connection>>,
    db_path: PathBuf,
    pub downloads: PathBuf,
    pub system_downloads: PathBuf,
    pub tools: Tools,
    pub tool_updates: Arc<crate::api::tool_updates::UpdateState>,
    pub download_slots: Arc<crate::api::downloads::Slots>,
    pub edits: Arc<Semaphore>,
    pub visuals: Arc<Semaphore>,
    previous_downloads: Vec<PathBuf>,
}

impl State {
    pub fn open(
        data_root: &Path,
        legacy_root: &Path,
        system_downloads: PathBuf,
    ) -> StartupResult<Self> {
        let downloads = data_root.join("downloads");
        fs::create_dir_all(&downloads)?;
        let db_path = data_root.join("metadata.db");
        let legacy_db = legacy_root.join("backend-data").join("metadata.db");
        let preview_root = data_root.with_file_name("com.yloader.app.tauri-preview");
        let preview_db = preview_root.join("metadata.db");
        let previous_db = [legacy_db, preview_db]
            .into_iter()
            .find(|path| path.is_file());
        if !db_path.exists()
            && let Some(previous_db) = previous_db
        {
            // Use SQLite's backup API so committed changes in a WAL are copied too.
            let source =
                Connection::open_with_flags(previous_db, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
            source.busy_timeout(Duration::from_secs(5))?;
            let snapshot = tempfile::NamedTempFile::new_in(data_root)?;
            source.backup(MAIN_DB, snapshot.path(), None)?;
            snapshot.persist_noclobber(&db_path)?;
        }

        let mut db = Connection::open(&db_path)?;
        db.busy_timeout(Duration::from_secs(5))?;
        initialize_schema(&mut db)?;
        if let Some(profile) = legacy_root.parent() {
            import_legacy_settings(&mut db, profile)?;
        }
        let tools = Tools::locate(legacy_root, data_root.join("tools"));
        let source: YtDlpSource =
            serde_json::from_value(read_setting(&db, YT_DLP_SOURCE_KEY)?).unwrap_or_default();
        tools.set_yt_dlp_source(source);
        Ok(Self {
            db: Arc::new(Mutex::new(db)),
            db_path,
            downloads,
            system_downloads,
            tools,
            tool_updates: Default::default(),
            download_slots: Default::default(),
            edits: Arc::new(Semaphore::new(1)),
            visuals: Arc::new(Semaphore::new(1)),
            previous_downloads: vec![
                legacy_root.join("downloads"),
                preview_root.join("downloads"),
            ],
        })
    }

    pub fn recover_database(&self, db: &mut Connection, error: &Error) {
        let Error::SqliteFailure(code, _) = error else {
            return;
        };
        eprintln!(
            "Download database operation failed (SQLite {})",
            code.extended_code
        );
        if code.code != ErrorCode::SystemIoFailure
            && code.extended_code != ffi::SQLITE_READONLY_DBMOVED
        {
            return;
        }

        // Keep the failed operation failed: it may already have had filesystem side effects.
        let reopen = || {
            let replacement =
                Connection::open_with_flags(&self.db_path, OpenFlags::SQLITE_OPEN_READ_WRITE)?;
            replacement.busy_timeout(Duration::from_secs(5))?;
            replacement.prepare("SELECT 1 FROM downloads, settings LIMIT 0")?;
            Ok::<_, Error>(replacement)
        };
        if let Ok(replacement) = reopen() {
            *db = replacement;
        }
    }

    pub fn download_path(&self, filename: &str, local_path: Option<&str>) -> Option<PathBuf> {
        if let Some(path) = local_path.filter(|path| !path.is_empty()) {
            let path = PathBuf::from(path);
            return (path.is_absolute() && path.is_file()).then_some(path);
        }
        let name = Path::new(filename).file_name()?;
        std::iter::once(&self.downloads)
            .chain(&self.previous_downloads)
            .filter_map(|dir| {
                let root = dir.canonicalize().ok()?;
                let file = root.join(name).canonicalize().ok()?;
                (file.starts_with(root) && file.is_file()).then_some(file)
            })
            .next()
    }

    pub fn legacy_web_preferences(&self) -> Value {
        self.db
            .lock()
            .ok()
            .and_then(|db| read_setting(&db, LEGACY_WEB_PREFERENCES_KEY).ok())
            .unwrap_or_default()
    }
}

fn import_legacy_settings(db: &mut Connection, profile: &Path) -> rusqlite::Result<()> {
    fn read_json(path: &Path) -> Option<Value> {
        serde_json::from_slice(&fs::read(path).ok()?).ok()
    }

    let tx = db.transaction()?;
    if read_setting(&tx, SHELL_SETTINGS_KEY)?.is_null()
        && let Some(settings) = read_json(&profile.join("desktop-settings.json"))
        && settings.is_object()
    {
        write_setting(
            &tx,
            SHELL_SETTINGS_KEY,
            &json!({
                "closeToTrayOnWindowClose": settings["closeToTrayOnWindowClose"] == true,
                "startupWindowMode": if settings["startupWindowMode"] == "minimized" { "minimized" } else { "normal" },
            }),
        )?;
        if settings["startOnSystemStartup"] == true {
            write_setting(&tx, AUTOSTART_MIGRATION_KEY, &Value::Bool(true))?;
        }
    }
    if read_setting(&tx, UPDATE_SETTINGS_KEY)?.is_null()
        && let Some(settings) = read_json(&profile.join("app-updater-settings.json"))
        && let Some(enabled) = settings["autoUpdateEnabled"].as_bool()
    {
        write_setting(&tx, UPDATE_SETTINGS_KEY, &Value::Bool(enabled))?;
    }
    if read_setting(&tx, LEGACY_WEB_PREFERENCES_KEY)?.is_null() {
        match crate::legacy_preferences::read(profile) {
            Ok(preferences) => {
                write_setting(&tx, LEGACY_WEB_PREFERENCES_KEY, &Value::Object(preferences))?
            }
            Err(error) => eprintln!("Could not import previous desktop UI preferences: {error}"),
        }
    }
    tx.commit()
}

fn initialize_schema(db: &mut Connection) -> rusqlite::Result<()> {
    let tx = db.transaction()?;
    tx.execute_batch(
        "CREATE TABLE IF NOT EXISTS downloads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            video_id TEXT, title TEXT, duration INTEGER, timestamp TEXT,
            download_type TEXT, format_id TEXT, filename TEXT, service TEXT,
            source_url TEXT, thumbnail_url TEXT, local_path TEXT
        );
        CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);",
    )?;
    let columns = {
        let mut statement = tx.prepare("PRAGMA table_info(downloads)")?;
        statement
            .query_map([], |row| row.get::<_, String>(1))?
            .collect::<rusqlite::Result<Vec<_>>>()?
    };
    for (column, statement) in [
        ("service", "ALTER TABLE downloads ADD COLUMN service TEXT"),
        (
            "source_url",
            "ALTER TABLE downloads ADD COLUMN source_url TEXT",
        ),
        (
            "thumbnail_url",
            "ALTER TABLE downloads ADD COLUMN thumbnail_url TEXT",
        ),
        (
            "local_path",
            "ALTER TABLE downloads ADD COLUMN local_path TEXT",
        ),
    ] {
        if !columns.iter().any(|existing| existing == column) {
            tx.execute(statement, [])?;
        }
    }
    tx.commit()
}

pub fn read_setting(db: &Connection, key: &str) -> rusqlite::Result<Value> {
    let stored: Option<String> = db
        .query_row("SELECT value FROM settings WHERE key = ?1", [key], |row| {
            row.get(0)
        })
        .optional()?;
    Ok(stored
        .and_then(|value| serde_json::from_str(&value).ok())
        .unwrap_or(Value::Null))
}

pub fn write_setting(db: &Connection, key: &str, value: &Value) -> rusqlite::Result<()> {
    db.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, value.to_string()),
    )?;
    Ok(())
}
