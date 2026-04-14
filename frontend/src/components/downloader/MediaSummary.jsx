import React from 'react'
import { Box, Skeleton, Typography, useTheme } from '@mui/material'
import { useI18n } from '../../providers/I18nProvider'

export default function MediaSummary({ thumbnail, title, author, duration, url, loading = false }) {
  const { t } = useI18n()
  const theme = useTheme()
  const interactive = !loading && Boolean(url)

  const handleClick = () => {
    if (!interactive) return
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  }

  return (
    <Box
      onClick={handleClick}
      sx={(t) => ({
        display: 'flex',
        gap: 1.5,
        p: 1.25,
        borderRadius: 1,
        bgcolor: t.palette.mode === 'dark' ? '#0a0a0a' : '#e8e8e8',
        boxShadow: t.palette.mode === 'dark' ? '0 2px 4px rgba(0, 0, 0, 0.2)' : '0 2px 4px rgba(0, 0, 0, 0.08)',
        cursor: interactive ? 'pointer' : 'default',
        opacity: loading ? 0.78 : 1,
        '&:hover': interactive
          ? {
              bgcolor: t.palette.mode === 'dark' ? '#0d0d0d' : '#f0f0f0',
            }
          : undefined,
      })}>
      <Box sx={{
        position: 'relative',
        width: 140,
        borderRadius: 0.75,
        overflow: 'hidden',
        flex: '0 0 auto',
        bgcolor: 'black',
        display: 'flex',
        aspectRatio: '16/9',
      }}>
        {loading ? (
          <Skeleton variant="rectangular" width="100%" height="100%" animation="wave" sx={{ borderRadius: 0.75 }} />
        ) : thumbnail ? (
          <Box component="img" src={thumbnail} alt={title || t('mediaSummary.thumbnailAlt')} sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', borderRadius: 0.75 }} />
        ) : (
          <Box sx={{ width: '100%', height: '100%', bgcolor: 'grey.800' }} />
        )}
        {loading ? (
          <Box sx={{
            position: 'absolute',
            right: 4,
            bottom: 4,
          }}>
            <Skeleton variant="rounded" width={46} height={18} animation="wave" sx={{ borderRadius: 0.75 }} />
          </Box>
        ) : duration && (
          <Box sx={{
            position: 'absolute',
            right: 4,
            bottom: 4,
            px: '6px',
            py: '6px',
            borderRadius: 0.75,
            bgcolor: 'rgba(0,0,0,0.7)',
            display: 'inline-flex',
            alignItems: 'center',
            height: 'fit-content',
            lineHeight: 1,
          }}>
            <Typography
              variant="caption"
              component="span"
              sx={{
                color: '#fff',
                fontWeight: 700,
                fontSize: '0.72rem', // minimal kleiner für noch kompaktere Höhe
                lineHeight: 1,
                display: 'inline',
                p: 0,
                m: 0,
              }}
            >
              {duration}
            </Typography>
          </Box>
        )}
      </Box>
      <Box sx={{ minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', flex: 1 }}>
        {loading ? (
          <>
            <Skeleton variant="text" animation="wave" width="92%" height={28} />
            <Skeleton variant="text" animation="wave" width="64%" height={22} sx={{ mt: 0.4 }} />
          </>
        ) : (
          <>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, color: theme.palette.mode === 'dark' ? '#f1f1f1' : theme.palette.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', lineHeight: 1.2 }} title={title}>
              {title || t('mediaSummary.emptyValue')}
            </Typography>
            <Typography variant="body2" sx={{ color: theme.palette.mode === 'dark' ? '#c9cacd' : theme.palette.text.secondary, fontWeight: 700, mt: 0.5 }} noWrap>{author || t('mediaSummary.emptyValue')}</Typography>
          </>
        )}
      </Box>
    </Box>
  )
}
