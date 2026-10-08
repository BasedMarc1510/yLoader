import React from 'react'
import { Button } from '@mui/material'
import { Scissors } from 'lucide-react'
import { useI18n } from '../../providers/I18nProvider'
import MediaEditorDialog from './MediaEditorDialog'

export default function CompletedDownloadEditor({ entry, downloading }) {
  const { t } = useI18n()
  const [open, setOpen] = React.useState(false)
  if (!entry || downloading) return null
  return <>
    <Button startIcon={<Scissors size={16} />} onClick={() => setOpen(true)} sx={{ mt: 2 }}>{t('editor.edit')}</Button>
    {open && <MediaEditorDialog key={entry.id} entry={entry} onClose={() => setOpen(false)} />}
  </>
}
