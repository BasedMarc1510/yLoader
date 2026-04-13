import React from 'react'
import {
  AppBar,
  Box,
  IconButton,
  Typography,
  CircularProgress,
  Toolbar,
} from '@mui/material'
import { Menu, Home, Download, Heart, Plus, X, ChevronLeft, ChevronRight } from 'lucide-react'
import { Box as ImageBox } from '@mui/material'
import { useTheme } from '@mui/material/styles'
import { useI18n } from '../providers/I18nProvider'
import { getRouteIconKey, getRouteTitle } from '../utils/tabRoutes'

function RouteIcon({ iconKey, xIcon, genericIcon }) {
  if (iconKey === 'downloads') return <Download size={14} />
  if (iconKey === 'support') return <Heart size={14} />
  if (iconKey === 'youtube') {
    return <ImageBox component="img" src="/dl-icons/youtube-icon.svg" alt="YouTube" sx={{ width: 14, height: 14 }} />
  }
  if (iconKey === 'reddit') {
    return <ImageBox component="img" src="/dl-icons/reddit-icon.svg" alt="Reddit" sx={{ width: 14, height: 14 }} />
  }
  if (iconKey === 'x') {
    return <ImageBox component="img" src={xIcon} alt="X/Twitter" sx={{ width: 14, height: 14 }} />
  }
  if (iconKey === 'generic') {
    return <ImageBox component="img" src={genericIcon} alt="Generic" sx={{ width: 14, height: 14 }} />
  }
  return <Home size={14} />
}

function clampProgress(value) {
  const raw = Number(value)
  if (!Number.isFinite(raw)) return 0
  return Math.max(0, Math.min(100, Math.round(raw)))
}

function getTabDomId(tabId) {
  return `yl-tab-${tabId}`
}

function getPanelDomId(tabId) {
  return `yl-tabpanel-${tabId}`
}

// ---------------------------------------------------------------------------
// Chrome-style pointer-drag hook
// ---------------------------------------------------------------------------
function useTabDrag({ tabs, onTabsReorder, scrollContainerRef }) {
  const DRAG_START_THRESHOLD_PX = 2
  const dragRef = React.useRef(null)
  const [draggingId, setDraggingId] = React.useState(null)
  // offsets: per-tabId translateX px value during drag
  const [offsets, setOffsets] = React.useState({})
  // didDrag ref: true once pointer moved past threshold, used to suppress click
  const didDragRef = React.useRef(false)

  const cancelDrag = React.useCallback(() => {
    const state = dragRef.current
    if (state) {
      if (state.animFrameId) cancelAnimationFrame(state.animFrameId)
      if (state.autoScrollId) clearInterval(state.autoScrollId)
    }
    dragRef.current = null
    didDragRef.current = false
    setDraggingId(null)
    setOffsets({})
  }, [])

  const startDrag = React.useCallback((event, tabId) => {
    if (event.button !== 0) return
    if (event.target.closest('.yl-tab-close')) return
    event.preventDefault()

    const container = scrollContainerRef.current
    if (!container) return

    const tabEls = Array.from(container.querySelectorAll('[data-tab-id]'))
    const rects = {}
    tabEls.forEach((el) => {
      const id = el.getAttribute('data-tab-id')
      rects[id] = el.getBoundingClientRect()
    })

    const order = tabs.map((t) => t.id)
    const dragIndex = order.indexOf(tabId)
    if (dragIndex === -1) return

    const el = tabEls.find((e) => e.getAttribute('data-tab-id') === tabId)
    dragRef.current = {
      tabId,
      order,
      rects,
      startClientX: event.clientX,
      startScrollLeft: container.scrollLeft,
      currentIndex: dragIndex,
      animFrameId: null,
      autoScrollId: null,
      pointerId: event.pointerId,
      tabEl: el || null,
    }
    didDragRef.current = false
  }, [tabs, scrollContainerRef])

  const onPointerMove = React.useCallback((event, tabId) => {
    const state = dragRef.current
    if (!state || state.tabId !== tabId) return

    const deltaX = event.clientX - state.startClientX
    // Activate visual drag with a small threshold so dragging feels immediate.
    if (!didDragRef.current && Math.abs(deltaX) < DRAG_START_THRESHOLD_PX) return

    if (!didDragRef.current) {
      didDragRef.current = true
      event.preventDefault()
      setDraggingId(tabId)
      // Capture pointer only after drag threshold (preserves click on inactive tabs)
      const el = state.tabEl
      if (el && typeof el.setPointerCapture === 'function') {
        try { el.setPointerCapture(state.pointerId) } catch { /* ignore */ }
      }
    }

    if (state.animFrameId) cancelAnimationFrame(state.animFrameId)
    state.animFrameId = requestAnimationFrame(() => {
      const container = scrollContainerRef.current
      if (!container) return

      const scrollDelta = container.scrollLeft - state.startScrollLeft
      const totalDeltaX = deltaX + scrollDelta
      const containerRect = container.getBoundingClientRect()

      // Auto-scroll near edges
      if (state.autoScrollId) { clearInterval(state.autoScrollId); state.autoScrollId = null }
      const distFromLeft = event.clientX - containerRect.left
      const distFromRight = containerRect.right - event.clientX
      const edgeZone = 60
      const scrollSpeed = 8
      if (distFromLeft < edgeZone && container.scrollLeft > 0) {
        state.autoScrollId = setInterval(() => { container.scrollLeft -= scrollSpeed }, 16)
      } else if (distFromRight < edgeZone) {
        state.autoScrollId = setInterval(() => { container.scrollLeft += scrollSpeed }, 16)
      }

      const dragTabRect = state.rects[tabId]
      if (
        !dragTabRect
        || !Number.isFinite(dragTabRect.left)
        || !Number.isFinite(dragTabRect.width)
        || dragTabRect.width <= 0
      ) {
        cancelDrag()
        return
      }

      const dragTabOrigLeft = dragTabRect.left - containerRect.left + state.startScrollLeft
      const dragTabWidth = dragTabRect.width
      const dragTabCurrentLeft = dragTabOrigLeft + totalDeltaX
      const dragMid = dragTabCurrentLeft + dragTabWidth / 2

      const baseOrder = state.order.filter((id) => {
        const rect = state.rects[id]
        return rect && Number.isFinite(rect.left) && Number.isFinite(rect.width) && rect.width > 0
      })
      if (!baseOrder.length || !baseOrder.includes(tabId)) {
        cancelDrag()
        return
      }

      const othersWithPos = baseOrder
        .filter((id) => id !== tabId)
        .map((id) => {
          const r = state.rects[id]
          const left = r.left - containerRect.left + state.startScrollLeft
          return { id, mid: left + r.width / 2 }
        })
        .filter((entry) => Number.isFinite(entry.mid))

      let insertIndex = othersWithPos.filter((o) => o.mid < dragMid).length
      insertIndex = Math.max(0, Math.min(insertIndex, othersWithPos.length))

      const newOrder = othersWithPos.map((o) => o.id)
      newOrder.splice(insertIndex, 0, tabId)

      // Use actual measured left positions (accounts for margins/gaps)
      const slotLefts = baseOrder.map((id) => state.rects[id].left)
      const origIdxMap = new Map(baseOrder.map((id, i) => [id, i]))

      const newOffsets = {}
      newOrder.forEach((id, newIdx) => {
        if (id === tabId) {
          newOffsets[id] = Number.isFinite(totalDeltaX) ? totalDeltaX : 0
        } else {
          const originalIndex = origIdxMap.get(id)
          if (originalIndex == null) return
          const nextLeft = slotLefts[newIdx]
          const originalLeft = slotLefts[originalIndex]
          const delta = nextLeft - originalLeft
          newOffsets[id] = Number.isFinite(delta) ? delta : 0
        }
      })

      state.currentOrder = newOrder
      setOffsets(newOffsets)
    })
  }, [DRAG_START_THRESHOLD_PX, scrollContainerRef, cancelDrag])

  const endDrag = React.useCallback((tabId) => {
    const state = dragRef.current
    if (!state || state.tabId !== tabId) return

    if (state.animFrameId) cancelAnimationFrame(state.animFrameId)
    if (state.autoScrollId) clearInterval(state.autoScrollId)

    const finalOrder = state.currentOrder || state.order
    const originalOrder = state.order
    const wasDragging = didDragRef.current

    dragRef.current = null

    setDraggingId(null)
    setOffsets({})

    if (wasDragging) {
      const hasChange = finalOrder.some((id, i) => id !== originalOrder[i])
      if (hasChange) {
        onTabsReorder?.(finalOrder)
      }
    }
    // Clear didDrag after a tick so click handler sees it
    setTimeout(() => { didDragRef.current = false }, 0)
  }, [onTabsReorder])

  return {
    draggingId,
    offsets,
    didDragRef,
    startDrag,
    onPointerMove,
    endDrag,
    cancelDrag,
  }
}

export default function Header({
  onMenuClick,
  sidebarWidth = 240,
  tabs = [],
  closingTabIds = [],
  activeTabId = '',
  onTabSelect,
  onTabClose,
  onAddTab,
  onTabsReorder,
}) {
  const { t } = useI18n()
  const theme = useTheme()
  const xIcon = theme.palette.mode === 'dark' ? '/dl-icons/x-icon-dark.svg' : '/dl-icons/x-icon-light.svg'
  const genericIcon = theme.palette.mode === 'dark' ? '/dl-icons/generic-icon-dark.svg' : '/dl-icons/generic-icon-light.svg'
  const sidebarBg = theme.palette.mode === 'dark' ? '#181818' : '#f9f9f9'
  const mainBg = theme.palette.mode === 'dark' ? '#212121' : '#ffffff'

  const scrollContainerRef = React.useRef(null)
  const [showScrollButtons, setShowScrollButtons] = React.useState(false)
  const [canScrollLeft, setCanScrollLeft] = React.useState(false)
  const [canScrollRight, setCanScrollRight] = React.useState(false)
  const [enteringTabIds, setEnteringTabIds] = React.useState(() => new Set())
  const previousTabIdsRef = React.useRef(tabs.map((tab) => tab.id))
  const enterAnimationTimersRef = React.useRef(new Map())
  const closingTabIdSet = React.useMemo(() => new Set(closingTabIds), [closingTabIds])

  const { draggingId, offsets, didDragRef, startDrag, onPointerMove, endDrag, cancelDrag } =
    useTabDrag({ tabs, onTabsReorder, scrollContainerRef })

  // Cancel drag if window loses focus (edge case: alt-tab while dragging)
  React.useEffect(() => {
    const handleBlur = () => cancelDrag()
    window.addEventListener('blur', handleBlur)
    return () => window.removeEventListener('blur', handleBlur)
  }, [cancelDrag])

  const displayTabs = tabs

  const checkScroll = React.useCallback(() => {
    const element = scrollContainerRef.current
    if (!element) return
    const { scrollLeft, scrollWidth, clientWidth } = element
    const hasOverflow = scrollWidth > clientWidth + 1
    setShowScrollButtons(hasOverflow)
    setCanScrollLeft(hasOverflow && scrollLeft > 0)
    setCanScrollRight(hasOverflow && scrollLeft < scrollWidth - clientWidth - 1)
  }, [])

  React.useLayoutEffect(() => {
    checkScroll()
    const timer = setTimeout(checkScroll, 320)
    return () => clearTimeout(timer)
  }, [tabs, activeTabId, checkScroll])

  React.useEffect(() => {
    const element = scrollContainerRef.current
    if (!element || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(() => checkScroll())
    observer.observe(element)
    return () => observer.disconnect()
  }, [checkScroll])

  React.useEffect(() => {
    const timer = setTimeout(() => {
      if (!activeTabId || !scrollContainerRef.current) return
      const activeEl = Array.from(scrollContainerRef.current.querySelectorAll('[data-tab-id]'))
        .find((node) => node.getAttribute('data-tab-id') === activeTabId)
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
      }
    }, 50)
    return () => clearTimeout(timer)
  }, [activeTabId, tabs.length])

  React.useEffect(() => {
    const nextIds = tabs.map((tab) => tab.id)
    const previousIds = previousTabIdsRef.current
    const previousSet = new Set(previousIds)
    const addedIds = nextIds.filter((id) => !previousSet.has(id))

    if (addedIds.length) {
      setEnteringTabIds((prev) => {
        const next = new Set(prev)
        addedIds.forEach((id) => next.add(id))
        return next
      })

      addedIds.forEach((id) => {
        const existingTimer = enterAnimationTimersRef.current.get(id)
        if (existingTimer) clearTimeout(existingTimer)

        const timer = setTimeout(() => {
          enterAnimationTimersRef.current.delete(id)
          setEnteringTabIds((prev) => {
            if (!prev.has(id)) return prev
            const next = new Set(prev)
            next.delete(id)
            return next
          })
        }, 290)

        enterAnimationTimersRef.current.set(id, timer)
      })
    }

    setEnteringTabIds((prev) => {
      if (!prev.size) return prev
      const activeIds = new Set(nextIds)
      let changed = false
      const next = new Set()
      prev.forEach((id) => {
        if (activeIds.has(id)) {
          next.add(id)
        } else {
          changed = true
        }
      })
      return changed ? next : prev
    })

    enterAnimationTimersRef.current.forEach((timer, id) => {
      if (nextIds.includes(id)) return
      clearTimeout(timer)
      enterAnimationTimersRef.current.delete(id)
    })

    previousTabIdsRef.current = nextIds
  }, [tabs])

  React.useEffect(() => () => {
    enterAnimationTimersRef.current.forEach((timer) => clearTimeout(timer))
    enterAnimationTimersRef.current.clear()
  }, [])

  const handleWheel = React.useCallback((event) => {
    const container = scrollContainerRef.current
    if (!container || event.ctrlKey) return
    if (container.scrollWidth <= container.clientWidth + 1) return
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
    container.scrollLeft += event.deltaY
    event.preventDefault()
  }, [])

  const scroll = React.useCallback((direction) => {
    const container = scrollContainerRef.current
    if (!container) return
    const amount = Math.max(180, Math.round(container.clientWidth * 0.6))
    container.scrollBy({ left: direction === 'left' ? -amount : amount, behavior: 'smooth' })
  }, [])

  const focusTabById = React.useCallback((tabId) => {
    const container = scrollContainerRef.current
    if (!container || !tabId) return

    const tabNode = Array.from(container.querySelectorAll('[data-tab-id]'))
      .find((node) => node.getAttribute('data-tab-id') === tabId)

    if (!(tabNode instanceof HTMLElement)) return

    tabNode.focus({ preventScroll: true })
    tabNode.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
  }, [])

  const selectTabByIndex = React.useCallback((index) => {
    if (!displayTabs.length) return

    const boundedIndex = ((index % displayTabs.length) + displayTabs.length) % displayTabs.length
    const nextTabId = displayTabs[boundedIndex]?.id
    if (!nextTabId) return

    onTabSelect?.(nextTabId)
    requestAnimationFrame(() => focusTabById(nextTabId))
  }, [displayTabs, focusTabById, onTabSelect])

  const handleTabKeyDown = React.useCallback((event, tabId) => {
    if (!displayTabs.length) return

    const currentIndex = displayTabs.findIndex((tab) => tab.id === tabId)
    if (currentIndex < 0) return

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'w') {
      event.preventDefault()
      onTabClose?.(tabId)
      return
    }

    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown': {
        event.preventDefault()
        selectTabByIndex(currentIndex + 1)
        return
      }
      case 'ArrowLeft':
      case 'ArrowUp': {
        event.preventDefault()
        selectTabByIndex(currentIndex - 1)
        return
      }
      case 'Home': {
        event.preventDefault()
        selectTabByIndex(0)
        return
      }
      case 'End': {
        event.preventDefault()
        selectTabByIndex(displayTabs.length - 1)
        return
      }
      case 'Delete':
      case 'Backspace': {
        event.preventDefault()
        onTabClose?.(tabId)
        return
      }
      case 'Enter':
      case ' ': {
        event.preventDefault()
        onTabSelect?.(tabId)
        return
      }
      default:
        return
    }
  }, [displayTabs, onTabClose, onTabSelect, selectTabByIndex])

  const activeTabIndex = displayTabs.findIndex((tab) => tab.id === activeTabId)

  return (
    <AppBar
      position="fixed"
      elevation={0}
      color="transparent"
      sx={(muiTheme) => ({
        zIndex: muiTheme.zIndex.drawer + 1,
        ml: { sm: `${sidebarWidth}px` },
        width: { sm: `calc(100% - ${sidebarWidth}px)` },
        bgcolor: sidebarBg,
        borderBottom: 'none',
        borderLeft: '0 !important',
        boxShadow: 'none',
      })}
    >
      <Toolbar disableGutters variant="dense" sx={{ minHeight: '49px !important', height: 49, alignItems: 'center' }}>
        <IconButton
          color="inherit"
          aria-label={t('sidebar.navigationAria')}
          edge="start"
          onClick={onMenuClick}
          size="small"
          sx={{ ml: 1, mr: 1, display: { xs: 'inline-flex', sm: 'none' } }}
        >
          <Menu size={18} />
        </IconButton>

        <Box
          className="yl-tabbar"
          style={{
            '--yl-surface': sidebarBg,
            '--yl-card': mainBg,
            '--yl-foreground': theme.palette.text.primary,
            '--yl-muted-foreground': theme.palette.text.secondary,
            '--yl-border': theme.palette.divider,
            '--yl-accent': theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
            '--yl-destructive': theme.palette.error.main,
          }}
          sx={{ flex: 1, minWidth: 0 }}
        >
          <Box className="yl-tabbar-bottom-line" />

          <Box className="yl-tabbar-inner">
            <Box className="yl-tabstrip-wrap">
              {canScrollLeft && <Box className="yl-scroll-fade left" aria-hidden="true" />}
              {canScrollRight && <Box className="yl-scroll-fade right" aria-hidden="true" />}
              <Box
                ref={scrollContainerRef}
                className="yl-tabstrip tabs-scrollbar-hidden"
                onScroll={checkScroll}
                onWheel={handleWheel}
                role="tablist"
                aria-label={t('tabs.listAria')}
                aria-orientation="horizontal"
              >
                {displayTabs.map((tab, index) => {
                  const isActive = tab.id === activeTabId
                  const isDragging = draggingId === tab.id
                  const isClosing = closingTabIdSet.has(tab.id)
                  const isEntering = enteringTabIds.has(tab.id)
                  const iconKey = getRouteIconKey(tab.path)
                  const displayTitle = tab.displayTitle || getRouteTitle(tab.path, t)
                  const closeTooltipLabel = t('tabs.closeTooltip')
                  const progress = clampProgress(tab?.download?.progress)
                  const isDownloading = Boolean(tab?.download?.active)
                  const showDivider = !isActive
                    && index < displayTabs.length - 1
                    && activeTabIndex !== index
                    && activeTabIndex !== index + 1
                  const showTrailingDivider = !isActive && index === displayTabs.length - 1
                  const translateX = offsets[tab.id] ?? 0

                  return (
                    <Box
                      key={tab.id}
                      role="tab"
                      tabIndex={isActive && !isClosing ? 0 : -1}
                      title={displayTitle}
                      id={getTabDomId(tab.id)}
                      aria-controls={getPanelDomId(tab.id)}
                      aria-selected={isActive}
                      aria-label={t('tabs.tabAria', { title: displayTitle })}
                      data-tab-id={tab.id}
                      className={`yl-tab ${isActive ? 'is-active' : ''} ${showDivider ? 'show-divider' : ''} ${showTrailingDivider ? 'show-trailing-divider' : ''} ${isDragging ? 'is-dragging' : ''} ${isClosing ? 'is-closing' : ''} ${isEntering ? 'is-entering' : ''}`}
                      style={translateX !== 0 || isDragging ? {
                        transform: `translateX(${translateX}px)`,
                        transition: isDragging ? 'none' : 'transform 120ms ease',
                        zIndex: isDragging ? 50 : undefined,
                        willChange: 'transform',
                      } : undefined}
                      onPointerDown={(event) => {
                        if (!isClosing) startDrag(event, tab.id)
                      }}
                      onPointerMove={(event) => onPointerMove(event, tab.id)}
                      onPointerUp={() => endDrag(tab.id)}
                      onPointerCancel={() => endDrag(tab.id)}
                      onMouseDown={(event) => {
                        if (event.button !== 1 || isClosing) return
                        event.preventDefault()
                        onTabClose?.(tab.id)
                      }}
                      onKeyDown={(event) => {
                        if (!isClosing) handleTabKeyDown(event, tab.id)
                      }}
                    >
                      {isActive && <span className="yl-tab-curve-left" aria-hidden="true" />}
                      {isActive && <span className="yl-tab-curve-right" aria-hidden="true" />}

                      <Box
                        className="yl-tab-hit"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          // Suppress click if this was a real drag interaction
                          if (!didDragRef.current) {
                            onTabSelect?.(tab.id)
                          }
                          e.stopPropagation()
                        }}
                      >
                        <Box className="yl-tab-content">
                          <RouteIcon iconKey={iconKey} xIcon={xIcon} genericIcon={genericIcon} />
                          <Typography component="span" className="yl-tab-title">
                            {displayTitle}
                          </Typography>
                          {isDownloading && (
                            <Box className="yl-tab-progress" aria-label={`${progress}%`}>
                              <CircularProgress size={9} thickness={6} sx={{ color: 'currentColor' }} />
                              <Typography component="span" className="yl-tab-progress-text">{`${progress}%`}</Typography>
                            </Box>
                          )}
                        </Box>
                      </Box>

                      <span className="yl-tab-fade" aria-hidden="true" />

                      <IconButton
                        size="small"
                        className="yl-tab-close"
                        aria-label={closeTooltipLabel}
                        title={closeTooltipLabel}
                        disabled={isClosing}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(event) => {
                          event.stopPropagation()
                          onTabClose?.(tab.id)
                        }}
                      >
                        <X size={12} />
                      </IconButton>
                    </Box>
                  )
                })}

                <IconButton
                  size="small"
                  className="yl-add-btn"
                  onClick={onAddTab}
                  aria-label={t('tabs.newTabAria')}
                >
                  <Plus size={16} />
                </IconButton>
              </Box>
            </Box>

            <Box className={`yl-scroll-controls ${showScrollButtons ? 'show' : ''}`}>
              <IconButton
                size="small"
                className="yl-scroll-btn"
                onClick={() => scroll('left')}
                disabled={!canScrollLeft}
                aria-label={t('tabs.scrollLeftAria')}
              >
                <ChevronLeft size={14} />
              </IconButton>
              <IconButton
                size="small"
                className="yl-scroll-btn"
                onClick={() => scroll('right')}
                disabled={!canScrollRight}
                aria-label={t('tabs.scrollRightAria')}
              >
                <ChevronRight size={14} />
              </IconButton>
            </Box>
          </Box>
        </Box>
      </Toolbar>
    </AppBar>
  )
}
