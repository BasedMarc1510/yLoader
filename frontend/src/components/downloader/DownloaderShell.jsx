import React from 'react'
import { Box, Paper, Skeleton } from '@mui/material'
import DownloaderHeader from './DownloaderHeader'
import MediaSummary from './MediaSummary'
import OptionsTabs from './OptionsTabs'
import { useI18n } from '../../providers/I18nProvider'

function DownloaderOptionsSkeleton() {
  return (
    <>
      <Box
        sx={(t) => ({
          margin: t.spacing(1.5, 1.5, 0, 1.5),
          padding: t.spacing(1.5),
          borderRadius: '12px 12px 0 0',
          bgcolor: t.palette.mode === 'dark' ? '#0a0a0a' : '#f0f0f0',
          display: 'flex',
          gap: t.spacing(1),
        })}
      >
        <Skeleton variant="rounded" animation="wave" height={48} sx={{ flex: 1, borderRadius: '28px' }} />
        <Skeleton variant="rounded" animation="wave" height={48} sx={{ flex: 1, borderRadius: '28px' }} />
        <Skeleton variant="circular" animation="wave" width={48} height={48} />
      </Box>

      <Box
        sx={(t) => ({
          margin: t.spacing(0, 1.5, 1.5, 1.5),
          padding: t.spacing(1.25, 1.5, 1.5, 1.5),
          borderRadius: '0 0 12px 12px',
          bgcolor: t.palette.mode === 'dark' ? '#0a0a0a' : '#f0f0f0',
          minHeight: 160,
        })}
      >
        <Skeleton variant="text" animation="wave" width="78%" height={30} />
        <Skeleton variant="text" animation="wave" width="52%" height={26} sx={{ mt: 0.4 }} />
        <Skeleton variant="rounded" animation="wave" width="100%" height={44} sx={{ mt: 1.25 }} />
        <Skeleton variant="rounded" animation="wave" width="100%" height={44} sx={{ mt: 1 }} />
      </Box>
    </>
  )
}

export default function DownloaderShell({ brand, meta, onClose, serviceKey, onFetchError, onDownloadStateChange, loadingState = false }) {
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
        transition: 'opacity 140ms ease, filter 140ms ease',
        opacity: loadingState ? 0.86 : 1,
        filter: loadingState ? 'saturate(0.35)' : 'none',
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
          {loadingState ? (
            <Box sx={{ mt: 0.5, pointerEvents: 'none' }}>
              <DownloaderOptionsSkeleton />
            </Box>
          ) : (
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
                onDownloadStateChange={onDownloadStateChange}
              />
            </Box>
          )}
        </Box>
      </Paper>
    </Box>
  )
}
