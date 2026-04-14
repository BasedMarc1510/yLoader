import React from 'react'

function isTypingTarget(target) {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tagName = target.tagName.toLowerCase()
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select'
}

export function useGlobalTabShortcuts({
  activeTabId,
  onAddTab,
  onCloseActiveTab,
  onSelectRelativeTab,
}) {
  React.useEffect(() => {
    const handleGlobalTabShortcuts = (event) => {
      const key = String(event.key || '').toLowerCase()
      const hasPrimaryModifier = event.ctrlKey || event.metaKey
      if (!hasPrimaryModifier) return
      if (isTypingTarget(event.target)) return

      if (key === 't') {
        event.preventDefault()
        onAddTab()
        return
      }

      if (key === 'w') {
        event.preventDefault()
        if (activeTabId) onCloseActiveTab(activeTabId)
        return
      }

      if (key === 'tab') {
        event.preventDefault()
        onSelectRelativeTab(event.shiftKey ? -1 : 1)
      }
    }

    window.addEventListener('keydown', handleGlobalTabShortcuts)
    return () => window.removeEventListener('keydown', handleGlobalTabShortcuts)
  }, [activeTabId, onAddTab, onCloseActiveTab, onSelectRelativeTab])
}
