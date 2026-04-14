import React from 'react'
import { Box } from '@mui/material'
import { useTheme } from '@mui/material/styles'
import {
  SiYoutube,
  SiReddit,
  SiX,
  SiGoogleearth,
} from '@icons-pack/react-simple-icons'

const SERVICE_ICON_MAP = {
  youtube: SiYoutube,
  reddit: SiReddit,
  x: SiX,
  generic: SiGoogleearth,
}

function getNeutralIconColor(mode) {
  return mode === 'dark' ? '#d1d5db' : '#4b5563'
}

export default function ServiceIcon({ serviceKey = 'generic', size = 18, title, sx }) {
  const theme = useTheme()
  const Icon = SERVICE_ICON_MAP[serviceKey] || SERVICE_ICON_MAP.generic
  const color = getNeutralIconColor(theme.palette.mode)

  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        lineHeight: 0,
        ...sx,
      }}
    >
      <Icon size={size} color={color} title={title} />
    </Box>
  )
}
