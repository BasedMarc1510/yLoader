import React from 'react'
import { Box, Typography } from '@mui/material'
import { ChevronRight } from 'lucide-react'

/**
 * Breadcrumb navigation for drill-in settings views.
 * @param {{ segments: Array<{ label: string, onClick?: () => void }>, isMobileLayout?: boolean }} props
 */
export default function SettingsBreadcrumb({ segments = [], isMobileLayout = false }) {
  if (!Array.isArray(segments) || segments.length < 2) return null

  const headingSize = isMobileLayout ? 20 : 24
  const headingSpacing = isMobileLayout ? '-0.3px' : '-0.5px'
  const chevronSize = isMobileLayout ? 17 : 19

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: isMobileLayout ? 0.55 : 0.7,
        minWidth: 0,
      }}
    >
      {segments.map((segment, index) => {
        const isLast = index === segments.length - 1
        const isClickable = Boolean(segment.onClick) && !isLast

        return (
          <React.Fragment key={index}>
            {index > 0 && (
              <ChevronRight
                size={chevronSize}
                style={{ color: 'var(--breadcrumb-separator, #8e8e93)', flexShrink: 0, opacity: 0.9 }}
              />
            )}
            <Typography
              component={isClickable ? 'button' : 'span'}
              onClick={isClickable ? segment.onClick : undefined}
              sx={{
                fontWeight: 700,
                fontSize: headingSize,
                letterSpacing: headingSpacing,
                color: 'text.primary',
                opacity: isLast ? 1 : 0.75,
                cursor: isClickable ? 'pointer' : 'default',
                background: 'none',
                border: 'none',
                p: 0,
                fontFamily: 'inherit',
                lineHeight: 1.15,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                '&:hover': isClickable
                  ? { opacity: 1 }
                  : {},
              }}
            >
              {segment.label}
            </Typography>
          </React.Fragment>
        )
      })}
    </Box>
  )
}
