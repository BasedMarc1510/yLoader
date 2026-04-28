import React from 'react'
import { Box, Stack, Typography, useTheme } from '@mui/material'
import ServiceIcon from '../../../../components/ServiceIcon'
import { getServiceDisplayName } from '../../../../utils/metadata'
import MultiEntryItem from './MultiEntryItem'

export default function MultiServiceGroup({
  i18nT,
  group,
  services,
  onToggleExpanded,
  onRemoveEntry,
  onEntryTypeChange,
  onRegisterController,
  onDownloadStateChange,
  onDownloadEvent,
  onOpenCompleted,
  onOpenCookieSettings,
  downloadSettingsOverride,
  forcedDownloadDirectory,
}) {
  const theme = useTheme()
  const isDark = theme.palette.mode === 'dark'
  
  const groupServiceKey = String(group.serviceKey || 'generic').trim() || 'generic'
  const groupServiceName = getServiceDisplayName(groupServiceKey)

  return (
    <Box sx={{ mb: 3 }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5, px: 0.5 }}>
        <ServiceIcon serviceKey={groupServiceKey} size={18} />
        <Typography variant="subtitle2" sx={{ fontWeight: 800, letterSpacing: '0.02em', textTransform: 'uppercase', fontSize: 12, color: 'text.secondary' }}>
          {groupServiceName}
        </Typography>
        <Box sx={{ flexGrow: 1, height: '1px', bgcolor: isDark ? 'rgba(255,255,255,0.08)' : '#eee' }} />
        <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.disabled' }}>
          {i18nT('multiDownloader.groupCount', { count: group.entries.length })}
        </Typography>
      </Stack>

      <Stack spacing={1.5}>
        {group.entries.map((entry) => {
          const serviceConfig = services[String(entry.serviceKey || 'generic').trim() || 'generic'] || services.generic
          return (
            <MultiEntryItem
              key={entry.id}
              i18nT={i18nT}
              entry={entry}
              serviceConfig={serviceConfig}
              onToggleExpanded={onToggleExpanded}
              onRemoveEntry={onRemoveEntry}
              onEntryTypeChange={onEntryTypeChange}
              onRegisterController={onRegisterController}
              onDownloadStateChange={onDownloadStateChange}
              onDownloadEvent={onDownloadEvent}
              onOpenCompleted={onOpenCompleted}
              onOpenCookieSettings={onOpenCookieSettings}
              downloadSettingsOverride={downloadSettingsOverride}
              forcedDownloadDirectory={forcedDownloadDirectory}
            />
          )
        })}
      </Stack>
    </Box>
  )
}
