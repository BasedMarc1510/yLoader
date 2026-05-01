import React from 'react'
import { Box, Typography, Stack } from '@mui/material'
import { groupEntriesByService } from './entryUtils'
import MultiServiceGroup from './components/MultiServiceGroup'

export default function MultiEntryGroups({
  i18nT,
  services,
  entries,
  downloadSettingsOverride,
  forcedDownloadDirectory,
  onToggleExpanded,
  onRemoveEntry,
  onEntryTypeChange,
  onRegisterController,
  onDownloadStateChange,
  onDownloadEvent,
  onOpenCompleted,
  onOpenCookieSettings,
}) {
  const groupedEntries = React.useMemo(
    () => groupEntriesByService(entries),
    [entries]
  )

  if (!entries.length) {
    return (
      <Box
        sx={(theme) => ({
          p: 4,
          mb: 3,
          borderRadius: 4,
          border: '1px dashed',
          borderColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
          bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.01)' : 'rgba(0,0,0,0.005)',
          textAlign: 'center',
        })}
      >
        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
          {i18nT('multiDownloader.emptyState')}
        </Typography>
      </Box>
    )
  }

  return (
    <Box>
      {groupedEntries.map((group) => (
        <MultiServiceGroup
          key={group.serviceKey}
          i18nT={i18nT}
          group={group}
          services={services}
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
      ))}
    </Box>
  )
}
