export const makeSliderSx = (brandColor, railGradient, trackVisible = true, trackOpacity = 0.85) => ({
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
    ? { bgcolor: brandColor, opacity: trackOpacity, height: 4, border: 'none' }
    : { display: 'none' },
  '& .MuiSlider-rail': {
    background: railGradient,
    opacity: 1,
    height: 4,
  },
})

export const makeModeButtonSx = ({ active, isDark, brandColor, disabled }) => ({
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
