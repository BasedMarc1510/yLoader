import React from 'react'
import {
  Box,
  Button,
  Collapse,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
  useTheme,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material'
import { AlertTriangle, FolderOpen, Plus, X, Music2, Video, Image as ImageIcon } from 'lucide-react'

const DOWNLOAD_TYPE_CHOICES = ['audio', 'video', 'thumbnail']

function getDownloadTypeIcon(type) {
  if (type === 'audio') return <Music2 size={16} />
  if (type === 'video') return <Video size={16} />
  return <ImageIcon size={16} />
}

function getDownloadTypeLabel(i18nT, type) {
  if (type === 'audio') return i18nT('downloader.tabAudio')
  if (type === 'video') return i18nT('downloader.tabVideo')
  return 'Thumbnail'
}

export default function MultiDownloaderHeader({
  i18nT,
  entriesCount,
  controlsExpanded,
  onToggleControls,
  onCloseInterface,
  linkInput,
  onLinkInputChange,
  onAddLinks,
  globalDownloadType,
  onGlobalTypeChange,
  unsupportedCount,
  isElectronRuntime,
  downloadDirectory,
  onDownloadDirectoryChange,
  onPickDirectory,
  runtimeDownloadsPath,
}) {
  const theme = useTheme()
  const isDark = theme.palette.mode === 'dark'

  return (
    <Box
      sx={{
        p: 2.5,
        borderRadius: 4,
        bgcolor: isDark ? 'rgba(255,255,255,0.03)' : '#ffffff',
        border: '1px solid',
        borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#eef0f2',
        boxShadow: isDark ? '0 8px 32px rgba(0,0,0,0.2)' : '0 8px 24px rgba(0,0,0,0.04)',
        mb: 3
      }}
    >
      <Stack spacing={2.5}>
        <Stack direction="row" spacing={1} justifyContent="space-between" alignItems="center">
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 900, letterSpacing: '-0.02em', mb: 0.5 }}>
              {i18nT('multiDownloader.title')}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
              {i18nT('multiDownloader.subtitle', { count: entriesCount })}
            </Typography>
          </Box>

          <Stack direction="row" spacing={1}>
            <Tooltip title={i18nT('multiDownloader.addLinksButton')}>
              <IconButton
                onClick={onToggleControls}
                sx={{ 
                  bgcolor: controlsExpanded ? 'primary.main' : (isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)'),
                  color: controlsExpanded ? 'primary.contrastText' : 'inherit',
                  '&:hover': { bgcolor: controlsExpanded ? 'primary.dark' : (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)') }
                }}
              >
                <Plus size={20} />
              </IconButton>
            </Tooltip>
            <IconButton
              onClick={onCloseInterface}
              sx={{ bgcolor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)' }}
            >
              <X size={20} />
            </IconButton>
          </Stack>
        </Stack>

        <Collapse in={controlsExpanded}>
          <Stack spacing={1.5} sx={{ mt: 0.5 }}>
            <TextField
              fullWidth
              multiline
              minRows={3}
              maxRows={8}
              placeholder={i18nT('placeholders.homeMultiUrls')}
              value={linkInput}
              onChange={(e) => onLinkInputChange(e.target.value)}
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: 3,
                  bgcolor: isDark ? 'rgba(0,0,0,0.2)' : '#f9fbfd',
                  '& fieldset': { borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0' },
                }
              }}
            />
            <Button
              variant="contained"
              fullWidth
              onClick={onAddLinks}
              disabled={!linkInput.trim()}
              startIcon={<Plus size={18} />}
              sx={{ borderRadius: 3, py: 1.2, fontWeight: 800, textTransform: 'none', boxShadow: 'none' }}
            >
              {i18nT('multiDownloader.addLinksButton')}
            </Button>
          </Stack>
        </Collapse>

        <Stack spacing={2}>
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <Typography variant="caption" sx={{ fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary' }}>
              {i18nT('multiDownloader.globalTypeLabel')}
            </Typography>
            <Box sx={{ flexGrow: 1, height: '1px', bgcolor: isDark ? 'rgba(255,255,255,0.08)' : '#eee' }} />
            {unsupportedCount > 0 && (
              <Tooltip title={i18nT('multiDownloader.globalTypeUnsupported', { count: unsupportedCount })}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'warning.main', cursor: 'help' }}>
                  <AlertTriangle size={14} />
                  <Typography variant="caption" sx={{ fontWeight: 800 }}>{unsupportedCount}</Typography>
                </Box>
              </Tooltip>
            )}
          </Stack>

          <ToggleButtonGroup
            fullWidth
            value={globalDownloadType}
            exclusive
            onChange={(_, value) => value && onGlobalTypeChange({ target: { value } })}
            sx={{
              height: 44,
              '& .MuiToggleButton-root': {
                flex: 1,
                borderRadius: 2.5,
                border: '1px solid',
                borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0',
                textTransform: 'none',
                fontWeight: 700,
                color: 'text.secondary',
                gap: 1,
                mx: 0.25,
                '&:first-of-type': { ml: 0 },
                '&:last-of-type': { mr: 0 },
                '&.Mui-selected': {
                  bgcolor: 'primary.main',
                  color: 'primary.contrastText',
                  borderColor: 'primary.main',
                  '&:hover': { bgcolor: 'primary.dark' }
                }
              }
            }}
          >
            {DOWNLOAD_TYPE_CHOICES.map((type) => (
              <ToggleButton key={type} value={type}>
                {getDownloadTypeIcon(type)}
                {getDownloadTypeLabel(i18nT, type)}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>

          {isElectronRuntime && (
            <Stack direction="row" spacing={1}>
              <TextField
                fullWidth
                size="small"
                label={i18nT('multiDownloader.downloadDirectoryLabel')}
                value={downloadDirectory}
                onChange={(e) => onDownloadDirectoryChange(e.target.value)}
                placeholder={runtimeDownloadsPath}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 2.5,
                    bgcolor: isDark ? 'rgba(0,0,0,0.1)' : '#f9fbfd',
                  }
                }}
              />
              <IconButton 
                onClick={onPickDirectory}
                sx={{ 
                  borderRadius: 2.5, 
                  bgcolor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                  width: 40, height: 40
                }}
              >
                <FolderOpen size={20} />
              </IconButton>
            </Stack>
          )}
        </Stack>
      </Stack>
    </Box>
  )
}
