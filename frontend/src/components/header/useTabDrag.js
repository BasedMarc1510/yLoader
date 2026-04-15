import React from 'react'

export function useTabDrag({ tabs, onTabsReorder, scrollContainerRef }) {
  const DRAG_START_THRESHOLD_PX = 4
  const dragRef = React.useRef(null)
  const [draggingId, setDraggingId] = React.useState(null)
  const [offsets, setOffsets] = React.useState({})
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
    if (tabs.length <= 1) return
    event.preventDefault()

    const container = scrollContainerRef.current
    if (!container) return

    const tabEls = Array.from(container.querySelectorAll('[data-tab-id]'))
    const rects = {}
    tabEls.forEach((el) => {
      const id = el.getAttribute('data-tab-id')
      rects[id] = el.getBoundingClientRect()
    })

    const order = tabs.map((tab) => tab.id)
    const dragIndex = order.indexOf(tabId)
    if (dragIndex === -1) return

    const el = tabEls.find((node) => node.getAttribute('data-tab-id') === tabId)
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
  }, [scrollContainerRef, tabs])

  const onPointerMove = React.useCallback((event, tabId) => {
    const state = dragRef.current
    if (!state || state.tabId !== tabId) return

    const deltaX = event.clientX - state.startClientX
    if (!didDragRef.current && Math.abs(deltaX) < DRAG_START_THRESHOLD_PX) return

    if (!didDragRef.current) {
      didDragRef.current = true
      event.preventDefault()
      setDraggingId(tabId)

      const element = state.tabEl
      if (element && typeof element.setPointerCapture === 'function') {
        try {
          element.setPointerCapture(state.pointerId)
        } catch {
          // ignore
        }
      }
    }

    if (state.animFrameId) cancelAnimationFrame(state.animFrameId)
    state.animFrameId = requestAnimationFrame(() => {
      const container = scrollContainerRef.current
      if (!container) return

      const scrollDelta = container.scrollLeft - state.startScrollLeft
      const totalDeltaX = deltaX + scrollDelta
      const containerRect = container.getBoundingClientRect()

      if (state.autoScrollId) {
        clearInterval(state.autoScrollId)
        state.autoScrollId = null
      }

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
          const rect = state.rects[id]
          const left = rect.left - containerRect.left + state.startScrollLeft
          return { id, mid: left + rect.width / 2 }
        })
        .filter((entry) => Number.isFinite(entry.mid))

      let insertIndex = othersWithPos.filter((entry) => entry.mid < dragMid).length
      insertIndex = Math.max(0, Math.min(insertIndex, othersWithPos.length))

      const newOrder = othersWithPos.map((entry) => entry.id)
      newOrder.splice(insertIndex, 0, tabId)

      const slotLefts = baseOrder.map((id) => state.rects[id].left)
      const origIdxMap = new Map(baseOrder.map((id, index) => [id, index]))

      const newOffsets = {}
      newOrder.forEach((id, newIdx) => {
        if (id === tabId) {
          newOffsets[id] = Number.isFinite(totalDeltaX) ? totalDeltaX : 0
          return
        }

        const originalIndex = origIdxMap.get(id)
        if (originalIndex == null) return
        const nextLeft = slotLefts[newIdx]
        const originalLeft = slotLefts[originalIndex]
        const delta = nextLeft - originalLeft
        newOffsets[id] = Number.isFinite(delta) ? delta : 0
      })

      state.currentOrder = newOrder
      setOffsets(newOffsets)
    })
  }, [DRAG_START_THRESHOLD_PX, cancelDrag, scrollContainerRef])

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
      const hasChange = finalOrder.some((id, index) => id !== originalOrder[index])
      if (hasChange) {
        onTabsReorder?.(finalOrder)
      }
    }

    setTimeout(() => {
      didDragRef.current = false
    }, 0)
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
