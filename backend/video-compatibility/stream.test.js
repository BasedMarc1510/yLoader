import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { once } from 'node:events'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import { fileURLToPath } from 'node:url'

const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg'
const ffprobe = process.env.FFPROBE_PATH || 'ffprobe'
const backendDir = fileURLToPath(new URL('../', import.meta.url))

async function startServer(dir, runtime) {
  const socket = net.createServer()
  socket.listen(0, '127.0.0.1')
  await once(socket, 'listening')
  const port = socket.address().port
  await new Promise(resolve => socket.close(resolve))
  const child = spawn(process.execPath, ['server.js'], {
    cwd: backendDir,
    env: { ...process.env, PORT: String(port), DB_PATH: path.join(dir, 'metadata.db'),
      DOWNLOAD_DIR: path.join(dir, 'downloads'), YT_DLP_PATH: path.join(dir, 'yt-dlp.cjs'),
      FFMPEG_PATH: path.join(dir, 'ffmpeg.cjs'), FFPROBE_PATH: ffprobe,
      YLOADER_RUNTIME_TARGET: runtime, YT_DLP_MANAGED_BY_YLOADER: 'false', FFMPEG_MANAGED_BY_YLOADER: 'false' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let logs = ''
  child.stdout.on('data', chunk => { logs += chunk })
  child.stderr.on('data', chunk => { logs += chunk })
  const base = `http://127.0.0.1:${port}`
  for (let i = 0; i < 100; i += 1) {
    try {
      const result = await fetch(`${base}/api/ffmpeg/status`)
      if ((await result.json()).available) return { child, base }
    } catch { }
    if (child.exitCode !== null) throw new Error(logs)
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  child.kill()
  throw new Error(`Server startup failed: ${logs}`)
}

async function fixture(dir) {
  const source = path.join(dir, 'source.webm')
  execFileSync(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=160x90:rate=25:duration=2',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-c:v', 'libvpx-vp9', '-c:a', 'libopus', source])
  // Stand in for a provider download; the postprocessing uses the real FFmpeg binary.
  await fs.writeFile(path.join(dir, 'yt-dlp.cjs'), `#!${process.execPath}
const fs = require('node:fs'); const args = process.argv.slice(2);
if (args.includes('--version')) { console.log('2026.10.04'); process.exit(0); }
if (!args.includes('-o')) process.exit(0);
const target = args[args.indexOf('-o') + 1].replace('%(ext)s', 'webm');
fs.copyFileSync(${JSON.stringify(source)}, target);
console.log('[download] 100%');
`, { mode: 0o755 })
  await fs.writeFile(path.join(dir, 'ffmpeg.cjs'), `#!${process.execPath}
const fs = require('node:fs'); const { spawnSync } = require('node:child_process');
const args = process.argv.slice(2);
if (fs.existsSync(${JSON.stringify(path.join(dir, 'fail'))}) && args.includes('libx264')) {
  fs.writeFileSync(args.at(-1), 'partial'); process.exit(1);
}
const result = spawnSync(${JSON.stringify(ffmpeg)}, args, { stdio: 'inherit' });
process.exit(result.status ?? 1);
`, { mode: 0o755 })
}

async function download(base, options = {}) {
  const response = await fetch(`${base}/api/download/stream`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://example.com/video', type: 'video',
      format: 'mp4', videoTitle: 'test', maximumCompatibility: true, ...options }),
    signal: AbortSignal.timeout(30000),
  })
  return { status: response.status, text: await response.text() }
}

function completion(text) {
  return JSON.parse(text.match(/event: complete\ndata: (.+)/)?.[1] || 'null')
}

const media = file => JSON.parse(execFileSync(ffprobe, [
  '-v', 'error', '-show_streams', '-show_format', '-of', 'json', file,
], { encoding: 'utf8' }))

for (const runtime of ['server', 'electron']) {
  test(`stream: ${runtime} converts after cuts, handles cache/validation/failure and retains target`, async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'yloader-stream-'))
    let child
    try {
      await fixture(dir)
      const server = await startServer(dir, runtime)
      child = server.child
      const target = path.join(dir, 'selected.mp4')
      const direct = runtime === 'electron' ? { electronSavePath: target, electronAllowOverwrite: true } : {}
      const cuts = { enabled: true, mode: 'keep', trimStart: 0.2, trimEnd: 1.2 }
      const result = await download(server.base, { ...direct, cuts })
      assert.equal(result.status, 200)
      assert.match(result.text, /"stage":"converting"/)
      const complete = completion(result.text)
      assert.ok(complete, result.text)
      assert.equal(path.extname(complete.filename), '.mp4')
      if (runtime === 'electron') assert.equal(complete.savePath, target)
      const output = media(complete.savePath)
      assert.equal(output.streams.find(s => s.codec_type === 'video').codec_name, 'h264')
      assert.equal(output.streams.find(s => s.codec_type === 'audio').codec_name, 'aac')
      assert.ok(Number(output.format.duration) < 1.5)
      if (runtime === 'server') {
        const cached = await download(server.base, { cuts })
        assert.match(cached.text, /"stage":"cached"/)
        const ordinary = await download(server.base, { cuts, maximumCompatibility: false })
        assert.doesNotMatch(ordinary.text, /"stage":"cached"/)
        assert.equal(media(completion(ordinary.text).savePath).streams[0].codec_name, 'vp9')
      }
      const invalid = await download(server.base, { maximumCompatibility: 'true' })
      assert.equal(invalid.status, 400)
      const before = await fs.readFile(complete.savePath)
      await fs.writeFile(path.join(dir, 'fail'), '')
      const failed = await download(server.base, { ...direct, videoTitle: 'failure' })
      assert.match(failed.text, /VIDEO_COMPATIBILITY_FAILED/)
      assert.equal(completion(failed.text), null)
      assert.deepEqual(await fs.readFile(complete.savePath), before)
      const remaining = await fs.readdir(runtime === 'server' ? path.join(dir, 'downloads') : dir)
      assert.ok(!remaining.some(name => name.includes('_compatible_') || name.startsWith('yloader_') || name.startsWith('temp_')))
    } finally {
      if (child && child.exitCode === null) { child.kill(); await once(child, 'exit') }
      await fs.rm(dir, { recursive: true, force: true })
    }
  })
}
