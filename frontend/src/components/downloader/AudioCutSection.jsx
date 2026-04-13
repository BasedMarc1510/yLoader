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

/** Shared MUI Slider sx factory */
const makeSliderSx = (brandColor, railGradient) => ({
  color: brandColor,
  py: '10px',
  '& .MuiSlider-thumb': {
    width: 14,
    height: 14,
    bgcolor: brandColor,
    '&:hover, &.Mui-focusVisible': { boxShadow: `0 0 0 6px ${brandColor}33` },
    '&.Mui-active': { boxShadow: `0 0 0 10px ${brandColor}26` },
  },
  '& .MuiSlider-track': { bgcolor: brandColor, opacity: 0.85, height: 4, border: 'none' },
  '& .MuiSlider-rail': {
    background: railGradient,
    opacity: 1,
    height: 4,
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
 *   kind         – 'audio' | 'video' (affects helper text)
 *   onChange     – callback({ enabled, trimStart, trimEnd, removals: [{start, end}] })
 */
export default function AudioCutSection({ duration: durationProp, brandColor, isDark, disabled, kind = 'audio', onChange }) {
  const { t } = useI18n()
  const dur = durationProp || 0

  const textColor = isDark ? '#fff' : '#111'
  const mutedColor = isDark ? '#888' : '#666'
  const railBase = isDark ? '#444' : '#ddd'
  const cutZoneColor = isDark ? 'rgba(220,80,80,0.65)' : 'rgba(200,50,50,0.55)'
  const dividerColor = isDark ? '#2a2a2a' : '#e8e8e8'

  // ── State ──────────────────────────────────────────────────────────────────
  const [enabled, setEnabledState] = React.useState(false)
  const [trimStart, setTrimStartState] = React.useState(0)
  const [trimEnd, setTrimEndState] = React.useState(dur)
  const [cuts, setCutsState] = React.useState([]) // [{ id, start, end }]

  // Per-field string states for the time inputs (editable before commit)
  const [trimStartStr, setTrimStartStr] = React.useState('0:00')
  const [trimEndStr, setTrimEndStr] = React.useState(formatTime(dur))
  const [cutStrs, setCutStrs] = React.useState({}) // { [id]: { startStr, endStr } }

  const MIN_CUT_LENGTH = 1
  const cutDescriptionKey = kind === 'video' ? 'downloader.cutEnabledDescVideo' : 'downloader.cutEnabledDesc'

  // Sync trimEnd when duration first becomes available / changes
  React.useEffect(() => {
    if (dur > 0) {
      setTrimEndState(dur)
      setTrimEndStr(formatTime(dur))
    }
  }, [dur])

  // ── Reporting ──────────────────────────────────────────────────────────────
  const report = React.useCallback((en, ts, te, c) => {
    onChange?.({
      enabled: en,
      trimStart: ts,
      trimEnd: te,
      removals: c.map(x => ({ start: x.start, end: x.end })),
    })
  }, [onChange])

  // ── Helpers ────────────────────────────────────────────────────────────────
  const syncCutStrs = (newCuts) => {
    setCutStrs(
      Object.fromEntries(newCuts.map(c => [c.id, { startStr: formatTime(c.start), endStr: formatTime(c.end) }]))
    )
  }

  const normalizeCuts = (inputCuts, ts, te) => {
    if (!Array.isArray(inputCuts) || te - ts < MIN_CUT_LENGTH) return []

    const sorted = [...inputCuts]
      .filter(x => x && typeof x.start === 'number' && typeof x.end === 'number')
      .map(x => ({
        ...x,
        start: Math.max(ts, Math.min(Math.round(x.start), te - MIN_CUT_LENGTH)),
        end: Math.max(ts + MIN_CUT_LENGTH, Math.min(Math.round(x.end), te)),
      }))
      .sort((a, b) => a.start - b.start || a.end - b.end || String(a.id).localeCompare(String(b.id)))

    const out = []
    let cursor = ts
    for (const c of sorted) {
      let start = Math.max(c.start, cursor)
      let end = Math.max(start + MIN_CUT_LENGTH, c.end)

      if (end > te) {
        end = te
        start = Math.max(cursor, te - MIN_CUT_LENGTH)
      }

      if (end - start < MIN_CUT_LENGTH) continue
      out.push({ ...c, start, end })
      cursor = end
    }
    return out
  }

  const findCutInsertionSlot = (existingCuts, ts, te) => {
    if (te - ts < MIN_CUT_LENGTH) return null

    const gaps = []
    const sorted = normalizeCuts(existingCuts, ts, te)
    let cursor = ts

    for (const c of sorted) {
      if (c.start - cursor >= MIN_CUT_LENGTH) {
        gaps.push({ start: cursor, end: c.start })
      }
      cursor = Math.max(cursor, c.end)
    }

    if (te - cursor >= MIN_CUT_LENGTH) {
      gaps.push({ start: cursor, end: te })
    }

    if (!gaps.length) return null

    const prefLen = Math.max(MIN_CUT_LENGTH, Math.round((te - ts) * 0.1))
    const gap = gaps.find(g => (g.end - g.start) >= prefLen) || gaps[0]
    const span = gap.end - gap.start
    return {
      start: gap.start,
      end: gap.start + Math.min(prefLen, span),
    }
  }

  // ── Toggle ─────────────────────────────────────────────────────────────────
  const toggleEnabled = () => {
    const next = !enabled
    setEnabledState(next)
    report(next, trimStart, trimEnd, cuts)
  }

  // ── Trim slider ────────────────────────────────────────────────────────────
  const handleTrimSlider = (_, val) => {
    const [s, e] = val
    setTrimStartState(s)
    setTrimEndState(e)
    setTrimStartStr(formatTime(s))
    setTrimEndStr(formatTime(e))
    const newCuts = normalizeCuts(cuts, s, e)
    setCutsState(newCuts)
    syncCutStrs(newCuts)
    report(enabled, s, e, newCuts)
  }

  const commitTrimStart = (str) => {
    const v = parseTime(str, dur)
    const clamped = Math.min(v, trimEnd - 1)
    setTrimStartState(clamped)
    setTrimStartStr(formatTime(clamped))
    const newCuts = normalizeCuts(cuts, clamped, trimEnd)
    setCutsState(newCuts)
    syncCutStrs(newCuts)
    report(enabled, clamped, trimEnd, newCuts)
  }

  const commitTrimEnd = (str) => {
    const v = parseTime(str, dur)
    const clamped = Math.max(v, trimStart + 1)
    setTrimEndState(clamped)
    setTrimEndStr(formatTime(clamped))
    const newCuts = normalizeCuts(cuts, trimStart, clamped)
    setCutsState(newCuts)
    syncCutStrs(newCuts)
    report(enabled, trimStart, clamped, newCuts)
  }

  // ── Multi-range cut slider ─────────────────────────────────────────────────
  const handleCutsSlider = (_, val, activeThumb) => {
    if (!Array.isArray(val) || cuts.length === 0) return

    const next = [...val]
    if (next.length !== cuts.length * 2) return

    if (typeof activeThumb === 'number') {
      const leftNeighbor = activeThumb > 0 ? next[activeThumb - 1] : trimStart
      const rightNeighbor = activeThumb < next.length - 1 ? next[activeThumb + 1] : trimEnd
      const isStartThumb = activeThumb % 2 === 0

      if (isStartThumb) {
        next[activeThumb] = Math.max(leftNeighbor, Math.min(next[activeThumb], rightNeighbor - MIN_CUT_LENGTH))
      } else {
        next[activeThumb] = Math.max(leftNeighbor + MIN_CUT_LENGTH, Math.min(next[activeThumb], rightNeighbor))
      }
    }

    const mapped = cuts.map((c, i) => ({ ...c, start: next[i * 2], end: next[i * 2 + 1] }))
    const normalized = normalizeCuts(mapped, trimStart, trimEnd)
    setCutsState(normalized)
    syncCutStrs(normalized)
    report(enabled, trimStart, trimEnd, normalized)
  }

  const commitCutStart = (id, str) => {
    const idx = cuts.findIndex(c => c.id === id)
    if (idx < 0) return

    const cut = cuts[idx]
    const leftNeighbor = idx > 0 ? cuts[idx - 1].end : trimStart
    const v = parseTime(str, trimEnd)
    const clamped = Math.max(leftNeighbor, Math.min(v, cut.end - MIN_CUT_LENGTH))
    const newCuts = normalizeCuts(cuts.map(c => c.id === id ? { ...c, start: clamped } : c), trimStart, trimEnd)
    setCutsState(newCuts)
    syncCutStrs(newCuts)
    report(enabled, trimStart, trimEnd, newCuts)
  }

  const commitCutEnd = (id, str) => {
    const idx = cuts.findIndex(c => c.id === id)
    if (idx < 0) return

    const cut = cuts[idx]
    const rightNeighbor = idx < cuts.length - 1 ? cuts[idx + 1].start : trimEnd
    const v = parseTime(str, trimEnd)
    const clamped = Math.max(cut.start + MIN_CUT_LENGTH, Math.min(v, rightNeighbor))
    const newCuts = normalizeCuts(cuts.map(c => c.id === id ? { ...c, end: clamped } : c), trimStart, trimEnd)
    setCutsState(newCuts)
    syncCutStrs(newCuts)
    report(enabled, trimStart, trimEnd, newCuts)
  }

  const addCut = () => {
    const slot = findCutInsertionSlot(cuts, trimStart, trimEnd)
    if (!slot) return
    const { start: newStart, end: newEnd } = slot
    const id = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
    const newCuts = normalizeCuts([...cuts, { id, start: newStart, end: newEnd }], trimStart, trimEnd)
    setCutsState(newCuts)
    syncCutStrs(newCuts)
    report(enabled, trimStart, trimEnd, newCuts)
  }

  const removeCut = (id) => {
    const newCuts = cuts.filter(c => c.id !== id)
    setCutsState(newCuts)
    syncCutStrs(newCuts)
    report(enabled, trimStart, trimEnd, newCuts)
  }

  // ── Gradients ──────────────────────────────────────────────────────────────
  const trimRailGradient = buildRailGradient(cuts, 0, Math.max(dur, 1), railBase, cutZoneColor)
  const cutsRailGradient = buildRailGradient(cuts, trimStart, Math.max(trimEnd, trimStart + 1), railBase, cutZoneColor)
  const cutsSliderValue = cuts.flatMap(c => [c.start, c.end])
  const canAddCut = Boolean(findCutInsertionSlot(cuts, trimStart, trimEnd))

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
            {t(cutDescriptionKey)}
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
          {/* ── Keep / Trim range ── */}
          <Typography variant="caption" sx={{
            fontWeight: 700, color: mutedColor,
            textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.68rem',
          }}>
            {t('downloader.cutKeepRange')}
          </Typography>

          <Box sx={{ px: 0.5, mt: 0.5 }}>
            <Slider
              value={[trimStart, Math.max(trimEnd, trimStart + 1)]}
              min={0}
              max={Math.max(dur, 1)}
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

          {/* ── Individual removal cuts ── */}
          {cuts.length > 0 && (
            <Box sx={{ mt: 1.5, pt: 1.5, borderTop: `1px solid ${dividerColor}` }}>
              <Box sx={{ px: 0.5 }}>
                <Slider
                  value={cutsSliderValue}
                  min={trimStart}
                  max={Math.max(trimEnd, trimStart + 1)}
                  step={1}
                  disabled={disabled || dur === 0}
                  disableSwap
                  track={false}
                  onChange={handleCutsSlider}
                  sx={makeSliderSx(brandColor, cutsRailGradient)}
                />
              </Box>
            </Box>
          )}

          {cuts.map((cut, idx) => {
            const strs = cutStrs[cut.id] || { startStr: formatTime(cut.start), endStr: formatTime(cut.end) }

            return (
              <Box
                key={cut.id}
                sx={{ mt: 1.25, pt: 1.25, borderTop: `1px solid ${dividerColor}` }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.25 }}>
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

                <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.25 }}>
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
