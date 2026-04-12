# syntax=docker/dockerfile:1.7

FROM node:20-bookworm-slim

ARG TARGETARCH

# App setup
WORKDIR /app
ENV NODE_ENV=production
ENV DOWNLOAD_DIR=/downloads
ENV YT_DLP_PATH=/usr/local/bin/yt-dlp
ENV YT_DLP_UPDATE_METHOD=self

# Runtime dependencies: ffmpeg + standalone yt-dlp binary
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
		--mount=type=cache,target=/var/lib/apt,sharing=locked \
		apt-get update \
		&& apt-get install -y --no-install-recommends ca-certificates curl ffmpeg \
		&& case "${TARGETARCH}" in \
				 "amd64") YT_DLP_ASSET="yt-dlp_linux" ;; \
				 "arm64") YT_DLP_ASSET="yt-dlp_linux_aarch64" ;; \
				 *) echo "Unsupported TARGETARCH: ${TARGETARCH}" >&2; exit 1 ;; \
			 esac \
		&& curl -fsSL "https://github.com/yt-dlp/yt-dlp/releases/latest/download/${YT_DLP_ASSET}" -o /usr/local/bin/yt-dlp \
		&& chmod +x /usr/local/bin/yt-dlp \
		&& /usr/local/bin/yt-dlp --version

# Install Node dependencies
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# Copy application source
COPY server.js ./

# Ensure directories exist (bind-mounts will override at runtime)
RUN mkdir -p /downloads /app/data

EXPOSE 4000
CMD ["npm", "start"]
