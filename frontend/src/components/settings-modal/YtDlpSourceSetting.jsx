import React, { useId } from 'react'
import { CircularProgress, FormControl, FormHelperText, MenuItem, Select } from '@mui/material'
import SettingRow from './SettingRow'

export default function YtDlpSourceSetting({ info, onChange, updateInProgress, t }) {
  const messageId = useId()
  const label = t('settings.ytDlpInstallationSource')

  return (
    <SettingRow label={label} description={t('settings.ytDlpInstallationSourceDesc')}>
      <FormControl size="small" error={Boolean(info.sourceError)} sx={{ width: { xs: '100%', sm: 250 } }}>
        <Select
          value={info.installationSource}
          onChange={(event) => onChange(event.target.value)}
          disabled={info.loading || info.sourceChanging || updateInProgress}
          inputProps={{ 'aria-label': label }}
          SelectDisplayProps={{ 'aria-describedby': info.sourceChanging || info.sourceError ? messageId : undefined }}
          sx={{ minHeight: 44, fontSize: 13 }}
        >
          <MenuItem value="automatic">{t('settings.ytDlpSourceAutomatic')}</MenuItem>
          <MenuItem value="managed">{t('settings.ytDlpSourceManaged')}</MenuItem>
        </Select>
        {info.sourceChanging && (
          <FormHelperText id={messageId} role="status" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CircularProgress size={12} aria-hidden="true" />
            {t('settings.ytDlpSourceChanging')}
          </FormHelperText>
        )}
        {!info.sourceChanging && info.sourceError && (
          <FormHelperText id={messageId} role="alert">{info.sourceError}</FormHelperText>
        )}
      </FormControl>
    </SettingRow>
  )
}
