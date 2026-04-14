import React from 'react'
import { Box, IconButton, Typography, Tooltip, useTheme } from '@mui/material'
import { X } from 'lucide-react'
import ServiceIcon from '../ServiceIcon'
import { useI18n } from '../../providers/I18nProvider'

export default function DownloaderHeader({ icon, title, onClose }) {
  const { t } = useI18n()
  const theme = useTheme()
  
  return (
    <Box sx={(t) => ({
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: t.spacing(1.5, 2),
      height: '56px',
      bgcolor: 'transparent',
    })}>
      <Box sx={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: 2,
        marginLeft: 1,
        height: '100%',
      }}>
        <Box sx={{
          width: '18px',
          height: '18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: theme.palette.mode === 'dark' ? 'white' : theme.palette.text.primary,
        }}>
          <ServiceIcon serviceKey={icon} size={18} title={title} />
        </Box>
        <Typography 
          variant="subtitle1" 
          sx={{ 
            fontWeight: 600,
            color: theme.palette.mode === 'dark' ? '#FFFFFF' : theme.palette.text.primary,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          {title}
        </Typography>
      </Box>
      <Tooltip title={t('downloader.close')}>
        <IconButton
          onClick={onClose}
          size="small"
          sx={(t) => ({
            color: t.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.6)',
            mr: 0.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            '&:hover': {
              color: t.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.9)',
            },
          })}
          aria-label={t('downloader.closeAria')}
        >
          <X size={16} />
        </IconButton>
      </Tooltip>
    </Box>
  )
}
