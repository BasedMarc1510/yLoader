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
  isDark = true
}) {
  const [isFocused, setIsFocused] = React.useState(false)
  const hasValue = value && value.length > 0

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
        value={value}
        onChange={onChange}
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
          backgroundColor: isDark ? '#272727' : '#ffffff',
          border: `1px solid ${isDark ? '#333333' : '#dfe0e2'}`,
          borderRadius: '25px',
          outline: 'none',
          transition: 'border-color 200ms ease',
          '&:focus': {
            borderColor: isDark ? '#383838' : '#c0c2c6',
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
            backgroundColor: isFocused || hasValue ? (isDark ? '#272727' : '#ffffff') : 'transparent',
            padding: isFocused || hasValue ? '0 6px' : '0',
            marginLeft: isFocused || hasValue ? '-6px' : '0',
            transform: isFocused || hasValue ? 'translateY(-140%)' : 'translateY(0)',
            transition: 'all 200ms ease',
            display: 'inline-block',
            lineHeight: 1,
          }}
        >
          {label}
        </Box>
      </Box>
    </Box>
  )
}
