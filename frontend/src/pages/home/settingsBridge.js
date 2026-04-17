export function openSettingsModal(section = 'general', target = '') {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return
  window.dispatchEvent(new CustomEvent('yloader:open-settings', {
    detail: {
      section,
      target,
      requestId: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    },
  }))
}
