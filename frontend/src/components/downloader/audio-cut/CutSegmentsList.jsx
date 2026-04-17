import React from 'react'
import { Box, Slider, Typography } from '@mui/material'
import { X } from 'lucide-react'
import TimeField from './TimeField'
import { buildRailGradient, formatTime } from './utils'
import { makeSliderSx } from './styles'

export default function CutSegmentsList({
  cuts,
  cutStrs,
  setCutStrs,
  mode,
  isDark,
  brandColor,
  disabled,
  dur,
  trimStart,
  trimEnd,
  railBase,
  textColor,
  mutedColor,
  dividerColor,
  handleCutSlider,
  commitCutStart,
  commitCutEnd,
  removeCut,
  getRemovalZones,
  t,
}) {
  if (cuts.length === 0) return null

  const maxSeconds = Math.max(dur || 0, 1)
  const otherRemovalColor = isDark ? 'rgba(255,70,70,0.96)' : 'rgba(194,35,35,0.92)'
  const sliderRailBase = isDark ? '#393c41' : '#d8dce3'
  const sliderTrackColor = isDark ? 'rgba(236,240,246,0.38)' : 'rgba(27,34,45,0.28)'

  return (
    <Box sx={{ mt: 1.5, pt: 1.5, borderTop: `1px solid ${dividerColor}` }}>
      <Typography
        variant="caption"
        sx={{
          fontWeight: 700,
          color: mutedColor,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          fontSize: '0.68rem',
        }}
      >
        {mode === 'keep' ? t('downloader.cutModeKeep') : t('downloader.cutRemoveSections')}
      </Typography>

      {cuts.map((cut, idx) => {
        const strs = cutStrs[cut.id] || { startStr: formatTime(cut.start), endStr: formatTime(cut.end) }
        const others = cuts.filter((c) => c.id !== cut.id)
        const otherRemovals = others.length > 0
          ? getRemovalZones(others, mode, trimStart, trimEnd)
          : []
        const railGradient = buildRailGradient(
          otherRemovals,
          trimStart,
          Math.max(trimEnd, trimStart + 1),
          sliderRailBase,
          otherRemovalColor
        )

        return (
          <Box key={cut.id} sx={{ mt: 1.25 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 700,
                  color: mutedColor,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  fontSize: '0.68rem',
                }}
              >
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
                sx={makeSliderSx(brandColor, railGradient, true, 0.76, sliderTrackColor)}
              />
            </Box>

            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <TimeField
                label={t('downloader.cutStart')}
                value={strs.startStr}
                onChange={(v) => setCutStrs((prev) => ({ ...prev, [cut.id]: { ...prev[cut.id], startStr: v } }))}
                onCommit={(v) => commitCutStart(cut.id, v)}
                maxSeconds={maxSeconds}
                isDark={isDark}
                disabled={disabled || dur === 0}
                textColor={textColor}
              />
              <TimeField
                label={t('downloader.cutEnd')}
                value={strs.endStr}
                onChange={(v) => setCutStrs((prev) => ({ ...prev, [cut.id]: { ...prev[cut.id], endStr: v } }))}
                onCommit={(v) => commitCutEnd(cut.id, v)}
                maxSeconds={maxSeconds}
                isDark={isDark}
                disabled={disabled || dur === 0}
                textColor={textColor}
              />
            </Box>
          </Box>
        )
      })}
    </Box>
  )
}
