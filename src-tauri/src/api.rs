mod cookies;
pub(crate) mod downloads;
mod editor;
pub(crate) mod history;
mod metadata;
mod settings;
#[cfg(test)]
mod tests;
pub(crate) mod tool_updates;

use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, Request},
    http::{Method, StatusCode, header},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::get,
};
use rusqlite::Connection;
use serde_json::json;
use tower_http::cors::CorsLayer;

use crate::data::State;

#[derive(Debug)]
pub struct ApiError(pub StatusCode, pub &'static str);

impl ApiError {
    fn not_found() -> Self {
        Self(StatusCode::NOT_FOUND, "File not found")
    }

    fn database() -> Self {
        Self(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Could not access download database",
        )
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.0, Json(json!({"error": self.1}))).into_response()
    }
}

async fn db_task<T: Send + 'static>(
    state: State,
    task: impl FnOnce(&Connection) -> rusqlite::Result<T> + Send + 'static,
) -> Result<T, ApiError> {
    tokio::task::spawn_blocking(move || {
        let db = state.db.lock().map_err(|_| ApiError::database())?;
        task(&db).map_err(|_| ApiError::database())
    })
    .await
    .map_err(|_| ApiError::database())?
}

const APP_ORIGINS: [&str; 3] = [
    "tauri://localhost",
    "http://tauri.localhost",
    "https://tauri.localhost",
];

async fn check_origin(request: Request, next: Next) -> Response {
    if let Some(origin) = request.headers().get(header::ORIGIN)
        && !origin
            .to_str()
            .is_ok_and(|origin| APP_ORIGINS.contains(&origin))
    {
        return StatusCode::FORBIDDEN.into_response();
    }
    next.run(request).await
}

pub fn router(state: State, token: &str) -> Router {
    let api = Router::new()
        .merge(history::routes())
        .merge(cookies::routes())
        .merge(metadata::routes())
        .merge(editor::routes())
        .merge(downloads::routes())
        .merge(settings::routes())
        .merge(tool_updates::routes())
        .route("/health", get(|| async { Json(json!({"status": "ok"})) }))
        .layer(DefaultBodyLimit::max(25 * 1024 * 1024))
        .with_state(state);
    Router::new()
        .nest(&format!("/{token}"), api)
        .layer(middleware::from_fn(check_origin))
        .layer(
            CorsLayer::new()
                .allow_origin(APP_ORIGINS.map(|origin| origin.parse().unwrap()))
                .allow_methods([
                    Method::GET,
                    Method::HEAD,
                    Method::PUT,
                    Method::POST,
                    Method::DELETE,
                ])
                .allow_headers([header::CONTENT_TYPE, header::RANGE]),
        )
}
