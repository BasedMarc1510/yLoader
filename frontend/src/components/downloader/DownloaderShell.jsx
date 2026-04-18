import React from 'react'
import { Box, Paper } from '@mui/material'
import DownloaderHeader from './DownloaderHeader'
import MediaSummary from './MediaSummary'
import OptionsTabs from './OptionsTabs'
import { useI18n } from '../../providers/I18nProvider'

export default function DownloaderShell({ brand, meta, onClose, serviceKey, onFetchError, onDownloadStateChange, loadingState = false, autostartFormat }) {
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
        boxShadow: t.palette.mode === 'dark' ? '0 8px 16px rgba(0, 0, 0, 0.2)' : '0 4px 24px rgba(0, 0, 0, 0.04), 0 1px 6px rgba(0, 0, 0, 0.02)',
        transition: 'opacity 140ms ease',
        opacity: loadingState ? 0.9 : 1,
      })}>
        <DownloaderHeader icon={brand.icon} title={t('downloader.title', { service: brand.name })} onClose={onClose} />
        <Box>
          <Box sx={{ m: 1.5, mb: 0.5, mt: 0 }}>
            <MediaSummary
              thumbnail={meta.thumbnail}
              title={meta.title}
              author={meta.author}
              duration={meta.duration}
              url={meta.url}
              loading={loadingState}
            />
          </Box>
          <Box sx={{ mt: 0.5 }}>
            <OptionsTabs
              brandColor={brand.yColor}
              videoTitle={meta.title}
              videoAuthor={meta.author}
              videoUrl={meta.url}
              videoThumbnail={meta.thumbnail}
              durationSeconds={meta.durationSeconds}
              serviceKey={serviceKey}
              initialFormats={meta.preloadedFormats}
              onFetchError={onFetchError}
              onDownloadStateChange={onDownloadStateChange}
              loadingState={loadingState}
              autostartFormat={autostartFormat}
              defaultDownloadType={brand.defaultDownloadType}
              disabledDownloadTypes={brand.disabledDownloadTypes}
            />
          </Box>
        </Box>
      </Paper>
    </Box>
  )
}
