# yLoader

Self-hosted `yt-dlp` web UI for downloading audio and video from YouTube, X/Twitter, Reddit, and other supported sites.

`yLoader` is an open-source, local-first media downloader with a React frontend and a Node.js backend. It wraps `yt-dlp` in a browser interface, adds download history, metadata handling, format selection, and simple local or Docker startup, and is designed for self-hosting on Linux, Windows, macOS, and ARM devices.

## Quick Facts

| Topic | Value |
| --- | --- |
| Project type | Self-hosted `yt-dlp` web wrapper |
| Primary use case | Browser-based audio/video downloads for local or homelab use |
| Frontend | React + Vite + MUI |
| Backend | Node.js + Express + SQLite |
| Downloader engine | `yt-dlp` |
| Optional media processing | `ffmpeg` |
| Deployment modes | Local start or Docker Compose |
| Supported OS | Linux, Windows, macOS, ARM boards / single-board systems |
| License | `AGPL-3.0-or-later` |

## Supported Services

| Service | Route | Notes |
| --- | --- | --- |
| YouTube | `/youtube-downloader` | Standard video/audio downloads, metadata and format selection |
| X / Twitter | `/x-downloader` | Direct downloader view for X/Twitter URLs |
| Reddit | `/reddit-downloader` | Direct downloader view for Reddit URLs |
| Generic | `/generic-downloader` | Fallback for other `yt-dlp` supported URLs |

## Quick Start

Run commands from the repository root.

### Local Mode

```bash
npm run start
```

What this command does:

- Creates local runtime folders if missing
- Installs backend and frontend Node dependencies on first run
- Prefers `YT_DLP_PATH` or an existing `yt-dlp` installation from your system `PATH`
- Downloads a matching `yt-dlp` binary only if no usable installation was found
- Starts backend and frontend with readable prefixed logs
- Prints local service URLs and keeps both services running

Default local URLs:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:4000`
- Health: `http://localhost:4000/health`

Stop with `Ctrl+C`.

Linux note:
If `yt-dlp` is already installed on the machine, `yLoader` reuses it and treats updates as externally managed. That avoids broken self-update attempts for package-manager installs such as `apt`.

### Docker Mode

```bash
docker compose up -d --build --remove-orphans
```

What Docker mode does:

- Verifies Docker and Docker Compose availability
- Builds backend and frontend images
- Starts the stack in detached mode
- Uses local persistent folders for downloads and database data
- Prints follow-up commands and URLs

Default Docker URLs:

- Frontend: `http://localhost:8080`
- Backend: `http://localhost:4000`
- Health: `http://localhost:4000/health`

Useful commands:

```bash
npm run docker:start:guided
npm run docker:start:plain
npm run docker:start:fresh
npm run docker:logs
npm run docker:stop
```

Notes:

- `docker:start:guided` adds extra checks and readiness output
- `docker:start:plain` uses plain build logs
- `docker:start:fresh` forces a rebuild without cache and pulls fresh base images

## Prerequisites

### Local Mode

- Node.js 18+
- npm 9+
- `yt-dlp` recommended on Linux
- `ffmpeg` optional but recommended

### Docker Mode

- Docker
- Docker Compose v2

## Architecture

`yLoader` is a split frontend/backend application:

1. The React frontend provides the downloader UI in the browser.
2. The Node.js backend exposes API endpoints and manages downloads.
3. The backend calls `yt-dlp` for metadata extraction and downloads.
4. `ffmpeg` is used when merging or conversion is required.
5. SQLite stores local download history and related runtime state.

Runtime data lives in repository-local folders:

- `downloads/` for downloaded files
- `backend-data/` for SQLite data and updater state

## Core Features

- Home page with fast URL detection and service routing
- Dedicated downloader pages for YouTube, Reddit, X/Twitter, and generic URLs
- Audio and video download actions
- Format discovery through `yt-dlp`
- Thumbnail and metadata handling
- Local download history view
- Support page with donation links and QR codes
- Health endpoint for operational checks

## Configuration

Optional environment placeholders are provided in `.env.example`.

### Main Backend Environment Variables

| Variable | Purpose | Default |
| --- | --- | --- |
| `DB_PATH` | SQLite database path | `backend-data/metadata.db` in local mode |
| `DOWNLOAD_DIR` | Download target directory | `downloads/` in local mode |
| `YT_DLP_PATH` | Explicit `yt-dlp` binary path | auto-detected by startup script |
| `YT_DLP_JS_RUNTIMES` | JavaScript runtimes for extractors | `node` |
| `YT_DLP_UPDATE_METHOD` | Update mode for `yt-dlp` | `self` for local downloaded binaries, `disabled` for reused system binaries, optional `pip` with `YT_PIP_PATH` |
| `YT_PIP_PATH` | `pip` executable for `yt-dlp` updates | unset |

### Optional Authentication / Extractor Variables

| Variable | Purpose |
| --- | --- |
| `YT_DLP_COOKIES_FROM_BROWSER` | Read cookies from a local browser such as `chrome`, `firefox`, or `edge` |
| `YT_DLP_COOKIES_FILE` | Use an exported Netscape cookies file |
| `YT_DLP_EXTRACTOR_ARGS` | Advanced extractor tuning for `yt-dlp` |

If you see `Sign in to confirm you're not a bot`, configure one of the cookie options above.

## Health Endpoint

The backend exposes:

- `GET /health`

The response includes health checks for:

- SQLite database access
- `yt-dlp` availability
- `ffmpeg` availability

## yt-dlp Binary Source

If no usable system binary is found, the local startup flow uses official release assets:

- Windows: `https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe`
- Linux x64: `https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux`
- Linux arm64: `https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux_aarch64`
- macOS: `https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos`

Docker backend images also auto-select `amd64` or `arm64` at build time.

## FAQ

### What is yLoader?

`yLoader` is a self-hosted `yt-dlp` web frontend. It gives you a browser UI for URL-based audio and video downloads while keeping the actual downloader logic on your own machine or server.

### Is yLoader a cloud service?

No. `yLoader` is designed for self-hosting and local-first use. You run the frontend and backend yourself.

### Does yLoader work on Linux?

Yes. `yLoader` supports Linux directly, including local startup and Docker deployment. If a system `yt-dlp` is already installed, the startup script reuses it.

### Does yLoader require Docker?

No. Docker is optional. You can run `npm run start` for local mode.

### Which downloader engine does yLoader use?

`yLoader` uses `yt-dlp` as its downloader and metadata engine.

### What sites does yLoader target?

The UI has dedicated flows for YouTube, X/Twitter, Reddit, and a generic route for other `yt-dlp` supported URLs.

### How do I fix YouTube bot-check or login issues?

Use `YT_DLP_COOKIES_FROM_BROWSER` or `YT_DLP_COOKIES_FILE` so `yt-dlp` can authenticate with valid browser cookies.

### Can I run yLoader on a Raspberry Pi or other ARM device?

Yes. The project is intended to work on single-board systems and ARM hardware where Node.js, Docker, `yt-dlp`, and optional `ffmpeg` are available.

## Why use yLoader? (Use Cases)
If you are looking for a way to **bulk download YouTube videos**, archive **Twitter/X media**, or save **Reddit videos with sound**, yLoader provides a clean interface for it. 
Unlike cloud-based downloaders, yLoader is completely private. You avoid ads, tracking, and rate limits. Because it supports `yt-dlp` cookies, you can easily bypass login-walls or age-restrictions by passing your browser cookies directly to the backend.


## Support

The app includes a dedicated Support page in the UI and uses the same donation destinations as `openkeyboardheatmap`.

- Buy Me a Coffee: `https://buymeacoffee.com/michaelsant0s`
- Bitcoin: `bc1q273jxf4xq87qggcjfw6d8v038rwqyygcsxmw8f`
- Dogecoin: `DASGta7VgHuxUCvDh9v5cfRCFLirjs611B`

## License

The `yLoader` source code and original project assets in this repository are licensed under `AGPL-3.0-or-later`.

Files:

- `LICENSE` contains the GNU AGPL v3 license text
- `COPYING` contains the same GNU AGPL v3 license text for compatibility with common repository conventions
- `NOTICE.md` documents third-party marks and assets that cannot legally be relicensed under AGPL

Important exceptions:

- Brand icons in `frontend/public/dl-icons/` are used only to identify supported third-party services
- Those marks remain the property of their respective owners and are not relicensed under AGPL

## Legal / Usage Note

Use `yLoader`, `yt-dlp`, and related tooling only for content you are legally allowed to access and download. You are responsible for complying with local law, copyright rules, and the terms of the sites you use.
