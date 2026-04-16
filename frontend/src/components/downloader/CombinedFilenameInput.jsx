import React from 'react'
import { Box, MenuItem, Select } from '@mui/material'
import { Tag } from 'lucide-react'
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
}) {
    const { t } = useI18n()
    const resolvedPlaceholder = placeholder || t('downloader.filename')
    const inputRef = React.useRef(null)
    const [showLeftFade, setShowLeftFade] = React.useState(false)
    const [showRightFade, setShowRightFade] = React.useState(false)

    const inputBgColor = isDark ? '#1b1b1b' : '#f5f5f5'
    const leftFadeGradient = isDark
        ? 'linear-gradient(to right, #1b1b1b 36%, rgba(27,27,27,0))'
        : 'linear-gradient(to right, #f5f5f5 36%, rgba(245,245,245,0))'
    const rightFadeGradient = isDark
        ? 'linear-gradient(to left, #1b1b1b 36%, rgba(27,27,27,0))'
        : 'linear-gradient(to left, #f5f5f5 36%, rgba(245,245,245,0))'

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
                bgcolor: isDark ? '#1b1b1b' : '#f5f5f5',
                border: `2px solid ${isDark ? '#333333' : '#b0b0b0'}`,
                borderRadius: '16px',
                transition: 'border-color 0.2s ease',
                '&:focus-within': {
                    borderColor: isDark ? '#555555' : '#888888',
                },
                overflow: 'hidden',
                height: '45px',
            }}
        >
            <Box sx={{ pl: 2, display: 'flex', alignItems: 'center', color: isDark ? '#888888' : '#666666' }}>
                <Tag size={18} />
            </Box>

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
                    value={value}
                    onChange={(event) => {
                        onChange(event.target.value)
                        if (typeof window !== 'undefined') {
                            window.requestAnimationFrame(updateFadeState)
                        }
                    }}
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
                        color: isDark ? '#ffffff' : '#000000',
                        fontSize: '15px',
                        fontWeight: 600,
                        px: 1.5,
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

            <Box sx={{ width: '1px', height: '60%', bgcolor: isDark ? '#333333' : '#d0d0d0' }} />

            <Select
                value={extension}
                onChange={(event) => onExtensionChange(event.target.value)}
                disabled={disabled}
                variant="standard"
                disableUnderline
                sx={{
                    height: '100%',
                    bgcolor: isDark ? '#232323' : '#e8e8e8',
                    color: isDark ? '#bbb' : '#555',
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
                        color: isDark ? '#777' : '#999',
                    },
                    '&:hover': {
                        bgcolor: isDark ? '#2a2a2a' : '#dfdfdf',
                        color: isDark ? '#fff' : '#000',
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
