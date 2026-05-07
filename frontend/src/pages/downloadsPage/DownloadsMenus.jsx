import React from 'react'
import { Box, Menu, MenuItem, Typography } from '@mui/material'
import { Download, Filter, RefreshCw, Trash2 } from 'lucide-react'
import ServiceIcon from '../../components/ServiceIcon'

export default function DownloadsMenus({
  canMenuSaveTarget,
  closeEntryMenu,
  entryMenuAnchorEl,
  entryMenuItem,
  filterService,
  handleMenuDelete,
  handleMenuRedownload,
  handleMenuSave,
  hasMenuRedownloadTarget,
  serviceMenuAnchorEl,
  serviceOptions,
  setFilterService,
  setServiceMenuAnchorEl,
  t,
}) {
  return (
    <>
      <Menu
        anchorEl={serviceMenuAnchorEl}
        open={Boolean(serviceMenuAnchorEl)}
        onClose={() => setServiceMenuAnchorEl(null)}
        PaperProps={{
          sx: {
            mt: 0.7,
            borderRadius: 1,
          },
        }}
      >
        {serviceOptions.map((service) => (
          <MenuItem
            key={service.value}
            selected={filterService === service.value}
            onClick={() => {
              setFilterService(service.value)
              setServiceMenuAnchorEl(null)
            }}
          >
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1.1 }}>
              {service.icon ? (
                <ServiceIcon serviceKey={service.icon} size={17} title={t('sidebar.iconAlt', { name: service.label })} />
              ) : (
                <Filter size={17} />
              )}
              <Typography variant="body2">{service.label}</Typography>
            </Box>
          </MenuItem>
        ))}
      </Menu>

      <Menu
        anchorEl={entryMenuAnchorEl}
        open={Boolean(entryMenuAnchorEl && entryMenuItem)}
        onClose={closeEntryMenu}
        PaperProps={{
          sx: {
            mt: 0.7,
            borderRadius: 1,
            minWidth: 200,
            bgcolor: '#1f2228',
            color: '#f4f6f8',
            boxShadow: '0 18px 40px rgba(0,0,0,0.35)',
            '& .MuiMenuItem-root': {
              borderRadius: 0.75,
              mx: 0.5,
              my: 0.2,
              '&:hover': {
                bgcolor: 'rgba(255,255,255,0.08)',
              },
            },
          },
        }}
      >
        <MenuItem onClick={handleMenuSave} disabled={!canMenuSaveTarget}>
          <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
            <Download size={15} />
            <span>{t('downloads.save')}</span>
          </Box>
        </MenuItem>

        <MenuItem onClick={handleMenuRedownload} disabled={!hasMenuRedownloadTarget}>
          <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
            <RefreshCw size={15} />
            <span>{t('downloads.redownload')}</span>
          </Box>
        </MenuItem>

        <MenuItem
          onClick={handleMenuDelete}
          sx={{
            color: '#ffb3b3',
            '&:hover': {
              bgcolor: 'rgba(255, 118, 118, 0.15)',
            },
          }}
        >
          <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
            <Trash2 size={15} />
            <span>{t('downloads.removeEntry')}</span>
          </Box>
        </MenuItem>
      </Menu>
    </>
  )
}
