import React from 'react'
import { Box, Checkbox, FormControlLabel, IconButton, Tooltip } from '@mui/material'
import { CircleHelp } from 'lucide-react'

export default function VideoCompatibilityOption({ checked, onChange, disabled, i18nT }) {
  const helpText = i18nT('downloader.maximumCompatibilityHelp')
  return (
    <Box sx={{ mt: 1, display: 'flex', alignItems: 'center' }}>
      <FormControlLabel
        sx={{ ml: 0, mr: 0.5 }}
        control={(
          <Checkbox
            checked={checked}
            onChange={(event) => onChange(event.target.checked)}
            disabled={disabled}
          />
        )}
        label={i18nT('downloader.maximumCompatibility')}
      />
      <Tooltip title={helpText} arrow placement="top" enterTouchDelay={0}>
        <IconButton size="small" aria-label={helpText} sx={{ color: 'text.secondary' }}>
          <CircleHelp size={16} />
        </IconButton>
      </Tooltip>
    </Box>
  )
}
