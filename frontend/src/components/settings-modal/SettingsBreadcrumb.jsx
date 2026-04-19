import React from 'react'
import { Box, Typography } from '@mui/material'
import { ChevronRight } from 'lucide-react'

/**
 * Breadcrumb navigation for drill-in settings views.
 * @param {{ segments: Array<{ label: string, onClick?: () => void }> }} props
 */
export default function SettingsBreadcrumb({ segments = [] }) {
  if (!Array.isArray(segments) || segments.length < 2) return null

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        mb: 0.5,
      }}
    >
      {segments.map((segment, index) => {
        const isLast = index === segments.length - 1
        const isClickable = Boolean(segment.onClick) && !isLast

        return (
          <React.Fragment key={index}>
            {index > 0 && (
              <ChevronRight
                size={13}
                style={{ color: 'var(--breadcrumb-separator, #8e8e93)', flexShrink: 0 }}
              />
            )}
            <Typography
              component={isClickable ? 'button' : 'span'}
              onClick={isClickable ? segment.onClick : undefined}
              sx={{
                fontWeight: isLast ? 700 : 500,
                fontSize: 14,
                letterSpacing: 0,
                color: isLast ? 'text.primary' : 'text.secondary',
                cursor: isClickable ? 'pointer' : 'default',
                background: 'none',
                border: 'none',
                p: 0,
                fontFamily: 'inherit',
                lineHeight: 1.3,
                '&:hover': isClickable
                  ? { color: 'text.primary', textDecoration: 'underline' }
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
