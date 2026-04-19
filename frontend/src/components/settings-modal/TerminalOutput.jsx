import React, { useEffect, useRef } from 'react'
import { Box, CircularProgress, Typography } from '@mui/material'

/**
 * Terminal-style output component for real-time update logs.
 * Features: dark background, monospace font, auto-scroll to bottom,
 * loading spinner overlay, error-line highlighting.
 */
export default function TerminalOutput({
  lines = [],
  isRunning = false,
  emptyLabel = '',
  height = 220,
}) {
  const scrollRef = useRef(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [lines])

  const hasLines = Array.isArray(lines) && lines.length > 0

  return (
    <Box
      sx={(theme) => ({
        position: 'relative',
        borderRadius: '8px',
        overflow: 'hidden',
        bgcolor: theme.palette.mode === 'dark' ? '#0d0d0d' : '#1a1a2e',
        border: `1px solid ${theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.12)'}`,
      })}
    >
      {/* Terminal header bar */}
      <Box
        sx={(theme) => ({
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          px: 1.5,
          py: 0.75,
          bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.06)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        })}
      >
        <Box sx={{ display: 'flex', gap: 0.75 }}>
          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: isRunning ? '#22c55e' : '#3a3a3c' }} />
          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#3a3a3c' }} />
          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#3a3a3c' }} />
        </Box>
        {isRunning && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, ml: 'auto' }}>
            <CircularProgress size={12} sx={{ color: '#22c55e' }} />
            <Typography sx={{ fontSize: 11, color: '#8e8e93', fontFamily: 'monospace' }}>
              running
            </Typography>
          </Box>
        )}
      </Box>

      {/* Terminal body */}
      <Box
        ref={scrollRef}
        sx={{
          height,
          overflowY: 'auto',
          overflowX: 'hidden',
          p: 1.5,
          fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", "SF Mono", monospace',
          fontSize: 12,
          lineHeight: 1.7,
          color: '#d4d4d4',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          '&::-webkit-scrollbar': {
            width: 6,
          },
          '&::-webkit-scrollbar-track': {
            background: 'transparent',
          },
          '&::-webkit-scrollbar-thumb': {
            background: 'rgba(255,255,255,0.15)',
            borderRadius: 3,
          },
        }}
      >
        {!hasLines ? (
          <Typography
            component="span"
            sx={{
              color: 'rgba(255,255,255,0.3)',
              fontStyle: 'italic',
              fontFamily: 'inherit',
              fontSize: 'inherit',
            }}
          >
            {emptyLabel || '$ _'}
          </Typography>
        ) : (
          lines.map((line, index) => {
            const text = String(line || '')
            const isError = text.includes('ERROR') || text.includes('error:') || text.includes('FEHLER')
            const isSuccess = text.includes('completed') || text.includes('abgeschlossen') || text.includes('done')

            return (
              <Box
                key={index}
                component="div"
                sx={{
                  mb: '1px',
                  color: isError ? '#f87171' : isSuccess ? '#4ade80' : '#d4d4d4',
                  '&::before': {
                    content: isError ? '"▸ "' : '""',
                    color: '#f87171',
                  },
                }}
              >
                {text}
              </Box>
            )
          })
        )}
      </Box>
    </Box>
  )
}
