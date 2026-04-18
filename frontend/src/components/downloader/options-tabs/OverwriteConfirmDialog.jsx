import React from 'react'
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from '@mui/material'

export default function OverwriteConfirmDialog({
  open = false,
  title = '',
  message = '',
  detail = '',
  replaceLabel = '',
  keepLabel = '',
  cancelLabel = '',
  onReplace,
  onKeep,
  onCancel,
}) {
  return (
    <Dialog
      open={Boolean(open)}
      onClose={onCancel}
      maxWidth="xs"
      fullWidth
      // Keep the dialog below fixed Electron titlebar controls (z-index 1700).
      sx={{ zIndex: 1600 }}
    >
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {message}
        </Typography>
        {detail && (
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1.25 }}>
            {detail}
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>{cancelLabel}</Button>
        <Button onClick={onKeep}>{keepLabel}</Button>
        <Button variant="contained" color="error" onClick={onReplace}>
          {replaceLabel}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
