import React from 'react'
import { Box, Chip, IconButton, Stack, TextField, Tooltip, Typography } from '@mui/material'
import { RotateCcw } from 'lucide-react'
import {
  DOWNLOAD_FILENAME_PATTERN_TOKENS,
  DOWNLOAD_SETTINGS_DEFAULTS,
} from '../../utils/downloadSettings'

const FIELD_CONFIG = Object.freeze([
  {
    field: 'videoFilenamePattern',
    labelKey: 'settings.downloadFilenamePatternVideo',
  },
  {
    field: 'audioFilenamePattern',
    labelKey: 'settings.downloadFilenamePatternAudio',
  },
  {
    field: 'thumbnailFilenamePattern',
    labelKey: 'settings.downloadFilenamePatternThumbnail',
  },
])

function getPatternValue(settings, fieldName) {
  const fallback = String(DOWNLOAD_SETTINGS_DEFAULTS[fieldName] || '{title}')
  const raw = String(settings?.[fieldName] || '').trim()
  return raw || fallback
}

export default function DownloadNamingSettingsGroup({
  downloadSettings,
  disabled,
  updateDownloadSettings,
  t,
  isMobileLayout = false,
}) {
  const tokenTextParams = React.useMemo(() => ({
    titleToken: '{title}',
    artistToken: '{artist}',
    uploaderToken: '{uploader}',
    serviceToken: '{service}',
    typeToken: '{type}',
    idToken: '{id}',
    dateToken: '{date}',
    timeToken: '{time}',
    datetimeToken: '{datetime}',
  }), [])

  const handleInsertToken = React.useCallback((fieldName, token) => {
    const currentValue = getPatternValue(downloadSettings, fieldName)
    const separator = currentValue && !currentValue.endsWith(' ') ? ' ' : ''
    const nextValue = `${currentValue}${separator}${token}`.trim()

    updateDownloadSettings({ [fieldName]: nextValue })
  }, [downloadSettings, updateDownloadSettings])

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.4 }}>
      {FIELD_CONFIG.map((fieldConfig) => {
        const fieldName = fieldConfig.field
        const fieldValue = getPatternValue(downloadSettings, fieldName)
        const fieldLabel = t(fieldConfig.labelKey)
        const resetAriaLabel = t('settings.downloadFilenamePatternResetAria', { field: fieldLabel })

        return (
          <Box key={fieldName}>
            <Box
              sx={(theme) => ({
                width: '100%',
                p: 1.25,
                borderRadius: '12px',
                border: `1px solid ${theme.palette.divider}`,
                bgcolor: theme.palette.mode === 'dark' ? '#1c1c1e' : '#ffffff',
              })}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.6 }}>
                <Typography variant="body2" sx={{ fontWeight: 500, fontSize: 14.5, color: 'text.primary', lineHeight: 1.25 }}>
                  {fieldLabel}
                </Typography>
                <Tooltip title={resetAriaLabel}>
                  <span>
                    <IconButton
                      size="small"
                      disabled={disabled}
                      aria-label={resetAriaLabel}
                      onClick={() => {
                        updateDownloadSettings({
                          [fieldName]: DOWNLOAD_SETTINGS_DEFAULTS[fieldName],
                        })
                      }}
                      sx={{
                        color: 'text.secondary',
                        cursor: disabled ? 'default' : 'pointer',
                        '&:hover': { color: 'text.primary' },
                      }}
                    >
                      <RotateCcw size={14} />
                    </IconButton>
                  </span>
                </Tooltip>
              </Box>

              <TextField
                size="small"
                fullWidth
                value={fieldValue}
                disabled={disabled}
                onChange={(event) => {
                  updateDownloadSettings({ [fieldName]: String(event.target.value || '') })
                }}
                placeholder={t('settings.downloadFilenamePatternPlaceholder', tokenTextParams)}
                inputProps={{
                  spellCheck: false,
                }}
                sx={{
                  '& .MuiInputBase-input': {
                    fontFamily: 'monospace',
                    fontSize: isMobileLayout ? 13 : 12.5,
                  },
                }}
              />

              <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ width: '100%', mt: 0.85 }}>
                {DOWNLOAD_FILENAME_PATTERN_TOKENS.map((token) => (
                  <Chip
                    key={`${fieldName}-${token}`}
                    size="small"
                    clickable
                    disabled={disabled}
                    label={token}
                    onClick={() => handleInsertToken(fieldName, token)}
                    sx={{
                      fontFamily: 'monospace',
                      fontSize: 11,
                      height: 22,
                      '& .MuiChip-label': {
                        px: 0.85,
                      },
                    }}
                  />
                ))}
              </Stack>
            </Box>
          </Box>
        )
      })}
    </Box>
  )
}
