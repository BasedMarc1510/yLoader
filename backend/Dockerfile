# syntax=docker/dockerfile:1.7

FROM node:20-bookworm-slim

ARG TARGETARCH

# App setup
WORKDIR /app/backend
ENV NODE_ENV=production
ENV DOWNLOAD_DIR=/downloads
ENV YT_DLP_PATH=/usr/local/bin/yt-dlp
ENV YT_DLP_UPDATE_METHOD=self
ENV YT_DLP_MANAGED_BY_YLOADER=1
ENV FFMPEG_PATH=/usr/local/bin/ffmpeg
ENV FFPROBE_PATH=/usr/local/bin/ffprobe
ENV FFMPEG_MANAGED_BY_YLOADER=1

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
		&& curl -fL --retry 6 --retry-delay 2 --retry-all-errors --connect-timeout 20 --max-time 300 "https://github.com/yt-dlp/yt-dlp/releases/latest/download/${YT_DLP_ASSET}" -o /usr/local/bin/yt-dlp \
		&& curl -fL --retry 6 --retry-delay 2 --retry-all-errors --connect-timeout 20 --max-time 300 "https://github.com/eugeneware/ffmpeg-static/releases/latest/download/${FFMPEG_ASSET}" -o /usr/local/bin/ffmpeg \
		&& curl -fL --retry 6 --retry-delay 2 --retry-all-errors --connect-timeout 20 --max-time 300 "https://github.com/eugeneware/ffmpeg-static/releases/latest/download/${FFPROBE_ASSET}" -o /usr/local/bin/ffprobe \
		&& chmod +x /usr/local/bin/yt-dlp \
		&& chmod +x /usr/local/bin/ffmpeg \
		&& chmod +x /usr/local/bin/ffprobe \
		&& /usr/local/bin/yt-dlp --version \
		&& apt-get purge -y --auto-remove curl

# Install Node dependencies
COPY backend/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund \
		&& npm cache clean --force

# Copy application source
COPY backend/server.js ./
COPY shared /app/shared

# Ensure directories exist (bind-mounts will override at runtime)
RUN mkdir -p /downloads /app/data

EXPOSE 4000
CMD ["npm", "start"]
