import React, { useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  Box,
  Dialog,
  DialogContent,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  MenuItem,
  Select,
  Typography,
  Divider,
  Tooltip,
  Button,
  Switch,
} from '@mui/material'
import { X, RefreshCw } from 'lucide-react'
import { ColorModeContext } from '../providers/ColorModeProvider'
import { SettingsContext } from '../providers/SettingsProvider'
import { useI18n } from '../providers/I18nProvider'
import { getApiBase } from '../utils/metadata'

const AUTO_DOWNLOAD_DEFAULTS = {
  useMetadata: true,
  embedCoverArt: true,
  maxAudioBitrateKbps: 0,
  maxVideoHeight: 0,
}

function normalizeAutoDownloadSettings(value) {
  const input = (value && typeof value === 'object') ? value : {}
  const maxAudioBitrateKbps = Number(input.maxAudioBitrateKbps)
  const maxVideoHeight = Number(input.maxVideoHeight)

  return {
    useMetadata: input.useMetadata !== undefined ? Boolean(input.useMetadata) : AUTO_DOWNLOAD_DEFAULTS.useMetadata,
    embedCoverArt: input.embedCoverArt !== undefined ? Boolean(input.embedCoverArt) : AUTO_DOWNLOAD_DEFAULTS.embedCoverArt,
    maxAudioBitrateKbps: Number.isFinite(maxAudioBitrateKbps) ? maxAudioBitrateKbps : AUTO_DOWNLOAD_DEFAULTS.maxAudioBitrateKbps,
    maxVideoHeight: Number.isFinite(maxVideoHeight) ? maxVideoHeight : AUTO_DOWNLOAD_DEFAULTS.maxVideoHeight,
  }
}

// Reusable setting row: label on left, control on right
function SettingRow({ label, description, children, noDivider }) {
  return (
    <>
      <Box sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        minHeight: 52,
        px: 0,
        py: 0.5,
        gap: 3,
      }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 500, fontSize: 14, lineHeight: 1.3 }}>{label}</Typography>
          {description && (
            <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', mt: 0.25, lineHeight: 1.4 }}>
              {description}
            </Typography>
          )}
        </Box>
        <Box sx={{ flexShrink: 0 }}>
          {children}
        </Box>
      </Box>
      {!noDivider && <Divider />}
    </>
  )
}

export default function SettingsModal({ open, onClose, requestedSection = 'general' }) {
  const { t } = useI18n()
  const { mode, setPreference } = useContext(ColorModeContext)
  const { language, setLanguage } = useContext(SettingsContext)
  const [section, setSection] = useState(() => String(requestedSection || 'general'))
  const API_BASE = getApiBase()

  // yt-dlp state
  const [ytInfo, setYtInfo] = useState({
    currentVersion: '-',
    latestVersion: '-',
    binaryPath: '-',
    binarySize: '-',
    outdated: false,
    updateSupported: true,
    loading: false,
    error: '',
  })
  const [ffmpegInfo, setFfmpegInfo] = useState({
    available: false,
    version: '-',
    path: '-',
    fileSize: '-',
    projectManaged: true,
    loading: false,
    error: '',
  })
  const [updating, setUpdating] = useState(false)
  const [logLines, setLogLines] = useState([])
  const logRef = useRef(null)
  const [autoDownloadSettings, setAutoDownloadSettings] = useState(() => ({ ...AUTO_DOWNLOAD_DEFAULTS }))
  const [autoDownloadLoading, setAutoDownloadLoading] = useState(false)
  const [autoDownloadSaving, setAutoDownloadSaving] = useState(false)
  const [autoDownloadError, setAutoDownloadError] = useState('')

  const fetchStatus = async () => {
    setYtInfo((s) => ({ ...s, loading: true, error: '' }))
    try {
      const resp = await fetch(`${API_BASE}/api/yt-dlp/status`)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json()
      setYtInfo({
        currentVersion: data.currentVersion || '-',
        latestVersion: data.latestVersion || data.currentVersion || '-',
        binaryPath: data.binaryPath || '-',
        binarySize: data.binarySizeHuman || '-',
        outdated: !!data.outdated,
        updateSupported: data.updateSupported !== false,
        loading: false,
        error: ''
      })
    } catch (e) {
      setYtInfo((s) => ({ ...s, loading: false, error: t('settings.failedLoadStatus', { message: e?.message || e }) }))
    }
  }

  const fetchFfmpegStatus = async () => {
    setFfmpegInfo((s) => ({ ...s, loading: true, error: '' }))
    try {
      const resp = await fetch(`${API_BASE}/api/ffmpeg/status`)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json()
      const projectManaged = data.projectManaged !== false

      setFfmpegInfo({
        available: !!data.available,
        version: data.version || '-',
        path: data.path || '-',
        fileSize: projectManaged ? (data.fileSizeHuman || '-') : t('settings.systemManagedFfmpegSize'),
        projectManaged,
        loading: false,
        error: data.error || '',
      })
    } catch (e) {
      setFfmpegInfo((s) => ({
        ...s,
        loading: false,
        error: t('settings.failedLoadFfmpegStatus', { message: e?.message || e }),
      }))
    }
  }

  const fetchAutoDownloadSettings = async () => {
    setAutoDownloadLoading(true)
    setAutoDownloadError('')
    try {
      const resp = await fetch(`${API_BASE}/api/auto-download/settings`)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json()
      setAutoDownloadSettings(normalizeAutoDownloadSettings(data))
    } catch (e) {
      setAutoDownloadError(t('settings.autoDownloadLoadFailed', { message: e?.message || e }))
    } finally {
      setAutoDownloadLoading(false)
    }
  }

  const saveAutoDownloadSettings = async (nextSettings) => {
    setAutoDownloadSaving(true)
    setAutoDownloadError('')
    try {
      const resp = await fetch(`${API_BASE}/api/auto-download/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextSettings),
      })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json()
      setAutoDownloadSettings(normalizeAutoDownloadSettings(data))
    } catch (e) {
      setAutoDownloadError(t('settings.autoDownloadSaveFailed', { message: e?.message || e }))
    } finally {
      setAutoDownloadSaving(false)
    }
  }

  const updateAutoDownloadSettings = (changes) => {
    const next = normalizeAutoDownloadSettings({ ...autoDownloadSettings, ...changes })
    setAutoDownloadSettings(next)
    saveAutoDownloadSettings(next)
  }

  useEffect(() => {
    if (!open) return
    setSection(String(requestedSection || 'general'))
  }, [open, requestedSection])

  useEffect(() => {
    if (open && section === 'yt-dlp') fetchStatus()
    if (open && section === 'ffmpeg') fetchFfmpegStatus()
    if (open && section === 'auto-download') fetchAutoDownloadSettings()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, section])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [logLines])

  const startUpdate = () => {
    if (!ytInfo.updateSupported) {
      setLogLines((l) => [...l, t('settings.updateManagedExternally')])
      return
    }

    setUpdating(true)
    setLogLines((l) => [...l, t('settings.startUpdate')])
    const es = new EventSource(`${API_BASE}/api/yt-dlp/update/stream`)
    es.onmessage = (ev) => { if (ev.data) setLogLines((l) => [...l, ev.data]) }
    es.addEventListener('info', (ev) => { if (ev.data) setLogLines((l) => [...l, ev.data]) })
    es.addEventListener('error', (ev) => {
      const msg = typeof ev?.data === 'string' && ev.data ? ev.data : t('settings.updateErrorOccurred')
      setLogLines((l) => [...l, `ERROR: ${msg}`])
    })
    es.addEventListener('end', (ev) => {
      const ok = ev?.data === 'done'
      setLogLines((l) => [...l, ok ? t('settings.updateCompleted') : t('settings.updateFailed')])
      es.close()
      setUpdating(false)
      fetchStatus()
    })
  }

  const sections = useMemo(() => ([
    { key: 'general', label: t('settings.general') },
    { key: 'auto-download', label: t('settings.sectionAutoDownload') },
    { key: 'yt-dlp', label: t('settings.sectionYtDlp') },
    { key: 'ffmpeg', label: t('settings.sectionFfmpeg') },
  ]), [t])

  let sectionTitle = t('settings.general')
  if (section === 'auto-download') sectionTitle = t('settings.autoDownloadConfig')
  if (section === 'yt-dlp') sectionTitle = t('settings.ytDlpConfig')
  if (section === 'ffmpeg') sectionTitle = t('settings.ffmpegConfig')

  const canResetSection = section === 'general' || section === 'auto-download'
  const resetDisabled = section === 'auto-download' ? (autoDownloadLoading || autoDownloadSaving) : false

  const handleResetSection = React.useCallback(() => {
    if (section === 'general') {
      setLanguage('en')
      setPreference(null)
      return
    }

    if (section === 'auto-download') {
      const defaults = { ...AUTO_DOWNLOAD_DEFAULTS }
      setAutoDownloadSettings(defaults)
      saveAutoDownloadSettings(defaults)
    }
  }, [section, saveAutoDownloadSettings, setLanguage, setPreference])

  const selectSx = {
    fontSize: 13,
    height: 32,
    minWidth: 140,
    borderRadius: '4px',
    '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' },
    '& .MuiSelect-select': { py: '6px', px: 1.5 },
    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'text.disabled' },
    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderWidth: 1 },
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="md"
      PaperProps={{
        sx: (th) => ({
          borderRadius: '6px',
          overflow: 'hidden',
          bgcolor: th.palette.mode === 'dark' ? '#1e1e1e' : '#f5f5f5',
          backgroundImage: 'none',
        })
      }}
    >
      <DialogContent sx={{ p: 0, '&:first-of-type': { pt: 0 } }}>
        <Box sx={{ display: 'flex', height: 520 }}>

          {/* ── Sidebar ── */}
          <Box sx={(th) => ({
            width: 200,
            flexShrink: 0,
            borderRight: `1px solid ${th.palette.divider}`,
            bgcolor: th.palette.mode === 'dark' ? '#161616' : '#ececec',
            display: 'flex',
            flexDirection: 'column',
          })}>
            {/* Sidebar header with close button */}
            <Box sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              px: 2,
              height: 52,
              flexShrink: 0,
            }}>
              <Typography sx={{ fontWeight: 700, fontSize: 15 }}>{t('settings.title')}</Typography>
              <Tooltip title={t('settings.close')}>
                <IconButton
                  onClick={onClose}
                  size="small"
                  aria-label={t('settings.closeAria')}
                  sx={{
                    borderRadius: '4px',
                    p: '4px',
                    color: 'text.secondary',
                    '&:hover': { bgcolor: 'action.hover', color: 'text.primary' },
                  }}
                >
                  <X size={15} />
                </IconButton>
              </Tooltip>
            </Box>

            <Divider />

            <List disablePadding sx={{ pt: 0.5 }}>
              {sections.map((s) => (
                <ListItem key={s.key} disablePadding sx={{ px: 1, mb: 0.25 }}>
                  <ListItemButton
                    selected={section === s.key}
                    onClick={() => setSection(s.key)}
                    sx={(th) => ({
                      borderRadius: '4px',
                      py: '7px',
                      px: 1.5,
                      '&.Mui-selected': {
                        bgcolor: th.palette.mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                        '&:hover': { bgcolor: th.palette.mode === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)' },
                      },
                      '&:hover': { bgcolor: th.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)' },
                    })}
                  >
                    <ListItemText
                      primary={s.label}
                      primaryTypographyProps={{ fontSize: 13.5, fontWeight: section === s.key ? 600 : 400 }}
                    />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          </Box>

          {/* ── Content ── */}
          <Box sx={(th) => ({
            flex: 1,
            overflow: 'hidden',
            bgcolor: th.palette.mode === 'dark' ? '#1e1e1e' : '#ffffff',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          })}>
            {/* Content header */}
            <Box sx={(th) => ({
              px: 3,
              height: 52,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexShrink: 0,
              position: 'sticky',
              top: 0,
              zIndex: 1,
              bgcolor: th.palette.mode === 'dark' ? '#1e1e1e' : '#ffffff',
            })}>
              <Typography sx={{ fontWeight: 700, fontSize: 18 }}>{sectionTitle}</Typography>
              {canResetSection && (
                <Button
                  variant="text"
                  size="small"
                  disabled={resetDisabled}
                  onClick={handleResetSection}
                  sx={{
                    textTransform: 'none',
                    fontWeight: 600,
                    borderRadius: '4px',
                  }}
                >
                  {t('settings.resetToDefaults')}
                </Button>
              )}
            </Box>
            <Divider />

            <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>

            {/* ── General section ── */}
            {section === 'general' && (
              <Box sx={{ px: 3, pt: 1, pb: 3 }}>
                <SettingRow label={t('settings.language')}>
                  <Select
                    size="small"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    sx={selectSx}
                  >
                    <MenuItem value="en" sx={{ fontSize: 13 }}>English</MenuItem>
                    <MenuItem value="de" sx={{ fontSize: 13 }}>Deutsch</MenuItem>
                  </Select>
                </SettingRow>

                <SettingRow label={t('settings.appearance')} noDivider>
                  <Select
                    size="small"
                    value={mode}
                    onChange={(e) => setPreference(e.target.value)}
                    sx={selectSx}
                  >
                    <MenuItem value="light" sx={{ fontSize: 13 }}>{t('settings.light')}</MenuItem>
                    <MenuItem value="dark" sx={{ fontSize: 13 }}>{t('settings.dark')}</MenuItem>
                  </Select>
                </SettingRow>
              </Box>
            )}

            {/* ── Auto-download section ── */}
            {section === 'auto-download' && (
              <Box sx={{ px: 3, pt: 1, pb: 3 }}>
                <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
                  {t('settings.autoDownloadDescription')}
                </Typography>

                <SettingRow
                  label={t('settings.autoDownloadUseMetadata')}
                  description={t('settings.autoDownloadUseMetadataDesc')}
                >
                  <Switch
                    size="small"
                    checked={Boolean(autoDownloadSettings.useMetadata)}
                    disabled={autoDownloadLoading || autoDownloadSaving}
                    onChange={(event) => updateAutoDownloadSettings({ useMetadata: event.target.checked })}
                  />
                </SettingRow>

                <SettingRow
                  label={t('settings.autoDownloadEmbedCover')}
                  description={t('settings.autoDownloadEmbedCoverDesc')}
                >
                  <Switch
                    size="small"
                    checked={Boolean(autoDownloadSettings.embedCoverArt)}
                    disabled={autoDownloadLoading || autoDownloadSaving}
                    onChange={(event) => updateAutoDownloadSettings({ embedCoverArt: event.target.checked })}
                  />
                </SettingRow>

                <SettingRow label={t('settings.autoDownloadMaxAudioBitrate')}>
                  <Select
                    size="small"
                    value={Number(autoDownloadSettings.maxAudioBitrateKbps) || 0}
                    disabled={autoDownloadLoading || autoDownloadSaving}
                    onChange={(event) => updateAutoDownloadSettings({ maxAudioBitrateKbps: Number(event.target.value) || 0 })}
                    sx={selectSx}
                  >
                    <MenuItem value={0} sx={{ fontSize: 13 }}>{t('settings.autoDownloadBest')}</MenuItem>
                    <MenuItem value={320} sx={{ fontSize: 13 }}>320 kbps</MenuItem>
                    <MenuItem value={256} sx={{ fontSize: 13 }}>256 kbps</MenuItem>
                    <MenuItem value={192} sx={{ fontSize: 13 }}>192 kbps</MenuItem>
                    <MenuItem value={160} sx={{ fontSize: 13 }}>160 kbps</MenuItem>
                    <MenuItem value={128} sx={{ fontSize: 13 }}>128 kbps</MenuItem>
                    <MenuItem value={96} sx={{ fontSize: 13 }}>96 kbps</MenuItem>
                  </Select>
                </SettingRow>

                <SettingRow label={t('settings.autoDownloadMaxVideoQuality')} noDivider>
                  <Select
                    size="small"
                    value={Number(autoDownloadSettings.maxVideoHeight) || 0}
                    disabled={autoDownloadLoading || autoDownloadSaving}
                    onChange={(event) => updateAutoDownloadSettings({ maxVideoHeight: Number(event.target.value) || 0 })}
                    sx={selectSx}
                  >
                    <MenuItem value={0} sx={{ fontSize: 13 }}>{t('settings.autoDownloadBest')}</MenuItem>
                    <MenuItem value={2160} sx={{ fontSize: 13 }}>2160p</MenuItem>
                    <MenuItem value={1440} sx={{ fontSize: 13 }}>1440p</MenuItem>
                    <MenuItem value={1080} sx={{ fontSize: 13 }}>1080p</MenuItem>
                    <MenuItem value={720} sx={{ fontSize: 13 }}>720p</MenuItem>
                    <MenuItem value={480} sx={{ fontSize: 13 }}>480p</MenuItem>
                    <MenuItem value={360} sx={{ fontSize: 13 }}>360p</MenuItem>
                  </Select>
                </SettingRow>

                {(autoDownloadLoading || autoDownloadSaving) && (
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1 }}>
                    {t('settings.checking')}
                  </Typography>
                )}

                {autoDownloadError && (
                  <Box
                    sx={(th) => ({
                      mt: 1.5,
                      px: 2,
                      py: 1.25,
                      borderRadius: '4px',
                      bgcolor: th.palette.mode === 'dark' ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.08)',
                      border: '1px solid rgba(239,68,68,0.3)',
                    })}
                  >
                    <Typography variant="body2" sx={{ color: '#f87171', fontWeight: 500, fontSize: 13 }}>
                      {autoDownloadError}
                    </Typography>
                  </Box>
                )}
              </Box>
            )}

            {/* ── yt-dlp section ── */}
            {section === 'yt-dlp' && (
              <Box sx={{ px: 3, pt: 1, pb: 3 }}>
                <SettingRow label={t('settings.currentVersion')}>
                  <Typography sx={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: 'text.secondary' }}>
                    {ytInfo.loading ? '…' : ytInfo.currentVersion}
                  </Typography>
                </SettingRow>

                <SettingRow label={t('settings.latestVersion')}>
                  <Typography sx={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: 'text.secondary' }}>
                    {ytInfo.loading ? '…' : ytInfo.latestVersion}
                  </Typography>
                </SettingRow>

                <SettingRow label={t('settings.ytDlpPath')}>
                  <Typography sx={{ fontFamily: 'monospace', fontSize: 12, color: 'text.secondary', maxWidth: 380, textAlign: 'right', wordBreak: 'break-all' }}>
                    {ytInfo.loading ? '…' : ytInfo.binaryPath}
                  </Typography>
                </SettingRow>

                <SettingRow label={t('settings.ytDlpBinarySize')}>
                  <Typography sx={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: 'text.secondary' }}>
                    {ytInfo.loading ? '…' : ytInfo.binarySize}
                  </Typography>
                </SettingRow>

                <SettingRow label={t('settings.checkForUpdates')}>
                  <Button
                    onClick={fetchStatus}
                    disabled={ytInfo.loading || updating}
                    variant="outlined"
                    size="small"
                    startIcon={<RefreshCw size={13} />}
                    sx={{
                      textTransform: 'none',
                      fontSize: 13,
                      borderRadius: '4px',
                      height: 32,
                      borderColor: 'divider',
                      color: 'text.primary',
                      '&:hover': { borderColor: 'text.disabled', bgcolor: 'action.hover' },
                    }}
                  >
                    {ytInfo.loading ? t('settings.checking') : t('settings.checkForUpdates')}
                  </Button>
                </SettingRow>

                <SettingRow label={t('settings.updateNow')}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Box sx={{
                      width: 7, height: 7, borderRadius: '50%',
                      bgcolor: !ytInfo.updateSupported ? '#9ca3af' : ytInfo.outdated ? '#f59e0b' : '#22c55e',
                      flexShrink: 0,
                    }} />
                    <Typography variant="caption" sx={{ color: 'text.secondary', mr: 1 }}>
                      {!ytInfo.updateSupported
                        ? t('settings.updateManagedExternally')
                        : ytInfo.outdated
                          ? t('settings.updateAvailable')
                          : t('settings.upToDate')}
                    </Typography>
                    <Button
                      variant="contained"
                      onClick={startUpdate}
                      disabled={ytInfo.loading || updating || !ytInfo.outdated || !ytInfo.updateSupported}
                      disableElevation
                      size="small"
                      sx={{
                        textTransform: 'none',
                        fontSize: 13,
                        borderRadius: '4px',
                        height: 32,
                        fontWeight: 600,
                        minWidth: 100,
                      }}
                    >
                      {updating ? t('settings.updating') : t('settings.updateNow')}
                    </Button>
                  </Box>
                </SettingRow>

                {ytInfo.error && (
                  <Box sx={(th) => ({
                    mt: 1,
                    mb: 1,
                    px: 2,
                    py: 1.25,
                    borderRadius: '4px',
                    bgcolor: th.palette.mode === 'dark' ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.08)',
                    border: '1px solid rgba(239,68,68,0.3)',
                  })}>
                    <Typography variant="body2" sx={{ color: '#f87171', fontWeight: 500, fontSize: 13 }}>{ytInfo.error}</Typography>
                  </Box>
                )}

                {/* Log console */}
                <Box sx={{ mt: 2 }}>
                  <Typography sx={{ fontSize: 11, fontWeight: 600, color: 'text.disabled', letterSpacing: '0.08em', mb: 1, textTransform: 'uppercase' }}>
                    {t('settings.updateLogs')}
                  </Typography>
                  <Box
                    ref={logRef}
                    sx={(th) => ({
                      fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
                      fontSize: 12,
                      p: 1.5,
                      bgcolor: th.palette.mode === 'dark' ? '#111111' : '#1e1e1e',
                      color: '#d4d4d4',
                      borderRadius: '4px',
                      border: `1px solid ${th.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'transparent'}`,
                      height: 180,
                      overflow: 'auto',
                      whiteSpace: 'pre-wrap',
                      lineHeight: 1.6,
                      '&::-webkit-scrollbar': { width: 5 },
                      '&::-webkit-scrollbar-track': { bgcolor: 'transparent' },
                      '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(255,255,255,0.15)', borderRadius: '3px' },
                    })}
                  >
                    {logLines.length === 0 ? (
                      <span style={{ color: 'rgba(255,255,255,0.3)', fontStyle: 'italic' }}>
                        {t('settings.readyToUpdate')}
                      </span>
                    ) : (
                      logLines.map((l, i) => (
                        <div key={i} style={{
                          marginBottom: 2,
                          color: l.includes('ERROR') ? '#f87171' : undefined,
                        }}>
                          {l}
                        </div>
                      ))
                    )}
                  </Box>
                </Box>
              </Box>
            )}

            {/* ── ffmpeg section ── */}
            {section === 'ffmpeg' && (
              <Box sx={{ px: 3, pt: 1, pb: 3 }}>
                <SettingRow label={t('settings.ffmpegStatus')}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Box
                      sx={{
                        width: 7,
                        height: 7,
                        borderRadius: '50%',
                        bgcolor: ffmpegInfo.loading ? '#9ca3af' : ffmpegInfo.available ? '#22c55e' : '#ef4444',
                        flexShrink: 0,
                      }}
                    />
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      {ffmpegInfo.loading
                        ? t('settings.checking')
                        : ffmpegInfo.available
                          ? t('settings.ffmpegAvailable')
                          : t('settings.ffmpegMissing')}
                    </Typography>
                  </Box>
                </SettingRow>

                <SettingRow label={t('settings.ffmpegVersion')}>
                  <Typography sx={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: 'text.secondary' }}>
                    {ffmpegInfo.loading ? '…' : ffmpegInfo.version}
                  </Typography>
                </SettingRow>

                <SettingRow label={t('settings.ffmpegPath')}>
                  <Typography sx={{ fontFamily: 'monospace', fontSize: 12, color: 'text.secondary', maxWidth: 380, textAlign: 'right', wordBreak: 'break-all' }}>
                    {ffmpegInfo.loading ? '…' : ffmpegInfo.path}
                  </Typography>
                </SettingRow>

                <SettingRow label={t('settings.ffmpegBinarySize')}>
                  <Typography sx={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: 'text.secondary' }}>
                    {ffmpegInfo.loading ? '…' : ffmpegInfo.fileSize}
                  </Typography>
                </SettingRow>

                <SettingRow label={t('settings.projectManagedFfmpeg')}>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    {ffmpegInfo.projectManaged ? t('settings.yes') : t('settings.no')}
                  </Typography>
                </SettingRow>

                <SettingRow label={t('settings.refreshStatus')} noDivider>
                  <Button
                    onClick={fetchFfmpegStatus}
                    disabled={ffmpegInfo.loading}
                    variant="outlined"
                    size="small"
                    startIcon={<RefreshCw size={13} />}
                    sx={{
                      textTransform: 'none',
                      fontSize: 13,
                      borderRadius: '4px',
                      height: 32,
                      borderColor: 'divider',
                      color: 'text.primary',
                      '&:hover': { borderColor: 'text.disabled', bgcolor: 'action.hover' },
                    }}
                  >
                    {ffmpegInfo.loading ? t('settings.checking') : t('settings.refreshStatus')}
                  </Button>
                </SettingRow>

                {ffmpegInfo.error && (
                  <Box
                    sx={(th) => ({
                      mt: 2,
                      px: 2,
                      py: 1.25,
                      borderRadius: '4px',
                      bgcolor: th.palette.mode === 'dark' ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.08)',
                      border: '1px solid rgba(239,68,68,0.3)',
                    })}
                  >
                    <Typography variant="body2" sx={{ color: '#f87171', fontWeight: 500, fontSize: 13 }}>
                      {ffmpegInfo.error}
                    </Typography>
                  </Box>
                )}
              </Box>
            )}
            </Box>
          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  )
}
