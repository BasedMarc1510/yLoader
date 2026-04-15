# yLoader

Self-hosted `yt-dlp` web UI for downloading audio and video from YouTube, X/Twitter, Reddit, and other `yt-dlp` supported sites.

`yLoader` is local-first: you run the frontend and backend on your own machine or server.

## Quick Start

Run all commands from the repository root.

### Local

```bash
npm run start
```

Local starts read optional overrides from the repository root `.env` file, for example `YT_DLP_COOKIES_FROM_BROWSER=firefox`.

### Local (Electron)

```bash
npm run start:electron
```

This keeps the same backend (`http://localhost:4000`) and frontend source (`Vite` dev server on `http://localhost:5173`) and only changes the wrapper from browser tab to Electron window.

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
| Local Electron (dev) | Electron window (`http://localhost:5173`) | `http://localhost:4000` | `http://localhost:4000/health` |
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

```bash
npm run start
npm run start:electron
npm run build:electron
npm run release:publish
npm run dist:win
```

`release:publish` asks for the next version (or accepts one via `npm run release:publish -- 2026.1.2-beta`) and then automatically:

- updates root/frontend/backend package versions,
- creates a commit,
- creates and pushes a `v*` tag,
- waits for the GitHub Actions release workflow,
- waits until the GitHub Release and its assets are available.

`build:electron` prepares local tool binaries, builds the frontend, stages backend runtime files, rebuilds `sqlite3` for Electron, and then packages with `electron-builder`.

Electron packaging notes:

- `build:electron` now regenerates all app icons from `frontend/public/yloader-icon.svg` into web assets plus `build/icons/icon.ico` and `build/icons/icon.icns`.
- macOS targets must be built on macOS (`--mac` on other hosts is blocked to avoid broken app bundles).
- To avoid Gatekeeper "damaged" messages on distributed mac builds, set `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID`; these are picked up automatically by `scripts/notarize.cjs` via `electron-builder` `afterSign`.

Electron auto-update flow:

- Packaged Electron builds perform a silent update check on startup.
- Downloads are user-driven in **Settings > General** (`Check for updates` -> `Download update` -> `Restart & Install`).
- While an app update is downloading, closing the app is blocked to prevent interrupted installers.
- Pre-release detection is enabled (`allowPrerelease=true`) so beta tags from GitHub Releases can be used for update testing.
- On macOS, updates are still detected and shown in Settings, but in-place updater download/install is disabled. `Download update` opens the matching GitHub Release page so the DMG can be installed manually.

## GitHub Actions (Electron Builds and Releases)

This repository includes a cross-platform Electron workflow in `.github/workflows/electron-release.yml`.

### What it builds

- Windows installer (`nsis`, `.exe`)
- macOS disk image (`dmg`, `.dmg`)
- Linux portable package (`AppImage`, `.AppImage`)

### Safe test run (no release publish)

1. Open **Actions** on GitHub.
2. Select **Electron Build and Release**.
3. Click **Run workflow** on your branch.
4. Leave `publish` set to `false`.

Result: all three OS builds run and upload artifacts to the workflow run, but nothing is published to GitHub Releases.

### Real release publish

Push a version tag (for example `v1.0.1`):

```bash
git tag v1.0.1
git push origin v1.0.1
```

Result: the same matrix build runs, and electron-builder uploads the platform artifacts to the matching GitHub Release.

### Manual publish from a tag

You can also manually run the workflow on an existing `v*` tag and set `publish=true`.
On non-tag refs, `publish=true` is ignored to avoid accidental release uploads.

## Health Check

`GET /health` reports backend status including:

- SQLite access
- `yt-dlp` availability
- `ffmpeg` availability

## Why use yLoader? (Use Cases)
If you are looking for a way to **bulk download YouTube videos**, archive **Twitter/X media**, or save **Reddit videos with sound**, yLoader provides a clean interface for it. 
Unlike cloud-based downloaders, yLoader is completely private. You avoid ads, tracking, and rate limits. Because it supports `yt-dlp` cookies, you can easily bypass login-walls or age-restrictions by passing your browser cookies directly to the backend.


## Support

If you find this useful, consider supporting development:

<a href="https://buymeacoffee.com/michaelsant0s">
  <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" width="200">
</a>

BTC donations:  
`bc1q273jxf4xq87qggcjfw6d8v038rwqyygcsxmw8f`

![BTC Donation QR](frontend/src/assets/btc-qr.png)

DOGE donations:  
`DASGta7VgHuxUCvDh9v5cfRCFLirjs611B`

![DOGE Donation QR](frontend/src/assets/doge-qr.png)

## License

This project is licensed under `AGPL-3.0-or-later`.

- License text: `LICENSE`
- Trademark/third-party mark notes: `NOTICE.md`

Brand icons in `frontend/public/dl-icons/` are used only to identify supported third-party services and remain the property of their respective owners.

## Legal Notice

Use `yLoader`, `yt-dlp`, and related tools only where you have the legal right to access and download content. You are responsible for complying with local law and platform terms.
