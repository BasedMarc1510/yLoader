import React from 'react'
import { Box, Paper } from '@mui/material'
import DownloaderHeader from './DownloaderHeader'
import MediaSummary from './MediaSummary'
import OptionsTabs from './OptionsTabs'
import { useI18n } from '../../providers/I18nProvider'

export default function DownloaderShell({ brand, meta, onClose, serviceKey, onFetchError }) {
  const { t } = useI18n()
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
      <Paper elevation={0} sx={(t) => ({
        width: '100%',
        maxWidth: 450,
        borderRadius: 2,
        border: 'none',
        overflow: 'hidden',
        bgcolor: t.palette.mode === 'dark' ? '#181818' : '#ffffff',
        boxShadow: t.palette.mode === 'dark' ? '0 8px 16px rgba(0, 0, 0, 0.2)' : '0 4px 24px rgba(0, 0, 0, 0.06)',
      })}>
        <DownloaderHeader icon={brand.icon} title={t('downloader.title', { service: brand.name })} onClose={onClose} />
        <Box>
          <Box sx={{ m: 1.5, mb: 0.5, mt: 0 }}>
            <MediaSummary thumbnail={meta.thumbnail} title={meta.title} author={meta.author} duration={meta.duration} url={meta.url} />
          </Box>
          <Box sx={{ mt: 0.5 }}>
            <OptionsTabs
              brandColor={brand.yColor}
              videoTitle={meta.title}
              videoAuthor={meta.author}
              videoUrl={meta.url}
              durationSeconds={meta.durationSeconds}
              serviceKey={serviceKey}
              initialFormats={meta.preloadedFormats}
              onFetchError={onFetchError}
            />
          </Box>
        </Box>
      </Paper>
    </Box>
  )
}
