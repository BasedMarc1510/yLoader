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
  Typography,
  Divider,
  Tooltip,
  Button,
} from '@mui/material'
import { X } from 'lucide-react'
import { ColorModeContext } from '../providers/ColorModeProvider'
import { SettingsContext } from '../providers/SettingsProvider'
import { useI18n } from '../providers/I18nProvider'
import { getApiBase } from '../utils/metadata'
import GeneralSettingsSection from './settings-modal/GeneralSettingsSection'
import AutoDownloadSettingsSection from './settings-modal/AutoDownloadSettingsSection'
import YtDlpSettingsSection from './settings-modal/YtDlpSettingsSection'
import FfmpegSettingsSection from './settings-modal/FfmpegSettingsSection'
import {
  AUTO_DOWNLOAD_DEFAULTS,
  normalizeAutoDownloadSettings,
} from './settings-modal/autoDownloadUtils'

export default function SettingsModal({ open, onClose, requestedSection = 'general' }) {
  const { t } = useI18n()
  const { mode, setPreference } = useContext(ColorModeContext)
  const { language, setLanguage } = useContext(SettingsContext)
  const [section, setSection] = useState(() => String(requestedSection || 'general'))
  const API_BASE = getApiBase()

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
    setYtInfo((state) => ({ ...state, loading: true, error: '' }))

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
        error: data.error || '',
      })
    } catch (error) {
      setYtInfo((state) => ({
        ...state,
        loading: false,
        error: t('settings.failedLoadStatus', { message: error?.message || error }),
      }))
    }
  }

  const fetchFfmpegStatus = async () => {
    setFfmpegInfo((state) => ({ ...state, loading: true, error: '' }))

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
    } catch (error) {
      setFfmpegInfo((state) => ({
        ...state,
        loading: false,
        error: t('settings.failedLoadFfmpegStatus', { message: error?.message || error }),
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
    } catch (error) {
      setAutoDownloadError(t('settings.autoDownloadLoadFailed', { message: error?.message || error }))
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
    } catch (error) {
      setAutoDownloadError(t('settings.autoDownloadSaveFailed', { message: error?.message || error }))
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
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [logLines])

  const startUpdate = () => {
    if (!ytInfo.updateSupported) {
      setLogLines((lines) => [...lines, t('settings.updateManagedExternally')])
      return
    }

    setUpdating(true)
    setLogLines((lines) => [...lines, t('settings.startUpdate')])

    const es = new EventSource(`${API_BASE}/api/yt-dlp/update/stream`)
    es.onmessage = (event) => {
      if (event.data) setLogLines((lines) => [...lines, event.data])
    }

    es.addEventListener('info', (event) => {
      if (event.data) setLogLines((lines) => [...lines, event.data])
    })

    es.addEventListener('error', (event) => {
      const message = typeof event?.data === 'string' && event.data ? event.data : t('settings.updateErrorOccurred')
      setLogLines((lines) => [...lines, `ERROR: ${message}`])
    })

    es.addEventListener('end', (event) => {
      const ok = event?.data === 'done'
      setLogLines((lines) => [...lines, ok ? t('settings.updateCompleted') : t('settings.updateFailed')])
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
        sx: (theme) => ({
          borderRadius: '6px',
          overflow: 'hidden',
          bgcolor: theme.palette.mode === 'dark' ? '#1e1e1e' : '#f5f5f5',
          backgroundImage: 'none',
        }),
      }}
    >
      <DialogContent sx={{ p: 0, '&:first-of-type': { pt: 0 } }}>
        <Box sx={{ display: 'flex', height: 520 }}>
          <Box sx={(theme) => ({
            width: 200,
            flexShrink: 0,
            borderRight: `1px solid ${theme.palette.divider}`,
            bgcolor: theme.palette.mode === 'dark' ? '#161616' : '#ececec',
            display: 'flex',
            flexDirection: 'column',
          })}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                px: 2,
                height: 52,
                flexShrink: 0,
              }}
            >
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
              {sections.map((entry) => (
                <ListItem key={entry.key} disablePadding sx={{ px: 1, mb: 0.25 }}>
                  <ListItemButton
                    selected={section === entry.key}
                    onClick={() => setSection(entry.key)}
                    sx={(theme) => ({
                      borderRadius: '4px',
                      py: '7px',
                      px: 1.5,
                      '&.Mui-selected': {
                        bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                        '&:hover': { bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)' },
                      },
                      '&:hover': { bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)' },
                    })}
                  >
                    <ListItemText
                      primary={entry.label}
                      primaryTypographyProps={{ fontSize: 13.5, fontWeight: section === entry.key ? 600 : 400 }}
                    />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          </Box>

          <Box sx={(theme) => ({
            flex: 1,
            overflow: 'hidden',
            bgcolor: theme.palette.mode === 'dark' ? '#1e1e1e' : '#ffffff',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          })}>
            <Box sx={(theme) => ({
              px: 3,
              height: 52,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexShrink: 0,
              position: 'sticky',
              top: 0,
              zIndex: 1,
              bgcolor: theme.palette.mode === 'dark' ? '#1e1e1e' : '#ffffff',
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
              {section === 'general' && (
                <GeneralSettingsSection
                  language={language}
                  setLanguage={setLanguage}
                  mode={mode}
                  setPreference={setPreference}
                  selectSx={selectSx}
                  t={t}
                />
              )}

              {section === 'auto-download' && (
                <AutoDownloadSettingsSection
                  autoDownloadSettings={autoDownloadSettings}
                  autoDownloadLoading={autoDownloadLoading}
                  autoDownloadSaving={autoDownloadSaving}
                  autoDownloadError={autoDownloadError}
                  updateAutoDownloadSettings={updateAutoDownloadSettings}
                  selectSx={selectSx}
                  t={t}
                />
              )}

              {section === 'yt-dlp' && (
                <YtDlpSettingsSection
                  ytInfo={ytInfo}
                  updating={updating}
                  startUpdate={startUpdate}
                  fetchStatus={fetchStatus}
                  logRef={logRef}
                  logLines={logLines}
                  t={t}
                />
              )}

              {section === 'ffmpeg' && (
                <FfmpegSettingsSection
                  ffmpegInfo={ffmpegInfo}
                  fetchFfmpegStatus={fetchFfmpegStatus}
                  t={t}
                />
              )}
            </Box>
          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  )
}
