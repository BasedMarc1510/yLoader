import React from 'react'
import { Box, Select, MenuItem } from '@mui/material'
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
}) {
  return (
    <Box sx={{ px: 4, pt: 4, pb: 4 }}>
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

      {showAppUpdateSection && (
        <AppVersionUpdateSection
          t={t}
          appUpdateState={appUpdateState}
          isElectronUpdaterAvailable={isElectronUpdaterAvailable}
          checkForAppUpdates={checkForAppUpdates}
          downloadAppUpdate={downloadAppUpdate}
          installAppUpdate={installAppUpdate}
        />
      )}
    </Box>
  )
}
