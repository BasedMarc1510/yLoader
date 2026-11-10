window.addEventListener('contextmenu', (event) => {
  const target = event.composedPath()[0]
  if (
    (target instanceof HTMLElement && target.isContentEditable) ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLInputElement && ['text', 'search', 'url', 'email', 'tel', 'password', 'number'].includes(target.type))
  ) return

  const selection = window.getSelection()
  if (selection?.rangeCount && !selection.isCollapsed) {
    const clickedSelection = Array.from(selection.getRangeAt(0).getClientRects()).some((rect) => (
      event.clientX >= rect.left && event.clientX <= rect.right &&
      event.clientY >= rect.top && event.clientY <= rect.bottom
    ))
    if (clickedSelection) return
  }

  // Suppress the WebView's page menu while still delivering the event to app controls.
  event.preventDefault()
}, { capture: true })
