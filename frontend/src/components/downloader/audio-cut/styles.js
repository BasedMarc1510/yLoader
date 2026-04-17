export const makeSliderSx = (brandColor, railGradient, trackVisible = true, trackOpacity = 0.85, trackColor = brandColor) => ({
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
    ? { bgcolor: trackColor, opacity: trackOpacity, height: 4, border: 'none' }
    : { display: 'none' },
  '& .MuiSlider-rail': {
    background: railGradient,
    opacity: 1,
    height: 4,
  },
})
