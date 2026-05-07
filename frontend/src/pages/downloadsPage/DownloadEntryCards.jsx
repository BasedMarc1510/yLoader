import React from 'react'
import {
  Box,
  Card,
  CardActions,
  CardContent,
  Chip,
  IconButton,
  Skeleton,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material'
import { Link2, MoreVertical } from 'lucide-react'
import ServiceIcon from '../../components/ServiceIcon'

const SEPARATOR_BULLET = '•'

const ThumbnailSurface = React.memo(function ThumbnailSurface({
  thumbnailUrl,
  openUrl,
  alt,
  fallbackIcon,
  fallbackLabel,
  openLabel,
  borderRadius,
  sx,
  isDark,
}) {
  const [failed, setFailed] = React.useState(false)

  React.useEffect(() => {
    setFailed(false)
  }, [thumbnailUrl])

  const hasImage = Boolean(thumbnailUrl) && !failed
  const interactive = Boolean(openUrl)

  return (
    <Box
      component={interactive ? 'a' : 'div'}
      {...(interactive
        ? {
          href: openUrl,
          target: '_blank',
          rel: 'noopener noreferrer',
          'aria-label': openLabel,
        }
        : {
          role: 'img',
          'aria-label': fallbackLabel,
        })}
      sx={(theme) => ({
        position: 'relative',
        display: 'block',
        overflow: 'hidden',
        borderRadius,
        bgcolor: '#000',
        textDecoration: 'none',
        color: 'inherit',
        cursor: interactive ? 'pointer' : 'default',
        '&:hover .yl-downloads-thumb-overlay': interactive
          ? { opacity: 1 }
          : undefined,
        '&:focus-visible': interactive
          ? {
            outline: `2px solid ${theme.palette.primary.main}`,
            outlineOffset: '-2px',
          }
          : undefined,
        ...sx,
      })}
    >
      {hasImage ? (
        <Box
          component="img"
          src={thumbnailUrl}
          alt={alt}
          loading="lazy"
          onError={() => setFailed(true)}
          sx={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
          }}
        />
      ) : (
        <Box
          sx={{
            width: '100%',
            height: '100%',
            display: 'grid',
            placeItems: 'center',
            color: isDark ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.75)',
          }}
        >
          {fallbackIcon}
        </Box>
      )}

      {interactive && (
        <Box
          className="yl-downloads-thumb-overlay"
          sx={{
            position: 'absolute',
            inset: 0,
            opacity: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            bgcolor: 'rgba(0,0,0,0.55)',
            pointerEvents: 'none',
            transition: 'none',
          }}
        >
          <Link2 size={18} />
        </Box>
      )}
    </Box>
  )
})

export function DownloadGridCardSkeleton({ isDark }) {
  const skeletonSx = {
    bgcolor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
    '&::after': {
      background: isDark
        ? 'linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)'
        : 'linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent)',
    },
  }

  return (
    <Card
      elevation={0}
      sx={{
        borderRadius: 1.5,
        border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
        bgcolor: isDark ? '#1d1d1d' : '#fff',
      }}
    >
      <Box sx={{ p: 1, pb: 0.5 }}>
        <Box sx={{ aspectRatio: '16/9', position: 'relative', borderRadius: 1, overflow: 'hidden' }}>
          <Skeleton variant="rectangular" animation="wave" sx={{ ...skeletonSx, position: 'absolute', inset: 0 }} />
        </Box>
      </Box>

      <CardContent sx={{ p: 1.5, pt: 0.75, pb: 1.2 }}>
        <Skeleton variant="text" animation="wave" width="90%" height={30} sx={skeletonSx} />
        <Skeleton variant="rounded" animation="wave" width={162} height={18} sx={{ ...skeletonSx, borderRadius: 0.75 }} />
        <Skeleton variant="text" animation="wave" width="65%" height={18} sx={{ ...skeletonSx, mt: 1 }} />
        <Skeleton variant="text" animation="wave" width="82%" height={18} sx={{ ...skeletonSx }} />
      </CardContent>

      <CardActions sx={{ px: 1.5, pb: 1.35, pt: 0.25, justifyContent: 'space-between' }}>
        <Skeleton variant="rounded" animation="wave" width={112} height={34} sx={{ ...skeletonSx, borderRadius: 1.25 }} />
        <Skeleton variant="rounded" animation="wave" width={34} height={34} sx={{ ...skeletonSx, borderRadius: 1.25 }} />
      </CardActions>
    </Card>
  )
}

export function DownloadListRowSkeleton({ isDark }) {
  const skeletonSx = {
    bgcolor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
    '&::after': {
      background: isDark
        ? 'linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)'
        : 'linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent)',
    },
  }

  return (
    <Card
      elevation={0}
      sx={{
        borderRadius: 1.5,
        border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
        bgcolor: isDark ? '#1d1d1d' : '#fff',
        overflow: 'hidden',
      }}
    >
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { sm: 'center' } }}>
        <Box sx={{ p: 1, pb: { xs: 0.2, sm: 1 }, pr: { xs: 1, sm: 0.2 } }}>
          <Box sx={{ width: { xs: '100%', sm: 160 }, aspectRatio: '16/9', position: 'relative', borderRadius: 1, overflow: 'hidden' }}>
            <Skeleton variant="rectangular" animation="wave" sx={{ ...skeletonSx, position: 'absolute', inset: 0 }} />
          </Box>
        </Box>

        <Box sx={{ flex: 1, minWidth: 0, py: 1.2, pl: { xs: 1, sm: 1.2 }, pr: 1 }}>
          <Skeleton variant="text" animation="wave" width="75%" height={30} sx={skeletonSx} />
          <Skeleton variant="rounded" animation="wave" width={132} height={18} sx={{ ...skeletonSx, borderRadius: 0.75, mt: 0.55 }} />
          <Skeleton variant="text" animation="wave" width="52%" height={18} sx={{ ...skeletonSx, mt: 1 }} />
          <Skeleton variant="text" animation="wave" width="88%" height={18} sx={skeletonSx} />
        </Box>

        <Box sx={{ width: { xs: '100%', sm: 'auto' }, p: 1.2, pt: { xs: 0.2, sm: 1.2 }, display: 'flex', alignItems: 'center', justifyContent: { xs: 'space-between', sm: 'flex-end' }, gap: 1 }}>
          <Skeleton variant="rounded" animation="wave" width={112} height={34} sx={{ ...skeletonSx, borderRadius: 1.25 }} />
          <Skeleton variant="rounded" animation="wave" width={34} height={34} sx={{ ...skeletonSx, borderRadius: 1.25 }} />
        </Box>
      </Box>
    </Card>
  )
}

export const DownloadGridCard = React.memo(function DownloadGridCard({
  entry,
  isDark,
  t,
  onOpenActionsMenu,
}) {
  const statusLabel = entry.cached ? t('downloads.statusCached') : t('downloads.deleted')

  return (
    <Card
      elevation={0}
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 1.5,
        border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
        bgcolor: isDark ? '#1d1d1d' : '#fff',
        opacity: entry.cached ? 1 : 0.85,
        contentVisibility: 'auto',
        containIntrinsicSize: '360px',
        '&:hover': {
          bgcolor: isDark ? '#202020' : '#fff',
        },
      }}
    >
      <Box sx={{ p: 1, pb: 0.5 }}>
        <Box sx={{ position: 'relative', borderRadius: 1, overflow: 'hidden', aspectRatio: '16/9' }}>
          <ThumbnailSurface
            thumbnailUrl={entry.thumbnailUrl}
            openUrl={entry.openUrl}
            openLabel={t('downloads.openSourceVideo')}
            fallbackLabel={t('downloads.noThumbnail')}
            alt={t('downloads.thumbnailAlt', { title: entry.title || '' })}
            fallbackIcon={entry.typeIcon}
            isDark={isDark}
            borderRadius={1}
            sx={{ width: '100%', height: '100%' }}
          />

          <Box
            sx={{
              position: 'absolute',
              top: 8,
              left: 8,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.6,
              px: 0.8,
              py: 0.3,
              borderRadius: 0.75,
              bgcolor: 'rgba(0,0,0,0.62)',
              color: '#fff',
              fontSize: '0.72rem',
              fontWeight: 700,
              lineHeight: 1,
            }}
          >
            {entry.typeIcon}
            <span>{entry.typeLabel}</span>
          </Box>

          {entry.durationLabel && (
            <Box
              sx={{
                position: 'absolute',
                bottom: 8,
                right: 8,
                px: 0.75,
                py: 0.25,
                borderRadius: 0.5,
                bgcolor: 'rgba(0,0,0,0.76)',
                color: '#fff',
                fontSize: '0.75rem',
                fontWeight: 700,
                fontFeatureSettings: '"tnum"',
              }}
            >
              {entry.durationLabel}
            </Box>
          )}
        </Box>
      </Box>

      <CardContent sx={{ flexGrow: 1, p: 1.5, pt: 0.75, pb: 1.2 }}>
        <Tooltip title={entry.title || ''} enterDelay={420}>
          <Typography
            variant="body1"
            fontWeight={700}
            sx={{
              mb: 0.55,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              minHeight: '2.7em',
              lineHeight: 1.35,
            }}
          >
            {entry.title}
          </Typography>
        </Tooltip>

        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.6,
            flexWrap: 'wrap',
          }}
        >
          <ServiceIcon serviceKey={entry.serviceKey} size={14} title={t('sidebar.iconAlt', { name: entry.serviceLabel })} />
          <Typography variant="caption" fontWeight={700} sx={{ lineHeight: 1, color: 'text.secondary' }}>
            {entry.serviceLabel}
          </Typography>
          <Typography variant="caption" sx={{ opacity: 0.5 }}>{SEPARATOR_BULLET}</Typography>
          <Tooltip
            title={entry.timestampTooltip}
            enterDelay={380}
            slotProps={{ tooltip: { sx: { whiteSpace: 'pre-line', maxWidth: 'none' } } }}
          >
            <Typography variant="caption" color="text.secondary" component="span" sx={{ cursor: 'help' }}>
              {entry.shortDate}
            </Typography>
          </Tooltip>
          <Typography
            variant="caption"
            sx={{
              px: 0.6,
              py: 0.2,
              borderRadius: 0.5,
              bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
              fontWeight: 700,
            }}
          >
            {entry.formatLabel}
          </Typography>
        </Box>

        <Typography
          variant="caption"
          color="text.disabled"
          noWrap
          sx={{
            display: 'block',
            mt: 1.35,
            fontFamily: 'monospace',
            fontSize: '0.7rem',
          }}
        >
          {entry.filename}
        </Typography>
      </CardContent>

      <CardActions sx={{ px: 1.5, pb: 1.35, pt: 0.25, justifyContent: 'space-between' }}>
        <Chip
          size="small"
          label={statusLabel}
          variant={entry.cached ? 'outlined' : 'filled'}
          sx={{
            fontWeight: 700,
            borderRadius: 0.75,
            bgcolor: entry.cached ? 'transparent' : (isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.06)'),
            borderColor: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.14)',
            color: 'text.secondary',
          }}
        />

        <Tooltip title={t('downloads.moreActions')}>
          <IconButton
            size="small"
            aria-label={t('downloads.actionsAria')}
            onClick={(event) => onOpenActionsMenu(event, entry.raw)}
            sx={{
              borderRadius: 1.25,
              border: `1px solid ${isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.16)'}`,
              cursor: 'pointer',
            }}
          >
            <MoreVertical size={16} />
          </IconButton>
        </Tooltip>
      </CardActions>
    </Card>
  )
})

export const DownloadListRow = React.memo(function DownloadListRow({
  entry,
  isDark,
  t,
  onOpenActionsMenu,
}) {
  const statusLabel = entry.cached ? t('downloads.statusCached') : t('downloads.deleted')

  return (
    <Card
      elevation={0}
      sx={{
        borderRadius: 1.5,
        border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
        bgcolor: isDark ? '#1d1d1d' : '#fff',
        opacity: entry.cached ? 1 : 0.85,
        overflow: 'hidden',
        contentVisibility: 'auto',
        containIntrinsicSize: '176px',
        '&:hover': {
          bgcolor: isDark ? '#202020' : '#fff',
        },
      }}
    >
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { sm: 'center' } }}>
        <Box sx={{ p: 1, pb: { xs: 0.2, sm: 1 }, pr: { xs: 1, sm: 0.2 } }}>
          <ThumbnailSurface
            thumbnailUrl={entry.thumbnailUrl}
            openUrl={entry.openUrl}
            openLabel={t('downloads.openSourceVideo')}
            fallbackLabel={t('downloads.noThumbnail')}
            alt={t('downloads.thumbnailAlt', { title: entry.title || '' })}
            fallbackIcon={entry.typeIcon}
            isDark={isDark}
            borderRadius={1}
            sx={{
              width: { xs: '100%', sm: 160 },
              aspectRatio: '16/9',
              flexShrink: 0,
            }}
          />
        </Box>

        <Box sx={{ flex: 1, minWidth: 0, py: 1.2, pl: { xs: 1, sm: 1.2 }, pr: 1 }}>
          <Tooltip title={entry.title || ''} enterDelay={420}>
            <Typography
              variant="body1"
              fontWeight={700}
              sx={{
                lineHeight: 1.35,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {entry.title}
            </Typography>
          </Tooltip>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6, flexWrap: 'wrap', mt: 0.55 }}>
            <ServiceIcon serviceKey={entry.serviceKey} size={14} title={t('sidebar.iconAlt', { name: entry.serviceLabel })} />
            <Typography variant="caption" fontWeight={700} sx={{ color: 'text.secondary' }}>
              {entry.serviceLabel}
            </Typography>
            <Typography variant="caption" sx={{ opacity: 0.5 }}>{SEPARATOR_BULLET}</Typography>
            <Tooltip
              title={entry.timestampTooltip}
              enterDelay={380}
              slotProps={{ tooltip: { sx: { whiteSpace: 'pre-line', maxWidth: 'none' } } }}
            >
              <Typography variant="caption" color="text.secondary" component="span" sx={{ cursor: 'help' }}>
                {entry.shortDate}
              </Typography>
            </Tooltip>
          </Box>

          <Typography
            variant="caption"
            color="text.disabled"
            noWrap
            sx={{
              display: 'block',
              mt: 0.7,
              fontFamily: 'monospace',
              fontSize: '0.72rem',
            }}
          >
            {entry.filename}
          </Typography>
        </Box>

        <Box
          sx={{
            width: { xs: '100%', sm: 'auto' },
            p: 1.2,
            pt: { xs: 0.2, sm: 1.2 },
            display: 'flex',
            alignItems: 'center',
            justifyContent: { xs: 'space-between', sm: 'flex-end' },
            gap: 0.8,
            flexWrap: 'wrap',
          }}
        >
          <Stack direction={{ xs: 'row', sm: 'row' }} spacing={0.65} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <Chip
              size="small"
              label={statusLabel}
              variant={entry.cached ? 'outlined' : 'filled'}
              sx={{
                fontWeight: 700,
                borderRadius: 0.75,
                bgcolor: entry.cached ? 'transparent' : (isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.06)'),
                borderColor: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.14)',
                color: 'text.secondary',
              }}
            />

            <Chip
              size="small"
              label={entry.formatLabel}
              variant="outlined"
              sx={{
                fontWeight: 700,
                borderRadius: 0.75,
                borderColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.12)',
              }}
            />

            <Chip
              size="small"
              label={entry.typeLabel}
              variant="outlined"
              sx={{
                fontWeight: 700,
                borderRadius: 0.75,
                borderColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.12)',
              }}
            />

            {entry.durationLabel && (
              <Chip
                size="small"
                label={entry.durationLabel}
                variant="outlined"
                sx={{
                  fontWeight: 700,
                  borderRadius: 0.75,
                  borderColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.12)',
                }}
              />
            )}
          </Stack>

          <Tooltip title={t('downloads.moreActions')}>
            <IconButton
              size="small"
              aria-label={t('downloads.actionsAria')}
              onClick={(event) => onOpenActionsMenu(event, entry.raw)}
              sx={{
                borderRadius: 1,
                border: `1px solid ${isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.16)'}`,
                cursor: 'pointer',
              }}
            >
              <MoreVertical size={16} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>
    </Card>
  )
})
