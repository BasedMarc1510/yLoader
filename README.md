# yLoader

world's most advanced Downloader

All-in-one, local-first yt-dlp frontend for people who want one tool that can run exactly how they prefer:

- Web app (frontend + backend)
- Single Docker container
- Electron desktop app

yLoader is built for fast daily use: clean UI, advanced media controls, and feature parity across web, Docker, and Electron runtimes.

<img width="1314" height="817" alt="image1_dark" src="https://github.com/user-attachments/assets/b7577c6c-a76b-4372-ae10-8cb255fa6c5c" />

<br><br>

<img width="1314" height="817" alt="image2_dark" src="https://github.com/user-attachments/assets/aab38a50-6e77-41d2-8468-27d9749f1cec" />

## Maximum video compatibility

Enable **Maximum compatibility** in the video downloader to re-encode the finished download with FFmpeg, after any cuts. It is off by default and applies equally to Web, Docker, and Electron.

| Container | Video | Audio |
| --- | --- | --- |
| MP4 / MOV / MKV | H.264 Baseline, 8-bit YUV 4:2:0 | AAC-LC |
| WebM | VP8, 8-bit YUV 4:2:0 | Vorbis |
| AVI | MPEG-4 Part 2 (Xvid tag) | MP3 |

Audio is converted to stereo at 48 kHz when present. Odd video dimensions are padded to even dimensions. MP4 and MOV use fast-start metadata for playback. Resolution and frame rate are retained; compatibility still depends on the player's resolution/frame-rate limits and container support. Converting takes additional time and may reduce quality or increase file size. This option changes the actual codecs, rather than just remuxing or renaming the file. FFmpeg needs the listed encoders; conversion failures are reported without publishing an unconverted result. Converted downloads use a separate cache identity.

## Edit a completed download

After a video or audio download finishes, choose **Edit** below the download options, or open the file's menu under **All downloads → Edit**.

- Preview the downloaded file and trim on a zoomable timeline with actual video thumbnails and an audio waveform. Drag the start/end handles, click to seek, or enter precise times. Arrow keys move a focused handle by 0.1 seconds (Shift: 1 second; Alt: 0.01 seconds).
- Adjust volume (0–200%), remove the audio track, add audio fades, or extract audio from a video.
- **Save copy** creates an MP4 (H.264/AAC) or M4A (AAC) beside the original and adds it to the download history. The original is never overwritten. Exports are re-encoded.
- Cancel stops processing and removes the incomplete copy. Only one edit is processed at a time.

Thumbnails are extracted with independent seeks; waveform peaks are calculated from the source audio in a bounded streaming buffer. Timeline analysis runs only while the editor is open and is cancelled when it closes. Only one timeline analysis runs at a time; unavailable previews can be retried without preventing edits.

The editor uses the existing backend ffmpeg and ffprobe binaries; it requires no extra npm packages. Browser playback depends on the source codec; files that cannot be previewed can still be edited. The preview reflects cuts, mute, and volume up to 100%; amplification and fades are applied on export.

Web and Docker files, including edited copies, follow the existing 24-hour download cache retention. Electron downloads saved directly to a chosen folder remain in that folder. Their paths are recorded for new downloads; older direct-folder downloads must be downloaded again to become editable. The Docker build and Electron staging include the editor backend modules.

Run the processing/API regression tests with `node --test backend/media-editor/editor.test.js frontend/src/components/media-editor/timelineUtils.test.js` (ffmpeg and ffprobe must be on PATH).

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
On first launch, yLoader downloads the required runtime tools (yt-dlp and ffmpeg) and blocks downloads until setup is complete.

Electron-only behavior (Settings > General):

- Optional close-to-tray mode (disabled by default)
- Tray icon is always available while the app is running
- Autostart at system boot with selectable startup mode (normal window or tray-only)
- Deep-link protocol registration via `yloader://` for app handoff integrations

### Option 2: Docker Hub

```bash
docker pull yloader/yloader:latest
docker run -d --name yloader -p 8080:8080 -v yloader_downloads:/downloads -v yloader_data:/app/data yloader/yloader:latest
```

Open http://localhost:8080

If you need a pinned version instead of `latest`:

```bash
docker pull yloader/yloader:2026.1.1
docker run -d --name yloader -p 8080:8080 yloader/yloader:2026.1.1
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

If the local dev backend on `:4000` or frontend on `:5173` is already running, `npm run start` reuses the existing yLoader service and only starts what is missing.
Local web dev started via `npm run start` also enables yt-dlp browser-cookie import on the same machine, matching local Electron behavior. Container/runtime deployments still depend on their own environment setup.

### Option 5: Local Electron App

```bash
git clone https://github.com/BasedMarc1510/yLoader.git
cd yLoader
npm install
npm run start:electron
```

The local Electron runtime also performs a first-run yt-dlp/ffmpeg setup inside the Electron user-data directory.
Deep links are also registered in local Electron dev mode (`npm run start:electron`) so browser-extension style handoff flows can be tested without a packaged build.

For a fresh Electron reset (clears local settings/state plus local yt-dlp/ffmpeg cache before launch):

```bash
npm run start:electron:clear
```

## Docker Image Notes

- The image runs the app on container port `8080`
- If you do not publish a host port with `-p`, the app runs but is not reachable from your browser
- `latest` tracks the newest pushed `v*` release tag
- Version tags are also published in both forms (for example `v2026.1.1` and `2026.1.1`)
- In Docker mode, Settings > General can check for newer yLoader releases and will show a hint to update the container manually

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
npm run start:electron:clear
npm run build:electron
npm run docker:start
npm run docker:logs
npm run docker:stop
```

## Legal Notice

Use yLoader, yt-dlp, and related tools only where you have the legal right to access and download content. You are responsible for complying with local law and platform terms.

## License

AGPL-3.0-or-later. See `LICENSE` and `NOTICE.md`.
