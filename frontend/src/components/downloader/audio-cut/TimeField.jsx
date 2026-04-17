import React from 'react'
import { Box, IconButton, Menu, MenuItem, Tooltip, Typography } from '@mui/material'
import { ChevronDown } from 'lucide-react'
import { useI18n } from '../../../providers/I18nProvider'
import { formatTime, parseTime } from './utils'

const TIME_PRESET_DELTAS = Object.freeze([-10, -5, -1, 1, 5, 10])

export default function TimeField({ label, value, onChange, onCommit, maxSeconds = 0, isDark, disabled, textColor }) {
  const { t } = useI18n()
  const [menuAnchorEl, setMenuAnchorEl] = React.useState(null)
  const menuOpen = Boolean(menuAnchorEl)
  const safeMax = typeof maxSeconds === 'number' && maxSeconds > 0
    ? maxSeconds
    : Number.POSITIVE_INFINITY
  const currentSeconds = React.useMemo(() => parseTime(value, safeMax), [value, safeMax])

  const isPresetAvailable = React.useCallback((delta) => {
    const nextSeconds = currentSeconds + delta
    if (!Number.isFinite(nextSeconds)) return false
    if (nextSeconds < 0) return false
    if (nextSeconds > safeMax) return false
    return true
  }, [currentSeconds, safeMax])

  const closeMenu = () => {
    setMenuAnchorEl(null)
  }

  const handlePresetClick = (delta) => {
    if (disabled) return
    if (!isPresetAvailable(delta)) return

    const nextSeconds = Math.max(0, Math.min(safeMax, currentSeconds + delta))
    const nextValue = formatTime(nextSeconds)
    onChange?.(nextValue)
    onCommit?.(nextValue)
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
      <Typography
        variant="caption"
        sx={{ color: isDark ? '#777' : '#888', fontWeight: 600, fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}
      >
        {label}
      </Typography>
      <Box sx={{ display: 'inline-flex', alignItems: 'stretch', gap: 0 }}>
        <Box
          component="input"
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => onCommit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
          disabled={disabled}
          sx={{
            width: 64,
            px: 1,
            py: 0,
            height: 30,
            border: `1px solid ${isDark ? '#3a3a3a' : '#d0d0d0'}`,
            borderRight: 'none',
            borderRadius: '6px 0 0 6px',
            bgcolor: isDark ? '#1a1a1a' : '#fff',
            color: textColor,
            fontSize: '0.82rem',
            fontFamily: 'monospace',
            textAlign: 'center',
            lineHeight: '30px',
            outline: 'none',
            cursor: disabled ? 'default' : 'text',
            boxSizing: 'border-box',
            transition: 'border-color 0.15s',
            '&:focus': { borderColor: isDark ? '#666' : '#aaa' },
            '&:disabled': { opacity: 0.45, cursor: 'default' },
          }}
        />

        <Tooltip title={t('downloader.cutTimePresetTooltip')}>
          <span>
            <IconButton
              size="small"
              disabled={disabled}
              onClick={(event) => setMenuAnchorEl(event.currentTarget)}
              aria-label={t('downloader.cutTimePresetAria')}
              sx={{
                width: 30,
                height: 30,
                borderRadius: '0 6px 6px 0',
                p: 0,
                border: `1px solid ${isDark ? '#3a3a3a' : '#d0d0d0'}`,
                color: isDark ? '#a9a9a9' : '#666',
                bgcolor: isDark ? '#161616' : '#f4f5f7',
                '&:hover': {
                  bgcolor: isDark ? '#202020' : '#eceef2',
                },
                '&:disabled': {
                  opacity: 0.45,
                },
              }}
            >
              <ChevronDown size={13} />
            </IconButton>
          </span>
        </Tooltip>

        <Menu
          anchorEl={menuAnchorEl}
          open={menuOpen}
          onClose={closeMenu}
          transformOrigin={{ horizontal: 'right', vertical: 'top' }}
          anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
          PaperProps={{
            sx: {
              borderRadius: 1,
              minWidth: 82,
            },
          }}
          MenuListProps={{
            dense: true,
            sx: { py: 0.25 },
          }}
        >
          {TIME_PRESET_DELTAS.map((delta) => {
            const deltaText = `${delta > 0 ? '+' : ''}${delta}`
            const isUnavailable = !isPresetAvailable(delta)
            return (
              <MenuItem
                key={delta}
                disabled={isUnavailable}
                onClick={() => handlePresetClick(delta)}
                sx={{
                  minHeight: 24,
                  fontSize: '0.74rem',
                  fontFamily: 'monospace',
                  justifyContent: 'center',
                }}
              >
                {t('downloader.cutTimePresetDelta', { delta: deltaText })}
              </MenuItem>
            )
          })}
        </Menu>
      </Box>
    </Box>
  )
}
