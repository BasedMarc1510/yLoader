import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { buildCompatibilityArgs } from './profiles.js'

const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg'
const ffprobe = process.env.FFPROBE_PATH || 'ffprobe'

const probe = (file) => JSON.parse(execFileSync(ffprobe, [
  '-v', 'error', '-show_streams', '-show_format', '-of', 'json', file,
], { encoding: 'utf8' }))

test('real FFmpeg converts VP9/Opus to the promised container codecs', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'yloader-compatibility-'))
  try {
    const input = path.join(dir, 'source.webm')
    execFileSync(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=161x91:rate=25:duration=0.5',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.5',
      '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuv444p', '-c:a', 'libopus', '-shortest', input])
    const original = await fs.readFile(input)
    for (const [container, videoCodec, audioCodec] of [
      ['mp4', 'h264', 'aac'], ['mov', 'h264', 'aac'], ['mkv', 'h264', 'aac'],
      ['webm', 'vp8', 'vorbis'], ['avi', 'mpeg4', 'mp3'],
    ]) {
      const output = path.join(dir, `compatible.${container}`)
      execFileSync(ffmpeg, ['-v', 'error', ...buildCompatibilityArgs(input, output, container)])
      const media = probe(output)
      const video = media.streams.find(s => s.codec_type === 'video')
      const audio = media.streams.find(s => s.codec_type === 'audio')
      assert.equal(video.codec_name, videoCodec)
      assert.equal(video.pix_fmt, 'yuv420p')
      assert.equal(video.width, 162)
      assert.equal(video.height, 92)
      assert.equal(audio.codec_name, audioCodec)
      assert.equal(audio.channels, 2)
      assert.equal(audio.sample_rate, '48000')
      assert.ok(Number(media.format.duration) > 0)
      execFileSync(ffmpeg, ['-v', 'error', '-i', output, '-f', 'null', '-'])
      if (container === 'mp4' || container === 'mov') {
        const bytes = await fs.readFile(output)
        assert.ok(bytes.indexOf('moov') < bytes.indexOf('mdat'))
      }
    }
    assert.deepEqual(await fs.readFile(input), original)
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
})

test('video-only inputs remain valid without adding an audio track', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'yloader-silent-'))
  try {
    const input = path.join(dir, 'silent.mkv')
    execFileSync(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=160x90:duration=0.2',
      '-c:v', 'ffv1', input])
    for (const container of ['mp4', 'mkv', 'webm', 'avi', 'mov']) {
      const output = path.join(dir, `output.${container}`)
      execFileSync(ffmpeg, ['-v', 'error', ...buildCompatibilityArgs(input, output, container)])
      assert.equal(probe(output).streams.length, 1)
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
})
