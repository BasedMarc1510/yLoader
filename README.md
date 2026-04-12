# yLoader

yLoader is an open-source yt-dlp web wrapper with a React frontend and a Node.js backend.
It gives you a clean browser UI to download audio/video, manage metadata, and keep a local download history.

This project is designed for self-hosting and local use on Windows, Linux, macOS, and single-board systems.

## Why yLoader

- Simple web interface for yt-dlp downloads
- Local-first architecture with SQLite metadata storage
- Audio/video format selection and metadata handling
- Docker and non-Docker startup paths
- One-command local start with automatic first-run setup

## Tech Stack

- Frontend: React + Vite + MUI
- Backend: Node.js + Express + SQLite
- Downloader: yt-dlp
- Optional media processing: ffmpeg
- Container runtime: Docker Compose

## Quick Start

Run from the repository root.

### Local mode (recommended for development)

```bash
npm run start
```

What this command does:

- Creates local runtime folders if missing
- Installs backend/frontend Node dependencies on first run
- Prefers `YT_DLP_PATH` or an existing `yt-dlp` installation from your system `PATH`
- Downloads a matching yt-dlp binary automatically only if no existing installation was found
- Starts backend and frontend with prefixed, readable console logs
- Prints final service URLs and keeps both services running

Default URLs in local mode:

- Frontend: http://localhost:5173
- Backend: http://localhost:4000
- Health: http://localhost:4000/health

Stop with `Ctrl+C`.

### Docker mode (recommended for easy deployment)

```bash
docker compose up -d --build --remove-orphans
```

What this command does:

- Verifies Docker/Docker Compose availability
- Builds and starts containers in detached mode
- Uses local persistent folders for downloads and DB data
- Prints final URLs and follow-up commands

Optional guided starter with extra checks and readiness output:

```bash
npm run docker:start:guided
```

If you want full step-by-step build logs (instead of compact BuildKit output):

```bash
npm run docker:start:plain
```

This mode builds `backend` first and `frontend` second, so logs are easier to follow.

Note: if many steps show `CACHED`, Docker reused existing layers and did not rebuild them.

If you want to force a full rebuild (no cache, pull latest base image, and re-run yt-dlp download layer):

```bash
npm run docker:start:fresh
```

Default URLs in Docker mode:

- Frontend: http://localhost:8080
- Backend: http://localhost:4000
- Health: http://localhost:4000/health

Useful Docker commands:

```bash
docker compose logs -f --tail=100
docker compose down
```

## Prerequisites

For local mode:

- Node.js 18+
- npm 9+
- yt-dlp (recommended on Linux so startup works without downloading a local binary)
- ffmpeg (optional but recommended)

For Docker mode:

- Docker
- Docker Compose v2

## Data and Persistence

Runtime data is stored in repository-local folders:

- `downloads/` for downloaded media files
- `backend-data/` for SQLite database and updater state

These folders are ignored by Git to keep the repository clean.

## Configuration

Optional environment placeholders are provided in `.env.example`.

Main backend runtime environment variables:

- `DB_PATH` (default: `backend-data/metadata.db` in local mode)
- `DOWNLOAD_DIR` (default: `downloads/` in local mode)
- `YT_DLP_PATH` (auto-managed by startup script when available)
- `YT_DLP_JS_RUNTIMES` (default: `node`, used for extractor JavaScript execution)
- `YT_DLP_UPDATE_METHOD` (`self` for downloaded local binaries, `disabled` for reused system binaries, optional `pip` with `YT_PIP_PATH`)

Optional YouTube auth-related variables:

- `YT_DLP_COOKIES_FROM_BROWSER` (example: `chrome`, `firefox`, `edge`)
- `YT_DLP_COOKIES_FILE` (path to exported Netscape cookies file)
- `YT_DLP_EXTRACTOR_ARGS` (advanced extractor tuning)

If you see `Sign in to confirm you're not a bot`, set one of the cookie options above.

## Support

The app now includes a dedicated Support page in the UI with the same donation targets used in `openkeyboardheatmap`.

- Buy Me a Coffee: https://buymeacoffee.com/michaelsant0s
- Bitcoin: `bc1q273jxf4xq87qggcjfw6d8v038rwqyygcsxmw8f`
- Dogecoin: `DASGta7VgHuxUCvDh9v5cfRCFLirjs611B`

## yt-dlp Binary Source

The local startup flow uses these official release assets:

- Windows: https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe
- Linux: https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux
- macOS: https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos

Linux architecture handling:

- `x64` uses `yt-dlp_linux`
- `arm64` uses `yt-dlp_linux_aarch64`
- Docker backend image also auto-selects `amd64` or `arm64` at build time

## Health Endpoint

The backend exposes:

- `GET /health`

Response includes health checks for DB, yt-dlp, and ffmpeg.

## Open Source Notes

- Private machine-specific paths and host/IP defaults were removed
- Legacy private deployment scripts were removed
- Repository docs were consolidated into this single README

## License

The `yLoader` source code and original project assets in this repository are licensed under `AGPL-3.0-or-later`.

Files:

- `LICENSE` contains the GNU AGPL v3 license text
- `COPYING` contains the same GNU AGPL v3 license text for compatibility with common repository conventions
- `NOTICE.md` documents third-party marks/assets that cannot legally be relicensed under AGPL

Important exceptions:

- Brand icons in `frontend/public/dl-icons/` are used only to identify supported third-party services
- Those marks remain the property of their respective owners and are not relicensed under AGPL
