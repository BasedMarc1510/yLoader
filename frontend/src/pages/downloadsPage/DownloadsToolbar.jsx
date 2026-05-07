import React from 'react'
import {
  Box,
  Button,
  Chip,
  IconButton,
  InputAdornment,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import { ChevronDown, Filter, LayoutGrid, List, Search } from 'lucide-react'
import ServiceIcon from '../../components/ServiceIcon'

export default function DownloadsToolbar({
  activeServiceOption,
  filterType,
  isDark,
  onOpenServiceMenu,
  onSearchTermChange,
  onTypeFilterChange,
  onViewModeChange,
  searchTerm,
  t,
  theme,
  typeFilterOptions,
  viewMode,
}) {
  return (
    <Box
      sx={{
        mb: 2.7,
        p: 1.5,
        borderRadius: 1,
        border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`,
        bgcolor: isDark ? '#181818' : '#fff',
        boxShadow: isDark
          ? '0 14px 32px rgba(0,0,0,0.2)'
          : '0 10px 26px rgba(15,20,25,0.08)',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <TextField
          placeholder={t('downloads.searchPlaceholder')}
          value={searchTerm}
          onChange={(event) => onSearchTermChange(event.target.value)}
          size="small"
          fullWidth
          sx={{
            flex: 1,
            minWidth: { xs: '100%', md: 280 },
            '& .MuiOutlinedInput-root': {
              minHeight: 42,
              borderRadius: 1,
              bgcolor: isDark ? 'rgba(255,255,255,0.03)' : '#fafafa',
            },
          }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search size={17} color={theme.palette.text.secondary} />
              </InputAdornment>
            ),
          }}
        />

        <Button
          variant="outlined"
          onClick={onOpenServiceMenu}
          aria-label={t('downloads.filterByService')}
          sx={{
            borderRadius: 1,
            px: 1.3,
            textTransform: 'none',
            fontWeight: 700,
            minHeight: 42,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.9,
            cursor: 'pointer',
          }}
        >
          {activeServiceOption.icon ? (
            <ServiceIcon
              serviceKey={activeServiceOption.icon}
              size={16}
              title={t('sidebar.iconAlt', { name: activeServiceOption.label })}
            />
          ) : (
            <Filter size={16} />
          )}
          <Typography variant="body2" fontWeight={700}>
            {activeServiceOption.label}
          </Typography>
          <ChevronDown size={15} />
        </Button>

        <Box
          sx={{
            ml: { xs: 0, md: 'auto' },
            display: 'inline-flex',
            alignItems: 'center',
            p: 0.35,
            borderRadius: 1,
            border: `1px solid ${isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.12)'}`,
            bgcolor: isDark ? 'rgba(255,255,255,0.03)' : '#fafafa',
          }}
        >
          <Tooltip title={t('downloads.viewGrid')}>
            <IconButton
              size="small"
              aria-label={t('downloads.viewGridAria')}
              onClick={() => onViewModeChange('grid')}
              sx={{
                borderRadius: 0.75,
                bgcolor: viewMode === 'grid'
                  ? (isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)')
                  : 'transparent',
                cursor: 'pointer',
              }}
            >
              <LayoutGrid size={17} />
            </IconButton>
          </Tooltip>

          <Tooltip title={t('downloads.viewList')}>
            <IconButton
              size="small"
              aria-label={t('downloads.viewListAria')}
              onClick={() => onViewModeChange('list')}
              sx={{
                borderRadius: 0.75,
                bgcolor: viewMode === 'list'
                  ? (isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)')
                  : 'transparent',
                cursor: 'pointer',
              }}
            >
              <List size={17} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      <Box sx={{ mt: 1.25, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        {typeFilterOptions.map((option) => (
          <Chip
            key={option.value}
            label={option.label}
            clickable
            onClick={() => onTypeFilterChange(option.value)}
            variant="outlined"
            sx={{
              borderRadius: 1,
              px: 0.3,
              fontWeight: 700,
              borderColor: filterType === option.value
                ? 'rgba(214, 66, 66, 0.4)'
                : (isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.14)'),
              bgcolor: filterType === option.value
                ? (isDark ? 'rgba(214,66,66,0.18)' : 'rgba(214,66,66,0.1)')
                : 'transparent',
              color: filterType === option.value
                ? (isDark ? '#ffb4b4' : '#992828')
                : 'text.primary',
              cursor: 'pointer',
              '&:hover': {
                bgcolor: filterType === option.value
                  ? (isDark ? 'rgba(214,66,66,0.24)' : 'rgba(214,66,66,0.16)')
                  : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'),
              },
            }}
          />
        ))}
      </Box>
    </Box>
  )
}
