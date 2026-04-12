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
} from '@mui/material'
import { X, RefreshCw } from 'lucide-react'
import { ColorModeContext } from '../providers/ColorModeProvider'
import { SettingsContext } from '../providers/SettingsProvider'
import { useI18n } from '../providers/I18nProvider'
import { getApiBase } from '../utils/metadata'

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

export default function SettingsModal({ open, onClose }) {
  const { t } = useI18n()
  const { mode, setPreference } = useContext(ColorModeContext)
  const { language, setLanguage } = useContext(SettingsContext)
  const [section, setSection] = useState('general')
  const API_BASE = getApiBase()

  // yt-dlp state
  const [ytInfo, setYtInfo] = useState({
    currentVersion: '-',
    latestVersion: '-',
    outdated: false,
    updateSupported: true,
    loading: false,
    error: '',
  })
  const [updating, setUpdating] = useState(false)
  const [logLines, setLogLines] = useState([])
  const logRef = useRef(null)

  const fetchStatus = async () => {
    setYtInfo((s) => ({ ...s, loading: true, error: '' }))
    try {
      const resp = await fetch(`${API_BASE}/api/yt-dlp/status`)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json()
      setYtInfo({
        currentVersion: data.currentVersion || '-',
        latestVersion: data.latestVersion || data.currentVersion || '-',
        outdated: !!data.outdated,
        updateSupported: data.updateSupported !== false,
        loading: false,
        error: ''
      })
    } catch (e) {
      setYtInfo((s) => ({ ...s, loading: false, error: t('settings.failedLoadStatus', { message: e?.message || e }) }))
    }
  }

  useEffect(() => {
    if (open && section === 'yt-dlp') fetchStatus()
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
    { key: 'yt-dlp', label: t('settings.sectionYtDlp') },
  ]), [t])

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
            overflow: 'auto',
            bgcolor: th.palette.mode === 'dark' ? '#1e1e1e' : '#ffffff',
            display: 'flex',
            flexDirection: 'column',
          })}>
            {/* Content header */}
            <Box sx={{ px: 3, height: 52, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              <Typography sx={{ fontWeight: 700, fontSize: 18 }}>
                {section === 'general' ? t('settings.general') : t('settings.ytDlpConfig')}
              </Typography>
            </Box>
            <Divider />

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
          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  )
}
