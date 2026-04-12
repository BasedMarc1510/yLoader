import React from 'react'
import { Box, Typography, MenuItem, Select } from '@mui/material'
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
    return (
        <Box
            sx={{
                display: 'flex',
                alignItems: 'center',
                width: '100%',
                bgcolor: isDark ? '#1b1b1b' : '#f5f5f5',
                border: `2px solid ${isDark ? '#333333' : '#b0b0b0'}`,
                borderRadius: '16px', // Slightly less rounded for "premium" feel than full pill
                transition: 'border-color 0.2s ease',
                '&:focus-within': {
                    borderColor: isDark ? '#555555' : '#888888',
                },
                overflow: 'hidden',
                height: '45px',
            }}
        >
            {/* Icon */}
            <Box sx={{ pl: 2, display: 'flex', alignItems: 'center', color: isDark ? '#888888' : '#666666' }}>
                <Tag size={18} />
            </Box>

            {/* Input */}
            <Box
                component="input"
                value={value}
                onChange={(e) => onChange(e.target.value)}
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
                    '&::placeholder': {
                        color: isDark ? '#555555' : '#999999',
                    },
                }}
            />

            {/* Extension Divider */}
            <Box sx={{ width: '1px', height: '60%', bgcolor: isDark ? '#333333' : '#d0d0d0' }} />

            {/* Extension Dropdown */}
            <Select
                value={extension}
                onChange={(e) => onExtensionChange(e.target.value)}
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
                        paddingRight: '24px !important', // space for arrow
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: '100% !important',
                        boxSizing: 'border-box',
                        // py: 0,
                    },
                    '& .MuiSvgIcon-root': {
                        right: 4,
                        width: 20,
                        color: isDark ? '#777' : '#999',
                    },
                    '&:hover': {
                        bgcolor: isDark ? '#2a2a2a' : '#dfdfdf',
                        color: isDark ? '#fff' : '#000',
                    }
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
