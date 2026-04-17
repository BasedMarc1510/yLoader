import React from 'react'
import { Box } from '@mui/material'
import SimpleBar from 'simplebar-react'

export default function SimpleBarScrollArea({
  children,
  className = '',
  sx,
  autoHide = false,
  forceVisible = 'y',
  clickOnTrack = false,
  fillContainer = true,
  hideHorizontal = false,
  scrollableNodeProps,
  ...props
}) {
  const resolvedClassName = ['yl-simplebar', className].filter(Boolean).join(' ')
  const baseSx = {
    ...(fillContainer
      ? {
          height: '100%',
          minHeight: 0,
        }
      : {}),
    '& .simplebar-content': {
      minHeight: fillContainer ? '100%' : 'auto',
    },
    ...(hideHorizontal
      ? {
          '& .simplebar-content-wrapper': {
            overflowX: 'hidden !important',
          },
        }
      : {}),
  }

  return (
    <Box
      component={SimpleBar}
      className={resolvedClassName}
      autoHide={autoHide}
      forceVisible={forceVisible}
      clickOnTrack={clickOnTrack}
      scrollableNodeProps={scrollableNodeProps}
      sx={[baseSx, sx]}
      {...props}
    >
      {children}
    </Box>
  )
}
