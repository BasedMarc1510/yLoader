import React, { useState, useEffect } from 'react'
import {
    Box,
    Typography,
    TextField,
    InputAdornment,
    Grid,
    Card,
    CardContent,
    CardActions,
    IconButton,
    MenuItem,
    Select,
    Tooltip,
    useTheme,
    Button,
    Container
} from '@mui/material'
import { Search, Trash2, Download, RefreshCw, Music, Video, Image as ImageIcon, Filter } from 'lucide-react'
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

function getVideoSourceUrl(item) {
    const raw = typeof item.source_url === 'string' ? item.source_url.trim() : ''
    if (raw && /^https?:\/\//i.test(raw)) return raw

    const normalizedService = normalizeServiceKey(item.service)
    if (normalizedService === 'youtube' && item.video_id) {
        return `https://www.youtube.com/watch?v=${item.video_id}`
    }

    return null
}

function toKnownServiceKey(rawService, fallbackUrl = '') {
    return normalizeServiceKey(rawService) || detectService(fallbackUrl) || GENERIC_SERVICE_KEY
}

export default function DownloadsPage({ onOpenDownloader }) {
    const { t, language } = useI18n()
    const theme = useTheme()
    const isDark = theme.palette.mode === 'dark'
    const [downloads, setDownloads] = useState([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')
    const [filterService, setFilterService] = useState('all')

    const fetchDownloads = async () => {
        setLoading(true)
        try {
            const dbBase = getApiBase()
            const query = new URLSearchParams()
            if (searchTerm) query.append('q', searchTerm)
            if (filterService !== 'all') query.append('service', filterService)

            const res = await fetch(`${dbBase}/api/downloads?${query.toString()}`)
            if (res.ok) {
                const data = await res.json()
                setDownloads(data)
            }
        } catch (err) {
            console.error('Failed to fetch downloads', err)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        const handler = setTimeout(() => {
            fetchDownloads()
        }, 300)
        return () => clearTimeout(handler)
    }, [searchTerm, filterService])

    const handleDelete = async (id) => {
        if (!window.confirm(t('downloads.confirmDelete'))) return
        try {
            const dbBase = getApiBase()
            const res = await fetch(`${dbBase}/api/downloads/${id}`, { method: 'DELETE' })
            if (res.ok) {
                setDownloads(prev => prev.filter(d => d.id !== id))
            }
        } catch (err) {
            console.error('Failed to delete', err)
        }
    }

    const handleDownloadFile = (filename) => {
        const dbBase = getApiBase()
        const url = `${dbBase}/api/download/file/${encodeURIComponent(filename)}`
        window.location.href = url
    }

    const handleRedownload = (item) => {
        const url = getVideoSourceUrl(item)
        const service = toKnownServiceKey(item.service, url)
        if (url) onOpenDownloader?.(service, url)
    }

    const formatDuration = (sec) => {
        if (!sec) return '00:00'
        const h = Math.floor(sec / 3600)
        const m = Math.floor((sec % 3600) / 60)
        const s = Math.floor(sec % 60)
        if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    }

    const getServiceLabel = React.useCallback((serviceKey) => {
        if (serviceKey === GENERIC_SERVICE_KEY) return t('services.generic')
        return getServiceDisplayName(serviceKey)
    }, [t])

    const services = React.useMemo(() => {
        const options = [{ value: 'all', label: t('downloads.allServices'), icon: null }]
        const used = new Set()

        for (const item of downloads) {
            const sourceUrl = typeof item?.source_url === 'string' ? item.source_url : ''
            const serviceKey = toKnownServiceKey(item?.service, sourceUrl)
            used.add(serviceKey)
        }

        if (filterService !== 'all') {
            const selectedService = normalizeServiceKey(filterService)
            if (selectedService) used.add(selectedService)
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

    const getTypeIcon = (type) => {
        if (type === 'audio') return <Music size={14} />
        if (type === 'video') return <Video size={14} />
        return <ImageIcon size={14} />
    }

    const formatTimestampTooltip = (ts) => {
        if (!ts) return ''
        const d = new Date(ts)
        if (Number.isNaN(d.getTime())) return String(ts)
        const localeTag = language === 'de' ? 'de-DE' : 'en-US'
        const human = d.toLocaleString(localeTag, { dateStyle: 'full', timeStyle: 'medium' })
        return `${human}\n${d.toISOString()}`
    }

    return (
        <Box sx={{ height: '100%', overflowY: 'auto' }}>
            <Container maxWidth="xl" sx={{ py: 4 }}>
                <Box sx={{ mb: 4 }}>
                    <Typography variant="h4" component="h1" fontWeight={800} gutterBottom>
                        {t('downloads.title')}
                    </Typography>
                    <Typography variant="body1" color="text.secondary">
                        {t('downloads.subtitle')}
                    </Typography>
                </Box>

                <Box sx={{
                    display: 'flex',
                    flexDirection: { xs: 'column', md: 'row' },
                    gap: 2,
                    mb: 4,
                    alignItems: 'center'
                }}>
                    <TextField
                        placeholder={t('downloads.searchPlaceholder')}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        size="small"
                        fullWidth
                        sx={{
                            flexGrow: 1,
                            maxWidth: { md: 500 },
                            '& .MuiOutlinedInput-root': {
                                borderRadius: 1.5,
                                bgcolor: isDark ? 'background.paper' : '#fff',
                                '& fieldset': { borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)' },
                                '&:hover fieldset': { borderColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)' },
                                '&.Mui-focused fieldset': { borderColor: theme.palette.primary.main, borderWidth: 1 }
                            }
                        }}
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <Search size={18} color={theme.palette.text.secondary} />
                                </InputAdornment>
                            ),
                        }}
                    />

                    <Select
                        size="small"
                        value={filterService}
                        onChange={(e) => setFilterService(e.target.value)}
                        displayEmpty
                        sx={{
                            minWidth: 180,
                            borderRadius: 1.5,
                            bgcolor: isDark ? 'background.paper' : '#fff',
                            '& .MuiOutlinedInput-notchedOutline': { borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)' },
                            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)' },
                            '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: theme.palette.primary.main, borderWidth: 1 },
                            width: { xs: '100%', md: 'auto' }
                        }}
                        renderValue={(selected) => {
                            const svc = services.find(s => s.value === selected)
                            const fallbackKey = normalizeServiceKey(selected)
                            const fallback = fallbackKey
                                ? { value: fallbackKey, label: getServiceLabel(fallbackKey), icon: fallbackKey }
                                : { value: 'all', label: t('downloads.allServices'), icon: null }
                            const activeService = svc || fallback

                            return (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                    {activeService.icon ? (
                                        <ServiceIcon serviceKey={activeService.icon} size={18} title={t('sidebar.iconAlt', { name: activeService.label })} />
                                    ) : (
                                        <Filter size={18} />
                                    )}
                                    <Typography variant="body2" fontWeight={600}>{activeService.label}</Typography>
                                </Box>
                            )
                        }}
                    >
                        {services.map((svc) => (
                            <MenuItem key={svc.value} value={svc.value}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                    {svc.icon ? (
                                        <ServiceIcon serviceKey={svc.icon} size={20} title={t('sidebar.iconAlt', { name: svc.label })} />
                                    ) : (
                                        <Filter size={20} />
                                    )}
                                    {svc.label}
                                </Box>
                            </MenuItem>
                        ))}
                    </Select>
                </Box>

                <Grid container spacing={2.5}>
                    {downloads.map((item) => {
                        const videoPageUrl = getVideoSourceUrl(item)
                        const serviceKey = toKnownServiceKey(item.service, videoPageUrl || item.source_url)
                        const serviceLabel = getServiceLabel(serviceKey)

                        return (
                        <Grid item xs={12} sm={6} md={4} lg={3} xl={2.4} key={item.id}>
                            <Card
                                elevation={0}
                                sx={{
                                    height: '100%',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    position: 'relative',
                                    borderRadius: 1.5,
                                    border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
                                    bgcolor: isDark ? '#1e1e1e' : '#fff',
                                    transition: 'border-color 0.2s',
                                    '&:hover': {
                                        borderColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)',
                                    }
                                }}
                            >
                                <Box sx={{ position: 'relative', paddingTop: '56.25%', bgcolor: '#000' }}>
                                    <Box
                                        component={videoPageUrl ? 'a' : 'div'}
                                        {...(videoPageUrl
                                            ? {
                                                href: videoPageUrl,
                                                target: '_blank',
                                                rel: 'noopener noreferrer',
                                                'aria-label': t('downloads.openSourceVideo'),
                                            }
                                            : {})}
                                        sx={{
                                            position: 'absolute',
                                            top: 0,
                                            left: 0,
                                            width: '100%',
                                            height: '100%',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            overflow: 'hidden',
                                            ...(videoPageUrl
                                                ? {
                                                    textDecoration: 'none',
                                                    color: 'inherit',
                                                    cursor: 'pointer',
                                                    '&:focus-visible': {
                                                        boxShadow: (th) => `inset 0 0 0 2px ${th.palette.primary.main}`,
                                                    },
                                                }
                                                : {}),
                                        }}
                                    >
                                        {serviceKey === 'youtube' && item.video_id ? (
                                            <Box
                                                component="img"
                                                src={youtubeThumb(item.video_id, 'mqdefault')}
                                                alt=""
                                                sx={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.9 }}
                                                onError={(e) => { e.target.style.display = 'none' }}
                                            />
                                        ) : (
                                            <Box sx={{ opacity: 0.3, color: '#fff' }}>
                                                {getTypeIcon(item.download_type)}
                                            </Box>
                                        )}
                                    </Box>

                                    {/* Type Badge */}
                                    <Box sx={{
                                        position: 'absolute',
                                        top: 8,
                                        left: 8,
                                        bgcolor: 'rgba(0,0,0,0.6)',
                                        backdropFilter: 'blur(4px)',
                                        color: '#fff',
                                        borderRadius: 1,
                                        px: 1,
                                        py: 0.25,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 0.5,
                                        fontSize: '0.7rem',
                                        fontWeight: 700,
                                        textTransform: 'uppercase'
                                    }}>
                                        {getTypeIcon(item.download_type)}
                                        {item.download_type}
                                    </Box>

                                    {/* Duration Badge */}
                                    {item.duration > 0 && (
                                        <Box sx={{
                                            position: 'absolute',
                                            bottom: 8,
                                            right: 8,
                                            bgcolor: 'rgba(0,0,0,0.8)',
                                            color: '#fff',
                                            px: 0.75,
                                            py: 0.25,
                                            borderRadius: 0.75,
                                            fontSize: '0.75rem',
                                            fontWeight: 600,
                                            fontFeatureSettings: '"tnum"'
                                        }}>
                                            {formatDuration(item.duration)}
                                        </Box>
                                    )}
                                </Box>

                                <CardContent sx={{ flexGrow: 1, p: 2, pb: 1 }}>
                                    <Tooltip title={item.title} enterDelay={500}>
                                        <Typography variant="body1" fontWeight={700} noWrap sx={{ mb: 0.5, fontSize: '0.95rem' }}>
                                            {item.title}
                                        </Typography>
                                    </Tooltip>

                                    <Box sx={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 0.75,
                                        mt: 0.25,
                                        px: 0.75,
                                        py: 0.25,
                                        borderRadius: 0.75,
                                        bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                                    }}>
                                        <ServiceIcon serviceKey={serviceKey} size={14} title={t('sidebar.iconAlt', { name: serviceLabel })} />
                                        <Typography variant="caption" fontWeight={600} sx={{ lineHeight: 1.1 }}>
                                            {serviceLabel}
                                        </Typography>
                                    </Box>

                                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 1 }}>
                                        <Tooltip
                                            title={formatTimestampTooltip(item.timestamp)}
                                            enterDelay={400}
                                            slotProps={{ tooltip: { sx: { whiteSpace: 'pre-line', maxWidth: 'none' } } }}
                                        >
                                            <Typography variant="caption" color="text.secondary" fontWeight={500} component="span" sx={{ cursor: 'help' }}>
                                                {new Date(item.timestamp).toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US')}
                                            </Typography>
                                        </Tooltip>
                                        <Box sx={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 0.5,
                                            bgcolor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                                            px: 0.75,
                                            py: 0.25,
                                            borderRadius: 0.75
                                        }}>
                                            <Typography variant="caption" fontWeight={700} sx={{ opacity: 0.8 }}>
                                                {item.format_id || item.download_type}
                                            </Typography>
                                        </Box>
                                    </Box>

                                    <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 1.5, fontSize: '0.7rem', fontFamily: 'monospace' }} noWrap>
                                        {item.filename}
                                    </Typography>
                                </CardContent>

                                <CardActions sx={{ px: 2, pb: 2, pt: 1, justifyContent: 'space-between' }}>
                                    <Button
                                        size="small"
                                        variant="contained"
                                        disableElevation
                                        startIcon={<Download size={14} />}
                                        onClick={() => handleDownloadFile(item.filename)}
                                        disabled={!item.cached}
                                        sx={{
                                            textTransform: 'none',
                                            fontWeight: 700,
                                            borderRadius: 1,
                                            opacity: item.cached ? 1 : 0.6,
                                            bgcolor: isDark ? '#fff' : '#000',
                                            color: isDark ? '#000' : '#fff',
                                            '&:hover': { bgcolor: isDark ? '#e0e0e0' : '#333' }
                                        }}
                                    >
                                        {item.cached ? t('downloads.save') : t('downloads.deleted')}
                                    </Button>
                                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                                        <Tooltip title={t('downloads.redownload')}>
                                            <IconButton
                                                size="small"
                                                onClick={() => handleRedownload(item)}
                                                sx={{
                                                    borderRadius: 1,
                                                    border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`
                                                }}
                                            >
                                                <RefreshCw size={16} />
                                            </IconButton>
                                        </Tooltip>
                                        <Tooltip title={t('downloads.removeEntry')}>
                                            <IconButton
                                                size="small"
                                                color="error"
                                                onClick={() => handleDelete(item.id)}
                                                sx={{
                                                    borderRadius: 1,
                                                    border: `1px solid ${theme.palette.error.main}`,
                                                    color: theme.palette.error.main,
                                                    opacity: 0.7,
                                                    '&:hover': { opacity: 1, bgcolor: 'rgba(255,0,0,0.05)' }
                                                }}
                                            >
                                                <Trash2 size={16} />
                                            </IconButton>
                                        </Tooltip>
                                    </Box>
                                </CardActions>
                            </Card>
                        </Grid>
                        )
                    })}

                    {!loading && downloads.length === 0 && (
                        <Grid item xs={12}>
                            <Box sx={{ textAlign: 'center', py: 12, opacity: 0.4 }}>
                                <Download size={48} style={{ marginBottom: 16 }} />
                                <Typography variant="h6" fontWeight={600}>{t('downloads.emptyTitle')}</Typography>
                                <Typography variant="body2">{t('downloads.emptySubtitle')}</Typography>
                            </Box>
                        </Grid>
                    )}
                </Grid>
            </Container>
        </Box>
    )
}
