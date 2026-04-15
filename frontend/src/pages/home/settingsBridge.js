export function openSettingsModal(section = 'general') {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return
  window.dispatchEvent(new CustomEvent('yloader:open-settings', { detail: { section } }))
}
