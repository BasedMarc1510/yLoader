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
  variant = 'default',
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

  const isCompact = variant === 'compact'

  const updateMenuPosition = React.useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const viewportH = window.innerHeight || document.documentElement.clientHeight || 0
    const viewportW = window.innerWidth || document.documentElement.clientWidth || 0

    // Force exact width and position
    const width = rect.width
    const left = rect.left

    const spaceBelow = viewportH - rect.bottom - 8
    const spaceAbove = rect.top - 8
    const desiredMaxHeight = 300

    const fitsBelow = spaceBelow >= Math.min(desiredMaxHeight, 150) || spaceBelow > spaceAbove

    let top, bottom, maxHeight

    if (fitsBelow) {
      top = rect.bottom
      bottom = undefined
      maxHeight = Math.min(desiredMaxHeight, spaceBelow)
    } else {
      top = undefined
      bottom = viewportH - rect.top
      maxHeight = Math.min(desiredMaxHeight, spaceAbove)
    }

    setMenuPos({ top, bottom, left, width, maxHeight })
  }, [options.length])

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

  const triggerBg = isCompact
    ? (isOpen ? (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)') : (isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'))
    : (isDark ? '#1b1b1b' : '#ffffff')
  
  const triggerBorder = isCompact
    ? (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)')
    : (isDark ? '#333333' : '#dfe0e2')

  // Menu background for compact: Solid equivalent of the card color to blend perfectly
  const menuBg = isDark 
    ? (isCompact ? '#1a1a1a' : '#1b1b1b') 
    : (isCompact ? '#f5f7f9' : '#ffffff')

  return (
    <Box ref={dropdownRef} sx={{ position: 'relative', width: '100%' }}>
      {/* Select Button */}
      <Box
        ref={triggerRef}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        sx={{
          width: '100%',
          height: isCompact ? '38px' : '42px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: isCompact ? '0 0.75rem' : '0 1rem',
          backgroundColor: triggerBg,
          border: `1px solid ${triggerBorder}`,
          borderRadius: isCompact ? (isOpen ? (menuPos.top !== undefined ? '8px 8px 0 0' : '0 0 8px 8px') : '8px') : '12px',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          transition: 'all 0.1s ease',
          boxShadow: (isDark || isCompact) ? 'none' : '0 1px 3px rgba(0,0,0,0.03)',
          zIndex: isOpen ? 1601 : 1,
          boxSizing: 'border-box',
          '&:hover': {
            backgroundColor: isCompact 
              ? (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)')
              : (isDark ? '#222' : '#fafbfc'),
            borderColor: !disabled && (isDark ? (isCompact ? 'rgba(255,255,255,0.15)' : '#555') : (isCompact ? 'rgba(0,0,0,0.15)' : '#c0c2c6')),
          },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, minWidth: 0 }}>
          {label && (
            <Typography
              sx={{
                fontSize: isCompact ? '11px' : '13px',
                fontWeight: 700,
                color: isDark ? '#888' : '#8e8e93',
                whiteSpace: 'nowrap',
                textTransform: isCompact ? 'uppercase' : 'none',
                letterSpacing: isCompact ? '0.02em' : 'none'
              }}
            >
              {label}
            </Typography>
          )}
          {label && <Box sx={{ width: '1px', height: '14px', bgcolor: isDark ? (isCompact ? 'rgba(255,255,255,0.1)' : '#333') : (isCompact ? 'rgba(0,0,0,0.1)' : '#dfe0e2') }} />} { /* Separator */}
          <Typography
            sx={{
              fontSize: isCompact ? '13px' : '14px',
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
          size={isCompact ? 16 : 20}
          style={{
            color: isDark ? '#888888' : '#8e8e93',
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 100ms ease',
            flexShrink: 0,
          }}
        />
      </Box>

      {/* Dropdown Menu (Portal) */}
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
              backgroundColor: menuBg,
              border: `1px solid ${isDark ? (isCompact ? 'rgba(255,255,255,0.15)' : '#333333') : (isCompact ? 'rgba(0,0,0,0.1)' : '#dfe0e2')}`,
              borderRadius: isCompact ? (menuPos.top !== undefined ? '0 0 8px 8px' : '8px 8px 0 0') : '12px',
              zIndex: 1600,
              overflow: 'hidden',
              boxSizing: 'border-box',
              boxShadow: isDark
                ? '0 12px 40px rgba(0,0,0,0.6)'
                : '0 8px 32px rgba(0,0,0,0.1), 0 2px 8px rgba(0,0,0,0.04)',
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
                      padding: isCompact ? '10px 12px' : '12px 16px',
                      cursor: 'pointer',
                      backgroundColor: isSelected
                        ? (isDark ? (isCompact ? 'rgba(255,255,255,0.06)' : '#272727') : (isCompact ? 'rgba(0,0,0,0.04)' : '#f0f1f3'))
                        : 'transparent',
                      transition: 'background-color 90ms ease',
                      '&:hover': {
                        backgroundColor: isDark ? (isCompact ? 'rgba(255,255,255,0.08)' : '#272727') : (isCompact ? 'rgba(0,0,0,0.06)' : '#f0f1f3'),
                      },
                    }}
                  >
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography
                        sx={{
                          fontSize: isCompact ? '14px' : '16px',
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
                            fontSize: isCompact ? '11px' : '13px',
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
                        size={isCompact ? 16 : 20}
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
