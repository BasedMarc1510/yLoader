import React from 'react'
import {
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Chip,
  Container,
  Grid,
  IconButton,
  InputAdornment,
  Menu,
  MenuItem,
  Pagination,
  Skeleton,
  Stack,
  TextField,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material'
import {
  ChevronDown,
  Download,
  Filter,
  Image as ImageIcon,
  LayoutGrid,
  Link2,
  List,
  MoreVertical,
  Music,
  RefreshCw,
  Search,
  Trash2,
  Video,
} from 'lucide-react'
import ServiceIcon from '../components/ServiceIcon'
import {
  GENERIC_SERVICE_KEY,
  detectService,
  getApiBase,
  getServiceDisplayName,
  normalizeServiceKey,
  youtubeThumb,
} from '../utils/metadata'
import { useI18n } from '../providers/I18nProvider'
import { getLocaleForLanguage } from '../i18n/config'
import SimpleBarScrollArea from '../components/SimpleBarScrollArea'

const DOWNLOADS_UI_STORAGE_KEY = 'yloader.downloads.ui.v2'
const GRID_PAGE_SIZE = 18
const LIST_PAGE_SIZE = 20
const GRID_SKELETON_COUNT = 12
const LIST_SKELETON_COUNT = 8
const TYPE_FILTER_VALUES = new Set(['all', 'video', 'audio', 'thumbnail'])
const VIEW_MODE_VALUES = new Set(['grid', 'list'])

function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || '').trim())
}

function normalizeViewMode(value) {
  const normalized = String(value || '').trim().toLowerCase()
  return VIEW_MODE_VALUES.has(normalized) ? normalized : 'list'
}

function normalizeTypeFilter(value) {
  const normalized = String(value || '').trim().toLowerCase()
  return TYPE_FILTER_VALUES.has(normalized) ? normalized : 'all'
}

function readDownloadsUiPreferences() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { viewMode: 'list', typeFilter: 'all' }
  }

  try {
    const raw = window.localStorage.getItem(DOWNLOADS_UI_STORAGE_KEY)
    if (!raw) return { viewMode: 'list', typeFilter: 'all' }

    const parsed = JSON.parse(raw)
    return {
      viewMode: normalizeViewMode(parsed?.viewMode),
      typeFilter: normalizeTypeFilter(parsed?.typeFilter),
    }
  } catch {
    return { viewMode: 'list', typeFilter: 'all' }
  }
}

function persistDownloadsUiPreferences(preferences) {
  if (typeof window === 'undefined' || !window.localStorage) return

  try {
    window.localStorage.setItem(
      DOWNLOADS_UI_STORAGE_KEY,
      JSON.stringify({
        viewMode: normalizeViewMode(preferences?.viewMode),
        typeFilter: normalizeTypeFilter(preferences?.typeFilter),
      })
    )
  } catch {
    // Ignore local persistence errors.
  }
}

function getVideoSourceUrl(item) {
  const raw = typeof item?.source_url === 'string' ? item.source_url.trim() : ''
  if (isHttpUrl(raw)) return raw

  const normalizedService = normalizeServiceKey(item?.service)
  if (normalizedService === 'youtube' && item?.video_id) {
    return `https://www.youtube.com/watch?v=${item.video_id}`
  }

  return null
}

function toKnownServiceKey(rawService, fallbackUrl = '') {
  return normalizeServiceKey(rawService) || detectService(fallbackUrl) || GENERIC_SERVICE_KEY
}

function resolveThumbnailUrl(item) {
  const direct = String(item?.thumbnail_url || '').trim()
  if (isHttpUrl(direct)) return direct

  const service = normalizeServiceKey(item?.service)
  if (service === 'youtube' && item?.video_id) {
    return youtubeThumb(item.video_id, 'mqdefault')
  }

  return ''
}

function formatDurationLabel(sec) {
  const numeric = Number(sec)
  if (!Number.isFinite(numeric) || numeric <= 0) return ''

  const totalSeconds = Math.round(numeric)
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = Math.floor(totalSeconds % 60)

  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

function formatEntryDate(timestamp, language) {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return String(timestamp || '')

  const localeTag = getLocaleForLanguage(language)
  return date.toLocaleDateString(localeTag)
}

function formatTimestampTooltip(timestamp, language) {
  if (!timestamp) return ''

  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return String(timestamp)

  const localeTag = getLocaleForLanguage(language)
  const human = date.toLocaleString(localeTag, { dateStyle: 'full', timeStyle: 'medium' })
  return `${human}\n${date.toISOString()}`
}

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

function DownloadGridCardSkeleton({ isDark }) {
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

function DownloadListRowSkeleton({ isDark }) {
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

const DownloadGridCard = React.memo(function DownloadGridCard({
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
          <Typography variant="caption" sx={{ opacity: 0.5 }}>•</Typography>
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

const DownloadListRow = React.memo(function DownloadListRow({
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
            <Typography variant="caption" sx={{ opacity: 0.5 }}>•</Typography>
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

export default function DownloadsPage({ onOpenDownloader }) {
  const { t, language } = useI18n()
  const theme = useTheme()
  const isDark = theme.palette.mode === 'dark'

  const [downloads, setDownloads] = React.useState([])
  const [loading, setLoading] = React.useState(true)
  const [searchTerm, setSearchTerm] = React.useState('')
  const [filterService, setFilterService] = React.useState('all')
  const [viewMode, setViewMode] = React.useState(() => readDownloadsUiPreferences().viewMode)
  const [filterType, setFilterType] = React.useState(() => readDownloadsUiPreferences().typeFilter)
  const [page, setPage] = React.useState(1)
  const [serviceMenuAnchorEl, setServiceMenuAnchorEl] = React.useState(null)
  const [entryMenuAnchorEl, setEntryMenuAnchorEl] = React.useState(null)
  const [entryMenuItem, setEntryMenuItem] = React.useState(null)
  const fetchControllerRef = React.useRef(null)

  const deferredSearchTerm = React.useDeferredValue(searchTerm)

  React.useEffect(() => {
    persistDownloadsUiPreferences({ viewMode, typeFilter: filterType })
  }, [filterType, viewMode])

  const handleDelete = React.useCallback(async (id) => {
    if (!window.confirm(t('downloads.confirmDelete'))) return

    try {
      const apiBase = getApiBase()
      const res = await fetch(`${apiBase}/api/downloads/${id}`, { method: 'DELETE' })
      if (!res.ok) return

      setDownloads((previous) => previous.filter((entry) => entry.id !== id))
    } catch (err) {
      console.error('Failed to delete download entry', err)
    }
  }, [t])

  const handleDownloadFile = React.useCallback((filename) => {
    const apiBase = getApiBase()
    const url = `${apiBase}/api/download/file/${encodeURIComponent(filename)}`
    window.location.href = url
  }, [])

  const handleRedownload = React.useCallback((item) => {
    const openUrl = getVideoSourceUrl(item)
    const service = toKnownServiceKey(item?.service, openUrl || item?.source_url)
    if (openUrl) {
      onOpenDownloader?.(service, openUrl)
    }
  }, [onOpenDownloader])

  const closeEntryMenu = React.useCallback(() => {
    setEntryMenuAnchorEl(null)
    setEntryMenuItem(null)
  }, [])

  const openEntryMenu = React.useCallback((event, item) => {
    event.stopPropagation()
    setEntryMenuAnchorEl(event.currentTarget)
    setEntryMenuItem(item)
  }, [])

  const handleMenuRedownload = React.useCallback(() => {
    if (entryMenuItem) {
      handleRedownload(entryMenuItem)
    }
    closeEntryMenu()
  }, [closeEntryMenu, entryMenuItem, handleRedownload])

  const handleMenuSave = React.useCallback(() => {
    if (entryMenuItem?.cached && entryMenuItem?.filename) {
      handleDownloadFile(entryMenuItem.filename)
    }
    closeEntryMenu()
  }, [closeEntryMenu, entryMenuItem, handleDownloadFile])

  const handleMenuDelete = React.useCallback(() => {
    if (entryMenuItem?.id != null) {
      void handleDelete(entryMenuItem.id)
    }
    closeEntryMenu()
  }, [closeEntryMenu, entryMenuItem, handleDelete])

  const fetchDownloads = React.useCallback(async () => {
    fetchControllerRef.current?.abort()
    const controller = new AbortController()
    fetchControllerRef.current = controller

    setLoading(true)

    try {
      const apiBase = getApiBase()
      const query = new URLSearchParams()
      const normalizedSearch = String(deferredSearchTerm || '').trim()

      if (normalizedSearch) query.append('q', normalizedSearch)
      if (filterService !== 'all') query.append('service', filterService)

      const res = await fetch(`${apiBase}/api/downloads?${query.toString()}`, {
        signal: controller.signal,
      })

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }

      const payload = await res.json()
      if (fetchControllerRef.current !== controller) return

      setDownloads(Array.isArray(payload) ? payload : [])
    } catch (err) {
      if (err?.name !== 'AbortError') {
        console.error('Failed to fetch downloads', err)
      }
    } finally {
      if (fetchControllerRef.current === controller) {
        fetchControllerRef.current = null
        setLoading(false)
      }
    }
  }, [deferredSearchTerm, filterService])

  React.useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void fetchDownloads()
    }, 260)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [fetchDownloads])

  React.useEffect(() => () => {
    fetchControllerRef.current?.abort()
  }, [])

  React.useEffect(() => {
    setPage(1)
  }, [deferredSearchTerm, filterService, filterType, viewMode])

  const getServiceLabel = React.useCallback((serviceKey) => {
    if (serviceKey === GENERIC_SERVICE_KEY) return t('services.generic')
    return getServiceDisplayName(serviceKey)
  }, [t])

  const getTypeIcon = React.useCallback((type, size = 14) => {
    if (type === 'audio') return <Music size={size} />
    if (type === 'video') return <Video size={size} />
    return <ImageIcon size={size} />
  }, [])

  const getTypeLabel = React.useCallback((type) => {
    if (type === 'audio') return t('downloads.typeAudio')
    if (type === 'video') return t('downloads.typeVideo')
    return t('downloads.typeThumbnail')
  }, [t])

  const serviceOptions = React.useMemo(() => {
    const options = [{ value: 'all', label: t('downloads.allServices'), icon: null }]
    const used = new Set()

    for (const item of downloads) {
      const fallbackUrl = String(item?.source_url || '').trim()
      const serviceKey = toKnownServiceKey(item?.service, fallbackUrl)
      used.add(serviceKey)
    }

    if (filterService !== 'all') {
      const selected = normalizeServiceKey(filterService)
      if (selected) used.add(selected)
    }

    const sorted = Array.from(used).sort((a, b) => {
      if (a === GENERIC_SERVICE_KEY) return 1
      if (b === GENERIC_SERVICE_KEY) return -1
      return getServiceLabel(a).localeCompare(getServiceLabel(b), undefined, { sensitivity: 'base' })
    })

    for (const serviceKey of sorted) {
      options.push({
        value: serviceKey,
        label: getServiceLabel(serviceKey),
        icon: serviceKey,
      })
    }

    return options
  }, [downloads, filterService, getServiceLabel, t])

  const activeServiceOption = React.useMemo(() => {
    const direct = serviceOptions.find((entry) => entry.value === filterService)
    if (direct) return direct

    const normalized = normalizeServiceKey(filterService)
    if (!normalized) {
      return { value: 'all', label: t('downloads.allServices'), icon: null }
    }

    return {
      value: normalized,
      label: getServiceLabel(normalized),
      icon: normalized,
    }
  }, [filterService, getServiceLabel, serviceOptions, t])

  const typeFilterOptions = React.useMemo(() => ([
    { value: 'all', label: t('downloads.typeAll') },
    { value: 'video', label: t('downloads.typeVideo') },
    { value: 'audio', label: t('downloads.typeAudio') },
    { value: 'thumbnail', label: t('downloads.typeThumbnail') },
  ]), [t])

  const filteredDownloads = React.useMemo(() => {
    if (filterType === 'all') return downloads
    return downloads.filter((item) => String(item?.download_type || '').trim().toLowerCase() === filterType)
  }, [downloads, filterType])

  const pageSize = viewMode === 'list' ? LIST_PAGE_SIZE : GRID_PAGE_SIZE
  const totalPages = Math.max(1, Math.ceil(filteredDownloads.length / pageSize))

  React.useEffect(() => {
    setPage((current) => Math.min(current, totalPages))
  }, [totalPages])

  const pagedDownloads = React.useMemo(() => {
    const start = (page - 1) * pageSize
    const end = start + pageSize
    return filteredDownloads.slice(start, end)
  }, [filteredDownloads, page, pageSize])

  const entries = React.useMemo(() => {
    return pagedDownloads.map((item) => {
      const openUrl = getVideoSourceUrl(item)
      const serviceKey = toKnownServiceKey(item?.service, openUrl || item?.source_url)
      const shortDate = formatEntryDate(item?.timestamp, language)
      return {
        raw: item,
        id: item?.id,
        title: String(item?.title || '').trim() || item?.filename || '-',
        filename: String(item?.filename || '').trim(),
        cached: Boolean(item?.cached),
        durationLabel: formatDurationLabel(item?.duration),
        timestampTooltip: formatTimestampTooltip(item?.timestamp, language),
        shortDate,
        typeIcon: getTypeIcon(item?.download_type, 14),
        typeLabel: getTypeLabel(item?.download_type),
        serviceKey,
        serviceLabel: getServiceLabel(serviceKey),
        formatLabel: String(item?.format_id || item?.download_type || '').trim() || '-',
        openUrl,
        thumbnailUrl: resolveThumbnailUrl(item),
      }
    })
  }, [getServiceLabel, getTypeIcon, getTypeLabel, language, pagedDownloads])

  const showInitialSkeleton = loading && downloads.length === 0

  const hasMenuRedownloadTarget = React.useMemo(() => {
    return Boolean(entryMenuItem && getVideoSourceUrl(entryMenuItem))
  }, [entryMenuItem])

  const canMenuSaveTarget = React.useMemo(() => {
    return Boolean(entryMenuItem?.cached && entryMenuItem?.filename)
  }, [entryMenuItem])

  return (
    <SimpleBarScrollArea sx={{ height: '100%' }} hideHorizontal>
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Box sx={{ mb: 3.3 }}>
          <Typography variant="h4" component="h1" fontWeight={800}>
            {t('downloads.title')}
          </Typography>
        </Box>

        <Box
          sx={{
            mb: 2.7,
            p: 1.5,
            borderRadius: 1,
            border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`,
            bgcolor: isDark ? '#181818' : '#fff',
            boxShadow: isDark
              ? '0 14px 32px rgba(0,0,0,0.2)'
              : '0 10px 26px rgba(15,20,25,0.08)',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <TextField
              placeholder={t('downloads.searchPlaceholder')}
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              size="small"
              fullWidth
              sx={{
                flex: 1,
                minWidth: { xs: '100%', md: 280 },
                '& .MuiOutlinedInput-root': {
                  minHeight: 42,
                  borderRadius: 1,
                  bgcolor: isDark ? 'rgba(255,255,255,0.03)' : '#fafafa',
                },
              }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Search size={17} color={theme.palette.text.secondary} />
                  </InputAdornment>
                ),
              }}
            />

            <Button
              variant="outlined"
              onClick={(event) => setServiceMenuAnchorEl(event.currentTarget)}
              aria-label={t('downloads.filterByService')}
              sx={{
                borderRadius: 1,
                px: 1.3,
                textTransform: 'none',
                fontWeight: 700,
                minHeight: 42,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.9,
                cursor: 'pointer',
              }}
            >
              {activeServiceOption.icon ? (
                <ServiceIcon
                  serviceKey={activeServiceOption.icon}
                  size={16}
                  title={t('sidebar.iconAlt', { name: activeServiceOption.label })}
                />
              ) : (
                <Filter size={16} />
              )}
              <Typography variant="body2" fontWeight={700}>
                {activeServiceOption.label}
              </Typography>
              <ChevronDown size={15} />
            </Button>

            <Box
              sx={{
                ml: { xs: 0, md: 'auto' },
                display: 'inline-flex',
                alignItems: 'center',
                p: 0.35,
                borderRadius: 1,
                border: `1px solid ${isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.12)'}`,
                bgcolor: isDark ? 'rgba(255,255,255,0.03)' : '#fafafa',
              }}
            >
              <Tooltip title={t('downloads.viewGrid')}>
                <IconButton
                  size="small"
                  aria-label={t('downloads.viewGridAria')}
                  onClick={() => setViewMode('grid')}
                  sx={{
                    borderRadius: 0.75,
                    bgcolor: viewMode === 'grid'
                      ? (isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)')
                      : 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  <LayoutGrid size={17} />
                </IconButton>
              </Tooltip>

              <Tooltip title={t('downloads.viewList')}>
                <IconButton
                  size="small"
                  aria-label={t('downloads.viewListAria')}
                  onClick={() => setViewMode('list')}
                  sx={{
                    borderRadius: 0.75,
                    bgcolor: viewMode === 'list'
                      ? (isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)')
                      : 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  <List size={17} />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>

          <Box sx={{ mt: 1.25, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {typeFilterOptions.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                clickable
                onClick={() => setFilterType(option.value)}
                variant="outlined"
                sx={{
                  borderRadius: 1,
                  px: 0.3,
                  fontWeight: 700,
                  borderColor: filterType === option.value
                    ? 'rgba(214, 66, 66, 0.4)'
                    : (isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.14)'),
                  bgcolor: filterType === option.value
                    ? (isDark ? 'rgba(214,66,66,0.18)' : 'rgba(214,66,66,0.1)')
                    : 'transparent',
                  color: filterType === option.value
                    ? (isDark ? '#ffb4b4' : '#992828')
                    : 'text.primary',
                  cursor: 'pointer',
                  '&:hover': {
                    bgcolor: filterType === option.value
                      ? (isDark ? 'rgba(214,66,66,0.24)' : 'rgba(214,66,66,0.16)')
                      : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'),
                  },
                }}
              />
            ))}
          </Box>
        </Box>

        {loading && downloads.length > 0 && (
          <Box sx={{ mb: 1.6 }}>
            <Skeleton
              variant="rounded"
              animation="wave"
              height={8}
              sx={{
                borderRadius: 999,
                bgcolor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
              }}
            />
          </Box>
        )}

        {showInitialSkeleton && viewMode === 'grid' && (
          <Grid container spacing={2}>
            {Array.from({ length: GRID_SKELETON_COUNT }).map((_, index) => (
              <Grid item xs={12} sm={6} md={4} lg={3} xl={2} key={`downloads-grid-skeleton-${index}`}>
                <DownloadGridCardSkeleton isDark={isDark} />
              </Grid>
            ))}
          </Grid>
        )}

        {showInitialSkeleton && viewMode === 'list' && (
          <Stack spacing={1.25}>
            {Array.from({ length: LIST_SKELETON_COUNT }).map((_, index) => (
              <DownloadListRowSkeleton isDark={isDark} key={`downloads-list-skeleton-${index}`} />
            ))}
          </Stack>
        )}

        {!showInitialSkeleton && entries.length > 0 && viewMode === 'grid' && (
          <Grid container spacing={2}>
            {entries.map((entry) => (
              <Grid item xs={12} sm={6} md={4} lg={3} xl={2} key={entry.id}>
                <DownloadGridCard
                  entry={entry}
                  isDark={isDark}
                  t={t}
                  onOpenActionsMenu={openEntryMenu}
                />
              </Grid>
            ))}
          </Grid>
        )}

        {!showInitialSkeleton && entries.length > 0 && viewMode === 'list' && (
          <Stack spacing={1.25}>
            {entries.map((entry) => (
              <DownloadListRow
                key={entry.id}
                entry={entry}
                isDark={isDark}
                t={t}
                onOpenActionsMenu={openEntryMenu}
              />
            ))}
          </Stack>
        )}

        {!loading && filteredDownloads.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 11, opacity: 0.5 }}>
            <Download size={48} style={{ marginBottom: 14 }} />
            <Typography variant="h6" fontWeight={700}>
              {t('downloads.emptyTitle')}
            </Typography>
            <Typography variant="body2">{t('downloads.emptySubtitle')}</Typography>
          </Box>
        )}

        {!loading && filteredDownloads.length > pageSize && (
          <Box sx={{ mt: 2.4, display: 'flex', justifyContent: 'center' }}>
            <Pagination
              count={totalPages}
              page={page}
              onChange={(_event, nextPage) => setPage(nextPage)}
              color="primary"
              shape="rounded"
              size="medium"
              aria-label={t('downloads.paginationAria')}
              siblingCount={1}
              boundaryCount={1}
            />
          </Box>
        )}

        <Menu
          anchorEl={serviceMenuAnchorEl}
          open={Boolean(serviceMenuAnchorEl)}
          onClose={() => setServiceMenuAnchorEl(null)}
          PaperProps={{
            sx: {
              mt: 0.7,
              borderRadius: 1,
            },
          }}
        >
          {serviceOptions.map((service) => (
            <MenuItem
              key={service.value}
              selected={filterService === service.value}
              onClick={() => {
                setFilterService(service.value)
                setServiceMenuAnchorEl(null)
              }}
            >
              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1.1 }}>
                {service.icon ? (
                  <ServiceIcon serviceKey={service.icon} size={17} title={t('sidebar.iconAlt', { name: service.label })} />
                ) : (
                  <Filter size={17} />
                )}
                <Typography variant="body2">{service.label}</Typography>
              </Box>
            </MenuItem>
          ))}
        </Menu>

        <Menu
          anchorEl={entryMenuAnchorEl}
          open={Boolean(entryMenuAnchorEl && entryMenuItem)}
          onClose={closeEntryMenu}
          PaperProps={{
            sx: {
              mt: 0.7,
              borderRadius: 1,
              minWidth: 200,
              bgcolor: '#1f2228',
              color: '#f4f6f8',
              boxShadow: '0 18px 40px rgba(0,0,0,0.35)',
              '& .MuiMenuItem-root': {
                borderRadius: 0.75,
                mx: 0.5,
                my: 0.2,
                '&:hover': {
                  bgcolor: 'rgba(255,255,255,0.08)',
                },
              },
            },
          }}
        >
          <MenuItem onClick={handleMenuSave} disabled={!canMenuSaveTarget}>
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
              <Download size={15} />
              <span>{t('downloads.save')}</span>
            </Box>
          </MenuItem>

          <MenuItem onClick={handleMenuRedownload} disabled={!hasMenuRedownloadTarget}>
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
              <RefreshCw size={15} />
              <span>{t('downloads.redownload')}</span>
            </Box>
          </MenuItem>

          <MenuItem
            onClick={handleMenuDelete}
            sx={{
              color: '#ffb3b3',
              '&:hover': {
                bgcolor: 'rgba(255, 118, 118, 0.15)',
              },
            }}
          >
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
              <Trash2 size={15} />
              <span>{t('downloads.removeEntry')}</span>
            </Box>
          </MenuItem>
        </Menu>
      </Container>
    </SimpleBarScrollArea>
  )
}
