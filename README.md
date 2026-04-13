# yLoader

Self-hosted `yt-dlp` web UI for downloading audio and video from YouTube, X/Twitter, Reddit, and other `yt-dlp` supported sites.

`yLoader` is local-first: you run the frontend and backend on your own machine or server.

## Quick Start

Run all commands from the repository root.

### Local

```bash
npm run start
```

Local start is fully self-contained: `yLoader` uses project-local binaries from `.tools/` for `yt-dlp` and `ffmpeg` (no fallback to a globally installed ffmpeg on PATH).

### Docker

```bash
docker compose up -d --build --remove-orphans
```

The backend Docker image installs `ffmpeg` during build, so no host-level ffmpeg setup is required.

### Default URLs

| Mode | Frontend | Backend | Health |
| --- | --- | --- | --- |
| Local | `http://localhost:5173` | `http://localhost:4000` | `http://localhost:4000/health` |
| Docker | `http://localhost:8080` | `http://localhost:4000` | `http://localhost:4000/health` |

## What You Get

- Browser UI for URL-based downloads
- Dedicated downloaders for YouTube, X/Twitter, Reddit, and generic URLs
- Audio/video format selection
- Download history (SQLite-backed)
- Metadata and thumbnail handling
- Built-in ffmpeg handling for local and Docker workflows

## Supported Routes

| Service | Route |
| --- | --- |
| YouTube | `/youtube-downloader` |
| X / Twitter | `/x-downloader` |
| Reddit | `/reddit-downloader` |
| Generic | `/generic-downloader` |

## Requirements

### Local Mode

- Node.js 18+
- npm 9+

### Docker Mode

- Docker
- Docker Compose v2

## Configuration

Use `.env.example` as a reference.

### Key Backend Variables

| Variable | Purpose | Default (local) |
| --- | --- | --- |
| `DB_PATH` | SQLite file path | `backend-data/metadata.db` |
| `DOWNLOAD_DIR` | Download output directory | `downloads/` |
| `YT_DLP_PATH` | Explicit `yt-dlp` binary path | auto-detected |
| `FFMPEG_PATH` | Explicit `ffmpeg` binary path | project-managed `.tools/ffmpeg-bin/.../bin/ffmpeg` |
| `YT_DLP_JS_RUNTIMES` | JS runtimes for extractors | `node` |
| `YT_DLP_UPDATE_METHOD` | `yt-dlp` update strategy | auto-managed |
| `YT_PIP_PATH` | `pip` path for optional updates | unset |

### Optional Auth / Extractor Variables

| Variable | Purpose |
| --- | --- |
| `YT_DLP_COOKIES_FROM_BROWSER` | Read cookies from local browser (`chrome`, `firefox`, `edge`, etc.) |
| `YT_DLP_COOKIES_FILE` | Use exported Netscape cookies file |
| `YT_DLP_EXTRACTOR_ARGS` | Advanced `yt-dlp` extractor tuning |

If you hit bot-check/login restrictions, configure one of the cookie options.

## Data and Persistence

- `downloads/` stores downloaded media
- `backend-data/` stores SQLite data and updater state

## Useful Commands

```bash
npm run docker:start:guided
npm run docker:start:plain
npm run docker:start:fresh
npm run docker:logs
npm run docker:stop
```

## Health Check

`GET /health` reports backend status including:

- SQLite access
- `yt-dlp` availability
- `ffmpeg` availability

## Why use yLoader? (Use Cases)
If you are looking for a way to **bulk download YouTube videos**, archive **Twitter/X media**, or save **Reddit videos with sound**, yLoader provides a clean interface for it. 
Unlike cloud-based downloaders, yLoader is completely private. You avoid ads, tracking, and rate limits. Because it supports `yt-dlp` cookies, you can easily bypass login-walls or age-restrictions by passing your browser cookies directly to the backend.


## Support

- Buy Me a Coffee: `https://buymeacoffee.com/michaelsant0s`
- Bitcoin: `bc1q273jxf4xq87qggcjfw6d8v038rwqyygcsxmw8f`
- Dogecoin: `DASGta7VgHuxUCvDh9v5cfRCFLirjs611B`

## License

This project is licensed under `AGPL-3.0-or-later`.

- License text: `LICENSE`
- Trademark/third-party mark notes: `NOTICE.md`

Brand icons in `frontend/public/dl-icons/` are used only to identify supported third-party services and remain the property of their respective owners.

## Legal Notice

Use `yLoader`, `yt-dlp`, and related tools only where you have the legal right to access and download content. You are responsible for complying with local law and platform terms.
