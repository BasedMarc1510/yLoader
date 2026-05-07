import React from 'react'
import {
  Box,
  Button,
  IconButton,
  InputAdornment,
  Menu,
  MenuItem,
  TextField,
  Typography,
} from '@mui/material'
import { ChevronDown, Search as SearchIcon, X } from 'lucide-react'
import ServiceIcon from '../../components/ServiceIcon'
import { SEARCH_SERVICE_OPTIONS } from './searchUtils'

export default function SearchBar({
  handleClearSearch,
  handleSubmit,
  loadingInitial,
  onSelectService,
  query,
  selectedService,
  selectedServiceOption,
  serviceMenuAnchor,
  setQuery,
  setServiceMenuAnchor,
  t,
}) {
  return (
    <>
      <Menu
        anchorEl={serviceMenuAnchor}
        open={Boolean(serviceMenuAnchor)}
        onClose={() => setServiceMenuAnchor(null)}
        transformOrigin={{ horizontal: 'left', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'left', vertical: 'bottom' }}
        slotProps={{ paper: { sx: { width: 220, mt: 1, borderRadius: 3, boxShadow: '0 4px 20px rgba(0,0,0,0.1)' } } }}
      >
        {SEARCH_SERVICE_OPTIONS.map((option) => (
          <MenuItem
            key={option.value}
            selected={selectedService === option.value}
            onClick={() => onSelectService(option.value)}
            sx={{ py: 1.5, borderRadius: 2, mx: 1 }}
          >
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1.5 }}>
              <ServiceIcon serviceKey={option.iconKey} size={20} />
              <Typography variant="body2" fontWeight={selectedService === option.value ? 800 : 500}>
                {t(option.labelKey)}
              </Typography>
            </Box>
          </MenuItem>
        ))}
      </Menu>

      <TextField
        value={query}
        fullWidth
        placeholder={t('search.queryPlaceholder')}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            handleSubmit()
          }
        }}
        sx={(muiTheme) => ({
          '& .MuiOutlinedInput-root': {
            position: 'relative',
            borderRadius: 9999,
            backgroundColor: muiTheme.palette.mode === 'dark' ? '#303030' : '#f9f9f9',
            outline: 'none',
            '&:focus-within': {
              outline: 'none',
              boxShadow: 'none',
            },
            '& fieldset': {
              borderColor: muiTheme.palette.mode === 'dark' ? '#3c3c3c' : '#e0e0e0',
              borderWidth: '1px !important',
            },
            '&:hover fieldset': {
              borderColor: muiTheme.palette.mode === 'dark' ? '#3c3c3c' : '#e0e0e0',
            },
            '&.Mui-focused fieldset': {
              borderColor: muiTheme.palette.mode === 'dark' ? '#3c3c3c' : '#e0e0e0',
              borderWidth: '1px !important',
            },
            boxShadow: muiTheme.palette.mode === 'dark' ? 'none' : '0 1px 2px rgba(0,0,0,0.06)',
            transition: 'box-shadow 0.3s, border-color 0.3s',
          },
          '& .MuiOutlinedInput-input': {
            paddingLeft: '8px',
            paddingRight: '16px',
            color: muiTheme.palette.text.primary,
            fontWeight: 700,
            outline: 'none',
          },
          '& .MuiOutlinedInput-input::placeholder': {
            color: muiTheme.palette.text.secondary,
            fontWeight: 700,
          },
        })}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start" sx={{ ml: 0, mr: 0.25 }}>
              <Button
                size="small"
                onClick={(event) => setServiceMenuAnchor(event.currentTarget)}
                startIcon={<ServiceIcon serviceKey={selectedServiceOption.iconKey} size={18} />}
                endIcon={<ChevronDown size={14} />}
                sx={{
                  height: 36,
                  borderRadius: 9999,
                  textTransform: 'none',
                  fontWeight: 700,
                  px: 1.5,
                  color: 'text.primary',
                  bgcolor: 'transparent',
                  '&:hover': { bgcolor: 'action.hover' },
                }}
              >
                {t(selectedServiceOption.labelKey)}
              </Button>
            </InputAdornment>
          ),
          endAdornment: (
            <InputAdornment position="end">
              {Boolean(query) && (
                <IconButton size="small" onClick={handleClearSearch} title={t('search.clear')} sx={{ mr: 0.5, opacity: 0.5, '&:hover': { opacity: 1 } }}>
                  <X size={18} />
                </IconButton>
              )}
              <IconButton
                size="small"
                edge="end"
                disabled={loadingInitial || !String(query || '').trim()}
                onClick={handleSubmit}
                sx={(muiTheme) => ({
                  width: 36,
                  height: 36,
                  bgcolor: muiTheme.palette.mode === 'dark' ? '#ffffff' : '#000000',
                  color: muiTheme.palette.mode === 'dark' ? '#000000' : '#ffffff',
                  borderRadius: '50%',
                  boxShadow: muiTheme.palette.mode === 'dark'
                    ? '0 2px 6px rgba(0,0,0,0.4)'
                    : '0 2px 6px rgba(0,0,0,0.25)',
                  '&:hover': {
                    bgcolor: muiTheme.palette.mode === 'dark' ? '#f5f5f5' : '#111111',
                  },
                  '&.Mui-disabled': {
                    opacity: 0.55,
                    color: muiTheme.palette.mode === 'dark' ? '#000000' : '#ffffff',
                    bgcolor: muiTheme.palette.mode === 'dark' ? '#ffffff' : '#000000',
                  },
                })}
              >
                <SearchIcon size={18} />
              </IconButton>
            </InputAdornment>
          ),
        }}
        inputProps={{
          'aria-label': t('search.queryAria'),
          spellCheck: 'false',
        }}
      />
    </>
  )
}
