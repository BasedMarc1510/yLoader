import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Box, useTheme } from '@mui/material'
import { useI18n } from './I18nProvider'
import NotificationCenterPopover from './notification/NotificationCenterPopover'
import NotificationToast from './notification/NotificationToast'
import {
  CLEANUP_INTERVAL_MS,
  HISTORY_STORAGE_KEY,
  createNotificationId,
  loadStoredEntries,
  normalizeActions,
  normalizeDuration,
  normalizeMessage,
  normalizeSeverity,
  pruneEntries,
  toStoredEntry,
} from './notification/utils'

const NotificationContext = createContext({
  showNotification: () => '',
  unreadCount: 0,
  isNotificationCenterOpen: false,
  openNotificationCenter: () => {},
  closeNotificationCenter: () => {},
  dismissNotification: () => {},
  removeNotification: () => {},
  clearNotifications: () => {},
})

export const useNotification = () => useContext(NotificationContext)

export default function NotificationProvider({ children }) {
  const { t, language } = useI18n()
  const theme = useTheme()
  const isDark = theme.palette.mode === 'dark'

  const [entries, setEntries] = useState(() => loadStoredEntries())
  const [centerAnchorEl, setCenterAnchorEl] = useState(null)
  const [isWindowFocused, setIsWindowFocused] = useState(() => {
    if (typeof document === 'undefined') return true
    return document.visibilityState === 'visible' && document.hasFocus()
  })

  const entriesRef = useRef(entries)
  useEffect(() => {
    entriesRef.current = entries
  }, [entries])

  const markAllNotificationsRead = useCallback(() => {
    setEntries((previous) => {
      let changed = false
      const next = previous.map((entry) => {
        if (entry.read) return entry
        changed = true
        return { ...entry, read: true }
      })
      return changed ? next : previous
    })
  }, [])

  const clearNotifications = useCallback(() => {
    setEntries([])
  }, [])

  const dismissNotification = useCallback((id) => {
    const targetId = String(id || '').trim()
    if (!targetId) return

    setEntries((previous) => previous.map((entry) => {
      if (entry.id !== targetId) return entry
      if (entry.status === 'dismissed' && entry.read) return entry
      return {
        ...entry,
        status: 'dismissed',
        read: true,
      }
    }))
  }, [])

  const removeNotification = useCallback((id) => {
    const targetId = String(id || '').trim()
    if (!targetId) return
    setEntries((previous) => previous.filter((entry) => entry.id !== targetId))
  }, [])

  const openNotificationCenter = useCallback((anchorEl) => {
    if (!anchorEl) return
    setCenterAnchorEl(anchorEl)
    markAllNotificationsRead()
  }, [markAllNotificationsRead])

  const closeNotificationCenter = useCallback(() => {
    setCenterAnchorEl(null)
  }, [])

  const isNotificationCenterOpen = Boolean(centerAnchorEl)

  const showNotification = useCallback((message, severity = 'info', options = {}) => {
    const normalizedMessage = normalizeMessage(message)
    if (!normalizedMessage) return ''

    const duration = normalizeDuration(options?.duration)
    const persistent = Boolean(options?.persistent) || duration <= 0

    const entry = {
      id: createNotificationId(),
      message: normalizedMessage,
      severity: normalizeSeverity(severity),
      createdAt: Date.now(),
      read: isNotificationCenterOpen,
      status: 'active',
      duration: persistent ? 0 : duration,
      persistent,
      startTimerOnFocus: Boolean(options?.startTimerOnFocus),
      actions: normalizeActions(options),
    }

    setEntries((previous) => pruneEntries([entry, ...previous]))
    return entry.id
  }, [isNotificationCenterOpen])

  const handleNotificationAction = useCallback(async (notificationId, actionId) => {
    const entry = entriesRef.current.find((item) => item.id === notificationId)
    const action = entry?.actions?.find((item) => item.id === actionId)
    if (!action || typeof action.onClick !== 'function') return

    try {
      await action.onClick()
    } catch {
      // Keep the notification system resilient if action handlers fail.
    }

    if (action.autoClose !== false) {
      dismissNotification(notificationId)
    }
  }, [dismissNotification])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return undefined

    const updateWindowFocus = () => {
      setIsWindowFocused(document.visibilityState === 'visible' && document.hasFocus())
    }

    updateWindowFocus()
    window.addEventListener('focus', updateWindowFocus)
    window.addEventListener('blur', updateWindowFocus)
    document.addEventListener('visibilitychange', updateWindowFocus)

    return () => {
      window.removeEventListener('focus', updateWindowFocus)
      window.removeEventListener('blur', updateWindowFocus)
      document.removeEventListener('visibilitychange', updateWindowFocus)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const interval = window.setInterval(() => {
      setEntries((previous) => pruneEntries(previous))
    }, CLEANUP_INTERVAL_MS)

    return () => {
      window.clearInterval(interval)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    try {
      const serialized = pruneEntries(entries).map((entry) => toStoredEntry(entry))
      window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(serialized))
    } catch {
      // Ignore storage quota and serialization errors.
    }
  }, [entries])

  const activeNotifications = useMemo(
    () => entries.filter((entry) => entry.status === 'active'),
    [entries]
  )

  const sortedHistory = useMemo(
    () => [...entries].sort((a, b) => b.createdAt - a.createdAt),
    [entries]
  )

  const unreadCount = useMemo(
    () => entries.reduce((count, entry) => (entry.read ? count : count + 1), 0),
    [entries]
  )

  const contextValue = useMemo(() => ({
    showNotification,
    unreadCount,
    isNotificationCenterOpen,
    openNotificationCenter,
    closeNotificationCenter,
    dismissNotification,
    removeNotification,
    clearNotifications,
  }), [
    showNotification,
    unreadCount,
    isNotificationCenterOpen,
    openNotificationCenter,
    closeNotificationCenter,
    dismissNotification,
    removeNotification,
    clearNotifications,
  ])

  return (
    <NotificationContext.Provider value={contextValue}>
      {children}

      <NotificationCenterPopover
        open={isNotificationCenterOpen}
        anchorEl={centerAnchorEl}
        onClose={closeNotificationCenter}
        isDark={isDark}
        t={t}
        language={language}
        sortedHistory={sortedHistory}
        unreadCount={unreadCount}
        onMarkAllRead={markAllNotificationsRead}
        onClearAll={clearNotifications}
        onRemoveNotification={removeNotification}
        onAction={handleNotificationAction}
      />

      <Box
        sx={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: 1900,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 1.2,
          pointerEvents: 'none',
          '& > *': { pointerEvents: 'auto' },
        }}
      >
        {activeNotifications.map((entry) => (
          <NotificationToast
            key={entry.id}
            entry={entry}
            isWindowFocused={isWindowFocused}
            isNotificationCenterOpen={isNotificationCenterOpen}
            onDismiss={dismissNotification}
            onAction={handleNotificationAction}
            t={t}
          />
        ))}
      </Box>
    </NotificationContext.Provider>
  )
}
