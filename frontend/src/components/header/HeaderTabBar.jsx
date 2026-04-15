import React from 'react'
import {
  Box,
  CircularProgress,
  IconButton,
  Typography,
} from '@mui/material'
import {
  Plus,
  X,
} from 'lucide-react'
import { getRouteIconKey, getRouteTitle } from '../../utils/tabRoutes'
import { useTabDrag } from './useTabDrag'
import RouteIcon from './RouteIcon'
import WindowControls from './WindowControls'
import TabScrollControls from './TabScrollControls'
import TabContextMenu from './TabContextMenu'
import { clampProgress, getTabDomId, getPanelDomId } from './tabBarUtils'
export default function HeaderTabBar({
  t,
  theme,
  sidebarBg,
  mainBg,
  tabs,
  closingTabIds = [],
  activeTabId = '',
  onTabSelect,
  onTabClose,
  onAddTab,
  onTabsReorder,
  onCloneTab,
  onCloseOtherTabs,
  onCloseTabsToLeft,
  onCloseTabsToRight,
}) {
  const TAB_MAX_WIDTH = 236
  const TAB_MIN_WIDTH = 40
  const TAB_SIZE_SMALL = 120
  const TAB_SIZE_SMALLER = 80
  const TAB_SIZE_MINI = 48

  const runtime = typeof window !== 'undefined' ? window.yloaderRuntime : null
  const isElectron = Boolean(runtime?.isElectron && runtime?.windowControls)
  const isMacElectron = Boolean(runtime?.platform === 'darwin')
  const showCustomWindowControls = isElectron && !isMacElectron
  const [isWindowMaximized, setIsWindowMaximized] = React.useState(false)
  const scrollContainerRef = React.useRef(null)
  const [showScrollButtons, setShowScrollButtons] = React.useState(false)
  const [canScrollLeft, setCanScrollLeft] = React.useState(false)
  const [canScrollRight, setCanScrollRight] = React.useState(false)
  const [tabWidth, setTabWidth] = React.useState(TAB_MAX_WIDTH)
  const [enteringTabIds, setEnteringTabIds] = React.useState(() => new Set())
  const previousTabIdsRef = React.useRef(tabs.map((tab) => tab.id))
  const enterAnimationTimersRef = React.useRef(new Map())
  const closingTabIdSet = React.useMemo(() => new Set(closingTabIds), [closingTabIds])
  const tabOrderSignature = React.useMemo(() => tabs.map((tab) => tab.id).join('|'), [tabs])
  const tabbarClassName = [
    'yl-tabbar',
    isElectron ? 'is-electron' : '',
    isMacElectron ? 'is-mac-electron' : '',
    showCustomWindowControls ? 'has-electron-controls' : '',
  ].filter(Boolean).join(' ')

  const computeTabWidth = React.useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) return TAB_MAX_WIDTH
    const count = tabs.length
    if (count <= 0) return TAB_MAX_WIDTH
    // Reserve space for the + button (~32px) + its margins (~7px) + strip padding (~16px) + buffer (~4px)
    const FIXED_END_WIDTH = 59
    const available = container.clientWidth - FIXED_END_WIDTH
    if (available <= 0) return TAB_MIN_WIDTH
    const raw = Math.floor(available / count)
    return Math.max(TAB_MIN_WIDTH, Math.min(TAB_MAX_WIDTH, raw))
  }, [TAB_MAX_WIDTH, TAB_MIN_WIDTH, tabs.length])

  React.useLayoutEffect(() => {
    setTabWidth(computeTabWidth())
  }, [computeTabWidth])

  const {
    draggingId,
    offsets,
    didDragRef,
    startDrag,
    onPointerMove,
    endDrag,
    cancelDrag,
  } = useTabDrag({ tabs, onTabsReorder, scrollContainerRef })
  const draggingOffset = draggingId ? (offsets[draggingId] ?? 0) : 0
  const showDragAddProxy = Boolean(draggingId && draggingOffset > 0)

  // eslint-disable-next-line no-nested-ternary
  const tabSizeClass = tabWidth < TAB_SIZE_MINI
    ? 'is-mini'
    : tabWidth < TAB_SIZE_SMALLER
      ? 'is-smaller'
      : tabWidth < TAB_SIZE_SMALL
        ? 'is-small'
        : ''

  const handleTabstripDoubleClick = React.useCallback((event) => {
    if (event.target === scrollContainerRef.current) onAddTab?.()
  }, [onAddTab])

  const [contextMenu, setContextMenu] = React.useState(null)

  const handleTabContextMenu = React.useCallback((event, tabId) => {
    event.preventDefault()
    setContextMenu({ tabId, top: event.clientY, left: event.clientX })
  }, [])

  const handleContextMenuClose = React.useCallback(() => {
    setContextMenu(null)
  }, [])

  React.useEffect(() => {
    const handleBlur = () => cancelDrag()
    window.addEventListener('blur', handleBlur)
    return () => window.removeEventListener('blur', handleBlur)
  }, [cancelDrag])

  React.useEffect(() => {
    if (!showCustomWindowControls) return undefined
    let isMounted = true
    const controls = window.yloaderRuntime?.windowControls
    if (!controls) return undefined
    Promise.resolve(controls.getState?.())
      .then((state) => {
        if (!isMounted) return
        setIsWindowMaximized(Boolean(state?.isMaximized))
      })
      .catch(() => {
        // ignore transient state read errors
      })
    const unsubscribe = controls.onStateChange?.((state) => {
      if (!isMounted) return
      setIsWindowMaximized(Boolean(state?.isMaximized))
    })

    return () => {
      isMounted = false
      if (typeof unsubscribe === 'function') unsubscribe()
    }
  }, [showCustomWindowControls])

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
  }, [tabOrderSignature, activeTabId, checkScroll])

  React.useEffect(() => {
    const element = scrollContainerRef.current
    if (!element || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(() => {
      checkScroll()
      setTabWidth(computeTabWidth())
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [checkScroll, computeTabWidth])

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
    const nextIds = tabOrderSignature ? tabOrderSignature.split('|').filter(Boolean) : []
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
        }, 250)

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
  }, [tabOrderSignature])

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
    if (!tabs.length) return

    const boundedIndex = ((index % tabs.length) + tabs.length) % tabs.length
    const nextTabId = tabs[boundedIndex]?.id
    if (!nextTabId) return

    onTabSelect?.(nextTabId)
    requestAnimationFrame(() => focusTabById(nextTabId))
  }, [focusTabById, onTabSelect, tabs])

  const handleTabKeyDown = React.useCallback((event, tabId) => {
    if (!tabs.length) return

    const currentIndex = tabs.findIndex((tab) => tab.id === tabId)
    if (currentIndex < 0) return

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'w') {
      event.preventDefault()
      onTabClose?.(tabId)
      return
    }

    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault()
        selectTabByIndex(currentIndex + 1)
        return
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault()
        selectTabByIndex(currentIndex - 1)
        return
      case 'Home':
        event.preventDefault()
        selectTabByIndex(0)
        return
      case 'End':
        event.preventDefault()
        selectTabByIndex(tabs.length - 1)
        return
      case 'Delete':
      case 'Backspace':
        event.preventDefault()
        onTabClose?.(tabId)
        return
      case 'Enter':
      case ' ':
        event.preventDefault()
        onTabSelect?.(tabId)
        return
      default:
        return
    }
  }, [onTabClose, onTabSelect, selectTabByIndex, tabs])

  const handleWindowMinimize = React.useCallback(() => {
    if (!isElectron) return
    window.yloaderRuntime?.windowControls?.minimize?.()
  }, [isElectron])

  const handleWindowToggleMaximize = React.useCallback(() => {
    if (!isElectron) return
    window.yloaderRuntime?.windowControls?.toggleMaximize?.()
  }, [isElectron])

  const handleWindowClose = React.useCallback(() => {
    if (!isElectron) return
    window.yloaderRuntime?.windowControls?.close?.()
  }, [isElectron])

  return (
    <Box
      className={tabbarClassName}
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
      {isElectron && <Box className="yl-tabbar-drag-strip" aria-hidden="true" />}
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
            onDoubleClick={handleTabstripDoubleClick}
            role="tablist"
            aria-label={t('tabs.listAria')}
            aria-orientation="horizontal"
          >
            {tabs.map((tab, index) => {
              const isActive = tab.id === activeTabId
              const isDragging = draggingId === tab.id
              const isClosing = closingTabIdSet.has(tab.id)
              const isEntering = enteringTabIds.has(tab.id)
              const iconKey = getRouteIconKey(tab.path, tab.search)
              const displayTitle = tab.displayTitle || getRouteTitle(tab.path, t, tab.search)
              const closeTooltipLabel = t('tabs.closeTooltip')
              const progress = clampProgress(tab?.download?.progress)
              const isDownloading = Boolean(tab?.download?.active)
              const isTabBusy = Boolean(tab?.loading || isDownloading)
              const progressPrefix = isDownloading ? `${progress}% - ` : ''
              const tabTitle = `${progressPrefix}${displayTitle}`
              const nextTab = tabs[index + 1] || null
              const showDivider = !isActive
                && !isClosing
                && Boolean(nextTab)
                && nextTab.id !== activeTabId
                && !closingTabIdSet.has(nextTab.id)
              const translateX = offsets[tab.id] ?? 0

              return (
                <Box
                  key={tab.id}
                  role="tab"
                  tabIndex={isActive && !isClosing ? 0 : -1}
                  title={tabTitle}
                  id={getTabDomId(tab.id)}
                  aria-controls={getPanelDomId(tab.id)}
                  aria-selected={isActive}
                  aria-label={t('tabs.tabAria', { title: tabTitle })}
                  data-tab-id={tab.id}
                  className={`yl-tab ${isActive ? 'is-active' : ''} ${tabSizeClass} ${showDivider ? 'show-divider' : ''} ${isDragging ? 'is-dragging' : ''} ${isClosing ? 'is-closing' : ''} ${isEntering ? 'is-entering' : ''}`}
                  style={{
                    '--yl-tab-width': `${tabWidth}px`,
                    ...(translateX !== 0 || isDragging ? {
                      transform: `translateX(${translateX}px)`,
                      transition: isDragging ? 'none' : 'transform 120ms ease',
                      zIndex: isDragging ? 50 : undefined,
                      willChange: 'transform',
                    } : {}),
                  }}
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
                  onContextMenu={(event) => {
                    if (!isClosing) handleTabContextMenu(event, tab.id)
                  }}
                  onKeyDown={(event) => {
                    if (!isClosing) handleTabKeyDown(event, tab.id)
                  }}
                >
                  {isActive && <span className="yl-tab-curve-left" aria-hidden="true" />}
                  {isActive && <span className="yl-tab-curve-right" aria-hidden="true" />}

                  <Box
                    className="yl-tab-hit"
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      if (!didDragRef.current) {
                        onTabSelect?.(tab.id)
                      }
                      event.stopPropagation()
                    }}
                  >
                    <Box className="yl-tab-content">
                      {isTabBusy
                        ? (
                          <CircularProgress
                            size={13}
                            thickness={5}
                            aria-hidden="true"
                            sx={{ color: 'inherit', flexShrink: 0, display: 'block' }}
                          />
                        )
                        : <RouteIcon iconKey={iconKey} />}
                      <Typography component="span" className="yl-tab-title">
                        {tabTitle}
                      </Typography>
                    </Box>
                  </Box>

                  <span className="yl-tab-fade" aria-hidden="true" />

                  <IconButton
                    size="small"
                    className="yl-tab-close"
                    aria-label={closeTooltipLabel}
                    title={closeTooltipLabel}
                    disabled={isClosing}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation()
                      onTabClose?.(tab.id)
                    }}
                  >
                    <X size={11} />
                  </IconButton>

                  {isDragging && showDragAddProxy && (
                    <IconButton
                      size="small"
                      className="yl-add-btn yl-add-btn-drag-proxy"
                      aria-label={t('tabs.newTabAria')}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation()
                        onAddTab?.()
                      }}
                    >
                      <Plus size={16} />
                    </IconButton>
                  )}
                </Box>
              )
            })}

            <IconButton
              size="small"
              className={`yl-add-btn ${showDragAddProxy ? 'is-hidden-while-drag' : ''}`}
              onClick={onAddTab}
              aria-label={t('tabs.newTabAria')}
            >
              <Plus size={16} />
            </IconButton>

            {isElectron && <Box className="yl-tab-free-drag" aria-hidden="true" />}
          </Box>
        </Box>

        <TabScrollControls
          show={showScrollButtons}
          canScrollLeft={canScrollLeft}
          canScrollRight={canScrollRight}
          onScroll={scroll}
          t={t}
        />
      </Box>

      <WindowControls
        show={showCustomWindowControls}
        isWindowMaximized={isWindowMaximized}
        onMinimize={handleWindowMinimize}
        onToggleMaximize={handleWindowToggleMaximize}
        onClose={handleWindowClose}
        t={t}
      />

      <TabContextMenu
        anchorPosition={contextMenu ? { top: contextMenu.top, left: contextMenu.left } : null}
        tabId={contextMenu?.tabId ?? null}
        tabs={tabs}
        onClose={handleContextMenuClose}
        onCloseTab={onTabClose ?? (() => {})}
        onCloneTab={onCloneTab ?? (() => {})}
        onCloseOtherTabs={onCloseOtherTabs ?? (() => {})}
        onCloseTabsToLeft={onCloseTabsToLeft ?? (() => {})}
        onCloseTabsToRight={onCloseTabsToRight ?? (() => {})}
        t={t}
      />
    </Box>
  )
}
