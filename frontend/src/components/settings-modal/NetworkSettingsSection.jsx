import React from 'react'
import { Box, Typography } from '@mui/material'
import { normalizeYtDlpCookieSettings } from '../../utils/ytDlpCookieSettings'
import YtDlpCookieFileSettingsGroup from './YtDlpCookieFileSettingsGroup'
import YtDlpCookieBrowserSettingsGroup from './YtDlpCookieBrowserSettingsGroup'
import SettingGroup from './SettingGroup'

/**
 * Network & Authentication settings section.
 * - Web mode: only cookie file import
 * - Electron mode: cookie file + browser extraction
 */
export default function NetworkSettingsSection({
  cookieSettings,
  cookieSettingsLoading,
  cookieSettingsSaving,
  cookieSettingsError,
  onUpdateCookieSettings,
  onRefreshCookieSettings,
  requestedFocusTarget,
  requestedFocusRequestId,
  t,
  isElectronRuntime,
  isMobileLayout = false,
}) {
  const cookieState = normalizeYtDlpCookieSettings(cookieSettings)
  const cookieControlsDisabled = Boolean(cookieSettingsLoading || cookieSettingsSaving)
  const cookieSectionRef = React.useRef(null)
  const showBrowserImport = isElectronRuntime && cookieState.browserImportSupported
  const fileModeActive = Boolean(cookieState.cookiesFileEnabled)
  const browserModeActive = Boolean(showBrowserImport && cookieState.cookiesFromBrowserEnabled)
  const cookieFilePanelDisabled = Boolean(cookieControlsDisabled || browserModeActive)
  const cookieBrowserPanelDisabled = Boolean(cookieControlsDisabled || fileModeActive)

  const updateCookieSettingsExclusive = React.useCallback((changes) => {
    const patch = (changes && typeof changes === 'object') ? changes : {}
    const nextPatch = { ...patch }

    if (nextPatch.cookiesFileEnabled === true) {
      nextPatch.cookiesFromBrowserEnabled = false
    }

    if (nextPatch.cookiesFromBrowserEnabled === true) {
      nextPatch.cookiesFileEnabled = false
    }

    onUpdateCookieSettings?.(nextPatch)
  }, [onUpdateCookieSettings])

  React.useEffect(() => {
    if (!showBrowserImport) return
    if (!(cookieState.cookiesFileEnabled && cookieState.cookiesFromBrowserEnabled)) return

    onUpdateCookieSettings?.({
      cookiesFileEnabled: false,
      cookiesFromBrowserEnabled: true,
    })
  }, [cookieState.cookiesFileEnabled, cookieState.cookiesFromBrowserEnabled, onUpdateCookieSettings, showBrowserImport])

  React.useEffect(() => {
    const focusTarget = String(requestedFocusTarget || '').trim().toLowerCase()
    if (!focusTarget.startsWith('cookies')) return
    if (!cookieSectionRef.current) return

    const raf = window.requestAnimationFrame(() => {
      cookieSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })

    return () => window.cancelAnimationFrame(raf)
  }, [requestedFocusRequestId, requestedFocusTarget])

  return (
    <Box
      ref={cookieSectionRef}
      sx={{
        px: isMobileLayout ? 2 : 4,
        pt: isMobileLayout ? 2.5 : 4,
        pb: isMobileLayout ? 2.5 : 4,
        scrollMarginTop: isMobileLayout ? '16px' : '32px',
      }}
    >
      <Box sx={{ mb: 2 }}>
        <Typography sx={{ fontWeight: 600, color: 'text.secondary', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {t('settings.cookieSettingsTitle')}
        </Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5, lineHeight: 1.4, fontSize: 13 }}>
          {t('settings.cookieSettingsDescription')}
        </Typography>
      </Box>

      {/* Cookie file import — always available */}
      <Box
        sx={{
          opacity: cookieFilePanelDisabled ? 0.42 : 1,
          filter: cookieFilePanelDisabled ? 'grayscale(0.25)' : 'none',
          transition: 'opacity 160ms ease, filter 160ms ease',
          pointerEvents: cookieFilePanelDisabled ? 'none' : 'auto',
        }}
      >
        <SettingGroup title={t('settings.networkCookieFileTitle')}>
          <YtDlpCookieFileSettingsGroup
            cookieState={cookieState}
            cookieControlsDisabled={cookieFilePanelDisabled}
            cookieSettingsLoading={cookieSettingsLoading}
            cookieSettingsSaving={cookieSettingsSaving}
            onUpdateCookieSettings={updateCookieSettingsExclusive}
            t={t}
          />
        </SettingGroup>
      </Box>

      {/* Browser cookie extraction — Electron only */}
      {showBrowserImport && (
        <Box
          sx={{
            opacity: cookieBrowserPanelDisabled ? 0.42 : 1,
            filter: cookieBrowserPanelDisabled ? 'grayscale(0.25)' : 'none',
            transition: 'opacity 160ms ease, filter 160ms ease',
            pointerEvents: cookieBrowserPanelDisabled ? 'none' : 'auto',
          }}
        >
          <SettingGroup title={t('settings.networkCookieBrowserTitle')}>
            <YtDlpCookieBrowserSettingsGroup
              cookieState={cookieState}
              cookieControlsDisabled={cookieBrowserPanelDisabled}
              onUpdateCookieSettings={updateCookieSettingsExclusive}
              t={t}
            />
          </SettingGroup>
        </Box>
      )}

      {/* Unsupported hint for web mode */}
      {!isElectronRuntime && (
        <Box sx={(theme) => ({
          mt: 1,
          px: 2,
          py: 1.25,
          borderRadius: '8px',
          bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
          border: `1px solid ${theme.palette.divider}`,
        })}>
          <Typography variant="caption" sx={{ color: 'text.secondary', lineHeight: 1.45, display: 'block' }}>
            {t('settings.cookieBrowserUnsupportedHint')}
          </Typography>
        </Box>
      )}

      {cookieSettingsError && (
        <Box sx={(th) => ({
          mt: 1.5, px: 2, py: 1.25, borderRadius: '4px',
          bgcolor: th.palette.mode === 'dark' ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.3)',
        })}>
          <Typography variant="body2" sx={{ color: '#f87171', fontWeight: 500, fontSize: 13 }}>
            {cookieSettingsError}
          </Typography>
        </Box>
      )}
    </Box>
  )
}
