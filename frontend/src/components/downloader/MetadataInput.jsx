import React from 'react'
import { Box } from '@mui/material'

/**
 * Custom styled input component with floating label
 * Matches the design from the original HTML/CSS example
 */
export default function MetadataInput({
  id,
  label,
  value,
  onChange,
  placeholder = '',
  maxLength = 120,
  disabled = false,
  type = 'text',
  isDark = true,
  variant = 'default'
}) {
  const [isFocused, setIsFocused] = React.useState(false)
  const [localValue, setLocalValue] = React.useState(value || '')
  const timeoutRef = React.useRef(null)
  
  const isCompact = variant === 'compact'

  React.useEffect(() => {
    setLocalValue(value || '')
  }, [value])

  const handleChange = React.useCallback((e) => {
    const val = e.target.value
    setLocalValue(val)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      onChange({ target: { value: val } })
    }, 300)
  }, [onChange])

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  const hasValue = localValue && localValue.length > 0

  const inputBgColor = isCompact 
    ? (isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)')
    : (isDark ? '#272727' : '#ffffff')
    
  const focusedBgColor = isCompact
    ? (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)')
    : (isDark ? '#272727' : '#ffffff')
    
  const inputBorderColor = isCompact
    ? (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)')
    : (isDark ? '#333333' : '#dfe0e2')
    
  const focusedBorderColor = isCompact
    ? (isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)')
    : (isDark ? '#383838' : '#c0c2c6')

  return (
    <Box
      sx={{
        position: 'relative',
        width: '100%',
        height: '45px',
        mb: 1.5,
      }}
    >
      {/* Input field */}
      <Box
        component="input"
        id={id}
        type={type}
        value={localValue}
        onChange={handleChange}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        // onClick handler removed to prevent auto-selection
        placeholder={placeholder}
        maxLength={maxLength}
        disabled={disabled}
        autoComplete="off"
        spellCheck="false"
        sx={{
          width: '100%',
          height: '100%',
          padding: '0 1.2rem',
          fontSize: '16px',
          fontFamily: 'inherit',
          color: isDark ? '#ffffff' : '#1a1a1a',
          backgroundColor: inputBgColor,
          border: `1px solid ${inputBorderColor}`,
          borderRadius: '25px',
          outline: 'none',
          transition: 'border-color 200ms ease, background-color 200ms ease',
          '&:focus': {
            borderColor: focusedBorderColor,
            backgroundColor: focusedBgColor,
          },
          '&::placeholder': {
            color: isDark ? '#666666' : '#b0b0b4',
            opacity: isFocused || hasValue ? 0 : 1,
          },
          '&:disabled': {
            opacity: 0.5,
            cursor: 'not-allowed',
          },
        }}
      />

      {/* Floating label */}
      <Box
        component="label"
        htmlFor={id}
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          padding: '0 1.2rem',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          pointerEvents: 'none',
          transition: 'all 200ms ease',
        }}
      >
        <Box
          component="span"
          sx={{
            fontSize: isFocused || hasValue ? '16px' : '16px',
            fontWeight: 'bold',
            color: isFocused ? (isDark ? '#cacaca' : '#5e5e63') : (isDark ? '#888888' : '#8e8e93'),
            backgroundColor: isFocused || hasValue ? focusedBgColor : 'transparent',
            padding: isFocused || hasValue ? '0 6px' : '0',
            marginLeft: isFocused || hasValue ? '-6px' : '0',
            transform: isFocused || hasValue ? 'translateY(-140%)' : 'translateY(0)',
            transition: 'all 200ms ease',
            display: 'inline-block',
            lineHeight: 1,
            borderRadius: '4px',
          }}
        >
          {label}
        </Box>
      </Box>
    </Box>
  )
}
