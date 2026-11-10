import React from 'react'
import { Alert, Button, Switch, TextField, Select, MenuItem } from '@mui/material'
import SettingRow from './SettingRow'
import {
  CHROMIUM_COOKIE_BROWSERS,
  resolveBrowserLabel,
  resolveKeyringLabel,
} from './ytDlpCookieSettingsUtils'

export default function YtDlpCookieBrowserSettingsGroup({
  cookieState,
  cookieControlsDisabled: settingsDisabled,
  onUpdateCookieSettings,
  t,
}) {
  const selectedBrowser = String(cookieState.browserName || '').trim().toLowerCase()
  const browserImportSupported = Boolean(cookieState.browserImportSupported)
  const browserEnabled = Boolean(cookieState.cookiesFromBrowserEnabled)
  const browserHasChromiumKeyring = CHROMIUM_COOKIE_BROWSERS.has(selectedBrowser)
  const browserHasFirefoxContainer = selectedBrowser === 'firefox'
  const requestBrowserAccess = typeof window !== 'undefined' && window.yloaderRuntime?.cookies?.requestBrowserAccess
  const [requestingAccess, setRequestingAccess] = React.useState(false)
  const [accessStatus, setAccessStatus] = React.useState('')
  const cookieControlsDisabled = settingsDisabled || requestingAccess

  const [browserProfileDraft, setBrowserProfileDraft] = React.useState(String(cookieState.browserProfile || ''))
  const [browserContainerDraft, setBrowserContainerDraft] = React.useState(String(cookieState.browserContainer || ''))

  React.useEffect(() => {
    setBrowserProfileDraft(String(cookieState.browserProfile || ''))
  }, [cookieState.browserProfile])

  React.useEffect(() => {
    setBrowserContainerDraft(String(cookieState.browserContainer || ''))
  }, [cookieState.browserContainer])

  const commitBrowserProfile = React.useCallback(() => {
    const current = String(cookieState.browserProfile || '').trim()
    const next = String(browserProfileDraft || '').trim()
    if (next === current) return
    onUpdateCookieSettings?.({ browserProfile: next })
  }, [browserProfileDraft, cookieState.browserProfile, onUpdateCookieSettings])

  const commitBrowserContainer = React.useCallback(() => {
    const current = String(cookieState.browserContainer || '').trim()
    const next = String(browserContainerDraft || '').trim()
    if (next === current) return
    onUpdateCookieSettings?.({ browserContainer: next })
  }, [browserContainerDraft, cookieState.browserContainer, onUpdateCookieSettings])

  const browserOptions = React.useMemo(() => (
    Array.isArray(cookieState.supportedBrowsers)
      ? cookieState.supportedBrowsers
      : []
  ), [cookieState.supportedBrowsers])

  const keyringOptions = React.useMemo(() => (
    Array.isArray(cookieState.supportedKeyrings)
      ? cookieState.supportedKeyrings
      : []
  ), [cookieState.supportedKeyrings])

  const applyBrowserSettings = async (patch, checkAccess = false) => {
    setAccessStatus('')
    if (requestBrowserAccess && checkAccess) {
      const browser = patch?.browserName || selectedBrowser
      const profile = patch?.browserProfile ?? browserProfileDraft.trim()
      setRequestingAccess(true)
      try {
        const status = await requestBrowserAccess(browser, profile, t('settings.cookieBrowserAccessPrompt', {
          browser: resolveBrowserLabel(t, browser),
        }))
        if (status !== 'ready') {
          setAccessStatus(status === 'canceled' ? '' : status)
          return
        }
        if (!patch) setAccessStatus('ready')
      } catch {
        setAccessStatus('unavailable')
        return
      } finally {
        setRequestingAccess(false)
      }
    }
    if (patch) onUpdateCookieSettings?.(patch)
  }

  if (!browserImportSupported) return null

  const accessMessage = {
    ready: 'cookieBrowserAccessReady',
    missing: 'cookieBrowserAccessMissing',
    wrongLocation: 'cookieBrowserAccessWrongLocation',
    denied: 'cookieBrowserAccessDenied',
    unavailable: 'cookieBrowserAccessDenied',
  }[accessStatus]

  return (
    <>
      <SettingRow
        label={t('settings.cookieBrowserEnabled')}
        description={t(requestBrowserAccess && !selectedBrowser ? 'settings.cookieBrowserChooseFirst' : 'settings.cookieBrowserEnabledDesc')}
      >
        <Switch
          checked={browserImportSupported && browserEnabled}
          disabled={cookieControlsDisabled || Boolean(requestBrowserAccess && !selectedBrowser)}
          inputProps={{ 'aria-label': t('settings.cookieBrowserEnabled') }}
          onChange={(event) => {
            const nextEnabled = event.target.checked
            const fallbackBrowser = selectedBrowser || browserOptions[0] || ''
            void applyBrowserSettings({
              cookiesFromBrowserEnabled: nextEnabled,
              browserName: nextEnabled ? fallbackBrowser : selectedBrowser,
              ...(requestBrowserAccess && nextEnabled ? { browserProfile: browserProfileDraft.trim() } : {}),
            }, nextEnabled)
          }}
        />
      </SettingRow>

      {browserImportSupported && (
        <>
          <SettingRow
            label={t('settings.cookieBrowser')}
            description={t('settings.cookieBrowserDesc')}
          >
            <Select
              size="small"
              value={selectedBrowser}
              disabled={cookieControlsDisabled || (!browserEnabled && !requestBrowserAccess)}
              inputProps={{ 'aria-label': t('settings.cookieBrowser') }}
              onChange={(event) => {
                const nextBrowser = String(event.target.value || '').trim().toLowerCase()
                const supportsKeyring = CHROMIUM_COOKIE_BROWSERS.has(nextBrowser)
                const supportsContainer = nextBrowser === 'firefox'

                void applyBrowserSettings({
                  browserName: nextBrowser,
                  browserKeyring: supportsKeyring ? cookieState.browserKeyring : '',
                  browserContainer: supportsContainer ? cookieState.browserContainer : '',
                  ...(requestBrowserAccess ? { browserProfile: '' } : {}),
                  cookiesFromBrowserEnabled: Boolean(nextBrowser) && (browserEnabled || !requestBrowserAccess),
                }, Boolean(nextBrowser) && browserEnabled)
              }}
              sx={{
                fontSize: 13,
                height: 32,
                minWidth: 180,
                borderRadius: '4px',
                '& .MuiSelect-select': { py: '6px', px: 1.5 },
              }}
            >
              <MenuItem value="" sx={{ fontSize: 13 }}>{t('settings.cookieBrowserPlaceholder')}</MenuItem>
              {browserOptions.map((browser) => (
                <MenuItem key={browser} value={browser} sx={{ fontSize: 13 }}>
                  {resolveBrowserLabel(t, browser)}
                </MenuItem>
              ))}
            </Select>
          </SettingRow>

          {browserHasChromiumKeyring && (
            <SettingRow
              label={t('settings.cookieBrowserKeyring')}
              description={t('settings.cookieBrowserKeyringDesc')}
            >
              <Select
                size="small"
                value={String(cookieState.browserKeyring || '')}
                disabled={cookieControlsDisabled || !browserEnabled}
                onChange={(event) => {
                  const nextKeyring = String(event.target.value || '').trim().toLowerCase()
                  onUpdateCookieSettings?.({ browserKeyring: nextKeyring })
                }}
                sx={{
                  fontSize: 13,
                  height: 32,
                  minWidth: 180,
                  borderRadius: '4px',
                  '& .MuiSelect-select': { py: '6px', px: 1.5 },
                }}
              >
                <MenuItem value="" sx={{ fontSize: 13 }}>{t('settings.cookieBrowserKeyringPlaceholder')}</MenuItem>
                {keyringOptions.map((keyring) => (
                  <MenuItem key={keyring} value={keyring} sx={{ fontSize: 13 }}>
                    {resolveKeyringLabel(t, keyring)}
                  </MenuItem>
                ))}
              </Select>
            </SettingRow>
          )}

          <SettingRow
            label={t('settings.cookieBrowserProfile')}
            description={t('settings.cookieBrowserProfileDesc')}
          >
            <TextField
              size="small"
              value={browserProfileDraft}
              disabled={cookieControlsDisabled || (!browserEnabled && !requestBrowserAccess) || !selectedBrowser}
              placeholder={t('settings.cookieBrowserProfilePlaceholder')}
              onChange={(event) => setBrowserProfileDraft(event.target.value)}
              onBlur={commitBrowserProfile}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return
                event.preventDefault()
                event.currentTarget.blur()
              }}
              sx={{
                width: { xs: '100%', sm: 200, md: 260 },
                '& .MuiInputBase-input': {
                  fontSize: 12.5,
                  py: '6px',
                },
              }}
            />
          </SettingRow>

          {browserHasFirefoxContainer && (
            <SettingRow
              label={t('settings.cookieBrowserContainer')}
              description={t('settings.cookieBrowserContainerDesc')}
            >
              <TextField
                size="small"
                value={browserContainerDraft}
                disabled={cookieControlsDisabled || !browserEnabled}
                placeholder={t('settings.cookieBrowserContainerPlaceholder')}
                onChange={(event) => setBrowserContainerDraft(event.target.value)}
                onBlur={commitBrowserContainer}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return
                  event.preventDefault()
                  event.currentTarget.blur()
                }}
                sx={{
                  width: { xs: '100%', sm: 200, md: 260 },
                  '& .MuiInputBase-input': {
                    fontSize: 12.5,
                    py: '6px',
                  },
                }}
              />
            </SettingRow>
          )}

          {requestBrowserAccess && browserEnabled && (
            <SettingRow label={t('settings.cookieBrowserAccess')}>
              <Button size="small" disabled={cookieControlsDisabled} onClick={() => void applyBrowserSettings(null, true)}>
                {t('settings.cookieBrowserAccessRetry')}
              </Button>
            </SettingRow>
          )}

          {(requestingAccess || accessMessage) && (
            <Alert severity={requestingAccess || accessStatus === 'ready' ? 'info' : 'warning'}>
              {t(`settings.${requestingAccess ? 'cookieBrowserAccessPending' : accessMessage}`)}
            </Alert>
          )}

          <SettingRow
            label={t('settings.cookieBrowserRemoveTitle')}
            description={t('settings.cookieBrowserRemoveDesc')}
            noDivider
          >
            <Button
              variant="text"
              size="small"
              disabled={cookieControlsDisabled || (!browserEnabled && !selectedBrowser)}
              onClick={() => {
                setAccessStatus('')
                setBrowserProfileDraft('')
                setBrowserContainerDraft('')
                onUpdateCookieSettings?.({
                  cookiesFromBrowserEnabled: false,
                  browserName: '',
                  browserKeyring: '',
                  browserProfile: '',
                  browserContainer: '',
                })
              }}
              sx={{
                textTransform: 'none',
                minWidth: 74,
                fontWeight: 600,
                borderRadius: '4px',
              }}
            >
              {t('settings.cookieBrowserRemove')}
            </Button>
          </SettingRow>
        </>
      )}
    </>
  )
}
