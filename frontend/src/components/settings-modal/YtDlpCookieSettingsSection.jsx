import React from 'react'
import { Box, Typography, Button } from '@mui/material'
import { normalizeYtDlpCookieSettings } from '../../utils/ytDlpCookieSettings'
import YtDlpCookieFileSettingsGroup from './YtDlpCookieFileSettingsGroup'
import YtDlpCookieBrowserSettingsGroup from './YtDlpCookieBrowserSettingsGroup'
import SettingGroup from './SettingGroup'

export default function YtDlpCookieSettingsSection({
  cookieSettings,
  cookieSettingsLoading,
  cookieSettingsSaving,
  cookieSettingsError,
  onUpdateCookieSettings,
  onRefreshCookieSettings,
  requestedFocusTarget,
  requestedFocusRequestId,
  t,
}) {
  const cookieState = normalizeYtDlpCookieSettings(cookieSettings)
  const cookieControlsDisabled = Boolean(cookieSettingsLoading || cookieSettingsSaving)
  const cookieSectionRef = React.useRef(null)

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
    <>
      <Box
        ref={cookieSectionRef}
        sx={{
          mt: 3.5,
          mb: 1.5,
          scrollMarginTop: '32px',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
          <Typography sx={{ fontWeight: 600, color: 'text.secondary', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {t('settings.cookieSettingsTitle')}
          </Typography>
          <Button
            size="small"
            variant="text"
            onClick={() => onRefreshCookieSettings?.()}
            disabled={cookieControlsDisabled}
            sx={{
              textTransform: 'none',
              minWidth: 0,
              px: 1,
              fontSize: 12,
              borderRadius: '8px',
            }}
          >
            {t('settings.refreshStatus')}
          </Button>
        </Box>
        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5, lineHeight: 1.4, fontSize: 13 }}>
          {t('settings.cookieSettingsDescription')}
        </Typography>
      </Box>

      <SettingGroup sx={{ mb: 0 }}>
        <YtDlpCookieFileSettingsGroup
          cookieState={cookieState}
          cookieControlsDisabled={cookieControlsDisabled}
          cookieSettingsLoading={cookieSettingsLoading}
          cookieSettingsSaving={cookieSettingsSaving}
          onUpdateCookieSettings={onUpdateCookieSettings}
          t={t}
        />

        <YtDlpCookieBrowserSettingsGroup
          cookieState={cookieState}
          cookieControlsDisabled={cookieControlsDisabled}
          onUpdateCookieSettings={onUpdateCookieSettings}
          t={t}
        />
      </SettingGroup>

      {cookieSettingsError && (
        <Box sx={(th) => ({
          mt: 1,
          mb: 1,
          px: 2,
          py: 1.25,
          borderRadius: '4px',
          bgcolor: th.palette.mode === 'dark' ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.3)',
        })}>
          <Typography variant="body2" sx={{ color: '#f87171', fontWeight: 500, fontSize: 13 }}>
            {cookieSettingsError}
          </Typography>
        </Box>
      )}
    </>
  )
}
