import React from 'react'
import { getApiBase } from '../../utils/metadata'

const errorKeys = { NOT_FOUND: 'missing', INVALID_OPTIONS: 'invalid', BUSY: 'busy', TOOLS_MISSING: 'tools' }
const errorKey = error => ['missing', 'invalid', 'busy', 'tools'].includes(error.message) ? error.message : 'failed'

export default function useMediaEditor(entry, onSaved) {
  const [media, setMedia] = React.useState(null)
  const [range, setRange] = React.useState([0, 0])
  const [volume, setVolume] = React.useState(100)
  const [mute, setMute] = React.useState(false)
  const [audioOnly, setAudioOnly] = React.useState(false)
  const [fades, setFades] = React.useState([0, 0])
  const [error, setError] = React.useState('')
  const [previewError, setPreviewError] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [result, setResult] = React.useState(null)
  const [visuals, setVisuals] = React.useState(null)
  const [visualsLoading, setVisualsLoading] = React.useState(false)
  const [visualsError, setVisualsError] = React.useState(false)
  const [visualsAttempt, setVisualsAttempt] = React.useState(0)
  const [currentTime, setCurrentTime] = React.useState(0)
  const [playing, setPlaying] = React.useState(false)
  const player = React.useRef(null)
  const request = React.useRef(null)
  const base = `${getApiBase()}/api/downloads/${entry.id}`
  const length = range[1] - range[0]
  const invalid = !Number.isFinite(length) || length < 0.05 || range[0] < 0 || range[1] > (media?.duration || 0)
    || (!mute && (fades.some(value => !Number.isFinite(value) || value < 0 || value > 10) || fades[0] + fades[1] > length))
  const disabled = saving || Boolean(result)

  React.useEffect(() => {
    const controller = new AbortController()
    fetch(`${base}/media`, { signal: controller.signal }).then(async res => {
      const data = await res.json()
      if (!res.ok) throw new Error(errorKeys[data.code] || 'failed')
      if (!controller.signal.aborted) { setMedia(data); setRange([0, data.duration]); setAudioOnly(!data.hasVideo) }
    }).catch(err => { if (!controller.signal.aborted) setError(errorKey(err)) })
    return () => { controller.abort(); request.current?.abort() }
  }, [base])

  React.useEffect(() => {
    if (!media) return
    const controller = new AbortController()
    setVisualsLoading(true)
    setVisualsError(false)
    fetch(`${base}/timeline`, { signal: controller.signal }).then(async res => {
      if (!res.ok) throw new Error('VISUALS_FAILED')
      const data = await res.json()
      if (!controller.signal.aborted) setVisuals(data)
    }).catch(() => { if (!controller.signal.aborted) setVisualsError(true) })
      .finally(() => { if (!controller.signal.aborted) setVisualsLoading(false) })
    return () => controller.abort()
  }, [base, media, visualsAttempt])

  React.useEffect(() => {
    if (player.current) { player.current.muted = mute; player.current.volume = Math.min(1, volume / 100) }
  }, [mute, volume, media])

  const seek = value => {
    const time = Math.max(0, Math.min(media?.duration || 0, value))
    setCurrentTime(time)
    if (player.current && !previewError) {
      try { player.current.currentTime = time } catch { /* metadata is still loading */ }
    }
  }
  const togglePlayback = () => {
    if (!player.current || previewError || invalid) return
    if (!player.current.paused) player.current.pause()
    else {
      if (currentTime < range[0] || currentTime >= range[1]) seek(range[0])
      player.current.play().catch(() => setPreviewError(true))
    }
  }
  const save = async () => {
    player.current?.pause()
    setSaving(true)
    setError('')
    const controller = new AbortController()
    request.current = controller
    try {
      const res = await fetch(`${base}/edit`, { method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ start: range[0], end: range[1], volume, mute,
          audioOnly, fadeIn: mute ? 0 : fades[0], fadeOut: mute ? 0 : fades[1] }) })
      const data = await res.json()
      if (!res.ok) throw new Error(errorKeys[data.code] || 'failed')
      if (!controller.signal.aborted) { setResult(data); onSaved?.(data) }
    } catch (err) { if (!controller.signal.aborted) setError(errorKey(err)) }
    finally { if (!controller.signal.aborted) setSaving(false) }
  }
  return { media, range, setRange, volume, setVolume, mute, setMute, audioOnly, setAudioOnly, fades, setFades,
    error, previewError, setPreviewError, saving, result, player, base, length, invalid, disabled,
    visuals, visualsLoading, visualsError, retryVisuals: () => setVisualsAttempt(value => value + 1),
    currentTime, setCurrentTime, playing, setPlaying, seek, togglePlayback, save, cancel: () => request.current?.abort() }
}
