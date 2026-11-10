use axum::{
    Json, Router,
    body::Body,
    extract::{Path, Query, Request, State as ExtractState},
    http::{HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
    routing::get,
};
use rusqlite::{OptionalExtension, params_from_iter};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use tower::ServiceExt;
use tower_http::services::ServeFile;

use super::{ApiError, db_task};
use crate::data::State;

const FIELDS: &str = "id, video_id, title, duration, timestamp, download_type,
    format_id, filename, service, source_url, thumbnail_url, local_path";

#[derive(Serialize)]
pub struct Download {
    id: i64,
    video_id: Option<String>,
    title: Option<String>,
    duration: Option<f64>,
    timestamp: Option<String>,
    pub download_type: Option<String>,
    format_id: Option<String>,
    pub filename: Option<String>,
    service: Option<String>,
    source_url: Option<String>,
    thumbnail_url: Option<String>,
    #[serde(skip)]
    pub local_path: Option<String>,
    cached: bool,
}

impl Download {
    fn from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Self> {
        Ok(Self {
            id: row.get(0)?,
            video_id: row.get(1)?,
            title: row.get(2)?,
            duration: row.get(3)?,
            timestamp: row.get(4)?,
            download_type: row.get(5)?,
            format_id: row.get(6)?,
            filename: row.get(7)?,
            service: row.get(8)?,
            source_url: row.get(9)?,
            thumbnail_url: row.get::<_, Option<String>>(10)?.filter(|value| {
                tauri::Url::parse(value).is_ok_and(|url| matches!(url.scheme(), "http" | "https"))
            }),
            local_path: row.get(11)?,
            cached: false,
        })
    }

    pub fn file(&self, state: &State) -> Option<std::path::PathBuf> {
        state.download_path(self.filename.as_deref()?, self.local_path.as_deref())
    }
}

#[derive(Deserialize)]
struct Filters {
    q: Option<String>,
    service: Option<String>,
    #[serde(rename = "type")]
    kind: Option<String>,
}

async fn list(
    ExtractState(state): ExtractState<State>,
    Query(filters): Query<Filters>,
) -> Result<Json<Vec<Download>>, ApiError> {
    let state_for_files = state.clone();
    let rows = db_task(state, move |db| {
        let mut sql = format!("SELECT {FIELDS} FROM downloads WHERE 1=1");
        let mut params = Vec::new();
        if let Some(query) = filters.q.filter(|value| !value.is_empty()) {
            sql.push_str(" AND (title LIKE ? OR filename LIKE ?)");
            let needle = format!("%{query}%");
            params.extend([needle.clone(), needle]);
        }
        if let Some(service) = filters.service.filter(|value| !value.is_empty()) {
            let key = service.trim().to_ascii_lowercase();
            if matches!(key.as_str(), "generic" | "other") {
                sql.push_str(" AND service IN ('generic', 'other')");
            } else {
                sql.push_str(" AND service = ?");
                params.push(key);
            }
        }
        if let Some(kind) = filters.kind.filter(|value| !value.is_empty()) {
            sql.push_str(" AND download_type = ?");
            params.push(kind.trim().to_ascii_lowercase());
        }
        sql.push_str(" ORDER BY timestamp DESC");
        let mut statement = db.prepare(&sql)?;
        statement
            .query_map(params_from_iter(params), Download::from_row)?
            .collect()
    })
    .await?;
    let mut rows: Vec<Download> = rows;
    for row in &mut rows {
        row.cached = row.file(&state_for_files).is_some();
    }
    Ok(Json(rows))
}

async fn delete(
    ExtractState(state): ExtractState<State>,
    Path(id): Path<i64>,
) -> Result<Json<Value>, ApiError> {
    let count = db_task(state, move |db| {
        db.execute("DELETE FROM downloads WHERE id = ?1", [id])
    })
    .await?;
    Ok(Json(json!({ "deleted": count })))
}

pub async fn get_download(state: State, id: i64) -> Result<Option<Download>, ApiError> {
    db_task(state, move |db| {
        db.query_row(
            &format!("SELECT {FIELDS} FROM downloads WHERE id = ?1"),
            [id],
            Download::from_row,
        )
        .optional()
    })
    .await
}

async fn record_file(
    ExtractState(state): ExtractState<State>,
    Path(id): Path<i64>,
    request: Request,
) -> Result<Response, ApiError> {
    let row = get_download(state.clone(), id)
        .await?
        .ok_or(ApiError::not_found())?;
    let file = row.file(&state).ok_or(ApiError::not_found())?;
    serve(file, row.filename.as_deref(), request).await
}

async fn cache_file(
    ExtractState(state): ExtractState<State>,
    Path(filename): Path<String>,
    request: Request,
) -> Result<Response, ApiError> {
    if filename.contains(['/', '\\']) || filename == "." || filename == ".." {
        return Err(ApiError::not_found());
    }
    let file = state
        .download_path(&filename, None)
        .ok_or(ApiError::not_found())?;
    serve(file, Some(&filename), request).await
}

pub async fn serve(
    file: std::path::PathBuf,
    attachment: Option<&str>,
    request: Request,
) -> Result<Response, ApiError> {
    let (parts, _) = request.into_parts();
    let mut response = ServeFile::new(file)
        .oneshot(Request::from_parts(parts, Body::empty()))
        .await
        .unwrap_or_else(|err| match err {})
        .into_response();
    if response.status().is_success() {
        response.headers_mut().insert(
            header::CACHE_CONTROL,
            HeaderValue::from_static("private, no-store"),
        );
        if let Some(name) = attachment {
            let encoded = url::form_urlencoded::byte_serialize(name.as_bytes())
                .collect::<String>()
                .replace('+', "%20");
            let disposition =
                HeaderValue::from_str(&format!("attachment; filename*=UTF-8''{encoded}"))
                    .map_err(|_| ApiError(StatusCode::BAD_REQUEST, "Invalid filename"))?;
            response
                .headers_mut()
                .insert(header::CONTENT_DISPOSITION, disposition);
        }
    }
    Ok(response)
}

pub fn routes() -> Router<State> {
    Router::new()
        .route("/api/downloads", get(list))
        .route("/api/downloads/{id}", axum::routing::delete(delete))
        .route("/api/downloads/{id}/file", get(record_file))
        .route("/api/download/file/{filename}", get(cache_file))
}
