import express from 'express'
import { execFile, spawn } from 'child_process'
import os from 'os'
import path from 'path'
import { URL as NodeURL } from 'url'
import fs from 'fs'
import crypto from 'crypto'
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const sqlite3 = require("sqlite3").verbose();

const DB_PATH = process.env.DB_PATH || '/app/data/metadata.db';
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) console.error(`Failed to connect to ${DB_PATH}:`, err.message);
  else console.log(`Connected to ${DB_PATH}`);
});

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS downloads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id TEXT,
    title TEXT,
    duration INTEGER,
    timestamp TEXT,
    download_type TEXT,
    format_id TEXT,
    filename TEXT,
    service TEXT,
    source_url TEXT
  )`);
  // Try to add column if missing (for existing DBs)
  db.run(`ALTER TABLE downloads ADD COLUMN service TEXT`, (err) => {
    // ignore error if column exists
  });
  db.run(`ALTER TABLE downloads ADD COLUMN source_url TEXT`, (err) => {
    // ignore error if column exists
  });
  db.run(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )`);
});

const app = express()
const PORT = process.env.PORT || 4000
const ALLOWED_AUDIO_CONTAINERS = new Set(['mp3', 'm4a', 'wav', 'ogg', 'flac', 'opus'])
const ALLOWED_VIDEO_CONTAINERS = new Set(['mp4', 'webm', 'mkv'])
const ALLOWED_IMAGE_CONTAINERS = new Set(['jpg', 'png', 'webp'])
const FORMAT_ID_REGEX = /^[A-Za-z0-9_.,:+\-\/=~*]+$/
const MAX_PROXY_IMAGE_SIZE_BYTES = 15 * 1024 * 1024
const TAB_STATE_SETTINGS_KEY = 'ui.tabs.state.v1'
const AUTO_DOWNLOAD_SETTINGS_KEY = 'ui.autoDownload.settings.v1'
const MAX_PERSISTED_TABS = 30
const AUTO_DOWNLOAD_BITRATE_OPTIONS = new Set([0, 96, 128, 160, 192, 256, 320])
const AUTO_DOWNLOAD_VIDEO_HEIGHT_OPTIONS = new Set([0, 360, 480, 720, 1080, 1440, 2160])
const DEFAULT_AUTO_DOWNLOAD_SETTINGS = Object.freeze({
  useMetadata: true,
  embedCoverArt: true,
  maxAudioBitrateKbps: 0,
  maxVideoHeight: 1080,
})
const ALLOWED_TAB_PATHS = new Set([
  '/',
  '/downloads',
  '/support',
  '/youtube-downloader',
  '/reddit-downloader',
  '/x-downloader',
  '/generic-downloader',
])
const YT_DLP_JS_RUNTIMES = String(process.env.YT_DLP_JS_RUNTIMES || 'node').trim() || 'node'
const YT_DLP_JS_RUNTIME_ARGS = ['--js-runtimes', YT_DLP_JS_RUNTIMES]
const YT_DLP_COOKIES_FILE = String(process.env.YT_DLP_COOKIES_FILE || '').trim()
const YT_DLP_COOKIES_FROM_BROWSER = String(process.env.YT_DLP_COOKIES_FROM_BROWSER || '').trim()
const YT_DLP_EXTRACTOR_ARGS = String(process.env.YT_DLP_EXTRACTOR_ARGS || '').trim()
const FFMPEG_BIN = String(process.env.FFMPEG_PATH || '').trim()
const FFPROBE_BIN = String(process.env.FFPROBE_PATH || '').trim()

// Basic CORS to allow browser access from other origins
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

app.use(express.json({ limit: '25mb' }))

function normalizeTabPath(value) {
  const raw = String(value || '').trim()
  return ALLOWED_TAB_PATHS.has(raw) ? raw : '/'
}

function normalizeTabSearch(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''

  const prefixed = raw.startsWith('?') ? raw : `?${raw}`
  if (prefixed.length > 1024) return prefixed.slice(0, 1024)
  return prefixed
}

function normalizeTabTitle(value) {
  const raw = String(value || '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!raw) return ''
  return raw.slice(0, 180)
}

function createFallbackTab() {
  return {
    id: 'tab-home',
    path: '/',
    search: '',
    pageTitle: '',
  }
}

function normalizeAutoDownloadSettingsPayload(value) {
  const input = (value && typeof value === 'object') ? value : {}

  const useMetadata = input.useMetadata !== undefined
    ? Boolean(input.useMetadata)
    : DEFAULT_AUTO_DOWNLOAD_SETTINGS.useMetadata

  const embedCoverArt = input.embedCoverArt !== undefined
    ? Boolean(input.embedCoverArt)
    : DEFAULT_AUTO_DOWNLOAD_SETTINGS.embedCoverArt

  const bitrateRaw = Number(input.maxAudioBitrateKbps)
  const maxAudioBitrateKbps = AUTO_DOWNLOAD_BITRATE_OPTIONS.has(bitrateRaw)
    ? bitrateRaw
    : DEFAULT_AUTO_DOWNLOAD_SETTINGS.maxAudioBitrateKbps

  const heightRaw = Number(input.maxVideoHeight)
  const maxVideoHeight = AUTO_DOWNLOAD_VIDEO_HEIGHT_OPTIONS.has(heightRaw)
    ? heightRaw
    : DEFAULT_AUTO_DOWNLOAD_SETTINGS.maxVideoHeight

  return {
    useMetadata,
    embedCoverArt,
    maxAudioBitrateKbps,
    maxVideoHeight,
  }
}

function normalizeTabsStatePayload(value) {
  const inputTabs = Array.isArray(value?.tabs) ? value.tabs : []
  const normalizedTabs = []
  const seenIds = new Set()

  for (let i = 0; i < inputTabs.length && normalizedTabs.length < MAX_PERSISTED_TABS; i += 1) {
    const tab = inputTabs[i] || {}
    const rawId = String(tab.id || '').trim().slice(0, 80)
    const id = rawId || `tab-${i + 1}`
    if (seenIds.has(id)) continue
    seenIds.add(id)

    normalizedTabs.push({
      id,
      path: normalizeTabPath(tab.path),
      search: normalizeTabSearch(tab.search),
      pageTitle: normalizeTabTitle(tab.pageTitle),
    })
  }

  if (!normalizedTabs.length) {
    normalizedTabs.push(createFallbackTab())
  }

  const requestedActiveId = String(value?.activeTabId || '').trim()
  const activeTabId = normalizedTabs.some((tab) => tab.id === requestedActiveId)
    ? requestedActiveId
    : normalizedTabs[0].id

  return { tabs: normalizedTabs, activeTabId }
}

function readSettingValue(key) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT value FROM settings WHERE key = ?`, [key], (err, row) => {
      if (err) return reject(err)
      resolve(row?.value ?? null)
    })
  })
}

function writeSettingValue(key, value) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [key, value],
      (err) => {
        if (err) return reject(err)
        resolve()
      }
    )
  })
}

app.get('/api/tabs/state', async (_req, res) => {
  try {
    const raw = await readSettingValue(TAB_STATE_SETTINGS_KEY)
    let parsed = {}
    if (raw) {
      try {
        parsed = JSON.parse(raw)
      } catch {
        parsed = {}
      }
    }
    const normalized = normalizeTabsStatePayload(parsed)
    return res.json(normalized)
  } catch (err) {
    return res.status(500).json({ error: 'Failed to read tab state', details: String(err?.message || err) })
  }
})

app.put('/api/tabs/state', async (req, res) => {
  try {
    const normalized = normalizeTabsStatePayload(req.body || {})
    await writeSettingValue(TAB_STATE_SETTINGS_KEY, JSON.stringify(normalized))
    return res.json(normalized)
  } catch (err) {
    return res.status(500).json({ error: 'Failed to save tab state', details: String(err?.message || err) })
  }
})

app.get('/api/auto-download/settings', async (_req, res) => {
  try {
    const raw = await readSettingValue(AUTO_DOWNLOAD_SETTINGS_KEY)
    let parsed = {}
    if (raw) {
      try {
        parsed = JSON.parse(raw)
      } catch {
        parsed = {}
      }
    }

    return res.json(normalizeAutoDownloadSettingsPayload(parsed))
  } catch (err) {
    return res.status(500).json({ error: 'Failed to read auto-download settings', details: String(err?.message || err) })
  }
})

app.put('/api/auto-download/settings', async (req, res) => {
  try {
    let existing = { ...DEFAULT_AUTO_DOWNLOAD_SETTINGS }
    const raw = await readSettingValue(AUTO_DOWNLOAD_SETTINGS_KEY)
    if (raw) {
      try {
        existing = normalizeAutoDownloadSettingsPayload(JSON.parse(raw))
      } catch {
        existing = { ...DEFAULT_AUTO_DOWNLOAD_SETTINGS }
      }
    }

    const incoming = (req.body && typeof req.body === 'object') ? req.body : {}
    const normalized = normalizeAutoDownloadSettingsPayload({ ...existing, ...incoming })
    await writeSettingValue(AUTO_DOWNLOAD_SETTINGS_KEY, JSON.stringify(normalized))
    return res.json(normalized)
  } catch (err) {
    return res.status(500).json({ error: 'Failed to save auto-download settings', details: String(err?.message || err) })
  }
})

app.get('/api/downloads', (req, res) => {
  const { q, service } = req.query;
  let sql = `SELECT * FROM downloads WHERE 1=1`;
  const params = [];

  if (q) {
    sql += ` AND (title LIKE ? OR filename LIKE ?)`;
    params.push(`%${q}%`, `%${q}%`);
  }
  if (service) {
    if (service === 'generic') {
      // Keep legacy rows (stored as "other") visible in the Generic filter.
      sql += ` AND (service = ? OR service = ?)`;
      params.push('generic', 'other');
    } else {
      sql += ` AND service = ?`;
      params.push(service);
    }
  }

  sql += ` ORDER BY timestamp DESC`;

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    // Check file existence for each row
    const result = rows.map(row => {
      const filePath = path.join(DOWNLOADS_DIR, row.filename || '');
      return {
        ...row,
        cached: fs.existsSync(filePath)
      };
    });

    res.json(result);
  });
});

app.delete('/api/downloads/:id', (req, res) => {
  const { id } = req.params;
  db.run(`DELETE FROM downloads WHERE id = ?`, [id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: this.changes });
  });
});

app.get('/health', async (_req, res) => {
  const checks = {
    db: false,
    ytDlp: false,
    ffmpeg: HAS_FFMPEG,
  }

  checks.db = await checkDbHealth()
  checks.ytDlp = await checkYtDlpHealth()

  const healthy = checks.db && checks.ytDlp
  const status = healthy ? 'ok' : 'degraded'
  return res.status(healthy ? 200 : 503).json({ status, checks })
})

// Helper: run a command and return stdout as string
function runCmd(cmd, args = [], opts = {}) {
  return new Promise((resolve, reject) => {
    const { env: extraEnv, ...restOpts } = opts
    const options = {
      maxBuffer: 10 * 1024 * 1024,
      ...restOpts,
      env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8', ...(extraEnv || {}) },
    }
    execFile(cmd, args, options, (err, stdout, stderr) => {
      if (err) {
        err.stderr = stderr?.toString?.() || ''
        return reject(err)
      }
      resolve(stdout?.toString?.() || '')
    })
  })
}

// ── Media cut helpers ──────────────────────────────────────────────────────

function normalizeCutSegments(segments = [], trimStart = 0, trimEnd = null) {
  const hasTrimEnd = typeof trimEnd === 'number' && trimEnd > trimStart
  const upper = hasTrimEnd ? trimEnd : Number.POSITIVE_INFINITY

  const sorted = [...(segments || [])]
    .filter(s => typeof s?.start === 'number' && typeof s?.end === 'number' && s.end > s.start)
    .map((s) => ({
      start: Math.max(trimStart, Math.min(s.start, upper - 1)),
      end: Math.max(trimStart + 1, Math.min(s.end, upper)),
    }))
    .filter((s) => s.end > s.start)
    .sort((a, b) => a.start - b.start)

  const merged = []
  for (const seg of sorted) {
    const prev = merged[merged.length - 1]
    if (!prev) {
      merged.push(seg)
      continue
    }
    if (seg.start <= prev.end) {
      prev.end = Math.max(prev.end, seg.end)
    } else {
      merged.push(seg)
    }
  }

  return merged
}

function invertCutSegments(segments = [], trimStart = 0, trimEnd = null) {
  if (trimEnd == null || trimEnd <= trimStart) return []
  const normalized = normalizeCutSegments(segments, trimStart, trimEnd)
  if (!normalized.length) return [{ start: trimStart, end: trimEnd }]

  const keep = []
  let cursor = trimStart
  for (const seg of normalized) {
    const start = Math.max(trimStart, seg.start)
    const end = Math.min(trimEnd, seg.end)
    if (end <= start) continue
    if (start > cursor) {
      keep.push({ start: cursor, end: start })
    }
    cursor = Math.max(cursor, end)
  }
  if (cursor < trimEnd) {
    keep.push({ start: cursor, end: trimEnd })
  }

  return keep
}

/** Compute keep segments from trim range + selected segments and mode. */
function computeMediaKeepSegments(cuts, mediaDuration) {
  if (!cuts || !cuts.enabled) return null

  const trimStart = typeof cuts.trimStart === 'number' ? Math.max(0, cuts.trimStart) : 0
  const trimEnd =
    cuts.trimEnd != null && cuts.trimEnd > 0
      ? (mediaDuration != null ? Math.min(cuts.trimEnd, mediaDuration) : cuts.trimEnd)
      : mediaDuration

  if (trimEnd == null || trimEnd <= trimStart) return null

  const mode = cuts.mode === 'keep' ? 'keep' : 'remove'
  const selectedSegments = Array.isArray(cuts.segments)
    ? cuts.segments
    : (Array.isArray(cuts.removals) ? cuts.removals : [])

  const normalizedSelected = normalizeCutSegments(selectedSegments, trimStart, trimEnd)

  let keepSegments = null
  if (mode === 'keep') {
    keepSegments = normalizedSelected.length
      ? normalizedSelected
      : [{ start: trimStart, end: trimEnd }]
  } else {
    keepSegments = invertCutSegments(normalizedSelected, trimStart, trimEnd)
  }

  // Treat full-length keep as no-op.
  if (
    keepSegments.length === 1 &&
    keepSegments[0].start === 0 &&
    mediaDuration != null &&
    Math.abs(keepSegments[0].end - mediaDuration) < 1
  ) {
    return null
  }

  return keepSegments.length ? keepSegments : null
}

/** FFmpeg audio codec args for a given file extension */
function getAudioCodecArgs(extWithDot) {
  switch ((extWithDot || '').replace('.', '').toLowerCase()) {
    case 'mp3':  return ['-c:a', 'libmp3lame', '-q:a', '2']
    case 'm4a':  return ['-c:a', 'aac', '-b:a', '192k']
    case 'ogg':  return ['-c:a', 'libvorbis', '-q:a', '6']
    case 'opus': return ['-c:a', 'libopus', '-b:a', '128k']
    case 'flac': return ['-c:a', 'flac']
    case 'wav':  return ['-c:a', 'pcm_s16le']
    default:     return []
  }
}

function getVideoCodecArgs(extWithDot, hasAudio = true) {
  switch ((extWithDot || '').replace('.', '').toLowerCase()) {
    case 'webm':
      return hasAudio
        ? ['-c:v', 'libvpx-vp9', '-crf', '32', '-b:v', '0', '-c:a', 'libopus', '-b:a', '160k']
        : ['-c:v', 'libvpx-vp9', '-crf', '32', '-b:v', '0']
    case 'mkv':
      return hasAudio
        ? ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-c:a', 'aac', '-b:a', '192k']
        : ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20']
    case 'mp4':
    default:
      return hasAudio
        ? ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart']
        : ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-movflags', '+faststart']
  }
}

function resolveFfprobeBinary() {
  if (FFPROBE_BIN) return FFPROBE_BIN
  if (!FFMPEG_BIN) return ''
  const siblingName = process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe'
  const siblingPath = path.join(path.dirname(FFMPEG_BIN), siblingName)
  if (fs.existsSync(siblingPath)) return siblingPath
  return siblingName
}

async function detectHasAudioStream(inputPath) {
  const ffprobe = resolveFfprobeBinary()
  if (!ffprobe) return true

  try {
    const output = await runCmd(
      ffprobe,
      ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', inputPath],
      { timeout: 5000, maxBuffer: 256 * 1024 }
    )
    return String(output || '').trim().length > 0
  } catch {
    return true
  }
}

/** Build ffmpeg args to cut audio to the supplied keep segments */
function buildAudioCutFfmpegArgs(inputPath, outputPath, keepSegments, ext) {
  const codecArgs = getAudioCodecArgs(ext)
  if (keepSegments.length === 1) {
    const seg = keepSegments[0]
    return ['-y', '-i', inputPath, '-ss', String(seg.start), '-to', String(seg.end), ...codecArgs, outputPath]
  }
  const filterParts = keepSegments.map(
    (seg, i) => `[0:a]atrim=${seg.start}:${seg.end},asetpts=PTS-STARTPTS[a${i}]`
  )
  const concatInputs = keepSegments.map((_, i) => `[a${i}]`).join('')
  const filter = [...filterParts, `${concatInputs}concat=n=${keepSegments.length}:v=0:a=1[out]`].join(';')
  return ['-y', '-i', inputPath, '-filter_complex', filter, '-map', '[out]', ...codecArgs, outputPath]
}

function buildVideoCutFfmpegArgs(inputPath, outputPath, keepSegments, ext, hasAudio = true) {
  const codecArgs = getVideoCodecArgs(ext, hasAudio)
  if (keepSegments.length === 1) {
    const seg = keepSegments[0]
    const mapArgs = hasAudio
      ? ['-map', '0:v:0', '-map', '0:a:0']
      : ['-map', '0:v:0']

    return [
      '-y',
      '-i', inputPath,
      '-ss', String(seg.start),
      '-to', String(seg.end),
      ...mapArgs,
      ...codecArgs,
      outputPath,
    ]
  }

  if (hasAudio) {
    const filterParts = keepSegments.flatMap((seg, i) => ([
      `[0:v]trim=${seg.start}:${seg.end},setpts=PTS-STARTPTS[v${i}]`,
      `[0:a]atrim=${seg.start}:${seg.end},asetpts=PTS-STARTPTS[a${i}]`,
    ]))
    const vInputs = keepSegments.map((_, i) => `[v${i}]`).join('')
    const aInputs = keepSegments.map((_, i) => `[a${i}]`).join('')
    const filter = [...filterParts, `${vInputs}${aInputs}concat=n=${keepSegments.length}:v=1:a=1[outv][outa]`].join(';')

    return [
      '-y',
      '-i', inputPath,
      '-filter_complex', filter,
      '-map', '[outv]',
      '-map', '[outa]',
      ...codecArgs,
      outputPath,
    ]
  }

  const filterParts = keepSegments.map((seg, i) => `[0:v]trim=${seg.start}:${seg.end},setpts=PTS-STARTPTS[v${i}]`)
  const vInputs = keepSegments.map((_, i) => `[v${i}]`).join('')
  const filter = [...filterParts, `${vInputs}concat=n=${keepSegments.length}:v=1:a=0[outv]`].join(';')

  return [
    '-y',
    '-i', inputPath,
    '-filter_complex', filter,
    '-map', '[outv]',
    ...codecArgs,
    outputPath,
  ]
}

// ── End media cut helpers ─────────────────────────────────────────────────

function buildYtDlpNetworkArgs(baseArgs = []) {
  const args = [...YT_DLP_JS_RUNTIME_ARGS]

  if (YT_DLP_COOKIES_FILE) {
    args.push('--cookies', YT_DLP_COOKIES_FILE)
  }
  if (YT_DLP_COOKIES_FROM_BROWSER) {
    args.push('--cookies-from-browser', YT_DLP_COOKIES_FROM_BROWSER)
  }
  if (YT_DLP_EXTRACTOR_ARGS) {
    args.push('--extractor-args', YT_DLP_EXTRACTOR_ARGS)
  }

  args.push(...baseArgs)
  return args
}

// Helper: sanitize filenames
function sanitizeFilename(str, maxLen = 200) {
  const sanitized = String(str || '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/[\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, maxLen)
    .replace(/[. ]+$/g, '')

  if (!sanitized || sanitized === '.' || sanitized === '..') return ''
  return sanitized
}

function toAsciiFilename(value, fallback = 'download') {
  const ascii = String(value || '')
    .normalize('NFKD')
    .replace(/[\r\n]/g, '')
    .replace(/["\\]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return ascii || fallback
}

function encodeRfc5987Value(value) {
  return encodeURIComponent(String(value || ''))
    .replace(/[!'()*]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`)
}

function buildAttachmentContentDisposition(filename, fallback = 'download') {
  const clean = String(filename || '').replace(/[\r\n]/g, '').trim() || fallback
  const ascii = toAsciiFilename(clean, fallback)
  const encoded = encodeRfc5987Value(clean)
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`
}

function normalizeAudioContainer(value) {
  const normalized = String(value || '').trim().toLowerCase()
  return ALLOWED_AUDIO_CONTAINERS.has(normalized) ? normalized : ''
}

function normalizeVideoContainer(value) {
  const normalized = String(value || '').trim().toLowerCase()
  return ALLOWED_VIDEO_CONTAINERS.has(normalized) ? normalized : ''
}

function normalizeImageContainer(value) {
  const normalized = String(value || '').trim().toLowerCase().replace('jpeg', 'jpg')
  return ALLOWED_IMAGE_CONTAINERS.has(normalized) ? normalized : ''
}

function sanitizeFormatId(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (raw.length > 120) return ''
  return FORMAT_ID_REGEX.test(raw) ? raw : ''
}

function isValidHttpUrl(value) {
  const raw = String(value || '').trim()
  if (!raw || raw.length > 2048) return false
  try {
    const parsed = new NodeURL(raw)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function parseYtDlpJson(raw) {
  const input = String(raw || '').trim()
  if (!input) return {}

  try {
    return JSON.parse(input)
  } catch {
    const lines = input.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        return JSON.parse(lines[i])
      } catch {
        // continue
      }
    }
    throw new Error('yt-dlp did not return valid JSON metadata')
  }
}

const YT_DLP_HEALTH_CACHE_TTL_MS = 60 * 1000
let ytDlpHealthCache = {
  checkedAt: 0,
  ok: false,
}

async function checkYtDlpHealth() {
  const now = Date.now()
  if (ytDlpHealthCache.checkedAt > 0 && (now - ytDlpHealthCache.checkedAt) < YT_DLP_HEALTH_CACHE_TTL_MS) {
    return ytDlpHealthCache.ok
  }

  let ok = false
  try {
    const version = await runCmd(YT_DLP, ['--version'], { timeout: 30000, maxBuffer: 256 * 1024 })
    ok = Boolean((version || '').trim())
  } catch {
    ok = false
  }

  ytDlpHealthCache = {
    checkedAt: Date.now(),
    ok,
  }

  return ok
}

function checkDbHealth() {
  return new Promise((resolve) => {
    db.get('SELECT 1 AS ok', (err) => {
      resolve(!err)
    })
  })
}

let YT_DLP = process.env.YT_DLP_PATH || ''
if (!YT_DLP) {
  if (process.platform === 'win32') {
    YT_DLP = 'yt-dlp.exe'
  } else {
    YT_DLP = fs.existsSync('/usr/local/bin/yt-dlp') ? '/usr/local/bin/yt-dlp' : 'yt-dlp'
  }
}

const YT_PIP = process.env.YT_PIP_PATH || ''
const YT_DLP_UPDATE_METHOD = (process.env.YT_DLP_UPDATE_METHOD || (YT_PIP ? 'pip' : 'self')).toLowerCase()
const DISABLED_UPDATE_METHODS = new Set(['disabled', 'none', 'system'])

function isProjectManagedYtDlpBinary() {
  const normalizedBinaryPath = path.normalize(String(YT_DLP || '')).toLowerCase()
  const marker = path.normalize(path.join('.tools', 'yt-dlp-bin')).toLowerCase()
  return normalizedBinaryPath.includes(marker)
}

function getEffectiveYtDlpUpdateMethod() {
  if (isProjectManagedYtDlpBinary() && DISABLED_UPDATE_METHODS.has(YT_DLP_UPDATE_METHOD)) {
    return 'self'
  }
  return YT_DLP_UPDATE_METHOD
}

function isYtDlpUpdateDisabled() {
  return DISABLED_UPDATE_METHODS.has(getEffectiveYtDlpUpdateMethod())
}

function getYtDlpUpdateCommand() {
  const effectiveMethod = getEffectiveYtDlpUpdateMethod()

  if (isYtDlpUpdateDisabled()) {
    return null
  }

  if (effectiveMethod === 'pip') {
    if (!YT_PIP) {
      throw new Error('YT_DLP_UPDATE_METHOD is set to "pip" but YT_PIP_PATH is missing')
    }
    return {
      cmd: YT_PIP,
      args: ['install', '-U', '--no-cache-dir', 'yt-dlp'],
      label: 'pip',
    }
  }

  return {
    cmd: YT_DLP,
    args: ['-U'],
    label: 'binary self-update',
  }
}

// Check if yt-dlp is accessible at startup
try {
  execFile(YT_DLP, ['--version'], (err, stdout) => {
    if (err) {
      console.error('⚠️  yt-dlp not accessible at:', YT_DLP)
      console.error('⚠️  Error:', err.message)
      console.error('❌ yt-dlp is required for downloads and metadata endpoints')
    } else {
      console.log('✅ yt-dlp found at:', YT_DLP)
      console.log('   Version:', stdout.trim())
    }
  })
} catch (e) {
  console.error('❌ Failed to check yt-dlp:', e.message)
}

// Check if ffmpeg is available (required for merging)
let HAS_FFMPEG = false
if (!FFMPEG_BIN) {
  console.error('⚠️  FFMPEG_PATH is not configured - video/audio merging features are disabled!')
  HAS_FFMPEG = false
} else {
  try {
    execFile(FFMPEG_BIN, ['-version'], (err, stdout) => {
      if (err) {
        console.error(`⚠️  ffmpeg not found at "${FFMPEG_BIN}" - video/audio merging will fail!`)
        HAS_FFMPEG = false
      } else {
        const firstLine = stdout.split('\n')[0]
        console.log('✅ ffmpeg found:', firstLine)
        HAS_FFMPEG = true
      }
    })
  } catch (e) {
    console.error('⚠️  ffmpeg check failed:', e.message)
    HAS_FFMPEG = false
  }
}

console.log(`Using yt-dlp: ${YT_DLP}`)
console.log(`Using ffmpeg: ${FFMPEG_BIN || '(not configured)'}`)
if (FFPROBE_BIN) {
  console.log(`Using ffprobe: ${FFPROBE_BIN}`)
}
console.log(`yt-dlp JS runtimes: ${YT_DLP_JS_RUNTIMES}`)
console.log(`yt-dlp update method: ${getEffectiveYtDlpUpdateMethod()}${getEffectiveYtDlpUpdateMethod() !== YT_DLP_UPDATE_METHOD ? ` (configured: ${YT_DLP_UPDATE_METHOD})` : ''}`)
if (YT_DLP_COOKIES_FILE) {
  console.log(`yt-dlp cookies file: ${YT_DLP_COOKIES_FILE}`)
}
if (YT_DLP_COOKIES_FROM_BROWSER) {
  console.log(`yt-dlp cookies from browser: ${YT_DLP_COOKIES_FROM_BROWSER}`)
}

// Downloads directory and cache settings
const DOWNLOADS_DIR = path.resolve(process.env.DOWNLOAD_DIR || './downloads')
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000 // 24 hours
const activeDownloads = new Map() // Track active downloads by hash

// Ensure downloads directory exists
if (!fs.existsSync(DOWNLOADS_DIR)) {
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true })
}

// Cleanup old files on startup and periodically
function cleanupOldFiles() {
  try {
    const now = Date.now()
    const files = fs.readdirSync(DOWNLOADS_DIR)
    for (const file of files) {
      const filePath = path.join(DOWNLOADS_DIR, file)
      const stats = fs.statSync(filePath)
      if (now - stats.mtimeMs > CACHE_DURATION_MS) {
        fs.unlinkSync(filePath)
        console.log(`Cleaned up old file: ${file}`)
      }
    }
  } catch (err) {
    console.error('Cleanup error:', err)
  }
}
cleanupOldFiles()
setInterval(cleanupOldFiles, 60 * 60 * 1000) // Run every hour

// --- Auto-Update Logic ---
const UPDATE_STATE_FILE = path.join(path.dirname(DB_PATH), 'updater_state.json')

async function checkAndAutoUpdateYtDlp() {
  try {
    let state = {}
    try {
      if (fs.existsSync(UPDATE_STATE_FILE)) {
        state = JSON.parse(fs.readFileSync(UPDATE_STATE_FILE, 'utf-8'))
      }
    } catch (e) {
      console.warn('Failed to read updater state:', e.message)
    }

    const now = Date.now()
    const lastCheck = state.last_check || 0
    const oneWeekMs = 7 * 24 * 60 * 60 * 1000

    if (now - lastCheck < oneWeekMs) {
      console.log('Skipping yt-dlp auto-update check (less than 1 week).')
      return
    }

    const updateCmd = getYtDlpUpdateCommand()
    if (!updateCmd) {
      console.log(`Skipping yt-dlp auto-update check because updates are managed externally (${YT_DLP_UPDATE_METHOD}).`)
      return
    }
    console.log(`Checking for yt-dlp updates via ${updateCmd.label}...`)

    // Get current version first
    const v1 = await runCmd(YT_DLP, ['--version']).catch(() => '')
    const oldVer = v1.trim()

    // Run update
    await runCmd(updateCmd.cmd, updateCmd.args)

    // Get new version
    const v2 = await runCmd(YT_DLP, ['--version']).catch(() => '')
    const newVer = v2.trim()

    console.log(`Update check complete via ${updateCmd.label}. Old: ${oldVer}, New: ${newVer}`)

    if (newVer && oldVer && normalizeVersion(newVer) !== normalizeVersion(oldVer)) {
      state.notify_user = true
      state.new_version = newVer
    }

    state.last_check = now
    fs.writeFileSync(UPDATE_STATE_FILE, JSON.stringify(state, null, 2))
  } catch (err) {
    console.error('Auto-update failed:', err)
  }
}

// Run check on startup
checkAndAutoUpdateYtDlp()

// GET /api/yt-dlp/update-notification
// Returns { show: boolean, version?: string } and clears the flag if shown
app.get('/api/yt-dlp/update-notification', (req, res) => {
  try {
    if (!fs.existsSync(UPDATE_STATE_FILE)) {
      return res.json({ show: false })
    }
    const state = JSON.parse(fs.readFileSync(UPDATE_STATE_FILE, 'utf-8'))

    if (state.notify_user) {
      res.json({ show: true, version: state.new_version })

      // Clear flag
      state.notify_user = false
      fs.writeFileSync(UPDATE_STATE_FILE, JSON.stringify(state, null, 2))
    } else {
      res.json({ show: false })
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to check notification' })
  }
})

// Helper: normalize version strings (e.g. 01 -> 1) for comparison
function normalizeVersion(v) {
  return (v || '').trim().split('.').map(x => parseInt(x, 10)).join('.')
}

function extractVersionToken(rawValue) {
  const line = String(rawValue || '').trim()
  if (!line) return ''

  // ffmpeg/ffprobe commonly output: "ffmpeg version X ..."
  const match = line.match(/\bversion\s+([^\s]+)/i)
  if (match && match[1]) return match[1].trim()

  // yt-dlp --version commonly outputs only the version token.
  return line.split(/\s+/)[0] || line
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return ''
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let idx = 0
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024
    idx += 1
  }
  const digits = idx === 0 ? 0 : value >= 100 ? 0 : value >= 10 ? 1 : 2
  return `${value.toFixed(digits)} ${units[idx]}`
}

function resolveExistingPath(filePath) {
  const target = String(filePath || '').trim()
  if (!target) return ''
  try {
    return fs.realpathSync(target)
  } catch {
    return target
  }
}

function isProjectManagedFfmpegBinary() {
  const normalizedBinaryPath = path.normalize(String(FFMPEG_BIN || '')).toLowerCase()
  const marker = path.normalize(path.join('.tools', 'ffmpeg-bin')).toLowerCase()
  return normalizedBinaryPath.includes(marker)
}

function getFileSizeInfo(filePath) {
  const target = String(filePath || '').trim()
  if (!target) return { bytes: null, human: '', resolvedPath: '' }

  try {
    const resolvedPath = resolveExistingPath(target)
    if (!fs.existsSync(resolvedPath)) return { bytes: null, human: '', resolvedPath: '' }
    const stat = fs.statSync(resolvedPath)
    if (!stat.isFile()) return { bytes: null, human: '', resolvedPath: '' }
    return { bytes: stat.size, human: formatBytes(stat.size), resolvedPath }
  } catch {
    return { bytes: null, human: '', resolvedPath: '' }
  }
}

async function readBinaryVersionLine(binaryPath) {
  if (!binaryPath) return ''
  const raw = await runCmd(binaryPath, ['-version'], { timeout: 5000, maxBuffer: 512 * 1024 })
  return String(raw || '').split(/\r?\n/).find(Boolean) || ''
}

// GET /api/yt-dlp/status -> { currentVersion, latestVersion, outdated }
app.get('/api/yt-dlp/status', async (_req, res) => {
  try {
    // Current version from configured yt-dlp binary path
    const currentRaw = await runCmd(YT_DLP, ['--version'])
    const firstLine = String(currentRaw || '').split(/\r?\n/).find(Boolean) || ''
    const currentVersion = extractVersionToken(firstLine)

    let latestVersion = currentVersion
    let outdated = false

    const ytDlpPath = YT_DLP
    const ytDlpFileSize = getFileSizeInfo(ytDlpPath)

    try {
      // Fetch latest version directly from PyPI (faster & more reliable than pip list --outdated)
      const pypiRes = await fetch('https://pypi.org/pypi/yt-dlp/json')
      if (pypiRes.ok) {
        const pypiData = await pypiRes.json()
        if (pypiData?.info?.version) {
          latestVersion = pypiData.info.version
          outdated = normalizeVersion(latestVersion) !== normalizeVersion(currentVersion)
        }
      } else {
        throw new Error(`PyPI returned ${pypiRes.status}`)
      }
    } catch (e) {
      console.warn('Failed to fetch PyPI data, keeping current version as latest:', e.message)
    }

    res.json({
      currentVersion,
      latestVersion,
      outdated,
      platform: os.platform(),
      updateMethod: getEffectiveYtDlpUpdateMethod(),
      updateSupported: !isYtDlpUpdateDisabled(),
      binaryPath: ytDlpPath,
      binarySizeBytes: ytDlpFileSize.bytes,
      binarySizeHuman: ytDlpFileSize.human,
    })
  } catch (err) {
    res.status(500).json({ error: 'Failed to query yt-dlp status', details: String(err?.message || err) })
  }
})

// GET /api/ffmpeg/status -> { available, version, path, ffprobeVersion }
app.get('/api/ffmpeg/status', async (_req, res) => {
  const projectManaged = isProjectManagedFfmpegBinary()

  if (!FFMPEG_BIN) {
    return res.json({
      available: false,
      projectManaged,
      path: '',
      version: '',
      fileSizeBytes: null,
      fileSizeHuman: '',
      ffprobePath: '',
      ffprobeVersion: '',
      ffprobeFileSizeBytes: null,
      ffprobeFileSizeHuman: '',
      error: 'FFMPEG_PATH is not configured',
    })
  }

  try {
    const versionLine = await readBinaryVersionLine(FFMPEG_BIN)
    const version = extractVersionToken(versionLine)
    const ffmpegFileSize = getFileSizeInfo(FFMPEG_BIN)
    const ffmpegPath = ffmpegFileSize.resolvedPath || resolveExistingPath(FFMPEG_BIN) || FFMPEG_BIN

    let ffprobePath = FFPROBE_BIN
    if (!ffprobePath) {
      const fallbackName = process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe'
      const siblingPath = path.join(path.dirname(FFMPEG_BIN), fallbackName)
      if (fs.existsSync(siblingPath)) {
        ffprobePath = siblingPath
      }
    }

    let ffprobeVersion = ''
    let ffprobeFileSize = { bytes: null, human: '' }
    if (ffprobePath) {
      try {
        const ffprobeVersionLine = await readBinaryVersionLine(ffprobePath)
        ffprobeVersion = extractVersionToken(ffprobeVersionLine)
        ffprobeFileSize = getFileSizeInfo(ffprobePath)
        ffprobePath = ffprobeFileSize.resolvedPath || resolveExistingPath(ffprobePath) || ffprobePath
      } catch {
        ffprobeVersion = ''
      }
    }

    return res.json({
      available: true,
      projectManaged,
      path: ffmpegPath,
      version,
      fileSizeBytes: ffmpegFileSize.bytes,
      fileSizeHuman: ffmpegFileSize.human,
      ffprobePath,
      ffprobeVersion,
      ffprobeFileSizeBytes: ffprobeFileSize.bytes,
      ffprobeFileSizeHuman: ffprobeFileSize.human,
      error: '',
    })
  } catch (err) {
    return res.json({
      available: false,
      projectManaged,
      path: FFMPEG_BIN,
      version: '',
      fileSizeBytes: null,
      fileSizeHuman: '',
      ffprobePath: FFPROBE_BIN,
      ffprobeVersion: '',
      ffprobeFileSizeBytes: null,
      ffprobeFileSizeHuman: '',
      error: String(err?.message || err),
    })
  }
})

// GET /api/meta/duration?url=...
// Returns { duration: number|null, durationString: string|null }
app.get('/api/meta/duration', async (req, res) => {
  const url = (req.query.url || '').toString().trim()
  if (!url) return res.status(400).json({ error: 'Missing url' })
  if (!isValidHttpUrl(url)) return res.status(400).json({ error: 'Invalid url' })

  try {
    // Print seconds and formatted string separated by pipe to avoid JSON parsing overhead
    const out = await runCmd(
      YT_DLP,
      buildYtDlpNetworkArgs(['--no-warnings', '--no-playlist', '--skip-download', '-O', '%(duration)s|%(duration_string)s', url]),
      { timeout: 45000 }
    )
    const parts = (out || '').trim().split('|')
    const secRaw = parts.shift() || ''
    const strRaw = parts.join('|')
    const duration = secRaw ? Number(secRaw) : null

    // Manually format duration to ensure consistency (e.g. 00:46 instead of just 46)
    let formattedDuration = null
    if (duration !== null && Number.isFinite(duration)) {
      const d = Math.round(duration)
      const h = Math.floor(d / 3600)
      const m = Math.floor((d % 3600) / 60)
      const s = d % 60
      const pp = (n) => n.toString().padStart(2, '0')
      if (h > 0) {
        formattedDuration = `${h}:${pp(m)}:${pp(s)}`
      } else {
        formattedDuration = `${pp(m)}:${pp(s)}`
      }
    }

    // Prefer our robust formatting, fallback to yt-dlp string, then null
    const durationString = formattedDuration || (strRaw && strRaw.trim()) || null

    res.json({ duration: Number.isFinite(duration) ? duration : null, durationString })
  } catch (err) {
    res.status(500).json({ error: 'Failed to query duration', details: String(err?.message || err) })
  }
})

// GET /api/meta/formats?url=...
// Returns available audio and video formats with quality info
app.get('/api/meta/formats', async (req, res) => {
  const url = (req.query.url || '').toString().trim()
  if (!url) return res.status(400).json({ error: 'Missing url' })
  if (!isValidHttpUrl(url)) return res.status(400).json({ error: 'Invalid url' })

  try {
    // Get format list as JSON
    // Using --dump-json (same as -J) to retrieve full metadata including thumbnails
    const out = await runCmd(
      YT_DLP,
      buildYtDlpNetworkArgs(['--no-warnings', '--no-playlist', '--skip-download', '--dump-json', url]),
      { maxBuffer: 50 * 1024 * 1024, timeout: 60000 }
    )
    const data = parseYtDlpJson(out)

    const audioFormats = []
    const videoFormats = []
    const thumbnails = []

    // Parse audio formats
    if (data.formats) {
      data.formats.forEach(fmt => {
        if (fmt.vcodec === 'none' && fmt.acodec !== 'none') {
          // Audio only format
          audioFormats.push({
            formatId: fmt.format_id,
            ext: fmt.ext,
            abr: fmt.abr || fmt.tbr || 0,
            acodec: fmt.acodec,
            filesize: fmt.filesize || fmt.filesize_approx || 0,
          })
        } else if (fmt.vcodec !== 'none') {
          // Video format (include both video-only and muxed with audio)
          const width = fmt.width || 0
          const height = fmt.height || 0
          const resolution = fmt.resolution || (width && height ? `${width}x${height}` : null)
          videoFormats.push({
            formatId: fmt.format_id,
            ext: fmt.ext,
            resolution,
            width,
            height,
            vcodec: fmt.vcodec,
            acodec: fmt.acodec || 'none',
            filesize: fmt.filesize || fmt.filesize_approx || 0,
            fps: fmt.fps,
            requiresMerge: fmt.acodec === 'none',
          })
        }
      })
    }

    // Sort audio formats by bitrate (descending)
    audioFormats.sort((a, b) => (b.abr || 0) - (a.abr || 0))

    // Sort video formats by resolution (descending)
    videoFormats.sort((a, b) => {
      const aHeight = Number(a.resolution?.includes('x') ? a.resolution.split('x')[1] : (a.height || 0)) || 0
      const bHeight = Number(b.resolution?.includes('x') ? b.resolution.split('x')[1] : (b.height || 0)) || 0
      return bHeight - aHeight
    })

    // Collect thumbnails if present (yt-dlp provides array with url/width/height/id/preference)
    if (Array.isArray(data.thumbnails)) {
      for (const t of data.thumbnails) {
        if (!t || !t.url) continue
        thumbnails.push({
          url: t.url,
          id: t.id || null,
          width: t.width || null,
          height: t.height || null,
          preference: typeof t.preference === 'number' ? t.preference : null,
        })
      }
    }

    // Sort thumbnails by (height then width) descending when dimensions known
    thumbnails.sort((a, b) => {
      const ah = a.height || 0
      const bh = b.height || 0
      if (bh !== ah) return bh - ah
      const aw = a.width || 0
      const bw = b.width || 0
      return bw - aw
    })

    res.json({
      audioFormats: audioFormats,
      videoFormats: videoFormats,
      thumbnails: thumbnails,
    })
  } catch (err) {
    console.error('Error fetching formats:', err)
    res.status(500).json({ error: 'Failed to query formats', details: String(err?.message || err) })
  }
})

// GET /api/yt-dlp/update/stream -> SSE with live yt-dlp update output
app.get('/api/yt-dlp/update/stream', async (req, res) => {
  // Setup SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders?.()

  const send = (event, data) => {
    if (event) res.write(`event: ${event}\n`)
    if (data !== undefined) {
      const payload = typeof data === 'string' ? data : JSON.stringify(data)
      res.write(`data: ${payload}\n\n`)
    } else {
      res.write(`data: \n\n`)
    }
  }

  let updateCmd
  try {
    updateCmd = getYtDlpUpdateCommand()
    if (!updateCmd) {
      send('error', `Updates are managed externally for this yt-dlp installation (${YT_DLP_UPDATE_METHOD}).`)
      send('end', 'failed')
      return res.end()
    }
  } catch (cmdErr) {
    send('error', String(cmdErr?.message || cmdErr))
    send('end', 'failed')
    return res.end()
  }

  send('info', `Starting yt-dlp update via ${updateCmd.label}...`)

  try {
    const child = spawn(updateCmd.cmd, updateCmd.args)
    const onData = (chunk) => {
      const lines = chunk.toString().split(/\r?\n/)
      for (const line of lines) {
        if (line.length) send('message', line)
      }
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    child.on('error', (e) => {
      send('error', String(e?.message || e))
    })
    child.on('close', async (code) => {
      if (code === 0) {
        // Report final version
        const ver = await runCmd(YT_DLP, ['--version']).catch(() => '')
        send('message', `Update finished. yt-dlp version now: ${ver.trim()}`)
        send('end', 'done')
      } else {
        send('error', `${updateCmd.label} updater exited with code ${code}`)
        send('end', 'failed')
      }
      res.end()
    })

    // If client disconnects, kill child
    req.on('close', () => {
      try { child.kill('SIGTERM') } catch { }
    })
  } catch (e) {
    send('error', String(e?.message || e))
    send('end', 'failed')
    res.end()
  }
})

// GET /api/proxy-image?url=...&filename=...&format=...
// Proxies an external image to force same-origin download with a provided filename and optional format conversion
app.get('/api/proxy-image', async (req, res) => {
  try {
    const rawUrl = (req.query.url || '').toString()
    const targetFormatRaw = (req.query.format || '').toString().trim().toLowerCase()
    const targetFormat = targetFormatRaw ? normalizeImageContainer(targetFormatRaw) : ''

    if (!rawUrl) return res.status(400).json({ error: 'Missing url' })
    if (!isValidHttpUrl(rawUrl)) {
      return res.status(400).json({ error: 'Only http/https URLs are allowed' })
    }
    if (targetFormatRaw && !targetFormat) {
      return res.status(400).json({ error: 'Unsupported image format' })
    }

    const filenameRaw = (req.query.filename || '').toString().trim()

    // Determine target extension
    let extStr = targetFormat || ''
    if (!extStr && filenameRaw) {
      const parts = filenameRaw.split('.')
      if (parts.length > 1) extStr = normalizeImageContainer(parts[parts.length - 1])
    }
    if (!extStr) extStr = 'jpg'

    const safeFilenameRaw = filenameRaw
      ? filenameRaw.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').substring(0, 120).trim()
      : `thumbnail.${extStr}`

    // Ensure filename ends with correct extension
    const baseName = (safeFilenameRaw.replace(/\.[^/.]+$/, '') || 'thumbnail').trim()
    const finalFilename = `${baseName}.${extStr}`

    const imageTimeoutController = new AbortController()
    const imageTimeout = setTimeout(() => imageTimeoutController.abort(), 15000)
    let upstream
    try {
      upstream = await fetch(rawUrl, { signal: imageTimeoutController.signal })
    } finally {
      clearTimeout(imageTimeout)
    }

    if (!upstream.ok) {
      return res.status(502).json({ error: `Upstream error ${upstream.status}` })
    }

    const contentLength = Number(upstream.headers.get('content-length') || 0)
    if (Number.isFinite(contentLength) && contentLength > MAX_PROXY_IMAGE_SIZE_BYTES) {
      return res.status(413).json({ error: 'Image too large' })
    }

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream'
    const ab = await upstream.arrayBuffer()
    if (ab.byteLength > MAX_PROXY_IMAGE_SIZE_BYTES) {
      return res.status(413).json({ error: 'Image too large' })
    }
    const imageBuffer = Buffer.from(ab)

    // If no format conversion needed (or no ffmpeg), just pipe
    // We assume if targetFormat is provided, we SHOULD ensure it matches, unless same type
    let needConversion = false
    if (targetFormat && HAS_FFMPEG) {
      // Simple mime check
      if (targetFormat === 'jpg' && !contentType.includes('jpeg') && !contentType.includes('jpg')) needConversion = true
      else if (targetFormat === 'png' && !contentType.includes('png')) needConversion = true
      else if (targetFormat === 'webp' && !contentType.includes('webp')) needConversion = true
    }

    if (!needConversion) {
      res.setHeader('Content-Type', contentType)
      res.setHeader('Content-Disposition', buildAttachmentContentDisposition(finalFilename, 'thumbnail.jpg'))
      res.send(imageBuffer)
      return
    }

    // Perform conversion using ffmpeg
    const validationHash = crypto.randomBytes(4).toString('hex')
    const tempInput = path.join(os.tmpdir(), `yloader_thumb_in_${validationHash}`)
    const tempOutput = path.join(os.tmpdir(), `yloader_thumb_out_${validationHash}.${extStr}`)

    try {
      fs.writeFileSync(tempInput, imageBuffer)

      await runCmd(FFMPEG_BIN, ['-y', '-i', tempInput, tempOutput])

      if (fs.existsSync(tempOutput)) {
        const outData = fs.readFileSync(tempOutput)

        let outMime = 'application/octet-stream'
        if (extStr === 'jpg') outMime = 'image/jpeg'
        if (extStr === 'png') outMime = 'image/png'
        if (extStr === 'webp') outMime = 'image/webp'

        res.setHeader('Content-Type', outMime)
        res.setHeader('Content-Disposition', buildAttachmentContentDisposition(finalFilename, 'thumbnail.jpg'))
        res.send(outData)
      } else {
        throw new Error('Conversion output file missing')
      }
    } catch (binErr) {
      console.error('Image conversion failed:', binErr)
      // Fallback to original
      res.setHeader('Content-Type', contentType)
      res.setHeader('Content-Disposition', buildAttachmentContentDisposition(finalFilename, 'thumbnail.jpg'))
      res.send(imageBuffer)
    } finally {
      try { if (fs.existsSync(tempInput)) fs.unlinkSync(tempInput) } catch { }
      try { if (fs.existsSync(tempOutput)) fs.unlinkSync(tempOutput) } catch { }
    }

    // Log to DB
    try {
      const timestamp = new Date().toISOString()
      // Extract video ID from thumb url if possible
      const thumbIdMatch = rawUrl.match(/\/vi\/([^\/]+)\//)
      const videoId = thumbIdMatch ? thumbIdMatch[1] : null

      // Attempt to infer service
      let service = 'other'
      if (rawUrl.includes('youtube.com') || rawUrl.includes('youtu.be')) service = 'youtube'
      else if (rawUrl.includes('reddit.com') || rawUrl.includes('redd.it')) service = 'reddit'
      else if (rawUrl.includes('twitter.com') || rawUrl.includes('x.com')) service = 'x'

      const pageUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : null
      const stmt = db.prepare(`INSERT INTO downloads (video_id, title, duration, timestamp, download_type, format_id, filename, service, source_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      stmt.run(videoId, filenameRaw || 'thumbnail', 0, timestamp, 'thumbnail', targetFormat || extStr || 'jpg', finalFilename, service, pageUrl)
      stmt.finalize()
    } catch (dbErr) {
      console.error('DB Insert Error (Proxy):', dbErr)
    }

  } catch (err) {
    res.status(500).json({ error: 'Failed to proxy image', details: String(err?.message || err) })
  }
})

// POST /api/download/stream -> SSE with live yt-dlp download progress
// Body: { url, type: 'audio' | 'video', format?, audioFormat?, videoFormat?, metadata?, cover?, cuts? }
app.post('/api/download/stream', async (req, res) => {
  const {
    url: rawUrl,
    type: rawType,
    format: rawContainer,
    audioFormat: rawAudioFormat,
    videoFormat: rawVideoFormat,
    metadata,
    cover,
    duration,
    service,
  } = req.body || {}

  const url = String(rawUrl || '').trim()
  const type = String(rawType || '').trim().toLowerCase()
  const container = String(rawContainer || '').trim().toLowerCase()
  const audioFormat = String(rawAudioFormat || '').trim()
  const videoFormat = String(rawVideoFormat || '').trim()

  if (!url || !type) {
    return res.status(400).json({ error: 'Missing required fields: url, type' })
  }
  if (!isValidHttpUrl(url)) {
    return res.status(400).json({ error: 'Invalid url' })
  }
  if (type !== 'audio' && type !== 'video') {
    return res.status(400).json({ error: 'Invalid type. Must be audio or video' })
  }

  const requestedAudioContainer = type === 'audio' ? normalizeAudioContainer(container || 'mp3') : ''
  const requestedVideoContainer = type === 'video' ? normalizeVideoContainer(container || 'mp4') : ''
  if (type === 'audio' && !requestedAudioContainer) {
    return res.status(400).json({ error: 'Unsupported audio format' })
  }
  if (type === 'video' && !requestedVideoContainer) {
    return res.status(400).json({ error: 'Unsupported video format' })
  }

  const normalizedAudioFormatId = audioFormat === 'best' ? 'best' : sanitizeFormatId(audioFormat)
  const normalizedVideoFormatId = videoFormat === 'best' ? 'best' : sanitizeFormatId(videoFormat)
  if (audioFormat && audioFormat !== 'best' && !normalizedAudioFormatId) {
    return res.status(400).json({ error: 'Invalid audio format id' })
  }
  if (videoFormat && videoFormat !== 'best' && !normalizedVideoFormatId) {
    return res.status(400).json({ error: 'Invalid video format id' })
  }

  const coverConfig = (cover && typeof cover === 'object') ? cover : {}
  const coverEnabled = type === 'audio' ? coverConfig.enabled !== false : false
  const coverSource = coverConfig.source === 'upload' ? 'upload' : 'video'
  let coverUpload = null
  let coverUploadHash = null

  if (type === 'audio' && coverEnabled && coverSource === 'upload') {
    if (!HAS_FFMPEG) {
      return res.status(400).json({ error: 'ffmpeg is required to embed a custom cover image' })
    }
    const upload = coverConfig.upload || {}
    const dataUrl = upload.dataUrl || upload.data || ''
    if (!dataUrl) {
      return res.status(400).json({ error: 'Cover image is missing' })
    }
    const raw = String(dataUrl)
    const m = raw.match(/^data:([^;]+);base64,(.+)$/)
    const base64 = m ? m[2] : raw
    const mime = upload.type || (m ? m[1] : '') || 'image/jpeg'
    let buffer
    try {
      buffer = Buffer.from(base64, 'base64')
    } catch (e) {
      return res.status(400).json({ error: 'Cover image could not be decoded' })
    }
    if (!buffer || buffer.length === 0) {
      return res.status(400).json({ error: 'Cover image could not be decoded' })
    }
    const maxSize = 10 * 1024 * 1024
    if (buffer.length > maxSize) {
      return res.status(400).json({ error: 'Cover image is too large (max 10MB)' })
    }
    const ext = mime.includes('png') ? '.png' : (mime.includes('webp') ? '.webp' : '.jpg')
    const safeName = sanitizeFilename(upload.name || `cover${ext}`)
    coverUpload = { buffer, mime, ext, name: safeName }
    coverUploadHash = crypto.createHash('sha256').update(buffer).digest('hex').substring(0, 12)
  }

  // Parse and validate cuts (new payload: req.body.cuts, legacy fallback: req.body.audioCuts/videoCuts).
  const legacyCuts = type === 'video' ? req.body.videoCuts : req.body.audioCuts
  const rawCuts = (req.body.cuts && typeof req.body.cuts === 'object')
    ? req.body.cuts
    : ((legacyCuts && typeof legacyCuts === 'object') ? legacyCuts : null)

  let cuts = null
  if (rawCuts?.enabled) {
    const trimStart = typeof rawCuts.trimStart === 'number' ? Math.max(0, rawCuts.trimStart) : 0
    const trimEnd = typeof rawCuts.trimEnd === 'number' ? Math.max(0, rawCuts.trimEnd) : null
    const mode = rawCuts.mode === 'keep' ? 'keep' : 'remove'

    const segmentCandidates = Array.isArray(rawCuts.segments)
      ? rawCuts.segments
      : (Array.isArray(rawCuts.removals) ? rawCuts.removals : [])

    const segments = segmentCandidates
      .filter(s => typeof s?.start === 'number' && typeof s?.end === 'number' && s.end > s.start)
      .map(s => ({ start: Math.max(0, s.start), end: Math.max(0, s.end) }))

    cuts = { enabled: true, mode, trimStart, trimEnd, segments }
  }

  // Setup SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders?.()

  let responseClosed = false
  const safeEnd = () => {
    if (responseClosed) return
    responseClosed = true
    try { res.end() } catch { }
  }

  const send = (event, data) => {
    if (responseClosed) return false
    try {
      if (event) res.write(`event: ${event}\n`)
      if (data !== undefined) {
        const payload = typeof data === 'string' ? data : JSON.stringify(data)
        res.write(`data: ${payload}\n\n`)
      } else {
        res.write('data: \n\n')
      }
      return true
    } catch {
      responseClosed = true
      return false
    }
  }

  try {
    const downloadHash = crypto.createHash('sha256')
      .update(JSON.stringify({
        url,
        type,
        format: type === 'audio' ? requestedAudioContainer : requestedVideoContainer,
        audioFormat: normalizedAudioFormatId || '',
        videoFormat: normalizedVideoFormatId || '',
        videoTitle: req.body.videoTitle || null,
        metadata: metadata || null,
        cover: {
          enabled: coverEnabled,
          source: coverSource,
          upload: coverUploadHash || null,
        },
        cuts: cuts || null,
      }))
      .digest('hex')
      .substring(0, 16)

    // Determine file extension and format args
    let ext = 'mp3'
    let formatArgs = []

    if (type === 'audio') {
      const requestedExt = requestedAudioContainer || 'mp3'
      ext = requestedExt

      // Map 'ogg' to 'vorbis' for yt-dlp arguments
      let audioFormatArg = requestedExt
      if (requestedExt === 'ogg') audioFormatArg = 'vorbis'

      if (normalizedAudioFormatId && normalizedAudioFormatId !== 'best') {
        formatArgs = ['-f', normalizedAudioFormatId]
      } else {
        formatArgs = ['-f', 'bestaudio']
      }
      formatArgs.push('-x', '--audio-format', audioFormatArg)
      if (coverEnabled && coverSource === 'video') {
        formatArgs.push('--embed-thumbnail', '--convert-thumbnails', 'jpg', '--write-thumbnail')
      }
    } else if (type === 'video') {
      ext = requestedVideoContainer || 'mp4'

      if (!HAS_FFMPEG) {
        send('message', '⚠️ ffmpeg not detected. Falling back to "best" (single file).')
        formatArgs = ['-f', 'best']
      } else {
        if (normalizedVideoFormatId && normalizedVideoFormatId !== 'best') {
          // Use specific video format + best audio, merge if needed
          formatArgs = ['-f', `${normalizedVideoFormatId}+bestaudio/best`]
        } else {
          formatArgs = ['-f', 'bestvideo+bestaudio/best']
        }
        formatArgs.push('--merge-output-format', ext)
      }
    }

    // Use metadata title if available, otherwise fallback to videoTitle passed in payload, or generic
    const targetTitle = metadata?.title || req.body.videoTitle || `download_${downloadHash}`
    const finalBaseFilename = sanitizeFilename(targetTitle) || `download_${downloadHash}`

    // Check if file already exists (cached) in FINAL destination
    const possibleExts = type === 'audio' ? ['mp3', 'm4a', 'opus', 'webm', 'ogg', 'wav', 'flac'] : ['mp4', 'webm', 'mkv']
    let existingFile = null
    for (const e of possibleExts) {
      const testPath = path.join(DOWNLOADS_DIR, `${finalBaseFilename}.${e}`)
      if (!fs.existsSync(testPath)) continue
      const metaPath = `${testPath}.ytdlp.json`
      try {
        if (fs.existsSync(metaPath)) {
          const metaRaw = fs.readFileSync(metaPath, 'utf-8')
          const meta = JSON.parse(metaRaw || '{}')
          if (meta && meta.downloadHash === downloadHash) {
            existingFile = `${finalBaseFilename}.${e}`
            break
          }
        }
      } catch (err) {
        console.warn('Cache metadata read failed:', err?.message || err)
      }
    }

    if (existingFile) {
      console.log(`File cached: ${existingFile}`)
      send('progress', { percent: 100, stage: 'cached' })
      send('complete', { filename: existingFile, url: `/api/download/file/${encodeURIComponent(existingFile)}` })
      safeEnd()
      return
    }

    // Check if download is already in progress
    if (activeDownloads.has(downloadHash)) {
      send('error', 'Download already in progress for this configuration')
      send('end', 'failed')
      safeEnd()
      return
    }

    // Mark download as active
    activeDownloads.set(downloadHash, true)

    // Create a temporary directory for this download to avoid naming conflicts and quoting issues
    const tempDirName = `temp_${downloadHash}`
    const tempDir = path.join(DOWNLOADS_DIR, tempDirName)
    try {
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true })
      }
    } catch (err) {
      console.error('Failed to create temp dir:', err)
      activeDownloads.delete(downloadHash)
      send('error', 'Failed to create temporary directory')
      send('end', 'failed')
      safeEnd()
      return
    }

    send('info', `Starting ${type} download...`)

    // We use a generic name in the temp dir to avoid any yt-dlp output template parsing issues
    // We will rename it to the correct title after download
    const tempOutputTemplate = path.join(tempDir, 'content.%(ext)s')

    // Build yt-dlp command
    const args = buildYtDlpNetworkArgs([
      ...formatArgs,
      '--no-playlist',
      '--progress',
      '--newline',
      '-o', tempOutputTemplate, // Download to temp dir with generic name
      url
    ])

    // Add metadata if provided (for audio)
    // Use --parse-metadata with meta_ prefix to set custom metadata values
    // and --embed-metadata to write them into the audio file
    if (type === 'audio' && metadata) {
      const hasMetadata = metadata.title || metadata.artist || metadata.album
      if (hasMetadata) {
        // Use parse-metadata to override the default metadata fields
        if (metadata.title) args.push('--parse-metadata', `${metadata.title}:%(meta_title)s`)
        if (metadata.artist) args.push('--parse-metadata', `${metadata.artist}:%(meta_artist)s`)
        if (metadata.album) args.push('--parse-metadata', `${metadata.album}:%(meta_album)s`)
        // embed-metadata is required to write the metadata into the file
        args.push('--embed-metadata')
      }
    }

    console.log('===============================================')
    console.log('Starting download:')
    console.log('  Target Title:', targetTitle)
    console.log('  Temp Dir:', tempDir)
    console.log('  Output template:', tempOutputTemplate)
    if (type === 'audio' && metadata) {
      console.log('  Metadata:')
      console.log('    Title:', metadata.title || '(none)')
      console.log('    Artist:', metadata.artist || '(none)')
      console.log('    Album:', metadata.album || '(none)')
    }
    console.log('===============================================')

    send('message', `Executing: yt-dlp ...`)

    // LocalHub-style: use configured yt-dlp path
    const child = spawn(YT_DLP, args)

    let lastPercent = 0
    let errorOutput = []

    // Parse yt-dlp output for progress
    const parseProgress = (line) => {
      // yt-dlp progress format: [download]  45.2% of 10.5MiB at 1.2MiB/s ETA 00:05
      const match = line.match(/\[download\]\s+(\d+(?:\.\d+)?)%/)
      if (match) {
        const percent = parseFloat(match[1])
        if (percent > lastPercent) {
          lastPercent = percent
          send('progress', { percent: Math.min(percent, 99), stage: 'downloading' })
        }
      }
      // Also check for merge/post-processing
      if (line.includes('[Merger]') || line.includes('Merging formats')) {
        send('progress', { percent: 99, stage: 'merging' })
      }
      if (line.includes('[ffmpeg]')) {
        send('progress', { percent: 99, stage: 'processing' })
      }
    }

    child.stdout.on('data', (chunk) => {
      const lines = chunk.toString().split(/\r?\n/)
      for (const line of lines) {
        if (line.trim()) {
          parseProgress(line)
          send('message', line)
        }
      }
    })

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString()

      // Ignore "Error in input stream" which often happens with pipe closure but isn't fatal if download finished
      if (text.includes('Error in input stream')) {
        return
      }

      const lines = text.split(/\r?\n/)
      for (const line of lines) {
        if (line.trim()) {
          errorOutput.push(line.trim())
          if (errorOutput.length > 50) errorOutput.shift()
          console.error('yt-dlp stderr:', line)
          parseProgress(line)
          send('message', line)
        }
      }
    })

    child.on('error', (e) => {
      activeDownloads.delete(downloadHash)
      console.error('yt-dlp spawn error:', e)
      // Attempt cleanup
      try { fs.rmSync(tempDir, { recursive: true, force: true }) } catch { }
      send('error', `Failed to start yt-dlp: ${e.message}`)
      send('end', 'failed')
      safeEnd()
    })

    child.on('close', async (code, signal) => {
      activeDownloads.delete(downloadHash)
      console.log(`yt-dlp closed with code ${code}`)

      let finalFile = null

      // Check if we have a file in temp dir
      try {
        if (fs.existsSync(tempDir)) {
          const files = fs.readdirSync(tempDir)
          // Look for 'content.*' (mp3, mp4, etc)
          const contentFile = files.find(f => f.startsWith('content.') && ['.mp3', '.mp4', '.mkv', '.webm', '.m4a', '.ogg', '.wav', '.flac', '.opus'].includes(path.extname(f).toLowerCase()))

          if (contentFile) {
            const ext = path.extname(contentFile)
            let sourcePath = path.join(tempDir, contentFile)
            const parsedDuration = Number(duration)
            const mediaDuration = Number.isFinite(parsedDuration) ? parsedDuration : null

            // Apply media cuts (trim + remove/keep segments) if requested
            if ((type === 'audio' || type === 'video') && cuts?.enabled) {
              if (!HAS_FFMPEG) {
                send('message', '⚠️ ffmpeg required for media cutting – skipping cuts')
              } else {
                const keepSegments = computeMediaKeepSegments(cuts, duration || null)
                if (keepSegments) {
                  const cutOutputPath = path.join(tempDir, `content_cut${ext}`)
                  send('progress', { percent: 99, stage: 'processing' })
                  try {
                    const ffArgs = type === 'audio'
                      ? buildAudioCutFfmpegArgs(sourcePath, cutOutputPath, keepSegments, ext)
                      : buildVideoCutFfmpegArgs(
                        sourcePath,
                        cutOutputPath,
                        keepSegments,
                        ext,
                        await detectHasAudioStream(sourcePath)
                      )
                    await runCmd(FFMPEG_BIN, ffArgs)
                    if (fs.existsSync(cutOutputPath)) {
                      sourcePath = cutOutputPath
                    }
                  } catch (cutErr) {
                    console.error('Media cut failed:', cutErr)
                    send('message', 'Media cutting failed, continuing with original file')
                  }
                }
              }
            }

            if (type === 'audio' && coverEnabled && coverSource === 'upload' && coverUpload) {
              try {
                const coverPath = path.join(tempDir, `cover${coverUpload.ext}`)
                fs.writeFileSync(coverPath, coverUpload.buffer)
                const withCoverPath = path.join(tempDir, `content_cover${ext}`)
                send('progress', { percent: 99, stage: 'processing' })
                await runCmd(FFMPEG_BIN, [
                  '-y',
                  '-i', sourcePath,
                  '-i', coverPath,
                  '-map', '0:0',
                  '-map', '1:0',
                  '-c', 'copy',
                  '-map_metadata', '0',
                  '-id3v2_version', '3',
                  '-metadata:s:v', 'title=Album cover',
                  '-metadata:s:v', 'comment=Cover (front)',
                  withCoverPath,
                ])
                sourcePath = withCoverPath
              } catch (err) {
                console.error('Failed to embed custom cover:', err)
                send('message', 'Cover embedding failed, continuing without custom cover')
              }
            }

            const destFilename = `${finalBaseFilename}${ext}`
            const destPath = path.join(DOWNLOADS_DIR, destFilename)

            // Move file to final destination
            console.log(`Moving ${sourcePath} to ${destPath}`)

            // If dest exists, delete it first (overwrite)
            if (fs.existsSync(destPath)) {
              fs.unlinkSync(destPath)
            }

            fs.renameSync(sourcePath, destPath)
            try {
              const metaPath = `${destPath}.ytdlp.json`
              const meta = {
                downloadHash,
                url,
                type,
                format: type === 'audio' ? requestedAudioContainer : requestedVideoContainer,
                audioFormat: normalizedAudioFormatId || '',
                videoFormat: normalizedVideoFormatId || '',
                videoTitle: req.body.videoTitle || null,
                metadata: metadata || null,
                cover: {
                  enabled: coverEnabled,
                  source: coverSource,
                  upload: coverUploadHash || null,
                },
                cuts: cuts || null,
              }
              fs.writeFileSync(metaPath, JSON.stringify(meta))
            } catch (err) {
              console.warn('Failed to write cache metadata:', err?.message || err)
            }
            finalFile = destFilename

            // Insert into DB
            try {
              const timestamp = new Date().toISOString()
              const videoId = (url.match(/[?&]v=([^&]+)/) || url.match(/youtu\.be\/([^?]+)/) || [])[1] || null

              // Determine format_id
              const formatId = type === 'audio'
                ? (normalizedAudioFormatId || requestedAudioContainer || 'bestaudio')
                : (normalizedVideoFormatId || requestedVideoContainer || 'best')

              // Default to youtube if not provided, for robustness
              let svc = service;
              if (!svc) {
                if (url.includes('youtube') || url.includes('youtu.be')) svc = 'youtube';
                else if (url.includes('reddit')) svc = 'reddit';
                else if (url.includes('twitter') || url.includes('x.com')) svc = 'x';
                else svc = 'other';
              }

              const stmt = db.prepare(`INSERT INTO downloads (video_id, title, duration, timestamp, download_type, format_id, filename, service, source_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
              stmt.run(videoId, targetTitle, duration || 0, timestamp, type, formatId, finalFile, svc, url)
              stmt.finalize()
              console.log('Metadata saved to DB for:', finalFile)
            } catch (dbErr) {
              console.error('Failed to save metadata to DB:', dbErr)
            }
          }
        }
      } catch (err) {
        console.error('File move/cleanup error:', err)
      }

      // Always cleanup temp dir
      try {
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true })
        }
      } catch (err) {
        console.error('Failed to remove temp dir:', err)
      }

      if (finalFile) {
        console.log(`Download successful: ${finalFile}`)
        send('progress', { percent: 100, stage: 'complete' })
        send('complete', {
          filename: finalFile,
          url: `/api/download/file/${encodeURIComponent(finalFile)}`
        })
        send('end', 'done')
      } else {
        if (code === 0) {
          console.error('Download reported success but content file not found in temp dir')
          send('error', 'Download reported success but file not found')
          send('end', 'failed')
        } else {
          const errorMsg = errorOutput.length > 0
            ? errorOutput.slice(-3).join(' ').substring(0, 200)
            : 'Unknown error'
          send('error', `yt-dlp exited with code ${code}. ${errorMsg}`)
          send('end', 'failed')
        }
      }
      safeEnd()
    })

    // Keep yt-dlp alive even if the client drops the SSE connection.
    // Only mark response as closed when the response stream is actually gone.
    res.on('close', () => {
      if (responseClosed) return
      responseClosed = true
      if (!res.writableEnded) {
        console.log(`[${downloadHash}] Client disconnected (keeping download alive)`)
      }
      // activeDownloads.delete(downloadHash) // Don't delete yet, let it finish so it caches
    })
  } catch (e) {
    send('error', String(e?.message || e))
    send('end', 'failed')
    safeEnd()
  }
})

// GET /api/download/file/:filename -> Serve cached download file
app.get('/api/download/file/:filename', (req, res) => {
  try {
    let filename = ''
    try {
      filename = decodeURIComponent(req.params.filename)
    } catch {
      return res.status(400).json({ error: 'Invalid filename encoding' })
    }
    // Sanitize to prevent directory traversal
    const safeName = path.basename(filename)
    const filePath = path.join(DOWNLOADS_DIR, safeName)

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' })
    }

    // Update access time to keep file in cache
    fs.utimesSync(filePath, new Date(), new Date())

    // Serve file with proper headers
    const ext = path.extname(safeName).toLowerCase()
    const contentTypeMap = {
      '.mp3': 'audio/mpeg',
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.mkv': 'video/x-matroska',
      '.m4a': 'audio/mp4',
      '.ogg': 'audio/ogg',
      '.wav': 'audio/wav',
      '.flac': 'audio/flac',
      '.opus': 'audio/opus',
    }
    const contentType = contentTypeMap[ext] || 'application/octet-stream'

    res.setHeader('Content-Type', contentType)
    res.setHeader('Content-Disposition', buildAttachmentContentDisposition(safeName, 'download'))
    res.setHeader('Cache-Control', 'public, max-age=86400') // 24 hours

    const stream = fs.createReadStream(filePath)
    stream.on('error', () => {
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to read file' })
      } else {
        res.destroy()
      }
    })
    stream.pipe(res)
  } catch (err) {
    res.status(500).json({ error: 'Failed to serve file', details: String(err?.message || err) })
  }
})

app.listen(PORT, () => {
  console.log(`yLoader backend listening on port ${PORT}`)
  console.log(`Downloads directory: ${DOWNLOADS_DIR}`)
})

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down...')
  process.exit(0)
})
