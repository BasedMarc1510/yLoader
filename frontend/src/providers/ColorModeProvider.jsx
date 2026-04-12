import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material'

// Keys for localStorage
const STORAGE_KEY = 'theme-mode' // values: 'light' | 'dark'

export const ColorModeContext = createContext({
  mode: 'dark', // actual effective mode used by the theme
  preference: null, // 'light' | 'dark' | null (null = follow system)
  setPreference: () => { },
  toggleMode: () => { },
})

function getSystemPrefersDark() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  } catch (_) {
    return undefined
  }
}

function getInitialPreference() {
  // 1) If user stored a preference, use it
  const stored = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null
  if (stored === 'light' || stored === 'dark') return stored

  // 2) Otherwise follow system if available, else fallback dark
  const systemDark = getSystemPrefersDark()
  if (systemDark === undefined) {
    return null // null means system; but since we can't detect, we'll default effective to dark below
  }
  return null // null = follow system
}

export default function ColorModeProvider({ children }) {
  const [preference, setPreference] = useState(() => getInitialPreference()) // 'light' | 'dark' | null
  const systemDarkRef = useRef(getSystemPrefersDark())

  // Listen to system changes only when following system (preference === null)
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e) => {
      systemDarkRef.current = e.matches
      // Trigger rerender if following system
      if (preference === null) {
        setPreference(null)
      }
    }
    if (media.addEventListener) media.addEventListener('change', handler)
    else if (media.addListener) media.addListener(handler)

    return () => {
      if (media.removeEventListener) media.removeEventListener('change', handler)
      else if (media.removeListener) media.removeListener(handler)
    }
  }, [preference])

  // Persist explicit preference changes
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (preference === 'light' || preference === 'dark') {
      window.localStorage.setItem(STORAGE_KEY, preference)
    } else {
      window.localStorage.removeItem(STORAGE_KEY)
    }
  }, [preference])

  const effectiveMode = useMemo(() => {
    if (preference === 'light' || preference === 'dark') return preference
    const sys = systemDarkRef.current
    if (sys === undefined) return 'dark' // fallback if we cannot detect system
    return sys ? 'dark' : 'light'
  }, [preference])

  const theme = useMemo(() => createTheme({
    palette: {
      mode: effectiveMode,
      primary: {
        main: '#df2f2f', // Dein Rot bleibt erhalten
      },
      background: {
        // Etwas weichere Hintergrundfarben für einen modernen Look (nicht extrem grell/tiefschwarz)
        default: effectiveMode === 'dark' ? '#121212' : '#f8f9fa',
        paper: effectiveMode === 'dark' ? '#1e1e1e' : '#ffffff',
      }
    },
    shape: { 
      // Reduziert von 10 auf 6 für eine dezentere, modernere Rundung
      borderRadius: 6 
    },
    typography: {
      // Eine moderne Standard-Font-Kombination (Inter ist aktuell der Goldstandard für schlichtes UI)
      fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
      button: {
        textTransform: 'none', // Schaltet die standardmäßigen GROSSBUCHSTABEN in MUI aus
        fontWeight: 500,
      },
    },
    components: {
      MuiButton: {
        defaultProps: {
          disableElevation: true, // Entfernt Schatten (Flat-Design ist moderner)
        },
        styleOverrides: {
          root: {
            // Blockiert explizit alle Transform-Effekte bei Hover oder Klick
            '&:hover': {
              transform: 'none',
            },
            '&:active': {
              transform: 'none',
            }
          },
        },
      },
      MuiPaper: {
        defaultProps: {
          elevation: 0, // Keine tiefen Schatten
        },
        styleOverrides: {
          root: {
            backgroundImage: 'none', // Verhindert das Aufhellen von Paper in MUI Dark-Mode
            border: effectiveMode === 'dark' ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid rgba(0, 0, 0, 0.12)',
          }
        }
      },
      MuiTooltip: {
        defaultProps: {
          // Prevent first tap from opening tooltip and swallowing the intended click on touch devices.
          disableTouchListener: true,
          disableInteractive: true,
        },
      },
      MuiButtonBase: {
        styleOverrides: {
          root: {
            touchAction: 'manipulation',
            WebkitTapHighlightColor: 'transparent',
          },
        },
      },
    },
  }), [effectiveMode])

  const toggleMode = useCallback(() => {
    setPreference((prev) => {
      const next = (prev === 'dark' || (prev === null && systemDarkRef.current)) ? 'light' : 'dark'
      return next
    })
  }, [])

  const contextValue = useMemo(() => ({
    mode: effectiveMode,
    preference,
    setPreference,
    toggleMode,
  }), [effectiveMode, preference, toggleMode])

  return (
    <ColorModeContext.Provider value={contextValue}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ColorModeContext.Provider>
  )
}