import React from 'react'
import { Box, Select, MenuItem, Switch } from '@mui/material'
import SettingRow from './SettingRow'
import SettingGroup from './SettingGroup'
import AppVersionUpdateSection from './AppVersionUpdateSection'

export default function GeneralSettingsSection({
  language,
  setLanguage,
  mode,
  setPreference,
  showAppUpdateSection,
  selectSx,
  t,
  appUpdateState,
  isElectronUpdaterAvailable,
  checkForAppUpdates,
  downloadAppUpdate,
  installAppUpdate,
  setAppAutoUpdateEnabled,
  isMobileLayout = false,
  showDesktopSettings = false,
  desktopSettings = null,
  desktopSettingsLoading = false,
  onUpdateDesktopSettings,
}) {
  const startupSupported = desktopSettings?.startupSupported !== false
  const showStartupMode = startupSupported && Boolean(desktopSettings?.startOnSystemStartup)

  return (
    <Box sx={{ px: isMobileLayout ? 2 : 4, pt: isMobileLayout ? 2.5 : 4, pb: isMobileLayout ? 2.5 : 4 }}>
      <SettingGroup>
        <SettingRow label={t('settings.language')}>
          <Select
            size="small"
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
            sx={selectSx}
          >
            <MenuItem value="en" sx={{ fontSize: 14 }}>English</MenuItem>
            <MenuItem value="de" sx={{ fontSize: 14 }}>Deutsch</MenuItem>
          </Select>
        </SettingRow>

        <SettingRow label={t('settings.appearance')} noDivider>
          <Select
            size="small"
            value={mode}
            onChange={(event) => setPreference(event.target.value)}
            sx={selectSx}
          >
            <MenuItem value="light" sx={{ fontSize: 14 }}>{t('settings.light')}</MenuItem>
            <MenuItem value="dark" sx={{ fontSize: 14 }}>{t('settings.dark')}</MenuItem>
          </Select>
        </SettingRow>
      </SettingGroup>

      {showDesktopSettings && (
        <SettingGroup title={t('settings.desktopBehaviorTitle')}>
          <SettingRow
            label={t('settings.closeToTrayOnClose')}
            description={t('settings.closeToTrayOnCloseDesc')}
          >
            <Switch
              checked={Boolean(desktopSettings?.closeToTrayOnWindowClose)}
              onChange={(event) => {
                onUpdateDesktopSettings?.({ closeToTrayOnWindowClose: event.target.checked })
              }}
              disabled={desktopSettingsLoading}
            />
          </SettingRow>

          <SettingRow
            label={t('settings.startOnSystemStartup')}
            description={startupSupported ? t('settings.startOnSystemStartupDesc') : t('settings.startOnSystemStartupUnsupported')}
            noDivider={!showStartupMode}
          >
            <Switch
              checked={Boolean(desktopSettings?.startOnSystemStartup)}
              onChange={(event) => {
                onUpdateDesktopSettings?.({ startOnSystemStartup: event.target.checked })
              }}
              disabled={desktopSettingsLoading || !startupSupported}
            />
          </SettingRow>

          {showStartupMode && (
            <SettingRow
              label={t('settings.startupWindowMode')}
              description={t('settings.startupWindowModeDesc')}
              noDivider
            >
              <Select
                size="small"
                value={desktopSettings?.startupWindowMode === 'minimized' ? 'minimized' : 'normal'}
                onChange={(event) => {
                  onUpdateDesktopSettings?.({ startupWindowMode: event.target.value })
                }}
                disabled={desktopSettingsLoading}
                sx={selectSx}
              >
                <MenuItem value="normal" sx={{ fontSize: 14 }}>{t('settings.startupWindowModeNormal')}</MenuItem>
                <MenuItem value="minimized" sx={{ fontSize: 14 }}>{t('settings.startupWindowModeMinimized')}</MenuItem>
              </Select>
            </SettingRow>
          )}
        </SettingGroup>
      )}

      {showAppUpdateSection && (
        <AppVersionUpdateSection
          t={t}
          appUpdateState={appUpdateState}
          isElectronUpdaterAvailable={isElectronUpdaterAvailable}
          checkForAppUpdates={checkForAppUpdates}
          downloadAppUpdate={downloadAppUpdate}
          installAppUpdate={installAppUpdate}
          setAppAutoUpdateEnabled={setAppAutoUpdateEnabled}
        />
      )}
    </Box>
  )
}
