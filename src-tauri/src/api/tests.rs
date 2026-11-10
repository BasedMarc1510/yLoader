use std::{fs, process::Command};

use axum::{
    body::{Body, to_bytes},
    http::{Request, StatusCode},
};
use rusqlite::Connection;
use serde_json::{Value, json};
use tower::ServiceExt;

use super::router;
use crate::data::{
    AUTOSTART_MIGRATION_KEY, SHELL_SETTINGS_KEY, State, UPDATE_SETTINGS_KEY, read_setting,
    write_setting,
};

const TOKEN: &str = "test-access-token";

fn fixture() -> (tempfile::TempDir, State) {
    let root = tempfile::tempdir().unwrap();
    let state = State::open(
        &root.path().join("tauri"),
        &root.path().join("legacy"),
        root.path().join("system-downloads"),
    )
    .unwrap();
    (root, state)
}

async fn json_body(response: axum::response::Response) -> Value {
    serde_json::from_slice(
        &to_bytes(response.into_body(), 10 * 1024 * 1024)
            .await
            .unwrap(),
    )
    .unwrap()
}

#[tokio::test]
async fn requires_the_desktop_token_and_persists_valid_settings() {
    let (_root, state) = fixture();
    let app = router(state, TOKEN);
    let unauthorized = app
        .clone()
        .oneshot(
            Request::get("/api/download/settings")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(unauthorized.status(), StatusCode::NOT_FOUND);

    let path = format!("/{TOKEN}/api/download/settings");
    let response = app
        .clone()
        .oneshot(
            Request::put(&path)
                .header("content-type", "application/json")
                .header("origin", "https://example.com")
                .body(Body::from(r#"{"maxConcurrentDownloads":8}"#))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::FORBIDDEN);

    let response = app.clone().oneshot(Request::put(&path).header("content-type", "application/json")
        .header("origin", "tauri://localhost")
        .body(Body::from(r#"{"maxConcurrentDownloads":4,"defaultVideoContainer":"avi","maxVideoHeight":42}"#))
        .unwrap()).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response.headers()["access-control-allow-origin"],
        "tauri://localhost"
    );
    let saved = json_body(response).await;
    assert_eq!(saved["maxConcurrentDownloads"], 4);
    assert_eq!(saved["defaultVideoContainer"], "avi");
    assert_eq!(saved["maxVideoHeight"], 0);
    let read = app
        .oneshot(Request::get(path).body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(json_body(read).await, saved);
}

#[tokio::test]
async fn imports_an_electron_database_with_wal_and_serves_ranges() {
    let root = tempfile::tempdir().unwrap();
    let profile = root.path().join("legacy");
    let legacy = profile.join("runtime");
    fs::create_dir_all(legacy.join("backend-data")).unwrap();
    fs::create_dir_all(legacy.join("downloads")).unwrap();
    fs::write(legacy.join("downloads/fixture.mp4"), b"0123456789").unwrap();
    fs::write(profile.join("desktop-settings.json"), r#"{"closeToTrayOnWindowClose":true,"startOnSystemStartup":true,"startupWindowMode":"minimized"}"#).unwrap();
    fs::write(
        profile.join("app-updater-settings.json"),
        r#"{"autoUpdateEnabled":false}"#,
    )
    .unwrap();
    let web_storage = profile.join("session-data/Local Storage/leveldb");
    fs::create_dir_all(&web_storage).unwrap();
    let mut previous_web = rusty_leveldb::DB::open(&web_storage, Default::default()).unwrap();
    previous_web
        .put(b"_file://\0\x01theme-mode", b"\x01dark")
        .unwrap();
    previous_web
        .put(b"_file://\0\x01app-language", b"\0d\0e\0")
        .unwrap();
    previous_web
        .put(b"_file://\0\x01unrelated", b"\x01ignored")
        .unwrap();
    previous_web.flush().unwrap();

    let old_db = Connection::open(legacy.join("backend-data/metadata.db")).unwrap();
    old_db
        .execute_batch(
            "PRAGMA journal_mode=WAL;
         CREATE TABLE downloads (id INTEGER PRIMARY KEY, video_id TEXT, title TEXT,
             duration INTEGER, timestamp TEXT, download_type TEXT, format_id TEXT,
             filename TEXT, service TEXT);
         INSERT INTO downloads (id, title, download_type, filename, service)
             VALUES (1, 'Legacy download', 'video', 'fixture.mp4', 'other');",
        )
        .unwrap();

    let state = State::open(
        &root.path().join("tauri"),
        &legacy,
        root.path().join("user-downloads"),
    )
    .unwrap();
    {
        let db = state.db.lock().unwrap();
        assert_eq!(
            read_setting(&db, SHELL_SETTINGS_KEY).unwrap(),
            json!({
                "closeToTrayOnWindowClose": true, "startupWindowMode": "minimized"
            })
        );
        assert_eq!(read_setting(&db, AUTOSTART_MIGRATION_KEY).unwrap(), true);
        assert_eq!(read_setting(&db, UPDATE_SETTINGS_KEY).unwrap(), false);
        write_setting(&db, UPDATE_SETTINGS_KEY, &json!(true)).unwrap();
    }
    assert_eq!(
        state.legacy_web_preferences(),
        json!({"theme-mode":"dark", "app-language":"de"})
    );
    let app = router(state, TOKEN);
    let list = app
        .clone()
        .oneshot(
            Request::get(format!("/{TOKEN}/api/downloads?service=generic"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(list.status(), StatusCode::OK);
    let row = &json_body(list).await[0];
    assert_eq!(row["cached"], true);
    assert_eq!(row["title"], "Legacy download");
    assert!(row.get("local_path").is_none());

    let range = app
        .clone()
        .oneshot(
            Request::get(format!("/{TOKEN}/api/downloads/1/preview"))
                .header("range", "bytes=2-4")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(range.status(), StatusCode::PARTIAL_CONTENT);
    assert_eq!(to_bytes(range.into_body(), 20).await.unwrap(), "234");

    let delete = app
        .oneshot(
            Request::delete(format!("/{TOKEN}/api/downloads/1"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(json_body(delete).await["deleted"], 1);
    assert_eq!(
        old_db
            .query_row("SELECT COUNT(*) FROM downloads", [], |row| row
                .get::<_, i32>(0))
            .unwrap(),
        1
    );
    assert!(legacy.join("downloads/fixture.mp4").exists());
    let reopened = State::open(
        &root.path().join("tauri"),
        &legacy,
        root.path().join("user-downloads"),
    )
    .unwrap();
    assert_eq!(
        read_setting(&reopened.db.lock().unwrap(), UPDATE_SETTINGS_KEY).unwrap(),
        true
    );
}

#[tokio::test]
async fn generates_editor_visuals_and_exports_an_audio_cut() {
    if !["ffmpeg", "ffprobe"].iter().all(|binary| {
        Command::new(binary)
            .arg("-version")
            .output()
            .is_ok_and(|output| output.status.success())
    }) {
        assert!(
            std::env::var_os("YLOADER_REQUIRE_FFMPEG_TEST").is_none(),
            "FFmpeg must be installed"
        );
        eprintln!("skipping media editor integration: ffmpeg or ffprobe is missing");
        return;
    }

    let (_root, state) = fixture();
    let input = state.downloads.join("original.mp4");
    assert!(
        Command::new("ffmpeg")
            .args([
                "-v",
                "error",
                "-f",
                "lavfi",
                "-i",
                "testsrc2=size=160x90:rate=25:duration=3",
                "-f",
                "lavfi",
                "-i",
                "sine=frequency=440:duration=3",
                "-c:v",
                "libx264",
                "-c:a",
                "aac",
                "-shortest",
            ])
            .arg(&input)
            .status()
            .unwrap()
            .success()
    );
    let original = fs::read(&input).unwrap();
    state.db.lock().unwrap().execute(
        "INSERT INTO downloads (id, download_type, filename, local_path) VALUES (1, 'video', 'original.mp4', ?1)",
        [input.to_string_lossy().as_ref()],
    ).unwrap();

    let app = router(state, TOKEN);
    let timeline = app
        .clone()
        .oneshot(
            Request::get(format!("/{TOKEN}/api/downloads/1/timeline"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(timeline.status(), StatusCode::OK);
    let visuals = json_body(timeline).await;
    assert_eq!(visuals["incomplete"], false);
    assert_eq!(visuals["frames"].as_array().unwrap().len(), 10);
    assert_eq!(visuals["peaks"].as_array().unwrap().len(), 480);

    let edit = app.clone().oneshot(Request::post(format!("/{TOKEN}/api/downloads/1/edit"))
        .header("content-type", "application/json")
        .body(Body::from(json!({"start": 0.5, "end": 2.0, "volume": 50, "fadeOut": 0.2, "audioOnly": true}).to_string()))
        .unwrap()).await.unwrap();
    assert_eq!(edit.status(), StatusCode::OK);
    let export = json_body(edit).await;
    let probe = app
        .oneshot(
            Request::get(format!("/{TOKEN}/api/downloads/{}/media", export["id"]))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let media = json_body(probe).await;
    assert_eq!(media["hasAudio"], true);
    assert_eq!(media["hasVideo"], false);
    assert!((media["duration"].as_f64().unwrap() - 1.5).abs() < 0.15);
    assert_eq!(fs::read(&input).unwrap(), original);
}

#[tokio::test]
async fn downloads_real_media_and_thumbnails_with_the_desktop_api() {
    let (root, state) = fixture();
    let available = [
        &state.tools.yt_dlp,
        &state.tools.ffmpeg,
        &state.tools.ffprobe,
    ]
    .into_iter()
    .all(|tool| {
        Command::new(tool)
            .arg(if tool == &state.tools.yt_dlp {
                "--version"
            } else {
                "-version"
            })
            .output()
            .is_ok_and(|output| output.status.success())
    });
    if !available {
        assert!(
            std::env::var_os("YLOADER_REQUIRE_DOWNLOAD_TEST").is_none(),
            "yt-dlp and FFmpeg must be installed"
        );
        return;
    }

    let source = root.path().join("source.mp4");
    let image = root.path().join("image.jpg");
    assert!(
        Command::new(&state.tools.ffmpeg)
            .args([
                "-v",
                "error",
                "-f",
                "lavfi",
                "-i",
                "testsrc2=size=160x90:rate=25:duration=3",
                "-f",
                "lavfi",
                "-i",
                "sine=frequency=440:duration=3",
                "-c:v",
                "libx264",
                "-c:a",
                "aac",
                "-shortest",
            ])
            .arg(&source)
            .status()
            .unwrap()
            .success()
    );
    assert!(
        Command::new(&state.tools.ffmpeg)
            .args(["-v", "error", "-i"])
            .arg(&source)
            .args(["-frames:v", "1"])
            .arg(&image)
            .status()
            .unwrap()
            .success()
    );

    let origin = axum::Router::new()
        .route_service("/media.mp4", tower_http::services::ServeFile::new(&source))
        .route_service("/image.jpg", tower_http::services::ServeFile::new(&image))
        .layer(axum::middleware::from_fn(
            |request: axum::extract::Request, next: axum::middleware::Next| async move {
                use axum::response::IntoResponse;
                if request.uri().path() == "/media.mp4"
                    && !request
                        .headers()
                        .get("cookie")
                        .and_then(|value| value.to_str().ok())
                        .is_some_and(|value| value.contains("test_session=fixture"))
                {
                    return StatusCode::UNAUTHORIZED.into_response();
                }
                next.run(request).await
            },
        ));
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", 0))
        .await
        .unwrap();
    let address = listener.local_addr().unwrap();
    let server = tokio::spawn(async move { axum::serve(listener, origin).await.unwrap() });
    let url = format!("http://{address}/media.mp4");
    let image_url = format!("http://{address}/image.jpg");
    let cookie_file = root.path().join("cookies.txt");
    let cookie_contents =
        "# Netscape HTTP Cookie File\n127.0.0.1\tFALSE\t/\tFALSE\t0\ttest_session\tfixture\n";
    fs::write(&cookie_file, cookie_contents).unwrap();

    let app = router(state, TOKEN);
    let saved = app
        .clone()
        .oneshot(
            Request::put(format!("/{TOKEN}/api/yt-dlp/cookies/settings"))
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "cookiesFileEnabled": true, "cookiesFilePath": cookie_file
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(saved.status(), StatusCode::OK);
    assert_eq!(json_body(saved).await["browserImportSupported"], true);

    let metadata = app
        .clone()
        .oneshot(
            Request::get(format!("/{TOKEN}/api/meta/formats?url={url}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(metadata.status(), StatusCode::OK);
    assert!(
        !json_body(metadata).await["videoFormats"]
            .as_array()
            .unwrap()
            .is_empty()
    );

    for (endpoint, body) in [
        (
            "stream",
            json!({"url":url, "type":"audio","format":"mp3","videoTitle":"Audio fixture","cover":{"enabled":false},
            "cuts":{"enabled":true,"trimStart":0.5,"trimEnd":2.0}}),
        ),
        (
            "stream",
            json!({"url":url,"type":"video","format":"mp4","videoTitle":"Video fixture","maximumCompatibility":true,
            "cuts":{"enabled":true,"mode":"keep","segments":[{"start":0.3,"end":1.0},{"start":1.8,"end":2.4}]}}),
        ),
        (
            "thumbnail/stream",
            json!({"url":url,"thumbnailUrl":image_url,"format":"png","videoTitle":"Thumbnail fixture"}),
        ),
    ] {
        let response = app
            .clone()
            .oneshot(
                Request::post(format!("/{TOKEN}/api/download/{endpoint}"))
                    .header("content-type", "application/json")
                    .body(Body::from(body.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let bytes = to_bytes(response.into_body(), 64 * 1024).await.unwrap();
        let events = std::str::from_utf8(&bytes).unwrap();
        assert!(events.contains("event: progress"), "{events}");
        let complete = events
            .split("event: complete\n")
            .nth(1)
            .unwrap_or_else(|| panic!("{events}"));
        let data: Value = serde_json::from_str(
            complete
                .lines()
                .next()
                .unwrap()
                .strip_prefix("data: ")
                .unwrap(),
        )
        .unwrap();
        let file = std::path::Path::new(data["savePath"].as_str().unwrap());
        assert!(file.metadata().unwrap().len() > 0);
        assert_eq!(file.extension().unwrap(), body["format"].as_str().unwrap());
        let retrieved = app
            .clone()
            .oneshot(
                Request::get(format!("/{TOKEN}{}", data["url"].as_str().unwrap()))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(retrieved.status(), StatusCode::OK);
    }
    let history = app
        .oneshot(
            Request::get(format!("/{TOKEN}/api/downloads"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(json_body(history).await.as_array().unwrap().len(), 3);
    assert_eq!(fs::read_to_string(cookie_file).unwrap(), cookie_contents);
    server.abort();
}

#[cfg(unix)]
#[tokio::test]
async fn search_uses_provider_and_pagination_arguments() {
    use std::os::unix::fs::PermissionsExt;

    let root = tempfile::tempdir().unwrap();
    let mut state = State::open(
        &root.path().join("data"),
        &root.path().join("legacy"),
        root.path().join("downloads"),
    )
    .unwrap();
    let yt_dlp = root.path().join("yt-dlp");
    fs::write(&yt_dlp, r#"#!/bin/sh
case "$*" in
  *"--flat-playlist --playlist-start 11 --playlist-end 20 -- scsearch20:some & query")
    printf '%s\n' '{"entries":[{"id":"7","title":"Example track","url":"https://soundcloud.com/example/track","duration":120,"uploader":"Example artist","thumbnail":"https://img.example.test/cover.jpg"}]}'
    ;;
  *) exit 4;;
esac
"#).unwrap();
    fs::set_permissions(&yt_dlp, fs::Permissions::from_mode(0o755)).unwrap();
    state.tools.yt_dlp = yt_dlp;
    let response = router(state, TOKEN)
        .oneshot(
            Request::get(format!(
                "/{TOKEN}/api/search?from=soundcloud&offset=10&q=some+%26+query"
            ))
            .body(Body::empty())
            .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let data = json_body(response).await;
    assert_eq!(data["offset"], 10);
    assert_eq!(data["from"], "soundcloud");
    assert_eq!(data["hasMore"], false);
    assert_eq!(data["entries"][0]["durationString"], "02:00");
    assert_eq!(
        data["entries"][0]["thumbnail"],
        "https://img.example.test/cover.jpg"
    );
}

#[tokio::test]
#[ignore = "downloads a real QuickJS executable from GitHub"]
async fn installs_and_runs_a_verified_tool() {
    use crate::tools::{Tool, Tools, version};
    let root = tempfile::tempdir().unwrap();
    let managed = root.path().join("tools");
    let tools = Tools::locate(&root.path().join("legacy"), managed.clone());
    tools.install(Tool::QuickJs).await.unwrap();
    let qjs = tools.path(Tool::QuickJs);
    assert_eq!(qjs.parent(), Some(managed.as_path()));
    assert_eq!(version(Tool::QuickJs, &qjs).await.unwrap(), "QuickJS");
}
