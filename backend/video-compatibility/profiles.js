// Explicit encoders: changing the container alone does not convert its codecs.
export function buildCompatibilityArgs(inputPath, outputPath, container) {
  const args = [
    '-y', '-i', inputPath,
    '-map', '0:v:0', '-map', '0:a:0?', '-map_metadata', '0',
    '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2', '-pix_fmt', 'yuv420p',
  ]

  if (container === 'webm') {
    args.push('-c:v', 'libvpx', '-crf', '10', '-b:v', '0',
      '-deadline', 'good', '-cpu-used', '2', '-c:a', 'libvorbis', '-q:a', '5')
  } else if (container === 'avi') {
    args.push('-c:v', 'mpeg4', '-q:v', '3', '-vtag', 'XVID',
      '-c:a', 'libmp3lame', '-b:a', '192k')
  } else if (['mp4', 'mkv', 'mov'].includes(container)) {
    args.push('-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
      '-profile:v', 'baseline', '-c:a', 'aac', '-profile:a', 'aac_low', '-b:a', '192k')
    if (container !== 'mkv') args.push('-tag:v', 'avc1', '-movflags', '+faststart')
  } else {
    throw new Error('Unsupported video compatibility container')
  }

  args.push('-ac', '2', '-ar', '48000', '-f', container === 'mkv' ? 'matroska' : container, outputPath)
  return args
}
