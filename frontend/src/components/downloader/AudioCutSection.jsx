import React from 'react'
import { Box, Slider, Typography } from '@mui/material'
import { Plus, X } from 'lucide-react'
import { useI18n } from '../../providers/I18nProvider'

/** Format seconds → "m:ss" or "h:mm:ss" */
const formatTime = (totalSec) => {
  const s = Math.max(0, Math.round(totalSec || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = s % 60
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`
  return `${m}:${ss.toString().padStart(2, '0')}`
}

/** Parse "m:ss" or "h:mm:ss" → seconds, clamped to [0, max] */
const parseTime = (str, max) => {
  if (!str || typeof str !== 'string') return 0
  const parts = str.trim().split(':').map(p => {
    const n = parseInt(p, 10)
    return isNaN(n) ? 0 : n
  })
  let v = 0
  if (parts.length >= 3) v = parts[0] * 3600 + parts[1] * 60 + parts[2]
  else if (parts.length === 2) v = parts[0] * 60 + parts[1]
  else v = parts[0]
  return Math.max(0, Math.min(max, v))
}

const mergeSegments = (segments) => {
  const sorted = [...(segments || [])]
    .filter(s => s && typeof s.start === 'number' && typeof s.end === 'number' && s.end > s.start)
    .sort((a, b) => a.start - b.start)

  const merged = []
  for (const seg of sorted) {
    const prev = merged[merged.length - 1]
    if (!prev) {
      merged.push({ start: seg.start, end: seg.end })
      continue
    }
    if (seg.start <= prev.end) {
      prev.end = Math.max(prev.end, seg.end)
    } else {
      merged.push({ start: seg.start, end: seg.end })
    }
  }
  return merged
}

const invertSegments = (segments, start, end) => {
  if (end <= start) return []
  const merged = mergeSegments(segments)
  if (!merged.length) return [{ start, end }]

  const inverted = []
  let cursor = start
  for (const seg of merged) {
    const clampedStart = Math.max(start, seg.start)
    const clampedEnd = Math.min(end, seg.end)
    if (clampedEnd <= clampedStart) continue
    if (clampedStart > cursor) {
      inverted.push({ start: cursor, end: clampedStart })
    }
    cursor = Math.max(cursor, clampedEnd)
  }
  if (cursor < end) {
    inverted.push({ start: cursor, end })
  }
  return inverted
}

/**
 * Build CSS linear-gradient for slider rail highlighting cut zones.
 * sliderMin/sliderMax define the slider's range; zones are clamped to it.
 */
const buildRailGradient = (zones, sliderMin, sliderMax, baseColor, zoneColor) => {
  const span = sliderMax - sliderMin
  if (!span || !zones || !zones.length) return baseColor

  const valid = zones
    .filter(z => z && typeof z.start === 'number' && typeof z.end === 'number' && z.end > z.start)
    .sort((a, b) => a.start - b.start)

  if (!valid.length) return baseColor

  const stops = [`${baseColor} 0%`]
  for (const z of valid) {
    const cs = Math.max(z.start, sliderMin)
    const ce = Math.min(z.end, sliderMax)
    if (ce <= cs) continue
    const sp = ((cs - sliderMin) / span * 100).toFixed(3)
    const ep = ((ce - sliderMin) / span * 100).toFixed(3)
    stops.push(
      `${baseColor} ${sp}%`,
      `${zoneColor} ${sp}%`,
      `${zoneColor} ${ep}%`,
      `${baseColor} ${ep}%`,
    )
  }
  stops.push(`${baseColor} 100%`)
  return `linear-gradient(to right, ${stops.join(', ')})`
}

/** Small labeled time-text input */
const TimeField = ({ label, value, onChange, onCommit, isDark, disabled, textColor }) => (
  <Box sx={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
    <Typography
      variant="caption"
      sx={{ color: isDark ? '#777' : '#888', fontWeight: 600, fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}
    >
      {label}
    </Typography>
    <Box
      component="input"
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      onBlur={e => onCommit(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
      disabled={disabled}
      sx={{
        width: 72,
        px: 1,
        py: '4px',
        border: `1px solid ${isDark ? '#3a3a3a' : '#d0d0d0'}`,
        borderRadius: '6px',
        bgcolor: isDark ? '#1a1a1a' : '#fff',
        color: textColor,
        fontSize: '0.82rem',
        fontFamily: 'monospace',
        textAlign: 'center',
        outline: 'none',
        cursor: disabled ? 'default' : 'text',
        boxSizing: 'border-box',
        transition: 'border-color 0.15s',
        '&:focus': { borderColor: isDark ? '#666' : '#aaa' },
        '&:disabled': { opacity: 0.45, cursor: 'default' },
      }}
    />
  </Box>
)

/** Shared MUI Slider sx – pass trackVisible=false for the combined-cuts slider */
const makeSliderSx = (brandColor, railGradient, trackVisible = true) => ({
  color: brandColor,
  py: '10px',
  '& .MuiSlider-thumb': {
    width: 14,
    height: 14,
    bgcolor: brandColor,
    '&:hover, &.Mui-focusVisible': { boxShadow: `0 0 0 6px ${brandColor}33` },
    '&.Mui-active': { boxShadow: `0 0 0 10px ${brandColor}26` },
  },
  '& .MuiSlider-track': trackVisible
    ? { bgcolor: brandColor, opacity: 0.85, height: 4, border: 'none' }
    : { display: 'none' },
  '& .MuiSlider-rail': {
    background: railGradient,
    opacity: 1,
    height: 4,
  },
})

const makeModeButtonSx = ({ active, isDark, brandColor, disabled }) => ({
  flex: 1,
  borderRadius: '9px',
  py: 0.7,
  px: 1,
  border: `1px solid ${active ? brandColor : (isDark ? '#3a3a3a' : '#d0d0d0')}`,
  bgcolor: active
    ? (isDark ? `${brandColor}2E` : `${brandColor}1F`)
    : (isDark ? '#1b1b1b' : '#fff'),
  color: active ? brandColor : (isDark ? '#cfcfcf' : '#444'),
  fontSize: '0.78rem',
  fontWeight: 700,
  textAlign: 'center',
  cursor: disabled ? 'default' : 'pointer',
  opacity: disabled ? 0.5 : 1,
  userSelect: 'none',
  transition: 'all 0.15s ease',
  '&:hover': disabled
    ? {}
    : {
      borderColor: active ? brandColor : (isDark ? '#6b6b6b' : '#a0a0a0'),
      bgcolor: active
        ? (isDark ? `${brandColor}33` : `${brandColor}26`)
        : (isDark ? '#222' : '#f7f7f7'),
    },
})

/**
 * AudioCutSection
 *
 * Props:
 *   duration     – total duration in seconds (null/0 when unknown)
 *   brandColor   – accent color string
 *   isDark       – boolean
 *   disabled     – boolean
 *   onChange     – callback({ enabled, mode, trimStart, trimEnd, segments, removals })
 */
export default function AudioCutSection({ duration: durationProp, brandColor, isDark, disabled, onChange, mediaType = 'audio' }) {
  const { t } = useI18n()
  const dur = durationProp || 0
  const maxDur = Math.max(dur, 1)

  const textColor = isDark ? '#fff' : '#111'
  const mutedColor = isDark ? '#888' : '#666'
  const railBase = isDark ? '#444' : '#ddd'
  const cutZoneColor = isDark ? 'rgba(220,80,80,0.65)' : 'rgba(200,50,50,0.55)'
  const dividerColor = isDark ? '#2a2a2a' : '#e8e8e8'

  // ── State ──────────────────────────────────────────────────────────────────
  const [enabled, setEnabledState] = React.useState(false)
  const [mode, setModeState] = React.useState('remove') // remove | keep
  const [trimStart, setTrimStartState] = React.useState(0)
  const [trimEnd, setTrimEndState] = React.useState(maxDur)
  const [cuts, setCutsState] = React.useState([]) // [{ id, start, end }]
  const nextCutIdRef = React.useRef(1)

  // Per-field string states for the time inputs (editable before commit)
  const [trimStartStr, setTrimStartStr] = React.useState('0:00')
  const [trimEndStr, setTrimEndStr] = React.useState(formatTime(maxDur))
  const [cutStrs, setCutStrs] = React.useState({}) // { [id]: { startStr, endStr } }

  // Sync trim range when duration becomes available / changes.
  React.useEffect(() => {
    if (dur <= 0) {
      setTrimStartState(0)
      setTrimEndState(1)
      setTrimStartStr('0:00')
      setTrimEndStr('0:00')
      setCutsState([])
      setCutStrs({})
      return
    }

    setTrimStartState(prev => {
      const upper = Math.max(dur - 1, 0)
      return Math.max(0, Math.min(prev, upper))
    })

    setTrimEndState(prev => {
      const lower = 1
      const next = Math.max(lower, Math.min(prev || dur, dur))
      return next
    })
  }, [dur])

  // ── Helpers ────────────────────────────────────────────────────────────────
  const syncCutStrs = React.useCallback((newCuts) => {
    setCutStrs(
      Object.fromEntries(newCuts.map(c => [c.id, { startStr: formatTime(c.start), endStr: formatTime(c.end) }]))
    )
  }, [])

  const applyCuts = React.useCallback((nextCuts) => {
    const sorted = [...nextCuts].sort((a, b) => a.start - b.start)
    setCutsState(sorted)
    syncCutStrs(sorted)
  }, [syncCutStrs])

  const clampCutsToTrim = React.useCallback((allCuts, ts, te) => {
    const clampedEnd = Math.max(te, ts + 1)
    const sorted = [...allCuts]
      .map(c => {
        const start = Math.max(ts, Math.min(c.start, clampedEnd - 1))
        const end = Math.max(start + 1, Math.min(c.end, clampedEnd))
        return { ...c, start, end }
      })
      .filter(c => c.end > c.start)
      .sort((a, b) => a.start - b.start)

    const nonOverlapping = []
    for (const cut of sorted) {
      const prev = nonOverlapping[nonOverlapping.length - 1]
      if (!prev) {
        nonOverlapping.push(cut)
        continue
      }
      const shiftedStart = Math.max(cut.start, prev.end)
      if (cut.end <= shiftedStart) continue
      nonOverlapping.push({ ...cut, start: shiftedStart })
    }

    return nonOverlapping
  }, [])

  const getRemovalZones = React.useCallback((segments, currentMode, ts, te) => {
    const normalized = mergeSegments(
      (segments || [])
        .filter(s => s && typeof s.start === 'number' && typeof s.end === 'number' && s.end > s.start)
        .map(s => ({
          start: Math.max(ts, Math.min(s.start, te - 1)),
          end: Math.max(ts + 1, Math.min(s.end, te)),
        }))
        .filter(s => s.end > s.start)
    )

    if (currentMode === 'keep') {
      return invertSegments(normalized, ts, te)
    }

    return normalized
  }, [])

  const normalizedCuts = React.useMemo(
    () => clampCutsToTrim(cuts, trimStart, trimEnd),
    [cuts, trimStart, trimEnd, clampCutsToTrim]
  )

  const computedRemovals = React.useMemo(
    () => getRemovalZones(normalizedCuts, mode, trimStart, trimEnd),
    [normalizedCuts, mode, trimStart, trimEnd, getRemovalZones]
  )

  const payload = React.useMemo(() => ({
    enabled,
    mode,
    trimStart,
    trimEnd,
    segments: normalizedCuts.map(c => ({ start: c.start, end: c.end })),
    removals: computedRemovals,
  }), [enabled, mode, trimStart, trimEnd, normalizedCuts, computedRemovals])

  React.useEffect(() => {
    onChange?.(payload)
  }, [onChange, payload])

  React.useEffect(() => {
    setTrimStartStr(formatTime(trimStart))
    setTrimEndStr(formatTime(trimEnd))
  }, [trimStart, trimEnd])

  React.useEffect(() => {
    const clamped = clampCutsToTrim(cuts, trimStart, trimEnd)
    const changed =
      clamped.length !== cuts.length ||
      clamped.some((c, i) => !cuts[i] || c.id !== cuts[i].id || c.start !== cuts[i].start || c.end !== cuts[i].end)
    if (changed) {
      applyCuts(clamped)
    }
  }, [cuts, trimStart, trimEnd, clampCutsToTrim, applyCuts])

  const updateCutById = (id, updater) => {
    const idx = cuts.findIndex(c => c.id === id)
    if (idx === -1) return

    const lowerBound = idx > 0 ? cuts[idx - 1].end : trimStart
    const upperBound = idx < cuts.length - 1 ? cuts[idx + 1].start : trimEnd

    const current = cuts[idx]
    const next = updater(current, { lowerBound, upperBound })

    const clampedStart = Math.max(lowerBound, Math.min(next.start, upperBound - 1))
    const clampedEnd = Math.max(clampedStart + 1, Math.min(next.end, upperBound))

    const updatedCuts = cuts.map(c => {
      if (c.id !== id) return c
      return { ...c, start: clampedStart, end: clampedEnd }
    })
    applyCuts(updatedCuts)
  }

  // ── Toggle ─────────────────────────────────────────────────────────────────
  const toggleEnabled = () => {
    setEnabledState(prev => !prev)
  }

  // ── Trim slider ────────────────────────────────────────────────────────────
  const handleTrimSlider = (_, val) => {
    const [s, e] = val
    const newStart = Math.max(0, Math.min(s, e - 1))
    const newEnd = Math.max(newStart + 1, e)

    setTrimStartState(newStart)
    setTrimEndState(newEnd)
    setTrimStartStr(formatTime(newStart))
    setTrimEndStr(formatTime(newEnd))

    const clamped = clampCutsToTrim(cuts, newStart, newEnd)
    applyCuts(clamped)
  }

  const commitTrimStart = (str) => {
    const v = parseTime(str, maxDur)
    const clamped = Math.min(v, trimEnd - 1)
    setTrimStartState(clamped)
    setTrimStartStr(formatTime(clamped))
    applyCuts(clampCutsToTrim(cuts, clamped, trimEnd))
  }

  const commitTrimEnd = (str) => {
    const v = parseTime(str, maxDur)
    const clamped = Math.max(v, trimStart + 1)
    setTrimEndState(clamped)
    setTrimEndStr(formatTime(clamped))
    applyCuts(clampCutsToTrim(cuts, trimStart, clamped))
  }

  // ── Per-cut slider / input commit ─────────────────────────────────────────
  const handleCutSlider = (id, values) => {
    if (!Array.isArray(values)) return
    const [start, end] = values
    updateCutById(id, () => ({ start, end }))
  }

  const commitCutStart = (id, str) => {
    const v = parseTime(str, maxDur)
    updateCutById(id, (current, { lowerBound, upperBound }) => ({
      start: Math.max(lowerBound, Math.min(v, upperBound - 1)),
      end: current.end,
    }))
  }

  const commitCutEnd = (id, str) => {
    const v = parseTime(str, maxDur)
    updateCutById(id, (current, { lowerBound, upperBound }) => ({
      start: current.start,
      end: Math.max(lowerBound + 1, Math.min(v, upperBound)),
    }))
  }

  const getLargestGap = React.useCallback(() => {
    const gaps = []
    let prev = trimStart
    for (const c of cuts) {
      if (c.start > prev) gaps.push({ from: prev, to: c.start })
      prev = c.end
    }
    if (prev < trimEnd) gaps.push({ from: prev, to: trimEnd })

    return gaps.reduce(
      (a, b) => (b.to - b.from > a.to - a.from ? b : a),
      { from: trimStart, to: trimStart }
    )
  }, [cuts, trimStart, trimEnd])

  const canAddCut = React.useMemo(() => {
    if (dur === 0) return false
    const best = getLargestGap()
    return (best.to - best.from) >= 2
  }, [dur, getLargestGap])

  // ── Add cut ────────────────────────────────────────────────────────────────
  const addCut = () => {
    if (dur === 0 || disabled) return
    // Pick the largest free gap inside the trim range.
    const best = getLargestGap()
    if (best.to - best.from < 2) return

    const gapSize = best.to - best.from
    const cutStart = Math.floor(best.from + gapSize * 0.3)
    const cutEnd = Math.max(Math.ceil(best.from + gapSize * 0.7), cutStart + 1)

    const id = `cut-${nextCutIdRef.current++}`
    const newCuts = [...cuts, { id, start: cutStart, end: cutEnd }].sort((a, b) => a.start - b.start)
    applyCuts(newCuts)
  }

  const removeCut = (id) => {
    const newCuts = cuts.filter(c => c.id !== id)
    applyCuts(newCuts)
  }

  // ── Gradients ──────────────────────────────────────────────────────────────
  const trimRailGradient = buildRailGradient(computedRemovals, 0, maxDur, railBase, cutZoneColor)
  const modeLabel = mediaType === 'video' ? t('downloader.cutVideo') : t('downloader.cutAudio')
  const modeDesc =
    mediaType === 'video'
      ? t('downloader.cutEnabledDescVideo')
      : t('downloader.cutEnabledDescAudio')

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Box>
      {/* Enable toggle */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 700, color: textColor }}>
            {t('downloader.cutEnabled')}
          </Typography>
          <Typography variant="caption" sx={{ color: mutedColor, lineHeight: 1 }}>
            {modeDesc}
          </Typography>
        </Box>
        <Box
          onClick={() => !disabled && toggleEnabled()}
          sx={{
            width: 40, height: 22, borderRadius: 12,
            bgcolor: enabled ? brandColor : (isDark ? '#444' : '#ccc'),
            position: 'relative',
            cursor: disabled ? 'default' : 'pointer',
            transition: 'background-color 0.2s',
            flexShrink: 0,
          }}
        >
          <Box sx={{
            width: 18, height: 18, borderRadius: '50%', bgcolor: '#fff',
            position: 'absolute', top: 2, left: enabled ? 20 : 2,
            transition: 'left 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
          }} />
        </Box>
      </Box>

      {/* Expanded cut UI */}
      {enabled && (
        <Box sx={{ mt: 2 }}>
          {/* ── Mode toggle ── */}
          <Typography variant="caption" sx={{
            fontWeight: 700, color: mutedColor,
            textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.68rem',
          }}>
            {modeLabel}
          </Typography>

          <Box sx={{ display: 'flex', gap: 0.75, mt: 0.5 }}>
            <Box
              onClick={() => !disabled && setModeState('remove')}
              sx={makeModeButtonSx({ active: mode === 'remove', isDark, brandColor, disabled })}
            >
              {t('downloader.cutModeRemove')}
            </Box>
            <Box
              onClick={() => !disabled && setModeState('keep')}
              sx={makeModeButtonSx({ active: mode === 'keep', isDark, brandColor, disabled })}
            >
              {t('downloader.cutModeKeep')}
            </Box>
          </Box>

          {/* ── Keep / Trim range ── */}
          <Typography variant="caption" sx={{
            fontWeight: 700, color: mutedColor,
            textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.68rem',
            mt: 1.5,
            display: 'inline-block',
          }}>
            {t('downloader.cutKeepRange')}
          </Typography>

          <Box sx={{ px: 0.5, mt: 0.5 }}>
            <Slider
              value={[trimStart, Math.max(trimEnd, trimStart + 1)]}
              min={0}
              max={maxDur}
              step={1}
              disabled={disabled || dur === 0}
              disableSwap
              onChange={handleTrimSlider}
              sx={makeSliderSx(brandColor, trimRailGradient)}
            />
          </Box>

          <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.25 }}>
            <TimeField
              label={t('downloader.cutStart')}
              value={trimStartStr}
              onChange={setTrimStartStr}
              onCommit={commitTrimStart}
              isDark={isDark}
              disabled={disabled || dur === 0}
              textColor={textColor}
            />
            <TimeField
              label={t('downloader.cutEnd')}
              value={trimEndStr}
              onChange={setTrimEndStr}
              onCommit={commitTrimEnd}
              isDark={isDark}
              disabled={disabled || dur === 0}
              textColor={textColor}
            />
          </Box>

          {/* ── Per-cut sliders ── */}
          {cuts.length > 0 && (
            <Box sx={{ mt: 1.5, pt: 1.5, borderTop: `1px solid ${dividerColor}` }}>
              <Typography variant="caption" sx={{
                fontWeight: 700, color: mutedColor,
                textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.68rem',
              }}>
                {mode === 'keep' ? t('downloader.cutModeKeep') : t('downloader.cutRemoveSections')}
              </Typography>

              {/* Per-cut time inputs */}
              {cuts.map((cut, idx) => {
                const strs = cutStrs[cut.id] || { startStr: formatTime(cut.start), endStr: formatTime(cut.end) }
                const others = cuts.filter(c => c.id !== cut.id)
                const otherRemovals = getRemovalZones(others, mode, trimStart, trimEnd)
                const railGradient = buildRailGradient(
                  otherRemovals,
                  trimStart,
                  Math.max(trimEnd, trimStart + 1),
                  railBase,
                  cutZoneColor
                )
                return (
                  <Box key={cut.id} sx={{ mt: 1.25 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                      <Typography variant="caption" sx={{
                        fontWeight: 700, color: mutedColor,
                        textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.68rem',
                      }}>
                        {t('downloader.cutSegmentLabel', { n: idx + 1 })}
                      </Typography>
                      <Box
                        onClick={() => !disabled && removeCut(cut.id)}
                        sx={{
                          cursor: disabled ? 'default' : 'pointer',
                          color: isDark ? '#666' : '#aaa',
                          display: 'flex',
                          alignItems: 'center',
                          '&:hover': { color: isDark ? '#ccc' : '#555' },
                        }}
                      >
                        <X size={13} />
                      </Box>
                    </Box>

                    <Box sx={{ px: 0.5, mt: 0.25 }}>
                      <Slider
                        value={[cut.start, cut.end]}
                        min={trimStart}
                        max={Math.max(trimEnd, trimStart + 1)}
                        step={1}
                        disableSwap
                        disabled={disabled || dur === 0}
                        onChange={(_, value) => handleCutSlider(cut.id, value)}
                        valueLabelDisplay="auto"
                        valueLabelFormat={(v, i) => `${i % 2 === 1 ? t('downloader.cutEnd') : t('downloader.cutStart')}: ${formatTime(v)}`}
                        sx={makeSliderSx(brandColor, railGradient, true)}
                      />
                    </Box>

                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <TimeField
                        label={t('downloader.cutStart')}
                        value={strs.startStr}
                        onChange={v => setCutStrs(prev => ({ ...prev, [cut.id]: { ...prev[cut.id], startStr: v } }))}
                        onCommit={v => commitCutStart(cut.id, v)}
                        isDark={isDark}
                        disabled={disabled || dur === 0}
                        textColor={textColor}
                      />
                      <TimeField
                        label={t('downloader.cutEnd')}
                        value={strs.endStr}
                        onChange={v => setCutStrs(prev => ({ ...prev, [cut.id]: { ...prev[cut.id], endStr: v } }))}
                        onCommit={v => commitCutEnd(cut.id, v)}
                        isDark={isDark}
                        disabled={disabled || dur === 0}
                        textColor={textColor}
                      />
                    </Box>
                  </Box>
                )
              })}
            </Box>
          )}

          {/* ── Add cut button ── */}
          <Box
            onClick={() => !disabled && dur > 0 && addCut()}
            sx={{
              mt: 1.5,
              pt: 1.5,
              borderTop: `1px solid ${dividerColor}`,
              display: 'flex',
              alignItems: 'center',
              gap: 0.75,
              cursor: (disabled || dur === 0 || !canAddCut) ? 'default' : 'pointer',
              color: isDark ? '#777' : '#888',
              opacity: (disabled || dur === 0 || !canAddCut) ? 0.5 : 1,
              userSelect: 'none',
              '&:hover': { color: (disabled || dur === 0 || !canAddCut) ? undefined : (isDark ? '#ccc' : '#444') },
            }}
          >
            <Plus size={13} />
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'inherit', fontSize: '0.78rem' }}>
              {t('downloader.cutAddSegment')}
            </Typography>
          </Box>
        </Box>
      )}
    </Box>
  )
}
