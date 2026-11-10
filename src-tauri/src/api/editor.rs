mod processing;
mod visuals;

use std::path::PathBuf;

use axum::{
    Json, Router,
    extract::{Path, Request, State as ExtractState},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, post},
};
use serde_json::{Value, json};
use uuid::Uuid;

use super::{
    ApiError, db_task,
    history::{Download, get_download, serve},
};
use crate::{
    data::State,
    tools::{Tool, ToolError},
};
use processing::{Edit, Media, probe};

#[derive(Debug)]
enum EditorError {
    NotFound,
    Invalid,
    Busy,
    Missing,
    Failed,
}

impl IntoResponse for EditorError {
    fn into_response(self) -> Response {
        let (status, code) = match self {
            Self::NotFound => (StatusCode::NOT_FOUND, "NOT_FOUND"),
            Self::Invalid => (StatusCode::BAD_REQUEST, "INVALID_OPTIONS"),
            Self::Busy => (StatusCode::CONFLICT, "BUSY"),
            Self::Missing => (StatusCode::SERVICE_UNAVAILABLE, "TOOLS_MISSING"),
            Self::Failed => (StatusCode::INTERNAL_SERVER_ERROR, "PROCESSING_FAILED"),
        };
        (status, Json(json!({"code": code}))).into_response()
    }
}

impl From<ToolError> for EditorError {
    fn from(error: ToolError) -> Self {
        match error {
            ToolError::Missing => Self::Missing,
            ToolError::Failed => Self::Failed,
        }
    }
}

impl From<ApiError> for EditorError {
    fn from(_: ApiError) -> Self {
        Self::Failed
    }
}

async fn source(state: &State, id: i64) -> Result<(Download, PathBuf), EditorError> {
    let row = get_download(state.clone(), id)
        .await?
        .ok_or(EditorError::NotFound)?;
    if !matches!(row.download_type.as_deref(), Some("audio" | "video")) {
        return Err(EditorError::NotFound);
    }
    let input = row.file(state).ok_or(EditorError::NotFound)?;
    Ok((row, input))
}

async fn info(
    ExtractState(state): ExtractState<State>,
    Path(id): Path<i64>,
) -> Result<Json<Media>, EditorError> {
    let (_, input) = source(&state, id).await?;
    Ok(Json(
        probe(&state.tools.ensure(Tool::Ffprobe).await?, &input).await?,
    ))
}

async fn preview(
    ExtractState(state): ExtractState<State>,
    Path(id): Path<i64>,
    request: Request,
) -> Result<Response, EditorError> {
    let (_, input) = source(&state, id).await?;
    Ok(serve(input, None, request).await?)
}

async fn timeline(
    ExtractState(state): ExtractState<State>,
    Path(id): Path<i64>,
) -> Result<Json<Value>, EditorError> {
    let _permit = state.visuals.try_acquire().map_err(|_| EditorError::Busy)?;
    let (_, input) = source(&state, id).await?;
    let media = probe(&state.tools.ensure(Tool::Ffprobe).await?, &input).await?;
    Ok(Json(
        visuals::create(&state.tools.ensure(Tool::Ffmpeg).await?, &input, &media).await,
    ))
}

async fn edit(
    ExtractState(state): ExtractState<State>,
    Path(id): Path<i64>,
    body: Result<Json<Value>, axum::extract::rejection::JsonRejection>,
) -> Result<Json<Value>, EditorError> {
    let Json(body) = body.map_err(|_| EditorError::Invalid)?;
    let _permit = state
        .edits
        .clone()
        .try_acquire_owned()
        .map_err(|_| EditorError::Busy)?;
    let (row, input) = source(&state, id).await?;
    let media = probe(&state.tools.ensure(Tool::Ffprobe).await?, &input).await?;
    let edit = Edit::parse(&body, &media).ok_or(EditorError::Invalid)?;
    let extension = if edit.audio_only { "m4a" } else { "mp4" };
    let stem = row
        .filename
        .as_deref()
        .and_then(|filename| std::path::Path::new(filename).file_stem())
        .and_then(|stem| stem.to_str())
        .unwrap_or("media")
        .chars()
        .take(48)
        .collect::<String>();
    let filename = format!("{stem}-edit-{}.{extension}", Uuid::new_v4().simple());
    let parent = input.parent().ok_or(EditorError::Failed)?;
    let staging = tempfile::tempdir_in(parent).map_err(|_| EditorError::Failed)?;
    let output = parent.join(&filename);
    let staged_file = staging.path().join(&filename);

    edit.render(
        &state.tools.ensure(Tool::Ffmpeg).await?,
        &input,
        &staged_file,
        &media,
    )
    .await?;
    let duration = edit.duration();
    let kind = if edit.audio_only { "audio" } else { "video" };

    let result = db_task(state, move |db| {
        let _resources = (staging, _permit);
        // A sibling temporary directory allows an atomic no-clobber publish.
        std::fs::hard_link(&staged_file, &output)
            .map_err(|_| rusqlite::Error::ExecuteReturnedResults)?;
        let insert = db.execute(
            "INSERT INTO downloads (
                video_id, title, duration, timestamp, download_type, format_id,
                filename, service, source_url, thumbnail_url, local_path
             )
             SELECT video_id, title, ?2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), ?3, ?4,
                ?5, service, source_url, thumbnail_url, ?6 FROM downloads WHERE id = ?1",
            (
                id,
                duration,
                kind,
                extension,
                &filename,
                output.to_string_lossy().as_ref(),
            ),
        );
        match insert {
            Ok(1) => Ok(
                json!({"id": db.last_insert_rowid(), "filename": filename, "duration": duration}),
            ),
            failed => {
                let _ = std::fs::remove_file(&output);
                Err(failed.err().unwrap_or(rusqlite::Error::QueryReturnedNoRows))
            }
        }
    })
    .await?;
    Ok(Json(result))
}

pub fn routes() -> Router<State> {
    Router::new()
        .route("/api/downloads/{id}/media", get(info))
        .route("/api/downloads/{id}/preview", get(preview))
        .route("/api/downloads/{id}/timeline", get(timeline))
        .route("/api/downloads/{id}/edit", post(edit))
}
