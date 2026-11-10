# yLoader

world's most advanced Downloader

All-in-one, local-first yt-dlp frontend for people who want one tool that can run exactly how they prefer:

- Web app (frontend + backend)
- Single Docker container
- Tauri desktop app

yLoader is built for fast daily use: clean UI, advanced media controls, and feature parity across web, Docker, and desktop runtimes.

<img width="1314" height="817" alt="image1_dark" src="https://github.com/user-attachments/assets/b7577c6c-a76b-4372-ae10-8cb255fa6c5c" />

<br><br>

<img width="1314" height="817" alt="image2_dark" src="https://github.com/user-attachments/assets/aab38a50-6e77-41d2-8468-27d9749f1cec" />

## Maximum video compatibility

Enable **Maximum compatibility** in the video downloader to re-encode the finished download with FFmpeg, after any cuts. It is off by default and applies equally to Web, Docker, and desktop.

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

Web and Docker files, including edited copies, follow the existing 24-hour download cache retention. Desktop downloads saved directly to a chosen folder remain in that folder. Their paths are recorded for new downloads; older direct-folder downloads must be downloaded again to become editable.

Run the processing/API regression tests with `node --test backend/media-editor/editor.test.js frontend/src/components/media-editor/timelineUtils.test.js` (ffmpeg and ffprobe must be on PATH).

## Desktop App

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
- Same core behavior across Web, Docker, and desktop

## Runtime Modes

| Mode | What you run | Access |
| --- | --- | --- |
| Web (local dev) | React + Node backend | http://localhost:5173 (UI), http://localhost:4000 (API) |
| Docker | Single container serving frontend + backend | http://localhost:8080 |
| Desktop | Tauri with the shared React frontend and a native Rust API | Native app window |

## Upgrading to 2026.2.0

Quit the previous desktop app before installing the update. On macOS, open the Universal DMG from the release page and replace yLoader in Applications. On Windows, the current-user installer replaces the previous installation. On Linux, the update replaces the AppImage if it is writable. You can also replace it manually and mark the new AppImage executable.

On first launch, yLoader imports the previous SQLite database, including download history and cookie settings, as well as desktop preferences and supported interface preferences such as language and theme. Existing downloads and cookie files stay at their original paths. When both the released Electron app and the Tauri preview have a database, the released app's data takes precedence.

The tab bar also serves as the title bar. macOS uses native window controls on the left. Windows and Linux use yLoader's controls on the right. The desktop app supports closing to the tray, autostart, and `yloader://` deep links.

## Quick Start

### Option 1: Desktop App

Download the installer for your operating system from the links above. The desktop app checks its `PATH` for working yt-dlp, FFmpeg, and FFprobe executables before trying its local caches. If an FFmpeg build lacks an encoder required for an export, the desktop app selects another build for that job. It downloads missing tools on demand and verifies their release hashes.

In **Settings → System → yt-dlp**, choose **Managed by yLoader** to install and use an app-managed copy even if a working executable is on `PATH`. Choose **Automatic (prefer local)** to give `PATH` priority again. The selection is saved for future launches.

The update button runs the selected external binary's own updater. For a detected Homebrew installation it runs `brew upgrade yt-dlp`. Other package-managed builds may require an update through their package manager. External FFmpeg installations are updated by their provider. Automatic updates apply to copies managed by the desktop app.

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
Local web dev started via `npm run start` also enables yt-dlp browser-cookie import on the same machine. Container/runtime deployments still depend on their own environment setup.

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

Install the Tauri prerequisites for your OS. Then run these commands from the repository root to launch the desktop app. [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)

```bash
npm ci
npm ci --prefix frontend
npm run dev
```

The command builds the React frontend and starts the Rust desktop backend. Restart it after editing the frontend to rebuild the assets. It uses the desktop app's local profile, so close an already running yLoader desktop instance before starting it.

On macOS, choose a browser under **Settings → Network → Cookie import**, then enable browser cookies. If macOS blocks access, yLoader opens a native picker. Confirm the suggested browser folder or select the requested Safari cookie file. Use **Check access** if browser cookies were already enabled. If macOS still denies access during `npm run dev`, check **System Settings → Privacy & Security → Files and Folders** for the app hosting the terminal, such as Terminal or Visual Studio Code.

For local development in the browser, run `npm run start`. For Docker, use the commands below.

```bash
npm run docker:start
npm run docker:logs
npm run docker:stop
```

## Building and releasing the desktop app

Install the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS, then run `npm ci` and `npm ci --prefix frontend` from the repository root. Build a Windows installer with `npm run dist:win` on Windows, or an AppImage with `npm run dist:linux` on Linux. On macOS, build a Universal DMG for Apple Silicon and Intel:

```bash
rustup target add aarch64-apple-darwin x86_64-apple-darwin
npm run dist:mac
```

During `npm run dev`, yLoader uses the `PATH` inherited from the terminal and can fall back to the repository's existing `.tools` cache. To add a different fallback directory for local testing, set `YLOADER_TAURI_TOOLS_DIR` to an absolute path containing `yt-dlp-bin`, `ffmpeg-bin/<platform>-<arch>/bin`, and optionally `quickjs-bin`.

The **Tauri Desktop Release** workflow builds a Universal macOS DMG, a Windows x64 NSIS installer and a Linux x64 AppImage. Run it manually to get workflow artifacts. To publish, push a `v<version>` tag or select an existing version tag with **publish** enabled. The workflow checks that the tag matches the source version and publishes all installers and update files together. Local builds and manual artifact runs without publishing have app updates disabled.

The updater uses its own key pair to verify downloaded updates. Set the repository variable `YLOADER_TAURI_UPDATE_PUBKEY` to the public key contents from `tauri signer generate`. Set the matching `TAURI_SIGNING_PRIVATE_KEY` secret and, if the key is password-protected, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.

Publisher signing is optional. Without the platform signing settings below, the workflow publishes an ad hoc-signed macOS app in a DMG without notarization and an unsigned Windows installer. Gatekeeper and SmartScreen may warn when users open these downloads. The Tauri updater key is still required for public releases so installed apps can verify their updates.

- For macOS, set `YLOADER_MACOS_SIGNING` to `true` to enable Developer ID signing. Set `APPLE_CERTIFICATE` to the base64-encoded PKCS#12 containing yLoader's Developer ID Application certificate and private key. Also configure `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD` (or `APPLE_APP_SPECIFIC_PASSWORD`), and `APPLE_TEAM_ID`. The workflow verifies the app's notarization ticket and notarizes and staples the Universal DMG before publishing it.
- For Windows, set the repository variable `YLOADER_WINDOWS_SIGN_COMMAND` to the command for your signing provider, with `%1` as a separate argument for the file to sign. Set up the provider's CLI and authentication on the Windows runner before the installer build. Tauri invokes the command during bundling, and the workflow verifies that the executable and installer both have valid timestamped Authenticode signatures. SmartScreen can still warn until the signed release builds reputation. [Tauri signing configuration](https://v2.tauri.app/distribute/sign/windows/#custom-sign-command) · [Microsoft SmartScreen](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation)

## Legal Notice

Use yLoader, yt-dlp, and related tools only where you have the legal right to access and download content. You are responsible for complying with local law and platform terms.

## License

AGPL-3.0-or-later. See `LICENSE` and `NOTICE.md`.
