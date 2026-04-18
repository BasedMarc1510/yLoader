# yLoader

world's most advanced Downloader

All-in-one, local-first yt-dlp frontend for people who want one tool that can run exactly how they prefer:

- Web app (frontend + backend)
- Single Docker container
- Electron desktop app

yLoader is built for fast daily use: clean UI, advanced media controls, and feature parity across web, Docker, and Electron runtimes.

![yLoader Home](https://raw.githubusercontent.com/BasedMarc1510/yLoader/main/docs/images/yloader-home.png)

![License](https://img.shields.io/badge/license-AGPL--3.0--or--later-blue)
![Node](https://img.shields.io/badge/node-18%2B-43853D)
![Docker](https://img.shields.io/badge/docker-ready-2496ED)

## Features

- Download from 1000+ sites supported by yt-dlp
- Dedicated downloader flows for YouTube, X/Twitter, Reddit, and generic URLs
- Integrated search with provider support (including YouTube and SoundCloud)
- Browser-like tab system for managing multiple downloads in parallel
- Advanced audio and video cutting workflows
- Metadata editing and cover art editing/embedding for audio downloads
- Format, bitrate, and resolution controls
- SQLite-backed download history
- Built-in yt-dlp and ffmpeg update handling
- Same core behavior across Web, Docker, and Electron

## Runtime Modes

| Mode | What you run | Access |
| --- | --- | --- |
| Web (local dev) | React + Node backend | http://localhost:5173 (UI), http://localhost:4000 (API) |
| Docker | Single container serving frontend + backend | http://localhost:8080 |
| Electron | Desktop shell over the same backend/frontend behavior | Native app window |

## Quick Start

### Option 1: Docker Hub (simplest)

```bash
docker pull yloader/yloader:latest
docker run -d --name yloader \
  -p 8080:8080 \
  -v yloader_downloads:/downloads \
  -v yloader_data:/app/data \
  yloader/yloader:latest
```

Open http://localhost:8080

If you need a pinned version instead of `latest`:

```bash
docker pull yloader/yloader:2026.1.2-beta
docker run -d --name yloader -p 8080:8080 yloader/yloader:2026.1.2-beta
```

### Option 2: Docker Compose (from source)

```bash
git clone https://github.com/BasedMarc1510/yLoader.git
cd yLoader
docker compose up -d --build --remove-orphans
```

Open http://localhost:8080

### Option 3: Local Web App

```bash
git clone https://github.com/BasedMarc1510/yLoader.git
cd yLoader
npm install
npm run start
```

### Option 4: Local Electron App

```bash
git clone https://github.com/BasedMarc1510/yLoader.git
cd yLoader
npm install
npm run start:electron
```

## Docker Image Notes

- The image runs the app on container port `8080`
- If you do not publish a host port with `-p`, the app runs but is not reachable from your browser
- `latest` tracks the newest pushed `v*` release tag
- Version tags are also published in both forms:
  - `v2026.1.2-beta`
  - `2026.1.2-beta`

## Key Routes

| Route | Purpose |
| --- | --- |
| `/youtube-downloader` | YouTube focused downloader |
| `/x-downloader` | X / Twitter downloader |
| `/reddit-downloader` | Reddit downloader |
| `/generic-downloader` | Generic yt-dlp route |
| `/downloads` | Download history |
| `/search` | Integrated search |
| `/health` | Health endpoint |

## Configuration

Use `.env.example` as a reference. Most users can start without custom overrides.

Common variables:

- `DOWNLOAD_DIR` for downloaded files
- `DB_PATH` for SQLite metadata
- `YLOADER_FRONTEND_PORT` for Docker host port mapping
- `YT_DLP_PATH`, `FFMPEG_PATH`, `FFPROBE_PATH` for explicit binary paths
- `YT_DLP_JS_RUNTIMES` for yt-dlp JS extractor runtime selection

## Development Commands

```bash
npm run start
npm run start:electron
npm run build:electron
npm run docker:start
npm run docker:logs
npm run docker:stop
npm run release:publish -- 2026.1.2-beta
```

## Releases and CI

Release flows are automated with GitHub Actions:

- Electron Build and Release
  - Builds Windows (NSIS), macOS (DMG), Linux (AppImage)
  - Publishes assets to GitHub Releases for `v*` tags
- Docker Build and Publish
  - Builds and publishes multi-arch Docker images (`linux/amd64`, `linux/arm64`)
  - Updates Docker Hub `latest` + explicit version tags
  - Syncs Docker Hub repository overview from this `README.md`

Typical release trigger:

```bash
git tag -a v2026.1.2-beta -m "release v2026.1.2-beta"
git push origin v2026.1.2-beta
```

## Legal Notice

Use yLoader, yt-dlp, and related tools only where you have the legal right to access and download content. You are responsible for complying with local law and platform terms.

## License

AGPL-3.0-or-later. See `LICENSE` and `NOTICE.md`.
