import React from 'react'
import { Box, Checkbox, FormControlLabel, Typography } from '@mui/material'

export default function VideoCompatibilityOption({ checked, onChange, disabled, i18nT }) {
  const descriptionId = React.useId()
  return (
    <Box sx={{ mt: 1 }}>
      <FormControlLabel
        sx={{ ml: 0, mr: 0 }}
        control={(
          <Checkbox
            checked={checked}
            onChange={(event) => onChange(event.target.checked)}
            disabled={disabled}
            inputProps={{ 'aria-describedby': descriptionId }}
          />
        )}
        label={i18nT('downloader.maximumCompatibility')}
      />
      <Typography id={descriptionId} variant="body2" color="text.secondary" sx={{ ml: 5.5 }}>
        {i18nT('downloader.maximumCompatibilityHelp')}
      </Typography>
    </Box>
  )
}
