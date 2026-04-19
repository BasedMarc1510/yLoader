import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'

const STORAGE_KEY = 'yloader-settings-advanced-mode'

function readStoredValue() {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null
    return raw === 'true'
  } catch {
    return false
  }
}

function writeStoredValue(value) {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, value ? 'true' : 'false')
    }
  } catch {
    // storage quota or permission errors are non-critical
  }
}

const AdvancedModeContext = createContext({
  advancedMode: false,
  setAdvancedMode: () => {},
  toggleAdvancedMode: () => {},
})

export function useAdvancedMode() {
  return useContext(AdvancedModeContext)
}

export default function AdvancedModeProvider({ children }) {
  const [advancedMode, setAdvancedModeState] = useState(() => readStoredValue())

  const setAdvancedMode = useCallback((value) => {
    const next = Boolean(value)
    setAdvancedModeState(next)
    writeStoredValue(next)
  }, [])

  const toggleAdvancedMode = useCallback(() => {
    setAdvancedModeState((prev) => {
      const next = !prev
      writeStoredValue(next)
      return next
    })
  }, [])

  const contextValue = useMemo(() => ({
    advancedMode,
    setAdvancedMode,
    toggleAdvancedMode,
  }), [advancedMode, setAdvancedMode, toggleAdvancedMode])

  return (
    <AdvancedModeContext.Provider value={contextValue}>
      {children}
    </AdvancedModeContext.Provider>
  )
}
