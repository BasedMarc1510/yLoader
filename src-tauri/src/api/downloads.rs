mod pipeline;

use std::{
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::Duration,
};

use axum::{
    Json, Router,
    extract::{Query, State as ExtractState},
    http::StatusCode,
    response::{
        IntoResponse, Response, Sse,
        sse::{Event, KeepAlive},
    },
    routing::{get, post},
};
use serde::Deserialize;
use serde_json::{Value, json};
use tokio::sync::{Notify, mpsc};
use tokio_stream::{StreamExt, wrappers::ReceiverStream};
use url::Url;

use super::{
    ApiError, db_task, history,
    metadata::{field, first, format_id, http_url},
    settings::Setting,
};
use crate::data::{State, read_setting};

const AUDIO: &[&str] = &["mp3", "m4a", "wav", "ogg", "flac", "opus"];
const VIDEO: &[&str] = &["mp4", "webm", "mkv", "avi", "mov"];
const IMAGE: &[&str] = &["jpg", "png", "webp"];
const FAILED: ApiError = ApiError(
    StatusCode::INTERNAL_SERVER_ERROR,
    "Download could not be completed",
);

#[derive(Default)]
pub(crate) struct Slots {
    active: Mutex<usize>,
    wake: Notify,
    next_start: tokio::sync::Mutex<Option<tokio::time::Instant>>,
}

struct Slot(Arc<Slots>);

impl Slots {
    async fn stagger(&self, delay: Duration) {
        let mut last_start = self.next_start.lock().await;
        if let Some(started) = *last_start {
            tokio::time::sleep_until(started + delay).await;
        }
        *last_start = Some(tokio::time::Instant::now());
    }

    async fn acquire(self: Arc<Self>, max: usize) -> Slot {
        loop {
            let notified = self.wake.notified();
            tokio::pin!(notified);
            notified.as_mut().enable();
            {
                let mut active = self.active.lock().unwrap();
                if *active < max {
                    *active += 1;
                    return Slot(self.clone());
                }
            }
            notified.await;
        }
    }
}

impl Drop for Slot {
    fn drop(&mut self) {
        *self.0.active.lock().unwrap() -= 1;
        self.0.wake.notify_waiters();
    }
}

#[derive(Clone, Copy, PartialEq)]
enum Kind {
    Audio,
    Video,
    Thumbnail,
}

impl Kind {
    fn name(self) -> &'static str {
        match self {
            Self::Audio => "audio",
            Self::Video => "video",
            Self::Thumbnail => "thumbnail",
        }
    }

    fn formats(self) -> &'static [&'static str] {
        match self {
            Self::Audio => AUDIO,
            Self::Video => VIDEO,
            Self::Thumbnail => IMAGE,
        }
    }
}

struct Job {
    kind: Kind,
    url: Url,
    image: Option<Url>,
    container: String,
    body: Value,
    settings: Value,
}

impl Job {
    fn new(kind: Kind, body: Value, settings: Value) -> Result<Self, ApiError> {
        let source = first(&body, &["url", "sourceUrl"]);
        let thumb = field(&body, "thumbnailUrl");
        let image = if thumb.is_empty() {
            None
        } else {
            Some(
                http_url(thumb)
                    .ok_or(ApiError(StatusCode::BAD_REQUEST, "Invalid thumbnail URL"))?,
            )
        };
        let url = if source.is_empty() && kind == Kind::Thumbnail {
            image.clone()
        } else {
            http_url(source)
        }
        .ok_or(ApiError(StatusCode::BAD_REQUEST, "Invalid URL"))?;
        if kind == Kind::Thumbnail && image.is_none() {
            return Err(ApiError(StatusCode::BAD_REQUEST, "Missing thumbnail URL"));
        }
        let requested = field(&body, "format").to_ascii_lowercase();
        let container = if requested.is_empty() {
            match kind {
                Kind::Audio => field(&settings, "defaultAudioContainer"),
                Kind::Video => field(&settings, "defaultVideoContainer"),
                Kind::Thumbnail => "jpg",
            }
            .to_owned()
        } else if kind == Kind::Thumbnail && requested == "jpeg" {
            "jpg".to_owned()
        } else {
            requested
        };
        if !kind.formats().contains(&container.as_str()) {
            return Err(ApiError(
                StatusCode::BAD_REQUEST,
                "Unsupported output format",
            ));
        }
        for key in ["audioFormat", "videoFormat"] {
            let selector = field(&body, key);
            if !selector.is_empty() && !format_id(selector) {
                return Err(ApiError(StatusCode::BAD_REQUEST, "Invalid format ID"));
            }
        }
        Ok(Self {
            kind,
            url,
            image,
            container,
            body,
            settings,
        })
    }
}

async fn settings(state: &State) -> Result<Value, ApiError> {
    let downloads = state.system_downloads.to_string_lossy().into_owned();
    db_task(state.clone(), move |db| {
        let setting = Setting::Downloads;
        Ok(setting.normalize(&downloads, &read_setting(db, setting.key())?, None))
    })
    .await
}

async fn media(
    ExtractState(state): ExtractState<State>,
    Json(body): Json<Value>,
) -> Result<Response, ApiError> {
    let kind = match field(&body, "type") {
        "audio" => Kind::Audio,
        "video" => Kind::Video,
        _ => return Err(ApiError(StatusCode::BAD_REQUEST, "Invalid download type")),
    };
    Ok(start(
        state.clone(),
        Job::new(kind, body, settings(&state).await?)?,
    ))
}

async fn thumbnail(
    ExtractState(state): ExtractState<State>,
    Json(body): Json<Value>,
) -> Result<Response, ApiError> {
    Ok(start(
        state.clone(),
        Job::new(Kind::Thumbnail, body, settings(&state).await?)?,
    ))
}

async fn send(sender: &mpsc::Sender<Event>, name: &str, data: Value) -> Result<(), ApiError> {
    sender
        .send(Event::default().event(name).data(data.to_string()))
        .await
        .map_err(|_| FAILED)
}

async fn progress(sender: &mpsc::Sender<Event>, percent: f64, stage: &str) -> Result<(), ApiError> {
    send(
        sender,
        "progress",
        json!({"percent": percent, "stage": stage}),
    )
    .await
}

fn start(state: State, job: Job) -> Response {
    let (sender, receiver) = mpsc::channel(16);
    tokio::spawn(async move {
        let worker = run(&state, job, &sender);
        let result = tokio::select! {
            biased;
            _ = sender.closed() => return,
            result = tokio::time::timeout(Duration::from_secs(2 * 60 * 60), worker) => result.unwrap_or(Err(FAILED)),
        };
        match result {
            Ok(payload) => {
                let _ = progress(&sender, 100.0, "complete").await;
                let _ = send(&sender, "complete", payload).await;
                let _ = sender
                    .send(Event::default().event("end").data("done"))
                    .await;
            }
            Err(error) => {
                let _ = send(&sender, "error", json!({"message": error.1})).await;
                let _ = sender
                    .send(Event::default().event("end").data("failed"))
                    .await;
            }
        }
    });
    Sse::new(ReceiverStream::new(receiver).map(Ok::<_, std::convert::Infallible>))
        .keep_alive(KeepAlive::default())
        .into_response()
}

fn sanitize_filename(value: &str) -> String {
    let clean = value
        .chars()
        .map(|c| {
            if c.is_control() || "\\/:*?\"<>|".contains(c) {
                ' '
            } else {
                c
            }
        })
        .collect::<String>();
    let mut name = clean.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut end = name.len().min(180);
    while !name.is_char_boundary(end) {
        end -= 1;
    }
    name.truncate(end);
    name.trim_matches([' ', '.']).to_owned()
}

fn target(job: &Job, state: &State, name: &str) -> Result<(PathBuf, String, bool, bool), ApiError> {
    let explicit = field(&job.body, "desktopSavePath");
    let directory = field(&job.body, "desktopTargetDirectory");
    let direct = !explicit.is_empty() || !directory.is_empty();
    let invalid = || ApiError(StatusCode::BAD_REQUEST, "Invalid download destination");
    let (dir, stem) = if !explicit.is_empty() {
        let file = Path::new(explicit);
        let parent = file
            .parent()
            .filter(|dir| dir.is_absolute())
            .ok_or_else(invalid)?;
        let stem = file
            .file_stem()
            .and_then(|name| name.to_str())
            .ok_or_else(invalid)?;
        (parent.to_owned(), sanitize_filename(stem))
    } else if !directory.is_empty() {
        let dir = PathBuf::from(directory);
        if !dir.is_absolute() {
            return Err(invalid());
        }
        (dir, name.to_owned())
    } else {
        (state.downloads.clone(), name.to_owned())
    };
    std::fs::create_dir_all(&dir).map_err(|_| invalid())?;
    let overwrite = !explicit.is_empty() && job.body["desktopAllowOverwrite"] == true;
    Ok((
        dir,
        if stem.is_empty() {
            "download".to_owned()
        } else {
            stem
        },
        direct,
        overwrite,
    ))
}

async fn run(state: &State, job: Job, sender: &mpsc::Sender<Event>) -> Result<Value, ApiError> {
    progress(sender, 0.0, "queued").await?;
    let max = job.settings["maxConcurrentDownloads"].as_u64().unwrap_or(3) as usize;
    let _slot = state.download_slots.clone().acquire(max).await;
    let delay = job.settings["staggerDownloadsMs"].as_u64().unwrap_or(0);
    state
        .download_slots
        .stagger(Duration::from_millis(delay))
        .await;
    progress(sender, 2.0, "starting").await?;
    let staging = tempfile::tempdir_in(&state.downloads).map_err(|_| FAILED)?;
    let (staged_file, info) = pipeline::process(state, &job, &staging, sender).await?;
    let metadata = &job.body["metadata"];
    let title = [
        field(metadata, "title"),
        first(&job.body, &["videoTitle", "filename"]),
        field(&info, "title"),
    ]
    .into_iter()
    .find(|text| !text.is_empty())
    .unwrap_or(job.kind.name())
    .chars()
    .take(220)
    .collect::<String>();
    let artist = [
        field(metadata, "artist"),
        field(&job.body, "videoAuthor"),
        first(&info, &["uploader", "channel"]),
    ]
    .into_iter()
    .find(|text| !text.is_empty())
    .unwrap_or_default();
    let service = first(&job.body, &["service"]);
    let service = if service.is_empty() || service == "other" {
        "generic"
    } else {
        service
    }
    .chars()
    .take(40)
    .collect::<String>();
    let pattern = match job.kind {
        Kind::Audio => "audioFilenamePattern",
        Kind::Video => "videoFilenamePattern",
        Kind::Thumbnail => "thumbnailFilenamePattern",
    };
    let id = field(&info, "id").to_owned();
    let source = job.url.to_string();
    let dates = db_task(state.clone(), |db| {
        db.query_row(
            "SELECT date('now','localtime'), strftime('%H-%M-%S','now','localtime')",
            [],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
    })
    .await?;
    let date_time = format!("{} {}", dates.0, dates.1);
    let mut base = field(&job.settings, pattern).to_owned();
    for (key, value) in [
        ("{title}", title.as_str()),
        ("{artist}", artist),
        ("{uploader}", field(&job.body, "videoAuthor")),
        ("{service}", service.as_str()),
        ("{type}", job.kind.name()),
        ("{id}", id.as_str()),
        ("{date}", &dates.0),
        ("{time}", &dates.1),
        ("{datetime}", &date_time),
    ] {
        base = base.replace(key, value);
    }
    let (directory, stem, direct, overwrite) = target(&job, state, &sanitize_filename(&base))?;
    let exact = !field(&job.body, "desktopSavePath").is_empty();
    let duration = pipeline::duration(state, &staged_file, &job, &info).await;
    let thumbnail = job
        .image
        .as_ref()
        .map(Url::as_str)
        .or_else(|| info["thumbnail"].as_str())
        .map(str::to_owned);
    let format = first(
        &job.body,
        &[if job.kind == Kind::Audio {
            "audioFormat"
        } else {
            "videoFormat"
        }],
    )
    .to_owned();
    db_task(state.clone(), move |db| {
        let _staging = staging;
        let file = publish(&staged_file, &directory, &stem, &job.container, overwrite, exact);
        let (filename, path) = match file { Ok(file) => file, Err(error) => return Ok(Err(error)) };
        let result = db.execute(
            "INSERT INTO downloads (video_id,title,duration,timestamp,download_type,format_id,filename,service,source_url,thumbnail_url,local_path)
             VALUES (?1,?2,?3,strftime('%Y-%m-%dT%H:%M:%fZ','now'),?4,?5,?6,?7,?8,?9,?10)",
            (&id,&title,duration,job.kind.name(),&format,&filename,&service,&source,&thumbnail,path.to_string_lossy().as_ref()),
        );
        if let Err(error) = result {
            if !overwrite { let _ = std::fs::remove_file(&path); }
            return Err(error);
        }
        let id = db.last_insert_rowid();
        let mut payload = json!({"id":id,"filename":filename,"savePath":path});
        if !direct {
            let encoded = url::form_urlencoded::byte_serialize(filename.as_bytes()).collect::<String>().replace('+', "%20");
            payload["url"] = json!(format!("/api/download/file/{encoded}"));
        }
        Ok(Ok(payload))
    }).await?
}

fn publish(
    source: &Path,
    dir: &Path,
    stem: &str,
    ext: &str,
    overwrite: bool,
    exact: bool,
) -> Result<(String, PathBuf), ApiError> {
    let mut file = tempfile::NamedTempFile::new_in(dir).map_err(|_| FAILED)?;
    let mut input = std::fs::File::open(source).map_err(|_| FAILED)?;
    std::io::copy(&mut input, &mut file).map_err(|_| FAILED)?;
    for index in 0..10_000 {
        let name = if index == 0 {
            format!("{stem}.{ext}")
        } else {
            format!("{stem} ({index}).{ext}")
        };
        let path = dir.join(&name);
        if overwrite {
            file.persist(&path).map_err(|_| FAILED)?;
            return Ok((name, path));
        }
        match file.persist_noclobber(&path) {
            Ok(_) => return Ok((name, path)),
            Err(error) if error.error.kind() == std::io::ErrorKind::AlreadyExists => {
                if exact {
                    return Err(ApiError(
                        StatusCode::CONFLICT,
                        "Download destination already exists",
                    ));
                }
                file = error.file;
            }
            Err(_) => return Err(FAILED),
        }
    }
    Err(FAILED)
}

#[derive(Deserialize)]
struct ImageQuery {
    url: String,
    filename: Option<String>,
    format: Option<String>,
}

async fn proxy_image(
    ExtractState(state): ExtractState<State>,
    Query(query): Query<ImageQuery>,
    request: axum::extract::Request,
) -> Result<axum::response::Response, ApiError> {
    let url = http_url(&query.url).ok_or(ApiError(StatusCode::BAD_REQUEST, "Invalid image URL"))?;
    let temp = tempfile::tempdir().map_err(|_| FAILED)?;
    let name = query
        .filename
        .as_deref()
        .map(sanitize_filename)
        .filter(|name| !name.is_empty());
    let (file, extension) = pipeline::image(&state, &url, query.format.as_deref(), &temp).await?;
    let attachment = name.map(|name| {
        if name.ends_with(&format!(".{extension}")) {
            name
        } else {
            format!("{name}.{extension}")
        }
    });
    let mut response = history::serve(file, attachment.as_deref(), request).await?;
    let body = std::mem::replace(response.body_mut(), axum::body::Body::empty());
    let bytes = axum::body::to_bytes(body, 15 * 1024 * 1024)
        .await
        .map_err(|_| FAILED)?;
    *response.body_mut() = axum::body::Body::from(bytes);
    Ok(response)
}

pub fn routes() -> Router<State> {
    Router::new()
        .route("/api/download/stream", post(media))
        .route("/api/download/thumbnail/stream", post(thumbnail))
        .route("/api/proxy-image", get(proxy_image))
}
