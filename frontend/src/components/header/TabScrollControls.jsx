import React from 'react'
import { Box, IconButton } from '@mui/material'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export default function TabScrollControls({
  show,
  canScrollLeft,
  canScrollRight,
  onScroll,
  t,
}) {
  return (
    <Box className={`yl-scroll-controls ${show ? 'show' : ''}`}>
      <IconButton
        size="small"
        className="yl-scroll-btn"
        onClick={() => onScroll('left')}
        disabled={!canScrollLeft}
        aria-label={t('tabs.scrollLeftAria')}
      >
        <ChevronLeft size={14} />
      </IconButton>
      <IconButton
        size="small"
        className="yl-scroll-btn"
        onClick={() => onScroll('right')}
        disabled={!canScrollRight}
        aria-label={t('tabs.scrollRightAria')}
      >
        <ChevronRight size={14} />
      </IconButton>
    </Box>
  )
}
