import React from 'react'
import {
  Box,
  Button,
  ButtonGroup,
  Card,
  CardActionArea,
  Checkbox,
  CircularProgress,
  IconButton,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material'
import { ChevronDown, ChevronUp, MoreVertical, Play } from 'lucide-react'
import ServiceIcon from '../../components/ServiceIcon'
import {
  GENERIC_SERVICE_KEY,
  getServiceThemeColor,
  normalizeServiceKey,
} from '../../utils/metadata'
import {
  EMBED_PREVIEW_SERVICES,
  formatDuration,
  getSearchEntryIdentity,
  SQUARE_THUMBNAIL_SERVICES,
} from './searchUtils'

export default function SearchResultsPane({
  availableHeight,
  getServiceLabel,
  handleClearSelectedEntries,
  handleCloseSelectedList,
  handleDownloadMain,
  handleDownloadSelectedEntries,
  handleOpenDownloadDropdown,
  handleOpenEmbedPreview,
  handleOpenKebab,
  handleOpenSelectedDownloadOptions,
  handleOpenSelectedList,
  hasMeasured,
  loadMoreSentinelRef,
  loadingInitial,
  loadingMore,
  results,
  selectedCount,
  selectedEntriesMap,
  selectedListOpen,
  selectedService,
  showEmptyState,
  showInitialLoading,
  t,
  toggleEntrySelection,
}) {
  return (
    <>
      {showInitialLoading && (
        <Box sx={{ overflow: 'hidden' }}>
          <Stack spacing={2}>
            {Array.from({ length: hasMeasured && availableHeight > 0 ? Math.max(2, Math.floor((availableHeight - 160) / 140)) : 4 }).map((_, i) => {
              const useSquareThumbnail = SQUARE_THUMBNAIL_SERVICES.has(selectedService)
              const thumbnailWidth = useSquareThumbnail ? { xs: 110, sm: 130 } : { xs: 140, sm: 230 }
              const searchSkeletonSx = {
                bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
                '&::after': {
                  background: (theme) => theme.palette.mode === 'dark'
                    ? 'linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)'
                    : 'linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent)',
                },
              }

              return (
                <Card elevation={0} key={i} sx={{ borderRadius: 1.5, border: '1px solid', borderColor: 'divider', display: 'flex', overflow: 'hidden', height: { xs: 110, sm: 130 } }}>
                  <Box sx={{ width: thumbnailWidth, minWidth: thumbnailWidth, flexShrink: 0, position: 'relative' }}>
                    <Skeleton variant="rectangular" width="100%" height="100%" animation="wave" sx={searchSkeletonSx} />
                    <Skeleton variant="rounded" width={34} height={16} animation="wave" sx={{ position: 'absolute', bottom: 8, right: 8, borderRadius: 0.75, ...searchSkeletonSx }} />
                  </Box>
                  <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, p: { xs: 1.5, sm: 2 }, pr: { xs: 7, sm: 10 }, justifyContent: 'center', position: 'relative' }}>
                    <Skeleton variant="text" width="85%" height={26} animation="wave" sx={searchSkeletonSx} />
                    <Skeleton variant="text" width="45%" height={20} animation="wave" sx={{ mt: 0.5, ...searchSkeletonSx }} />
                    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, mt: 1 }}>
                      <Skeleton variant="circular" width={14} height={14} animation="wave" sx={searchSkeletonSx} />
                      <Skeleton variant="text" width={60} height={18} animation="wave" sx={searchSkeletonSx} />
                    </Box>
                    <Skeleton variant="circular" width={32} height={32} animation="wave" sx={{ position: 'absolute', top: 8, right: 8, ...searchSkeletonSx }} />
                    <Skeleton variant="rounded" width={110} height={32} animation="wave" sx={{ position: 'absolute', bottom: 12, right: 12, borderRadius: 9999, ...searchSkeletonSx }} />
                  </Box>
                </Card>
              )
            })}
          </Stack>
        </Box>
      )}

      {showEmptyState && (
        <Stack spacing={0.5} sx={{ py: 8, textAlign: 'center' }}>
          <Typography variant="h6" fontWeight={800}>{t('search.noResultsTitle')}</Typography>
          <Typography variant="body2" color="text.secondary">{t('search.noResultsSubtitle')}</Typography>
        </Stack>
      )}

      {results.length > 0 && !loadingInitial && (
        <Stack spacing={2}>
          {results.map((entry) => {
            const rawService = normalizeServiceKey(entry?.service)
            const serviceKey = rawService || GENERIC_SERVICE_KEY
            const serviceLabel = getServiceLabel(serviceKey)
            const supportsEmbedPreview = EMBED_PREVIEW_SERVICES.has(serviceKey)
            const useSquareThumbnail = SQUARE_THUMBNAIL_SERVICES.has(serviceKey)
            const duration = entry?.durationString || formatDuration(entry?.duration)
            const title = String(entry?.title || '').trim() || String(entry?.url || '').trim()
            const uploader = String(entry?.uploader || '').trim()
            const thumbnail = String(entry?.thumbnail || '').trim()
            const itemId = getSearchEntryIdentity(entry) || String(entry?.url || `${serviceKey}-${title}`).trim()
            const isSelected = selectedEntriesMap.has(itemId)
            const thumbnailWidth = useSquareThumbnail
              ? { xs: 110, sm: 130 }
              : { xs: 140, sm: 230 }

            return (
              <Card elevation={0} key={itemId} sx={{ position: 'relative', borderRadius: 1.5, border: '1px solid', borderColor: 'divider', display: 'flex', overflow: 'hidden', height: { xs: 110, sm: 130 } }}>
                <Box
                  sx={{ display: 'flex', alignItems: 'stretch', width: '100%', justifyContent: 'flex-start' }}
                >
                  <Box sx={{
                    width: thumbnailWidth,
                    minWidth: thumbnailWidth,
                    position: 'relative',
                    bgcolor: 'action.hover',
                    flexShrink: 0,
                    ...(supportsEmbedPreview ? {
                      '&:hover .search-thumb-duration, &:focus-within .search-thumb-duration': {
                        opacity: 0,
                      },
                    } : {}),
                  }}>
                    {supportsEmbedPreview ? (
                      <CardActionArea
                        onClick={() => handleOpenEmbedPreview(entry)}
                        aria-label={t('search.openPreview', { service: serviceLabel })}
                        sx={{
                          position: 'absolute',
                          inset: 0,
                          transition: 'none',
                          '& .search-thumb-overlay': {
                            opacity: 0,
                            transition: 'none',
                          },
                          '&:hover .search-thumb-media, &.Mui-focusVisible .search-thumb-media': {
                            filter: 'brightness(0.6)',
                          },
                          '&:hover .search-thumb-overlay, &.Mui-focusVisible .search-thumb-overlay': {
                            opacity: 1,
                          },
                          '& .MuiCardActionArea-focusHighlight': {
                            transition: 'none',
                          },
                        }}
                      >
                        {thumbnail ? (
                          <Box
                            component="img"
                            src={thumbnail}
                            alt=""
                            className="search-thumb-media"
                            sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                            loading="lazy"
                          />
                        ) : (
                          <Stack
                            className="search-thumb-media"
                            sx={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}
                          >
                            <ServiceIcon serviceKey={serviceKey} size={34} title={serviceLabel} />
                          </Stack>
                        )}

                        <Stack
                          className="search-thumb-overlay"
                          sx={{
                            position: 'absolute',
                            inset: 0,
                            alignItems: 'center',
                            justifyContent: 'center',
                            bgcolor: 'rgba(0,0,0,0.25)',
                            pointerEvents: 'none',
                          }}
                        >
                          <Box
                            sx={{
                              width: 44,
                              height: 44,
                              borderRadius: '50%',
                              bgcolor: 'rgba(0,0,0,0.66)',
                              border: '1px solid rgba(255,255,255,0.6)',
                              color: '#fff',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <Play size={20} fill="currentColor" />
                          </Box>
                        </Stack>
                      </CardActionArea>
                    ) : thumbnail ? (
                      <Box
                        component="img"
                        src={thumbnail}
                        alt=""
                        sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                        loading="lazy"
                      />
                    ) : (
                      <Stack
                        sx={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}
                      >
                        <ServiceIcon serviceKey={serviceKey} size={34} title={serviceLabel} />
                      </Stack>
                    )}

                    {duration ? (
                      <Box
                        className="search-thumb-duration"
                        sx={{
                          position: 'absolute',
                          right: 8,
                          bottom: 8,
                          bgcolor: 'rgba(0,0,0,0.72)',
                          color: '#fff',
                          px: 0.8,
                          py: 0.2,
                          borderRadius: 0.75,
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          fontFeatureSettings: '"tnum"',
                          zIndex: 2,
                          transition: 'none',
                          pointerEvents: 'none',
                          userSelect: 'none',
                        }}
                      >
                        {duration}
                      </Box>
                    ) : null}
                  </Box>

                  <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, p: { xs: 1.5, sm: 2 }, pr: { xs: 7, sm: 10 }, overflow: 'hidden', justifyContent: 'center', position: 'relative' }}>
                    <Typography variant="body1" fontWeight={800} noWrap>
                      {title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" noWrap sx={{ mt: 0.5 }}>
                      {uploader || t('search.unknownUploader')}
                    </Typography>

                    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, mt: 1 }}>
                      <ServiceIcon serviceKey={serviceKey} size={14} title={serviceLabel} />
                      <Typography variant="caption" fontWeight={700}>{serviceLabel}</Typography>
                    </Box>
                  </Box>
                </Box>

                <Checkbox
                  size="small"
                  checked={isSelected}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => {
                    event.stopPropagation()
                    toggleEntrySelection(entry, event.target.checked)
                  }}
                  inputProps={{ 'aria-label': t('search.selectResultAria', { title }) }}
                  sx={{
                    position: 'absolute',
                    top: 6,
                    left: 6,
                    zIndex: 3,
                    p: 0.25,
                    borderRadius: 0.75,
                    color: '#ffffff',
                    bgcolor: 'rgba(0,0,0,0.45)',
                    '&.Mui-checked': {
                      color: '#ffffff',
                      bgcolor: 'rgba(0,0,0,0.62)',
                    },
                    '&:hover': {
                      bgcolor: 'rgba(0,0,0,0.58)',
                    },
                  }}
                />

                <IconButton
                  size="small"
                  onClick={(event) => handleOpenKebab(event, entry)}
                  sx={{ position: 'absolute', top: 8, right: 8, bgcolor: 'background.paper', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', '&:hover': { bgcolor: 'action.hover' } }}
                >
                  <MoreVertical size={16} />
                </IconButton>

                <ButtonGroup
                  variant="contained"
                  disableElevation
                  size="small"
                  sx={(theme) => {
                    const baseColor = getServiceThemeColor(serviceKey)
                    const bgColor = (theme.palette.mode === 'dark' && /^#000000$/i.test(baseColor)) ? '#333333' : baseColor
                    const effectiveBg = bgColor || 'primary.main'
                    const effectiveText = (theme.palette.mode === 'light' && /^#FFFFFF$/i.test(baseColor)) ? '#000000' : '#ffffff'

                    return {
                      position: 'absolute',
                      bottom: 12,
                      right: 12,
                      borderRadius: 9999,
                      boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                      '& .MuiButton-root': {
                        textTransform: 'none',
                        fontWeight: 700,
                        bgcolor: effectiveBg,
                        color: effectiveText,
                      },
                      '& .MuiButton-root:hover': {
                        bgcolor: effectiveBg,
                        filter: 'brightness(1.15)',
                      },
                      '& .MuiButtonGroup-grouped:not(:last-of-type)': {
                        borderColor: theme.palette.mode === 'light' && /^#FFFFFF$/i.test(baseColor)
                          ? 'rgba(0,0,0,0.15)'
                          : 'rgba(255,255,255,0.25)',
                      },
                    }
                  }}
                >
                  <Button onClick={() => handleDownloadMain(entry)} sx={{ px: 2, borderRadius: '9999px 0 0 9999px' }}>
                    {t('search.download')}
                  </Button>
                  <Button size="small" onClick={(event) => handleOpenDownloadDropdown(event, entry)} sx={{ px: 0.75, minWidth: 0, borderRadius: '0 9999px 9999px 0' }}>
                    <ChevronDown size={16} />
                  </Button>
                </ButtonGroup>
              </Card>
            )
          })}
        </Stack>
      )}

      {results.length > 0 && (
        <Box ref={loadMoreSentinelRef} sx={{ width: '100%', height: 1 }} />
      )}

      {loadingMore && results.length > 0 && (
        <Stack spacing={1} alignItems="center" justifyContent="center" sx={{ py: 3 }}>
          <CircularProgress size={22} />
          <Typography variant="body2" color="text.secondary">{t('search.loadingMore')}</Typography>
        </Stack>
      )}

      {selectedCount > 0 && (
        <Box
          sx={{
            position: 'sticky',
            bottom: 0,
            zIndex: 24,
            mt: 2,
            ml: { xs: -1.25, sm: -1.75 },
            mr: { xs: -1.25, sm: -1.75 },
          }}
        >
          <Box
            sx={{
              borderRadius: '18px 18px 0 0',
              border: '1px solid',
              borderBottom: 'none',
              borderColor: 'divider',
              bgcolor: 'background.paper',
              px: { xs: 1.5, sm: 2 },
              py: 1.15,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 1,
              boxShadow: '0 8px 26px rgba(0,0,0,0.14)',
            }}
          >
            <Button
              size="small"
              onClick={selectedListOpen ? handleCloseSelectedList : handleOpenSelectedList}
              endIcon={selectedListOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              sx={{ textTransform: 'none', fontWeight: 800, px: 1.4, cursor: 'pointer' }}
            >
              {t('search.selectedCount', { count: selectedCount })}
            </Button>

            <Stack direction="row" spacing={1}>
              <Button
                size="small"
                variant="text"
                onClick={handleClearSelectedEntries}
                sx={{ textTransform: 'none', fontWeight: 700, cursor: 'pointer' }}
              >
                {t('tabs.cancel')}
              </Button>

              <ButtonGroup
                variant="contained"
                disableElevation
                size="small"
                sx={{
                  borderRadius: 3.5,
                  overflow: 'hidden',
                  boxShadow: '0 2px 10px rgba(0,0,0,0.18)',
                  '& .MuiButtonGroup-grouped': {
                    minHeight: 34,
                  },
                }}
              >
                <Button
                  onClick={handleDownloadSelectedEntries}
                  sx={{ textTransform: 'none', fontWeight: 800, px: 1.9, borderRadius: '14px 0 0 14px', cursor: 'pointer' }}
                >
                  {t('search.downloadSelected')}
                </Button>
                <Button
                  size="small"
                  onClick={handleOpenSelectedDownloadOptions}
                  aria-label={t('search.downloadSelectedOptionsAria')}
                  sx={{ minWidth: 34, px: 0.8, borderRadius: '0 14px 14px 0', cursor: 'pointer' }}
                >
                  <ChevronDown size={15} />
                </Button>
              </ButtonGroup>
            </Stack>
          </Box>
        </Box>
      )}
    </>
  )
}
