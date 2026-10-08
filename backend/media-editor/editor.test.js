import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import express from 'express'
import sqlite3 from 'sqlite3'
import { registerMediaEditor } from './routes.js'
import { probeMedia, validateEdit, runEdit } from './processing.js'
import { extractWaveform } from './visuals.js'

test('rejects invalid cuts and impossible audio exports', () => {
  const media = { duration: 5, hasVideo: true, hasAudio: true }
  for (const body of [{ start: -1 }, { end: 6 }, { start: 3, end: 2 }, { volume: '100' },
    { volume: 201 }, { fadeIn: 3, fadeOut: 3 }, { audioOnly: true, mute: true }, { start: null }]) {
    assert.throws(() => validateEdit(body, media), /INVALID_OPTIONS/)
  }
  assert.throws(() => validateEdit({ audioOnly: true }, { ...media, hasAudio: false }))
})

test('cancels an active subprocess', async () => {
  const controller = new AbortController()
  const running = runEdit(process.execPath, ['-e', 'setTimeout(() => {}, 10000)'], controller.signal)
  controller.abort()
  await assert.rejects(running)
})

test('waveform reflects real silence and signal amplitude', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'yloader-waveform-'))
  try {
    const input = path.join(dir, 'signal.wav')
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2',
      '-af', "volume=if(lt(t\\,1)\\,0\\,1):eval=frame", input])
    const peaks = await extractWaveform('ffmpeg', input, 2, new AbortController().signal)
    assert.equal(peaks.length, 480)
    assert.ok(peaks.slice(0, 200).every(value => value === 0))
    assert.ok(peaks.slice(280, 450).every(value => value > 0.1 && value < 0.15))
  } finally { await fs.rm(dir, { recursive: true, force: true }) }
})

test('real ffmpeg: preview ranges, cut/volume/fades, mute, audio extraction, originals and external Electron paths', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'yloader-editor-'))
  const external = path.join(dir, 'chosen-folder')
  await fs.mkdir(external)
  const input = path.join(external, 'original.mp4')
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=160x90:rate=25:duration=4',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', input])
  const original = await fs.readFile(input)
  const db = new sqlite3.Database(':memory:')
  const run = (sql, args = []) => new Promise((resolve, reject) => db.run(sql, args, err => err ? reject(err) : resolve()))
  await run(`CREATE TABLE downloads (id INTEGER PRIMARY KEY, video_id TEXT, title TEXT, duration REAL,
    timestamp TEXT, download_type TEXT, format_id TEXT, filename TEXT, service TEXT, source_url TEXT, thumbnail_url TEXT, local_path TEXT)`)
  await run('INSERT INTO downloads (id, download_type, filename, local_path) VALUES (1, ?, ?, ?)', ['video', 'original.mp4', input])
  const app = express()
  app.use(express.json())
  registerMediaEditor(app, { db, downloadsDir: dir, getFfmpeg: () => 'ffmpeg', getFfprobe: () => 'ffprobe' })
  const server = app.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  const base = `http://127.0.0.1:${server.address().port}/api/downloads`
  try {
    const preview = await fetch(`${base}/1/preview`, { headers: { Range: 'bytes=0-99' } })
    assert.equal(preview.status, 206)
    assert.equal((await preview.arrayBuffer()).byteLength, 100)
    assert.equal((await fetch(`${base}/999/media`)).status, 404)
    const timelineResponse = await fetch(`${base}/1/timeline`)
    assert.equal(timelineResponse.status, 200)
    const timeline = await timelineResponse.json()
    assert.equal(timeline.incomplete, false)
    assert.equal(timeline.frames.length, 10)
    assert.ok(timeline.frames.every(frame => frame.image.startsWith('data:image/jpeg;base64,') && frame.time >= 0 && frame.time < 4))
    assert.notEqual(timeline.frames[0].image, timeline.frames[9].image)
    assert.equal(timeline.peaks.length, 480)
    assert.ok(timeline.peaks.every(value => value >= 0 && value <= 1))
    assert.ok(timeline.peaks.some(value => value > 0.1))
    const invalid = await fetch(`${base}/1/edit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"start":-1}' })
    assert.equal(invalid.status, 400)
    for (const options of [{ volume: 50, fadeIn: 0.3, fadeOut: 0.3 }, { mute: true }, { audioOnly: true }]) {
      const response = await fetch(`${base}/1/edit`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start: 1, end: 3, ...options }) })
      assert.equal(response.status, 200, await response.clone().text())
      const data = await response.json()
      const exported = await probeMedia('ffprobe', path.join(external, data.filename))
      assert.ok(Math.abs(exported.duration - 2) < 0.15)
      assert.equal(exported.hasVideo, !options.audioOnly)
      assert.equal(exported.hasAudio, !options.mute)
      assert.equal((await fetch(`${base}/${data.id}/file`)).status, 200)
      if (options.audioOnly) {
        const audioEdit = await fetch(`${base}/${data.id}/edit`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ start: 0.25, end: 1.25, volume: 150 }) })
        assert.equal(audioEdit.status, 200)
        const audioResult = await audioEdit.json()
        const audioMedia = await probeMedia('ffprobe', path.join(external, audioResult.filename))
        assert.equal(audioMedia.hasVideo, false)
        assert.ok(Math.abs(audioMedia.duration - 1) < 0.15)
      }
      if (options.volume) {
        const pcm = execFileSync('ffmpeg', ['-v', 'error', '-i', path.join(external, data.filename), '-f', 'f32le', '-ac', '1', '-ar', '8000', 'pipe:1'])
        const samples = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.length / 4)
        const rms = (start, end) => Math.sqrt(samples.slice(start, end).reduce((sum, v) => sum + v * v, 0) / (end - start))
        assert.ok(rms(4000, 6000) > 0.035 && rms(4000, 6000) < 0.055, 'volume is halved')
        assert.ok(rms(0, 400) < rms(4000, 6000) / 3, 'fade in starts quietly after cut')
        assert.ok(rms(15500, 15900) < rms(4000, 6000) / 3, 'fade out ends quietly')
      }
    }
    assert.deepEqual(await fs.readFile(input), original)
  } finally {
    await new Promise(resolve => server.close(resolve))
    await new Promise(resolve => db.close(resolve))
    await fs.rm(dir, { recursive: true, force: true })
  }
})
