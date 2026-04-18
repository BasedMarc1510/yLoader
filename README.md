# yLoader

world's most advanced Downloader

All-in-one, local-first yt-dlp frontend for people who want one tool that can run exactly how they prefer:

- Web app (frontend + backend)
- Single Docker container
- Electron desktop app

yLoader is built for fast daily use: clean UI, advanced media controls, and feature parity across web, Docker, and Electron runtimes.

<img width="1157" height="717" alt="image1" src="https://github.com/user-attachments/assets/9d3abc5c-d565-48b9-a59e-0e735f326eaa" />

## Electron Desktop App

Install yLoader directly from the latest release for your operating system:

[![Download for Windows](https://img.shields.io/badge/Windows-Download%20EXE-0078D6?style=for-the-badge&logo=windows)](https://github.com/BasedMarc1510/yLoader/releases/latest/download/yLoaderSetup.exe)
[![Download for macOS](https://img.shields.io/badge/macOS-Download%20DMG-111111?style=for-the-badge&logo=apple)](https://github.com/BasedMarc1510/yLoader/releases/latest/download/yLoaderSetup.dmg)
[![Download for Linux](https://img.shields.io/badge/Linux-Download%20AppImage-FCC624?style=for-the-badge&logo=linux&logoColor=black)](https://github.com/BasedMarc1510/yLoader/releases/latest/download/yLoaderSetup.AppImage)

[![Docker Hub](https://img.shields.io/badge/Docker%20Hub-yloader%2Fyloader-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://hub.docker.com/r/yloader/yloader)

Docker quick install:

```bash
docker pull yloader/yloader
```

![License](https://img.shields.io/badge/license-AGPL--3.0--or--later-blue)
![Node](https://img.shields.io/badge/node-18%2B-43853D)
![Docker](https://img.shields.io/badge/docker-ready-2496ED)

## Features

- Download from 1000+ sites supported by yt-dlp
- Service-focused downloader workflows with integrated generic mode
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

### Option 1: Electron Desktop App

Download and run the installer for your operating system from the links above.

### Option 2: Docker Hub

```bash
docker pull yloader/yloader:latest
docker run -d --name yloader -p 8080:8080 -v yloader_downloads:/downloads -v yloader_data:/app/data yloader/yloader:latest
```

Open http://localhost:8080

If you need a pinned version instead of `latest`:

```bash
docker pull yloader/yloader:2026.1.0
docker run -d --name yloader -p 8080:8080 yloader/yloader:2026.1.0
```

### Option 3: Docker Compose (from source)

```bash
git clone https://github.com/BasedMarc1510/yLoader.git
cd yLoader
docker compose up -d --build --remove-orphans
```

Open http://localhost:8080

### Option 4: Local Web App

```bash
git clone https://github.com/BasedMarc1510/yLoader.git
cd yLoader
npm install
npm run start
```

### Option 5: Local Electron App

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
- Version tags are also published in both forms (for example `v2026.1.0` and `2026.1.0`)

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
```

## Legal Notice

Use yLoader, yt-dlp, and related tools only where you have the legal right to access and download content. You are responsible for complying with local law and platform terms.

## License

AGPL-3.0-or-later. See `LICENSE` and `NOTICE.md`.
