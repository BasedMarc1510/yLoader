# syntax=docker/dockerfile:1.7

# Build frontend once and copy dist into the runtime image.
FROM node:20-slim AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci --no-audit --no-fund

WORKDIR /app
COPY frontend ./frontend
COPY shared ./shared

WORKDIR /app/frontend
RUN npm run build

FROM node:20-bookworm-slim

ARG TARGETARCH

# App setup
WORKDIR /app/backend
ENV NODE_ENV=production
ENV PORT=8080
ENV DOWNLOAD_DIR=/downloads
ENV DB_PATH=/app/data/metadata.db
ENV FRONTEND_DIST_DIR=/app/frontend/dist
ENV YT_DLP_PATH=/usr/local/bin/yt-dlp
ENV YT_DLP_UPDATE_METHOD=self
ENV YT_DLP_MANAGED_BY_YLOADER=1
ENV FFMPEG_PATH=/usr/local/bin/ffmpeg
ENV FFPROBE_PATH=/usr/local/bin/ffprobe
ENV FFMPEG_MANAGED_BY_YLOADER=1
ENV YLOADER_RUNTIME_TARGET=docker

# Runtime dependencies: standalone yt-dlp + ffmpeg/ffprobe release binaries
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
		--mount=type=cache,target=/var/lib/apt,sharing=locked \
		apt-get update \
		&& apt-get install -y --no-install-recommends ca-certificates curl \
		&& case "${TARGETARCH}" in \
				 "amd64") YT_DLP_ASSET="yt-dlp_linux"; FFMPEG_SUFFIX="linux-x64" ;; \
				 "arm64") YT_DLP_ASSET="yt-dlp_linux_aarch64"; FFMPEG_SUFFIX="linux-arm64" ;; \
				 *) echo "Unsupported TARGETARCH: ${TARGETARCH}" >&2; exit 1 ;; \
			 esac \
		&& FFMPEG_ASSET="ffmpeg-${FFMPEG_SUFFIX}" \
		&& FFPROBE_ASSET="ffprobe-${FFMPEG_SUFFIX}" \
		&& download_with_retry() { \
				 curl -fL --retry 10 --retry-delay 3 --retry-all-errors --retry-max-time 900 --connect-timeout 20 --max-time 300 "$1" -o "$2"; \
		 } \
		&& if ! download_with_retry "https://github.com/yt-dlp/yt-dlp/releases/latest/download/${YT_DLP_ASSET}" /usr/local/bin/yt-dlp; then \
				 echo "yt-dlp download failed; falling back to Debian package." >&2; \
				 apt-get install -y --no-install-recommends yt-dlp; \
				 cp "$(command -v yt-dlp)" /usr/local/bin/yt-dlp; \
		 fi \
		&& if ! download_with_retry "https://github.com/eugeneware/ffmpeg-static/releases/latest/download/${FFMPEG_ASSET}" /usr/local/bin/ffmpeg; then \
				 echo "ffmpeg download failed; falling back to Debian package." >&2; \
				 apt-get install -y --no-install-recommends ffmpeg; \
				 cp "$(command -v ffmpeg)" /usr/local/bin/ffmpeg; \
		 fi \
		&& if ! download_with_retry "https://github.com/eugeneware/ffmpeg-static/releases/latest/download/${FFPROBE_ASSET}" /usr/local/bin/ffprobe; then \
				 echo "ffprobe download failed; falling back to Debian package." >&2; \
				 if ! command -v ffprobe >/dev/null 2>&1; then \
						 apt-get install -y --no-install-recommends ffmpeg; \
				 fi; \
				 cp "$(command -v ffprobe)" /usr/local/bin/ffprobe; \
		 fi \
		&& chmod +x /usr/local/bin/yt-dlp \
		&& chmod +x /usr/local/bin/ffmpeg \
		&& chmod +x /usr/local/bin/ffprobe \
		&& /usr/local/bin/yt-dlp --version \
		&& /usr/local/bin/ffmpeg -version \
		&& apt-get purge -y --auto-remove curl

# Install Node dependencies
COPY backend/package*.json ./
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
		--mount=type=cache,target=/var/lib/apt,sharing=locked \
		apt-get update \
		&& apt-get install -y --no-install-recommends python3 make g++ \
		&& npm_config_build_from_source=true npm ci --omit=dev --no-audit --no-fund \
		&& apt-get purge -y --auto-remove python3 make g++ \
		&& rm -rf /var/lib/apt/lists/* \
		&& npm cache clean --force

# Copy application source
COPY backend/server.js ./
COPY shared /app/shared
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

# Ensure directories exist (bind-mounts will override at runtime)
RUN mkdir -p /downloads /app/data /app/frontend/dist

EXPOSE 8080
CMD ["npm", "start"]
