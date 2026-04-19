import React from 'react'
import { createPortal } from 'react-dom'
import { Box, Typography } from '@mui/material'
import { Check, ChevronDown } from 'lucide-react'
import { useI18n } from '../../providers/I18nProvider'
import SimpleBarScrollArea from '../SimpleBarScrollArea'

/**
 * Custom Select Dropdown Component
 * Full-width design that matches the app's aesthetic
 */
export default function CustomSelect({
  value,
  onChange,
  options = [],
  label = '',
  isDark = true,
  disabled = false
}) {
  const { t } = useI18n()
  const [isOpen, setIsOpen] = React.useState(false)
  const dropdownRef = React.useRef(null) // wrapper incl. trigger
  const triggerRef = React.useRef(null)
  const menuRef = React.useRef(null)
  const [menuPos, setMenuPos] = React.useState({ top: undefined, bottom: undefined, left: 0, width: 0, maxHeight: 300 })

  const updateMenuPosition = React.useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const viewportH = window.innerHeight || document.documentElement.clientHeight || 0
    const viewportW = window.innerWidth || document.documentElement.clientWidth || 0

    // Width (clamped)
    const width = Math.min(rect.width, Math.max(160, viewportW - 16))
    // Left (clamped)
    const left = Math.min(Math.max(8, rect.left), viewportW - width - 8)

    // Vertical logic
    const spaceBelow = viewportH - rect.bottom - 8
    const spaceAbove = rect.top - 8
    const desiredMaxHeight = 300

    // Prefer below if enough space (checked against a reasonable minimum menu height of ~150px)
    // or if there's significantly more space below than above
    const fitsBelow = spaceBelow >= Math.min(desiredMaxHeight, 150) || spaceBelow > spaceAbove

    let top, bottom, maxHeight

    if (fitsBelow) {
      top = rect.bottom + 4
      bottom = undefined
      maxHeight = Math.min(desiredMaxHeight, spaceBelow)
    } else {
      // Place above
      top = undefined
      // Distance from bottom of viewport to top of trigger minus gap
      bottom = viewportH - rect.top + 4
      maxHeight = Math.min(desiredMaxHeight, spaceAbove)
    }

    setMenuPos({ top, bottom, left, width, maxHeight })
  }, [options.length])

  // Close dropdown when clicking outside (both trigger and portal menu)
  React.useEffect(() => {
    const handleClickOutside = (event) => {
      const t = event.target
      const inTrigger = dropdownRef.current && dropdownRef.current.contains(t)
      const inMenu = menuRef.current && menuRef.current.contains(t)
      if (!inTrigger && !inMenu) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Reposition on open, scroll and resize
  React.useEffect(() => {
    if (!isOpen) return
    updateMenuPosition()
    const onScroll = () => updateMenuPosition()
    const onResize = () => updateMenuPosition()
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
  }, [isOpen, updateMenuPosition])

  const selectedOption = options.find(opt => opt.value === value)

  return (
    <Box ref={dropdownRef} sx={{ position: 'relative', width: '100%' }}>
      {/* Select Button */}
      <Box
        ref={triggerRef}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        sx={{
          width: '100%',
          height: '42px', // Slightly more compact
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 1rem',
          backgroundColor: isDark ? '#1b1b1b' : '#ffffff',
          border: `1px solid ${isDark ? '#333333' : '#dfe0e2'}`,
          borderRadius: '12px',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          transition: 'background-color 0.1s ease, border-color 0.1s ease',
          boxShadow: isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.03)',
          '&:hover': {
            backgroundColor: isDark ? '#222' : '#fafbfc',
            borderColor: !disabled && (isDark ? '#555' : '#c0c2c6'),
          },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, minWidth: 0 }}>
          {label && (
            <Typography
              sx={{
                fontSize: '13px',
                fontWeight: 600,
                color: isDark ? '#888' : '#8e8e93',
                whiteSpace: 'nowrap',
              }}
            >
              {label}
            </Typography>
          )}
          {label && <Box sx={{ width: '1px', height: '14px', bgcolor: isDark ? '#333' : '#dfe0e2' }} />} { /* Separator */}
          <Typography
            sx={{
              fontSize: '14px',
              fontWeight: 600,
              color: isDark ? '#ffffff' : '#1a1a1a',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {selectedOption?.label || t('downloader.selectPlaceholder')}
          </Typography>
        </Box>
        <ChevronDown
          size={20}
          style={{
            color: isDark ? '#888888' : '#8e8e93',
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 100ms ease',
            flexShrink: 0,
          }}
        />
      </Box>

      {/* Dropdown Menu (Portal to escape overflow clipping) */}
      {isOpen && createPortal(
        (
          <Box
            ref={menuRef}
            sx={{
              position: 'fixed',
              top: menuPos.top !== undefined ? `${menuPos.top}px` : 'auto',
              bottom: menuPos.bottom !== undefined ? `${menuPos.bottom}px` : 'auto',
              left: `${menuPos.left}px`,
              width: `${menuPos.width}px`,
              backgroundColor: isDark ? '#1b1b1b' : '#ffffff',
              border: `1px solid ${isDark ? '#333333' : '#dfe0e2'}`,
              borderRadius: '12px',
              zIndex: 1600,
              overflow: 'hidden',
              boxShadow: isDark
                ? '0 10px 40px -10px rgba(0,0,0,0.6)'
                : '0 8px 32px -8px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.04)',
            }}
          >
            <SimpleBarScrollArea
              fillContainer={false}
              hideHorizontal
              sx={{ maxHeight: `${menuPos.maxHeight}px` }}
            >
              {options.map((option) => {
                const isSelected = option.value === value
                return (
                  <Box
                    key={option.value}
                    onClick={() => {
                      onChange(option.value)
                      setIsOpen(false)
                    }}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 16px',
                      cursor: 'pointer',
                      backgroundColor: isSelected
                        ? (isDark ? '#272727' : '#f0f1f3')
                        : 'transparent',
                      transition: 'background-color 90ms ease',
                      '&:hover': {
                        backgroundColor: isDark ? '#272727' : '#f0f1f3',
                      },
                      '&:first-of-type': {
                        borderRadius: '14px 14px 0 0',
                      },
                      '&:last-of-type': {
                        borderRadius: '0 0 14px 14px',
                      },
                      '&:only-of-type': {
                        borderRadius: '14px',
                      },
                    }}
                  >
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography
                        sx={{
                          fontSize: '16px',
                          fontWeight: isSelected ? 700 : 600,
                          color: isDark ? '#ffffff' : '#1a1a1a',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {option.label}
                      </Typography>
                      {option.description && (
                        <Typography
                          sx={{
                            fontSize: '13px',
                            color: isDark ? '#888888' : '#8e8e93',
                            mt: 0.25,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {option.description}
                        </Typography>
                      )}
                    </Box>
                    {isSelected && (
                      <Check
                        size={20}
                        style={{
                          color: isDark ? '#ffffff' : '#1a1a1a',
                          marginLeft: '8px',
                          flexShrink: 0,
                        }}
                      />
                    )}
                  </Box>
                )
              })}
            </SimpleBarScrollArea>
          </Box>
        ),
        document.body
      )}
    </Box>
  )
}
