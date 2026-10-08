import { execFile, spawn } from 'child_process'

const FRAME_COUNT = 10
const WAVEFORM_BINS = 480
const SAMPLE_RATE = 8000

function thumbnail(binary, input, time, signal) {
  return new Promise((resolve, reject) => {
    execFile(binary, ['-nostdin', '-hide_banner', '-loglevel', 'error', '-threads', '2',
      '-ss', String(time), '-i', input, '-map', '0:V:0', '-an', '-frames:v', '1',
      '-vf', 'scale=160:90:force_original_aspect_ratio=decrease,pad=160:90:(ow-iw)/2:(oh-ih)/2',
      '-c:v', 'mjpeg', '-threads', '1', '-q:v', '5', '-f', 'image2pipe', 'pipe:1'],
    { encoding: 'buffer', timeout: 20000, maxBuffer: 512 * 1024, signal }, (error, stdout) => {
      if (error || !stdout.length) return reject(error || new Error('EMPTY_FRAME'))
      resolve({ time, image: `data:image/jpeg;base64,${stdout.toString('base64')}` })
    })
  })
}

async function filmstrip(binary, input, duration, signal) {
  const frames = []
  for (let index = 0; index < FRAME_COUNT; index += 1) {
    if (signal.aborted) throw new Error('ABORTED')
    // Seek independently so long videos do not need to be decoded in full.
    frames.push(await thumbnail(binary, input, duration * (index + 0.5) / FRAME_COUNT, signal))
  }
  return frames
}

export function extractWaveform(binary, input, duration, signal) {
  return new Promise((resolve, reject) => {
    const peaks = new Array(WAVEFORM_BINS).fill(0)
    const samplesPerBin = Math.max(1, Math.ceil(duration * SAMPLE_RATE / WAVEFORM_BINS))
    let sampleIndex = 0
    let pendingByte = null
    const child = spawn(binary, ['-nostdin', '-hide_banner', '-loglevel', 'error', '-threads', '2',
      '-i', input, '-map', '0:a:0', '-vn', '-ac', '1', '-ar', String(SAMPLE_RATE), '-f', 's16le', 'pipe:1'],
    { stdio: ['ignore', 'pipe', 'pipe'], signal })
    const timer = setTimeout(() => child.kill('SIGKILL'), 120000)
    child.stderr.resume()
    const addSample = value => {
      const bin = Math.floor(sampleIndex++ / samplesPerBin)
      if (bin < WAVEFORM_BINS) peaks[bin] = Math.max(peaks[bin], Math.abs(value) / 32768)
    }
    child.stdout.on('data', buffer => {
      let offset = 0
      if (pendingByte !== null && buffer.length) {
        let sample = pendingByte | (buffer[0] << 8)
        if (sample >= 32768) sample -= 65536
        addSample(sample)
        pendingByte = null
        offset = 1
      }
      for (; offset + 1 < buffer.length; offset += 2) addSample(buffer.readInt16LE(offset))
      if (offset < buffer.length) pendingByte = buffer[offset]
    })
    child.once('error', error => { clearTimeout(timer); reject(error) })
    child.once('close', code => {
      clearTimeout(timer)
      if (code !== 0) return reject(new Error('WAVEFORM_FAILED'))
      // Real peak levels, without normalizing away silence or dynamics.
      resolve(peaks.map(value => Math.round(value * 10000) / 10000))
    })
  })
}

export async function createTimelineVisuals(binary, input, media, signal) {
  const [video, audio] = await Promise.allSettled([
    media.hasVideo ? filmstrip(binary, input, media.duration, signal) : Promise.resolve([]),
    media.hasAudio ? extractWaveform(binary, input, media.duration, signal) : Promise.resolve([]),
  ])
  if (signal.aborted) throw new Error('ABORTED')
  return {
    frames: video.status === 'fulfilled' ? video.value : [],
    peaks: audio.status === 'fulfilled' ? audio.value : [],
    incomplete: video.status === 'rejected' || audio.status === 'rejected',
  }
}
