import React from 'react'
import { Box, Grid, Pagination, Skeleton, Stack, Typography } from '@mui/material'
import { Download } from 'lucide-react'
import {
  DownloadGridCard,
  DownloadGridCardSkeleton,
  DownloadListRow,
  DownloadListRowSkeleton,
} from './DownloadEntryCards'
import { GRID_SKELETON_COUNT, LIST_SKELETON_COUNT } from './downloadsPageUtils'

export default function DownloadsContent({
  downloads,
  entries,
  filteredDownloads,
  isDark,
  loading,
  onOpenEntryMenu,
  page,
  pageSize,
  setPage,
  showInitialSkeleton,
  t,
  totalPages,
  viewMode,
}) {
  return (
    <>
      {loading && downloads.length > 0 && (
        <Box sx={{ mb: 1.6 }}>
          <Skeleton
            variant="rounded"
            animation="wave"
            height={8}
            sx={{
              borderRadius: 999,
              bgcolor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
            }}
          />
        </Box>
      )}

      {showInitialSkeleton && viewMode === 'grid' && (
        <Grid container spacing={2}>
          {Array.from({ length: GRID_SKELETON_COUNT }).map((_, index) => (
            <Grid item xs={12} sm={6} md={4} lg={3} xl={2} key={`downloads-grid-skeleton-${index}`}>
              <DownloadGridCardSkeleton isDark={isDark} />
            </Grid>
          ))}
        </Grid>
      )}

      {showInitialSkeleton && viewMode === 'list' && (
        <Stack spacing={1.25}>
          {Array.from({ length: LIST_SKELETON_COUNT }).map((_, index) => (
            <DownloadListRowSkeleton isDark={isDark} key={`downloads-list-skeleton-${index}`} />
          ))}
        </Stack>
      )}

      {!showInitialSkeleton && entries.length > 0 && viewMode === 'grid' && (
        <Grid container spacing={2}>
          {entries.map((entry) => (
            <Grid item xs={12} sm={6} md={4} lg={3} xl={2} key={entry.id}>
              <DownloadGridCard
                entry={entry}
                isDark={isDark}
                t={t}
                onOpenActionsMenu={onOpenEntryMenu}
              />
            </Grid>
          ))}
        </Grid>
      )}

      {!showInitialSkeleton && entries.length > 0 && viewMode === 'list' && (
        <Stack spacing={1.25}>
          {entries.map((entry) => (
            <DownloadListRow
              key={entry.id}
              entry={entry}
              isDark={isDark}
              t={t}
              onOpenActionsMenu={onOpenEntryMenu}
            />
          ))}
        </Stack>
      )}

      {!loading && filteredDownloads.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 11, opacity: 0.5 }}>
          <Download size={48} style={{ marginBottom: 14 }} />
          <Typography variant="h6" fontWeight={700}>
            {t('downloads.emptyTitle')}
          </Typography>
          <Typography variant="body2">{t('downloads.emptySubtitle')}</Typography>
        </Box>
      )}

      {!loading && filteredDownloads.length > pageSize && (
        <Box sx={{ mt: 2.4, display: 'flex', justifyContent: 'center' }}>
          <Pagination
            count={totalPages}
            page={page}
            onChange={(_event, nextPage) => setPage(nextPage)}
            color="primary"
            shape="rounded"
            size="medium"
            aria-label={t('downloads.paginationAria')}
            siblingCount={1}
            boundaryCount={1}
          />
        </Box>
      )}
    </>
  )
}
