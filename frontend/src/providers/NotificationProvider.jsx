import React, { createContext, useCallback, useContext, useState, useEffect, useRef } from 'react'
import { Box, Paper, Typography, IconButton, Collapse, useTheme, keyframes } from '@mui/material'
import { X, AlertCircle, CheckCircle, Info, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'
import { useI18n } from './I18nProvider'

// Context
const NotificationContext = createContext({
    showNotification: () => { },
})

export const useNotification = () => useContext(NotificationContext)

// Keyframe for subtle slide in
const slideIn = keyframes`
  from { opacity: 0; transform: translateX(20px); }
  to { opacity: 1; transform: translateX(0); }
`

// Individual Notification Component
const NotificationItem = ({ id, message, severity, onClose, duration = 5000 }) => {
    const theme = useTheme()
    const { t } = useI18n()
    const isDark = theme.palette.mode === 'dark'

    // Pause detection
    const [isPaused, setIsPaused] = useState(false)
    const [isExpanded, setIsExpanded] = useState(false)
    const [isExiting, setIsExiting] = useState(false) // For smooth exit handling if needed manually

    // Timer ref
    const timerRef = useRef(null)
    const remainingTime = useRef(duration)
    const startTime = useRef(Date.now())

    // Start timer function
    const startTimer = useCallback(() => {
        timerRef.current = setTimeout(() => {
            onClose(id)
        }, remainingTime.current)
        startTime.current = Date.now()
    }, [id, onClose])

    // Pause timer function
    const pauseTimer = useCallback(() => {
        if (timerRef.current) {
            clearTimeout(timerRef.current)
            timerRef.current = null // clear
            const elapsed = Date.now() - startTime.current
            remainingTime.current = Math.max(0, remainingTime.current - elapsed)
        }
    }, [])

    // Initial timer start
    useEffect(() => {
        startTimer()
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current)
        }
    }, [startTimer])

    // Handlers for hover
    const handleMouseEnter = () => {
        setIsPaused(true)
        pauseTimer()
    }

    const handleMouseLeave = () => {
        setIsPaused(false)
        startTimer()
    }

    // Icons based on severity
    const getIcon = () => {
        switch (severity) {
            case 'error': return <AlertCircle size={20} color="#e53935" />
            case 'warning': return <AlertTriangle size={20} color="#fb8c00" />
            case 'success': return <CheckCircle size={20} color="#43a047" /> // User disabled success, but kept for completeness/future
            default: return <Info size={20} color="#0288d1" />
        }
    }

    // Styles
    const bgColor = isDark ? 'rgba(30, 30, 30, 0.95)' : 'rgba(255, 255, 255, 0.98)'
    const borderColor = isDark ? '#333' : '#e0e0e0'
    const textColor = isDark ? '#fff' : '#1a1a1a'

    // Check if message is long
    const isLong = message.length > 60

    return (
        <Collapse in={true} unmountOnExit sx={{ mb: 1.5 }}>
            <Paper
                elevation={4}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                sx={{
                    width: 320,
                    bgcolor: bgColor,
                    border: `1px solid ${borderColor}`,
                    borderRadius: 2,
                    position: 'relative',
                    overflow: 'hidden',
                    transition: 'all 0.3s ease',
                    animation: `${slideIn} 0.3s cubic-bezier(0.2, 0, 0, 1)`,
                    backdropFilter: 'blur(8px)',
                    boxShadow: isDark ? '0 8px 32px rgba(0,0,0,0.4)' : '0 8px 24px rgba(0,0,0,0.12)',
                }}
            >
                <Box sx={{ p: 2, display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                    <Box sx={{ mt: 0.25, flexShrink: 0 }}>
                        {getIcon()}
                    </Box>

                    <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography
                            variant="body2"
                            sx={{
                                color: textColor,
                                fontWeight: 500,
                                fontSize: '0.9rem',
                                lineHeight: 1.5,
                                // Line clamping if not expanded
                                ...(!isExpanded && {
                                    display: '-webkit-box',
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: 'vertical',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis'
                                })
                            }}
                        >
                            {message}
                        </Typography>

                        {isLong && (
                            <Box
                                component="span"
                                onClick={() => setIsExpanded(!isExpanded)}
                                sx={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 0.5,
                                    mt: 0.5,
                                    cursor: 'pointer',
                                    color: isDark ? '#999' : '#666',
                                    fontSize: '0.75rem',
                                    fontWeight: 600,
                                    '&:hover': { color: textColor }
                                }}
                            >
                                {isExpanded ? (
                                    <>{t('notifications.showLess')} <ChevronUp size={14} /></>
                                ) : (
                                    <>{t('notifications.showMore')} <ChevronDown size={14} /></>
                                )}
                            </Box>
                        )}
                    </Box>

                    <IconButton size="small" onClick={() => onClose(id)} sx={{ mt: -0.5, mr: -0.5, color: isDark ? '#666' : '#999', '&:hover': { color: textColor, bgcolor: isDark ? '#333' : '#f0f0f0' } }}>
                        <X size={16} />
                    </IconButton>
                </Box>

                {/* Progress timer bar (optional, nice touch for best practice) */}
                {/* <Box sx={{ height: 2, bgcolor: borderColor, width: '100%' }}>
            <Box 
              sx={{ 
                height: '100%', 
                bgcolor: severity === 'error' ? '#e53935' : (severity === 'warning' ? '#fb8c00' : brandColor), 
                width: isPaused ? '100%' : '0%', // This is complex to animate perfectly with pause without CSS var manipulation, simplifying for now to just show clean UI
                transition: isPaused ? 'none' : `width ${duration}ms linear`
              }} 
            />
        </Box> */}
            </Paper>
        </Collapse>
    )
}

// Global Provider
export default function NotificationProvider({ children }) {
    const [notifications, setNotifications] = useState([])

    const showNotification = useCallback((message, severity = 'info') => {
        const id = Date.now().toString() + Math.random().toString(36).substr(2, 9)
        setNotifications((prev) => [...prev, { id, message, severity }])
    }, [])

    const removeNotification = useCallback((id) => {
        setNotifications((prev) => prev.filter((n) => n.id !== id))
    }, [])

    return (
        <NotificationContext.Provider value={{ showNotification }}>
            {children}
            <Box
                sx={{
                    position: 'fixed',
                    bottom: 24,
                    right: 24,
                    zIndex: 9999,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-end',
                    pointerEvents: 'none', // Allow clicking through empty space
                    '& > *': { pointerEvents: 'auto' } // Re-enable clicks on notifications
                }}
            >
                {notifications.map((n) => (
                    <NotificationItem
                        key={n.id}
                        {...n}
                        onClose={removeNotification}
                    />
                ))}
            </Box>
        </NotificationContext.Provider>
    )
}
