import { spawn, execFile } from 'child_process'

export function probeMedia(binary, input) {
  return new Promise((resolve, reject) => {
    execFile(binary, ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', input],
      { timeout: 30000, maxBuffer: 2 * 1024 * 1024 }, (error, stdout) => {
        if (error) return reject(error)
        try {
          const data = JSON.parse(stdout)
          const video = data.streams.find(s => s.codec_type === 'video' && !s.disposition?.attached_pic)
          const audio = data.streams.some(s => s.codec_type === 'audio')
          const duration = Number(data.format?.duration)
          if (!(duration > 0) || (!video && !audio)) throw new Error('Unsupported media')
          resolve({ duration, hasVideo: Boolean(video), hasAudio: audio })
        } catch (err) { reject(err) }
      })
  })
}

export function validateEdit(body, media) {
  const number = (key, fallback, min, max) => {
    const value = body[key] === undefined ? fallback : body[key]
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
      throw new Error('INVALID_OPTIONS')
    }
    return value
  }
  const start = number('start', 0, 0, media.duration)
  const end = number('end', media.duration, 0, media.duration)
  const volume = number('volume', 100, 0, 200)
  const fadeIn = number('fadeIn', 0, 0, 10)
  const fadeOut = number('fadeOut', 0, 0, 10)
  if (end - start < 0.05 || fadeIn + fadeOut > end - start) throw new Error('INVALID_OPTIONS')
  if (body.mute !== undefined && typeof body.mute !== 'boolean') throw new Error('INVALID_OPTIONS')
  if (body.audioOnly !== undefined && typeof body.audioOnly !== 'boolean') throw new Error('INVALID_OPTIONS')
  const audioOnly = !media.hasVideo || Boolean(body.audioOnly)
  if ((audioOnly && (!media.hasAudio || body.mute)) || (!media.hasAudio && (volume !== 100 || fadeIn || fadeOut))) {
    throw new Error('INVALID_OPTIONS')
  }
  return { start, end, volume, fadeIn, fadeOut, mute: Boolean(body.mute), audioOnly }
}

export function buildEditArgs(input, output, edit, media) {
  const args = ['-nostdin', '-hide_banner', '-loglevel', 'error', '-n', '-ss', String(edit.start), '-i', input,
    '-t', String(edit.end - edit.start), '-map_metadata', '0']
  if (!edit.audioOnly) args.push('-map', '0:V:0', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2')
  else args.push('-vn')
  if (edit.mute || !media.hasAudio) args.push('-an')
  else {
    const filters = [`volume=${edit.volume / 100}`]
    if (edit.fadeIn) filters.push(`afade=t=in:d=${edit.fadeIn}`)
    if (edit.fadeOut) filters.push(`afade=t=out:st=${edit.end - edit.start - edit.fadeOut}:d=${edit.fadeOut}`)
    args.push('-map', '0:a:0', '-af', filters.join(','), '-c:a', 'aac', '-b:a', '192k')
  }
  args.push('-movflags', '+faststart', output)
  return args
}

export function runEdit(binary, args, signal) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ['ignore', 'ignore', 'pipe'], signal })
    // Drain stderr without retaining potentially large or sensitive tool output.
    child.stderr.resume()
    const timeout = setTimeout(() => child.kill('SIGKILL'), 30 * 60 * 1000)
    child.once('error', reject)
    child.once('close', code => {
      clearTimeout(timeout)
      code === 0 ? resolve() : reject(new Error('PROCESSING_FAILED'))
    })
  })
}
