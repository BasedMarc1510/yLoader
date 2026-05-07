import React from 'react'
import {
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  LinearProgress,
  Menu,
  MenuItem,
  Stack,
  Typography,
} from '@mui/material'
import { ExternalLink, Globe, X } from 'lucide-react'
import ServiceIcon from '../../components/ServiceIcon'

export default function SearchOverlays({
  activeQuickDownloadProgress,
  downloadAnchorEl,
  embedPreview,
  handleCloseDownloadDropdown,
  handleCloseEmbedPreview,
  handleCloseKebab,
  handleCloseSelectedDownloadOptions,
  handleCloseSelectedList,
  handleDownloadQuick,
  handleDownloadSelectedEntriesInNewTab,
  handleKebabBrowser,
  handleKebabNewTab,
  handleRemoveSelectedEntry,
  isQuickDownloadActive,
  kebabAnchorEl,
  quickDownloadFormatLabel,
  quickDownloadOptions,
  quickDownloadStageLabel,
  quickDownloadTitle,
  selectedDownloadAnchorEl,
  selectedDownloadOptionsOpen,
  selectedEntries,
  selectedListAnchorEl,
  selectedListOpen,
  t,
}) {
  return (
    <>
      <Menu
        anchorEl={kebabAnchorEl}
        open={Boolean(kebabAnchorEl)}
        onClose={handleCloseKebab}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        slotProps={{ paper: { sx: { width: 220, mt: 1, borderRadius: 3, boxShadow: '0 4px 20px rgba(0,0,0,0.1)' } } }}
      >
        <MenuItem onClick={handleKebabNewTab} sx={{ py: 1.5, borderRadius: 2, mx: 1 }}>
          <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1.25 }}>
            <ExternalLink size={16} />
            <Typography variant="body2" fontWeight={700}>{t('search.openInNewTab')}</Typography>
          </Box>
        </MenuItem>
        <MenuItem onClick={handleKebabBrowser} sx={{ py: 1.5, borderRadius: 2, mx: 1 }}>
          <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1.25 }}>
            <Globe size={16} />
            <Typography variant="body2" fontWeight={700}>{t('search.openInBrowser')}</Typography>
          </Box>
        </MenuItem>
      </Menu>

      <Menu
        anchorEl={downloadAnchorEl}
        open={Boolean(downloadAnchorEl)}
        onClose={handleCloseDownloadDropdown}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        slotProps={{ paper: { sx: { width: 240, mt: 1, borderRadius: 3, boxShadow: '0 4px 20px rgba(0,0,0,0.1)' } } }}
      >
        {quickDownloadOptions.map((option) => {
          const Icon = option.icon

          return (
            <MenuItem
              key={option.key}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                void handleDownloadQuick(option.key)
              }}
              sx={{
                py: 1.5,
                borderRadius: 2,
                mx: 1,
              }}
            >
              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1.25 }}>
                <Icon size={16} />
                <Typography variant="body2" fontWeight={700}>{option.label}</Typography>
              </Box>
            </MenuItem>
          )
        })}
      </Menu>

      <Menu
        anchorEl={selectedDownloadAnchorEl}
        open={selectedDownloadOptionsOpen}
        onClose={handleCloseSelectedDownloadOptions}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        slotProps={{ paper: { sx: { width: 240, mt: 1, borderRadius: 3, boxShadow: '0 4px 20px rgba(0,0,0,0.1)' } } }}
      >
        <MenuItem
          onClick={handleDownloadSelectedEntriesInNewTab}
          sx={{ py: 1.5, borderRadius: 2, mx: 1 }}
        >
          <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1.25 }}>
            <ExternalLink size={16} />
            <Typography variant="body2" fontWeight={700}>{t('search.downloadSelectedInNewTab')}</Typography>
          </Box>
        </MenuItem>
      </Menu>

      <Menu
        anchorEl={selectedListAnchorEl}
        open={selectedListOpen}
        onClose={handleCloseSelectedList}
        transformOrigin={{ horizontal: 'left', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'left', vertical: 'bottom' }}
        slotProps={{ paper: { sx: { width: 'min(480px, calc(100vw - 32px))', mt: 1, borderRadius: 3, boxShadow: '0 8px 30px rgba(0,0,0,0.16)', maxHeight: 'min(56vh, 460px)', overflow: 'auto' } } }}
      >
        {selectedEntries.length === 0 ? (
          <MenuItem disabled sx={{ py: 1.5, borderRadius: 2, mx: 1 }}>
            <Typography variant="body2" color="text.secondary">{t('search.selectedListEmpty')}</Typography>
          </MenuItem>
        ) : selectedEntries.map((item) => (
          <Box
            key={item.identity}
            sx={{
              px: 1.25,
              py: 0.9,
              mx: 1,
              my: 0.45,
              borderRadius: 2,
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              bgcolor: 'action.hover',
            }}
          >
            <Box sx={{ width: 44, height: 44, borderRadius: 1, overflow: 'hidden', bgcolor: 'action.selected', flexShrink: 0 }}>
              {item.thumbnail ? (
                <Box component="img" src={item.thumbnail} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
              ) : (
                <Stack sx={{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
                  <ServiceIcon serviceKey={item.service || 'generic'} size={18} />
                </Stack>
              )}
            </Box>

            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="body2" fontWeight={700} noWrap>{item.title}</Typography>
              <Typography variant="caption" color="text.secondary" noWrap>{item.url}</Typography>
            </Box>

            <IconButton
              size="small"
              aria-label={t('search.removeSelectedAria', { title: item.title })}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                handleRemoveSelectedEntry(item.identity)
              }}
            >
              <X size={15} />
            </IconButton>
          </Box>
        ))}
      </Menu>

      <Dialog
        open={isQuickDownloadActive}
        onClose={() => {}}
        fullScreen
        disableEscapeKeyDown
        PaperProps={{
          sx: {
            m: 0,
            p: 0,
            borderRadius: 0,
            maxWidth: 'none',
            bgcolor: 'transparent',
            boxShadow: 'none',
          },
        }}
        BackdropProps={{
          sx: {
            backdropFilter: 'blur(8px)',
            bgcolor: (theme) => theme.palette.mode === 'dark'
              ? 'rgba(0,0,0,0.42)'
              : 'rgba(245,245,245,0.48)',
          },
        }}
      >
        <DialogContent sx={{ minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2 }}>
          <Box
            sx={{
              width: 'min(560px, calc(100vw - 32px))',
              borderRadius: 3,
              border: '1px solid',
              borderColor: 'divider',
              bgcolor: 'background.paper',
              boxShadow: '0 20px 42px rgba(0,0,0,0.22)',
              px: { xs: 2, sm: 2.5 },
              py: { xs: 2, sm: 2.5 },
            }}
          >
            <Typography variant="h6" fontWeight={800}>
              {t('search.quickDownloadModalTitle')}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {t('search.quickDownloadModalDescription', { format: quickDownloadFormatLabel })}
            </Typography>
            {quickDownloadTitle ? (
              <Typography variant="body2" fontWeight={700} noWrap sx={{ mt: 1.25 }}>
                {quickDownloadTitle}
              </Typography>
            ) : null}
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.75, display: 'block' }}>
              {quickDownloadStageLabel}
            </Typography>

            <LinearProgress
              variant="determinate"
              value={activeQuickDownloadProgress}
              sx={{
                mt: 1.15,
                height: 8,
                borderRadius: 999,
                bgcolor: (theme) => theme.palette.mode === 'dark'
                  ? 'rgba(255,255,255,0.15)'
                  : 'rgba(0,0,0,0.1)',
                '& .MuiLinearProgress-bar': {
                  bgcolor: (theme) => theme.palette.mode === 'dark'
                    ? 'rgba(255,255,255,0.56)'
                    : 'rgba(0,0,0,0.46)',
                },
              }}
            />

            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.75, display: 'block' }}>
              {`${Math.round(activeQuickDownloadProgress)}%`}
            </Typography>
          </Box>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(embedPreview?.embedUrl)}
        onClose={handleCloseEmbedPreview}
        fullWidth
        maxWidth={false}
        keepMounted={false}
        PaperProps={{
          sx: {
            width: embedPreview?.serviceKey === 'soundcloud'
              ? 'min(680px, calc(100vw - 24px))'
              : 'min(980px, calc(100vw - 24px))',
            m: 1.5,
            borderRadius: 2.5,
            overflow: 'hidden',
          },
        }}
      >
        <DialogTitle
          sx={{
            px: 2,
            py: 1.25,
            borderBottom: '1px solid',
            borderColor: 'divider',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 2,
          }}
        >
          <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
            <ServiceIcon serviceKey={embedPreview?.serviceKey || 'generic'} size={18} />
            <Typography variant="subtitle1" fontWeight={800} noWrap>
              {embedPreview?.serviceLabel || t('search.title')}
            </Typography>
          </Box>

          <IconButton
            size="small"
            aria-label={t('search.closePreview')}
            onClick={handleCloseEmbedPreview}
          >
            <X size={18} />
          </IconButton>
        </DialogTitle>

        <DialogContent sx={{ p: 0, bgcolor: embedPreview?.serviceKey === 'soundcloud' ? 'background.default' : '#000' }}>
          {embedPreview?.embedUrl ? (
            <Box
              sx={{
                position: 'relative',
                width: '100%',
                ...(embedPreview?.serviceKey === 'soundcloud'
                  ? { height: 166, bgcolor: 'transparent' }
                  : { pt: '56.25%', bgcolor: '#000' }),
              }}
            >
              <Box
                key={embedPreview.embedUrl}
                component="iframe"
                src={embedPreview.embedUrl}
                scrolling={embedPreview?.serviceKey === 'soundcloud' ? 'no' : undefined}
                title={t('search.previewFrameTitle', { service: embedPreview.serviceLabel || t('search.title') })}
                allow={embedPreview?.serviceKey === 'soundcloud' ? 'autoplay' : 'autoplay; encrypted-media; picture-in-picture; web-share'}
                allowFullScreen={embedPreview?.serviceKey !== 'soundcloud'}
                loading="eager"
                referrerPolicy="strict-origin-when-cross-origin"
                sx={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  border: 0,
                }}
              />
            </Box>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
