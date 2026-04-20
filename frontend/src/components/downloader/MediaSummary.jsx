import React from 'react'
import { Box, Skeleton, Typography, useTheme } from '@mui/material'
import { Link2 } from 'lucide-react'
import { useI18n } from '../../providers/I18nProvider'

export default function MediaSummary({ thumbnail, title, author, duration, url, loading = false, durationLoading = false }) {
  const { t } = useI18n()
  const theme = useTheme()
  const interactive = !loading && Boolean(url)
  const skeletonSx = React.useMemo(() => ({
    bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
    '&::after': {
      background: theme.palette.mode === 'dark'
        ? 'linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)'
        : 'linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent)',
    },
  }), [theme.palette.mode])
  const durationSkeletonSx = React.useMemo(() => ({
    bgcolor: 'rgba(0,0,0,0.88)',
    border: '1px solid rgba(255,255,255,0.18)',
    boxShadow: '0 1px 2px rgba(0,0,0,0.4)',
    '&::after': {
      background: 'linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.42), rgba(255,255,255,0))',
    },
  }), [])

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
        borderRadius: '12px',
        bgcolor: t.palette.mode === 'dark' ? '#0a0a0a' : '#f9fafc',
        boxShadow: t.palette.mode === 'dark' ? '0 2px 4px rgba(0, 0, 0, 0.2)' : '0 1px 3px rgba(0,0,0,0.04)',
        border: t.palette.mode === 'dark' ? '1px solid transparent' : '1px solid #e2e4e8',
        cursor: interactive ? 'pointer' : 'default',
        opacity: loading ? 0.78 : 1,
        transition: 'none',
        '&:hover .yl-media-thumb-overlay': interactive
          ? { display: 'flex' }
          : undefined,
        '&:hover .yl-media-duration-chip': interactive
          ? { display: 'none' }
          : undefined,
        '&:hover': interactive
          ? {
              bgcolor: t.palette.mode === 'dark' ? '#0d0d0d' : '#ffffff',
              boxShadow: t.palette.mode === 'dark' ? undefined : '0 2px 8px rgba(0, 0, 0, 0.04)',
              borderColor: t.palette.mode === 'dark' ? undefined : '#e2e2e4',
            }
          : undefined,
      })}>
      <Box sx={{
        position: 'relative',
        width: 140,
        borderRadius: 0.75,
        overflow: 'hidden',
        flex: '0 0 auto',
        bgcolor: loading ? 'transparent' : 'black',
        display: 'flex',
        aspectRatio: '16/9',
      }}>
        {loading ? (
          <Skeleton variant="rectangular" width="100%" height="100%" animation="wave" sx={{ ...skeletonSx, borderRadius: 0.75 }} />
        ) : thumbnail ? (
          <Box component="img" src={thumbnail} alt={title || t('mediaSummary.thumbnailAlt')} sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', borderRadius: 0.75 }} />
        ) : (
          <Box sx={{ width: '100%', height: '100%', bgcolor: theme.palette.mode === 'dark' ? 'grey.800' : '#e4e5e7' }} />
        )}

        {interactive && (
          <Box
            className="yl-media-thumb-overlay"
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'none',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: 'rgba(0,0,0,0.52)',
              color: '#fff',
              pointerEvents: 'none',
            }}
          >
            <Link2 size={20} />
          </Box>
        )}

        {(loading || durationLoading) ? (
          <Box sx={{
            position: 'absolute',
            right: 4,
            bottom: 4,
          }}>
            <Skeleton variant="rounded" width={52} height={20} animation="wave" sx={{ ...durationSkeletonSx, borderRadius: 0.75 }} />
          </Box>
        ) : duration && (
          <Box
            className="yl-media-duration-chip"
            sx={{
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
            }}
          >
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
            <Skeleton variant="text" animation="wave" width="92%" height={28} sx={skeletonSx} />
            <Skeleton variant="text" animation="wave" width="64%" height={22} sx={{ ...skeletonSx, mt: 0.4 }} />
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
