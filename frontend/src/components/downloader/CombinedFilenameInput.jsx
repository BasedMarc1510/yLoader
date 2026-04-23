import React from 'react'
import { Box, CircularProgress, IconButton, MenuItem, Select } from '@mui/material'
import { FolderOpen } from 'lucide-react'
import { useI18n } from '../../providers/I18nProvider'

export default function CombinedFilenameInput({
    value,
    onChange,
    extension,
    onExtensionChange,
    extensions = [],
    placeholder,
    isDark = true,
    disabled = false,
    showPathPicker = false,
    onPickPath,
    pickPathDisabled = false,
    pickPathLoading = false,
    pickPathAriaLabel = '',
}) {
    const { t } = useI18n()
    const resolvedPlaceholder = placeholder || t('downloader.filename')
    const resolvedPickPathAriaLabel = pickPathAriaLabel || t('downloader.browseFilePath')
    const inputRef = React.useRef(null)
    const [showLeftFade, setShowLeftFade] = React.useState(false)
    const [showRightFade, setShowRightFade] = React.useState(false)
    const [localValue, setLocalValue] = React.useState(value || '')
    const timeoutRef = React.useRef(null)

    React.useEffect(() => {
        setLocalValue(value || '')
    }, [value])

    const handleChange = React.useCallback((event) => {
        const val = event.target.value
        setLocalValue(val)
        if (timeoutRef.current) clearTimeout(timeoutRef.current)
        timeoutRef.current = setTimeout(() => {
            onChange(val)
        }, 300)
        
        if (typeof window !== 'undefined') {
            window.requestAnimationFrame(updateFadeState)
        }
    }, [onChange, updateFadeState])

    React.useEffect(() => {
        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current)
        }
    }, [])

    const handlePickPath = React.useCallback(() => {
        if (typeof onPickPath === 'function') {
            onPickPath()
        }
    }, [onPickPath])

    const inputBgColor = isDark ? '#1b1b1b' : '#ffffff'
    const leftFadeGradient = isDark
        ? 'linear-gradient(to right, #1b1b1b 36%, rgba(27,27,27,0))'
        : 'linear-gradient(to right, #ffffff 36%, rgba(255,255,255,0))'
    const rightFadeGradient = isDark
        ? 'linear-gradient(to left, #1b1b1b 36%, rgba(27,27,27,0))'
        : 'linear-gradient(to left, #ffffff 36%, rgba(255,255,255,0))'

    const updateFadeState = React.useCallback(() => {
        const node = inputRef.current
        if (!node) return

        const maxScroll = Math.max(0, node.scrollWidth - node.clientWidth)
        if (maxScroll <= 1) {
            setShowLeftFade(false)
            setShowRightFade(false)
            return
        }

        const scrollLeft = Math.max(0, node.scrollLeft)
        const epsilon = 1
        setShowLeftFade(scrollLeft > epsilon)
        setShowRightFade(scrollLeft < (maxScroll - epsilon))
    }, [])

    React.useEffect(() => {
        if (typeof window === 'undefined') return undefined
        const rafId = window.requestAnimationFrame(updateFadeState)
        return () => window.cancelAnimationFrame(rafId)
    }, [value, updateFadeState])

    React.useEffect(() => {
        if (typeof window === 'undefined') return undefined

        const handleResize = () => updateFadeState()
        window.addEventListener('resize', handleResize)

        return () => {
            window.removeEventListener('resize', handleResize)
        }
    }, [updateFadeState])

    React.useEffect(() => {
        if (typeof ResizeObserver === 'undefined' || !inputRef.current) return undefined

        const observer = new ResizeObserver(() => updateFadeState())
        observer.observe(inputRef.current)

        return () => {
            observer.disconnect()
        }
    }, [updateFadeState])

    return (
        <Box
            sx={{
                display: 'flex',
                alignItems: 'center',
                width: '100%',
                bgcolor: isDark ? '#1b1b1b' : '#ffffff',
                border: `1px solid ${isDark ? '#333333' : '#dfe0e2'}`,
                borderRadius: '16px',
                transition: 'border-color 0.1s ease',
                '&:focus-within': {
                    borderColor: isDark ? '#555555' : '#c0c2c6',
                },
                overflow: 'hidden',
                height: '45px',
            }}
        >
            <Box
                sx={{
                    position: 'relative',
                    flex: 1,
                    minWidth: 0,
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    bgcolor: inputBgColor,
                }}
            >
                <Box
                    component="input"
                    ref={inputRef}
                    value={localValue}
                    onChange={handleChange}
                    onScroll={updateFadeState}
                    onKeyUp={updateFadeState}
                    onClick={updateFadeState}
                    placeholder={resolvedPlaceholder}
                    disabled={disabled}
                    sx={{
                        flex: 1,
                        height: '100%',
                        border: 'none',
                        outline: 'none',
                        bgcolor: 'transparent',
                        color: isDark ? '#ffffff' : '#1a1a1a',
                        fontSize: '15px',
                        fontWeight: 600,
                        px: 2,
                        minWidth: 0,
                        overflowX: 'auto',
                        '&::placeholder': {
                            color: isDark ? '#555555' : '#999999',
                        },
                    }}
                />

                {showLeftFade && (
                    <Box
                        sx={{
                            position: 'absolute',
                            left: 0,
                            top: 0,
                            bottom: 0,
                            width: '20px',
                            background: leftFadeGradient,
                            pointerEvents: 'none',
                        }}
                    />
                )}

                {showRightFade && (
                    <Box
                        sx={{
                            position: 'absolute',
                            right: 0,
                            top: 0,
                            bottom: 0,
                            width: '20px',
                            background: rightFadeGradient,
                            pointerEvents: 'none',
                        }}
                    />
                )}
            </Box>

            {showPathPicker && (
                <>
                    <Box sx={{ width: '1px', height: '60%', bgcolor: isDark ? '#333333' : '#dfe0e2' }} />

                    <IconButton
                        onClick={handlePickPath}
                        disabled={disabled || pickPathDisabled || pickPathLoading}
                        aria-label={resolvedPickPathAriaLabel}
                        size="small"
                        sx={{
                            borderRadius: 0,
                            px: 1,
                            height: '100%',
                            color: isDark ? '#9a9a9a' : '#5e5e63',
                            bgcolor: isDark ? '#232323' : '#f4f5f7',
                            transition: 'background-color 0.1s ease, color 0.1s ease',
                            '&:hover': {
                                bgcolor: isDark ? '#2a2a2a' : '#ecedf0',
                                color: isDark ? '#ffffff' : '#1a1a1a',
                            },
                        }}
                    >
                        {pickPathLoading
                            ? <CircularProgress size={16} sx={{ color: 'inherit' }} />
                            : <FolderOpen size={16} />}
                    </IconButton>
                </>
            )}

            <Box sx={{ width: '1px', height: '60%', bgcolor: isDark ? '#333333' : '#dfe0e2' }} />

            <Select
                value={extension}
                onChange={(event) => onExtensionChange(event.target.value)}
                disabled={disabled}
                variant="standard"
                disableUnderline
                sx={{
                    height: '100%',
                    bgcolor: isDark ? '#232323' : '#f4f5f7',
                    color: isDark ? '#bbb' : '#5e5e63',
                    fontSize: '13px',
                    fontWeight: 700,
                    px: 0,
                    minWidth: '70px',
                    textAlign: 'center',
                    '& .MuiSelect-select': {
                        paddingLeft: '12px',
                        paddingRight: '24px !important',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: '100% !important',
                        boxSizing: 'border-box',
                    },
                    '& .MuiSvgIcon-root': {
                        right: 4,
                        width: 20,
                        color: isDark ? '#777' : '#8e8e93',
                    },
                    transition: 'background-color 0.1s ease, color 0.1s ease',
                    '&:hover': {
                        bgcolor: isDark ? '#2a2a2a' : '#ecedf0',
                        color: isDark ? '#fff' : '#1a1a1a',
                    },
                }}
            >
                {extensions.map((ext) => (
                    <MenuItem
                        key={ext.value}
                        value={ext.value}
                        sx={{
                            fontSize: '13px',
                            fontWeight: 600,
                        }}
                    >
                        .{ext.label}
                    </MenuItem>
                ))}
            </Select>
        </Box>
    )
}
