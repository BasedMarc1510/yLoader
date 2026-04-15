import React from 'react'
import { Box, Select, MenuItem } from '@mui/material'
import SettingRow from './SettingRow'

export default function GeneralSettingsSection({
  language,
  setLanguage,
  mode,
  setPreference,
  selectSx,
  t,
}) {
  return (
    <Box sx={{ px: 3, pt: 1, pb: 3 }}>
      <SettingRow label={t('settings.language')}>
        <Select
          size="small"
          value={language}
          onChange={(event) => setLanguage(event.target.value)}
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
          onChange={(event) => setPreference(event.target.value)}
          sx={selectSx}
        >
          <MenuItem value="light" sx={{ fontSize: 13 }}>{t('settings.light')}</MenuItem>
          <MenuItem value="dark" sx={{ fontSize: 13 }}>{t('settings.dark')}</MenuItem>
        </Select>
      </SettingRow>
    </Box>
  )
}
