import React from 'react'
import {
  Box,
  Button,
  Chip,
  Container,
  IconButton,
  InputAdornment,
  Paper,
  Popover,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { Check, Copy, ExternalLink, Github, Heart, QrCode } from 'lucide-react'
import QRCode from 'qrcode'
import { useI18n } from '../providers/I18nProvider'
import SimpleBarScrollArea from '../components/SimpleBarScrollArea'

const COFFEE_URL = 'https://buymeacoffee.com/michaelsant0s'
const REPOSITORY_URL = 'https://github.com/BasedMarc1510/yLoader'
const SUPPORT_ICON_BASE = `${String(import.meta.env.BASE_URL || '/').replace(/\/?$/, '/')}icons/support/`
const DONATION_OPTIONS = [
  {
    key: 'btc',
    labelKey: 'support.currencyBitcoin',
    code: 'BTC',
    iconPath: `${SUPPORT_ICON_BASE}bitcoin.svg`,
    address: 'bc1q273jxf4xq87qggcjfw6d8v038rwqyygcsxmw8f',
    walletUrl: 'bitcoin:bc1q273jxf4xq87qggcjfw6d8v038rwqyygcsxmw8f',
  },
  {
    key: 'doge',
    labelKey: 'support.currencyDogecoin',
    code: 'DOGE',
    iconPath: `${SUPPORT_ICON_BASE}dogecoin.svg`,
    address: 'DASGta7VgHuxUCvDh9v5cfRCFLirjs611B',
    walletUrl: 'dogecoin:DASGta7VgHuxUCvDh9v5cfRCFLirjs611B',
  },
]

async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  textarea.remove()

  if (!copied) throw new Error('Clipboard copy command failed.')
}

export default function SupportPage() {
  const { t } = useI18n()
  const [copiedKey, setCopiedKey] = React.useState('')
  const [qrCodes, setQrCodes] = React.useState({})
  const [qrDropdown, setQrDropdown] = React.useState({ key: '', anchorEl: null })
  const resetTimerRef = React.useRef(null)

  const selectWalletAddress = React.useCallback((event) => {
    const input = event?.target
    if (!(input instanceof HTMLInputElement)) return

    input.select()
    try {
      input.setSelectionRange(0, input.value.length)
    } catch {
      // Ignore selection range errors in uncommon input engines.
    }
  }, [])

  React.useEffect(() => () => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current)
  }, [])

  React.useEffect(() => {
    let isActive = true

    const generateQrs = async () => {
      try {
        const pairs = await Promise.all(
          DONATION_OPTIONS.map(async (option) => ([
            option.key,
            await QRCode.toDataURL(option.walletUrl, {
              errorCorrectionLevel: 'M',
              margin: 1,
              width: 176,
              color: {
                dark: '#111111',
                light: '#FFFFFFFF',
              },
            }),
          ]))
        )

        if (!isActive) return
        setQrCodes(Object.fromEntries(pairs))
      } catch (error) {
        console.error('Failed to generate donation QR codes', error)
      }
    }

    void generateQrs()

    return () => {
      isActive = false
    }
  }, [])

  const handleCopy = async (key, address) => {
    try {
      await copyTextToClipboard(address)
      setCopiedKey(key)
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current)
      resetTimerRef.current = setTimeout(() => setCopiedKey(''), 1400)
    } catch (error) {
      console.error('Failed to copy donation address', error)
    }
  }

  const handleQrToggle = (key, event) => {
    setQrDropdown((prev) => {
      if (prev.key === key && prev.anchorEl) {
        return { key: '', anchorEl: null }
      }

      return { key, anchorEl: event.currentTarget }
    })
  }

  const handleQrClose = () => {
    setQrDropdown({ key: '', anchorEl: null })
  }

  return (
    <SimpleBarScrollArea sx={{ height: '100%' }}>
      <Container maxWidth="lg" sx={{ py: { xs: 3, md: 4 } }}>
        <Paper
          elevation={0}
          sx={{
            p: { xs: 2.5, md: 4 },
            borderRadius: 2.5,
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.paper',
          }}
        >
          <Stack spacing={2.5}>
            <Chip
              icon={<Heart size={16} />}
              label={t('support.kicker')}
              sx={{
                width: 'fit-content',
                fontWeight: 700,
                bgcolor: 'action.hover',
              }}
            />
            <Typography variant="h3" component="h1" sx={{ fontWeight: 800, fontSize: { xs: '2rem', md: '2.6rem' } }}>
              {t('support.title')}
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 760, lineHeight: 1.7 }}>
              {t('support.description')}
            </Typography>
            <Typography variant="body1" sx={{ maxWidth: 760, fontWeight: 600 }}>
              {t('support.thanks')}
            </Typography>
            <Stack spacing={1.25}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} alignItems={{ xs: 'stretch', sm: 'center' }}>
                <Button
                  variant="outlined"
                  color="inherit"
                  component="a"
                  href={COFFEE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t('support.coffeeButton')}
                  sx={{
                    width: { xs: '100%', sm: 170 },
                    minWidth: { xs: 0, sm: 170 },
                    minHeight: 44,
                    height: 44,
                    borderRadius: 1.25,
                    borderColor: 'divider',
                    bgcolor: '#ffdd00',
                    px: 0,
                    py: 0,
                    overflow: 'hidden',
                    '&:hover': {
                      bgcolor: '#f4d100',
                      borderColor: 'divider',
                    },
                  }}
                >
                  <Box
                    component="img"
                    src={`${SUPPORT_ICON_BASE}buy-me-a-coffee.svg`}
                    alt=""
                    aria-hidden="true"
                    sx={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain' }}
                  />
                </Button>

                <Button
                  variant="outlined"
                  color="inherit"
                  component="a"
                  href={REPOSITORY_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  startIcon={<Github size={18} />}
                  endIcon={<ExternalLink size={18} />}
                  sx={{
                    width: { xs: '100%', sm: 'fit-content' },
                    minHeight: 44,
                    height: 44,
                    borderRadius: 1.25,
                    px: 2.25,
                    py: 1.1,
                    fontWeight: 700,
                    textTransform: 'none',
                  }}
                >
                  {t('support.contributeButton')}
                </Button>
              </Stack>
              <Typography variant="body2" color="text.secondary">
                {t('support.pullRequestHint')}
              </Typography>
            </Stack>
          </Stack>
        </Paper>

        <Paper
          elevation={0}
          sx={{
            mt: { xs: 4, md: 5.5 },
            p: { xs: 2.25, md: 3.25 },
            borderRadius: 2.5,
            bgcolor: 'background.paper',
            border: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Stack spacing={2.5}>
            <Box>
              <Typography variant="h5" component="h2" sx={{ fontWeight: 800 }}>
                {t('support.cryptoTitle')}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, maxWidth: 760 }}>
                {t('support.cryptoDescription')}
              </Typography>
            </Box>

            <Box
              sx={{
                display: 'grid',
                gap: 2,
                gridTemplateColumns: {
                  xs: '1fr',
                  lg: 'repeat(2, minmax(0, 1fr))',
                },
              }}
            >
              {DONATION_OPTIONS.map((option) => {
                const isCopied = copiedKey === option.key
                const qrSrc = qrCodes[option.key]
                const qrOpen = qrDropdown.key === option.key && Boolean(qrDropdown.anchorEl)

                return (
                  <Paper
                    key={option.key}
                    elevation={0}
                    sx={{
                      p: { xs: 2, md: 2.25 },
                      borderRadius: 2,
                      border: '1px solid',
                      borderColor: 'divider',
                      bgcolor: 'background.default',
                    }}
                  >
                    <Stack spacing={1.6} sx={{ height: '100%' }}>
                      <Stack spacing={1} alignItems="center" textAlign="center">
                        <Box
                          sx={{
                            width: 48,
                            height: 48,
                            borderRadius: 2,
                            border: '1px solid',
                            borderColor: 'divider',
                            bgcolor: '#ffffff',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Box
                            component="img"
                            src={option.iconPath}
                            alt=""
                            aria-hidden="true"
                            sx={{ width: 28, height: 28 }}
                          />
                        </Box>

                        <Typography variant="subtitle1" sx={{ fontWeight: 800, lineHeight: 1.25 }}>
                          {t(option.labelKey)}
                        </Typography>

                        <Chip
                          label={option.code}
                          size="small"
                          sx={{
                            fontWeight: 800,
                            bgcolor: 'action.hover',
                          }}
                        />
                      </Stack>

                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{
                          textAlign: 'center',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.12em',
                        }}
                      >
                        {t('support.donationAddress')}
                      </Typography>

                      <TextField
                        fullWidth
                        size="small"
                        value={option.address}
                        inputProps={{
                          readOnly: true,
                          onFocus: selectWalletAddress,
                          onClick: selectWalletAddress,
                          onMouseUp: (event) => {
                            event.preventDefault()
                            selectWalletAddress(event)
                          },
                        }}
                        sx={{
                          '& .MuiInputBase-input': {
                            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                            fontSize: 12,
                            fontWeight: 700,
                            color: 'text.primary',
                            overflowWrap: 'anywhere',
                          },
                          '& .MuiOutlinedInput-root': {
                            bgcolor: 'action.hover',
                          },
                        }}
                        InputProps={{
                          endAdornment: (
                            <InputAdornment position="end">
                              <IconButton
                                size="small"
                                onClick={(event) => handleQrToggle(option.key, event)}
                                aria-label={t('support.showQr')}
                              >
                                <QrCode size={16} />
                              </IconButton>
                            </InputAdornment>
                          ),
                        }}
                      />

                      <Popover
                        open={qrOpen}
                        anchorEl={qrDropdown.anchorEl}
                        onClose={handleQrClose}
                        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                      >
                        <Stack spacing={0.75} alignItems="center" sx={{ p: 1.2 }}>
                          <Typography
                            variant="caption"
                            sx={{
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              letterSpacing: '0.12em',
                              color: '#374151',
                            }}
                          >
                            {t('support.qrCode')}
                          </Typography>

                          {qrSrc ? (
                            <Box
                              component="img"
                              src={qrSrc}
                              alt={t('support.qrImageAlt', { currency: t(option.labelKey) })}
                              sx={{
                                display: 'block',
                                width: 112,
                                height: 112,
                                p: 0.6,
                                borderRadius: 1.5,
                                border: '1px solid',
                                borderColor: 'divider',
                                bgcolor: '#ffffff',
                              }}
                            />
                          ) : (
                            <Box
                              sx={{
                                width: 112,
                                height: 112,
                                borderRadius: 1.5,
                                border: '1px solid',
                                borderColor: 'divider',
                                bgcolor: 'action.hover',
                              }}
                            />
                          )}
                        </Stack>
                      </Popover>

                      <Stack
                        direction={{ xs: 'column', sm: 'row' }}
                        spacing={1.1}
                        sx={{
                          '& > *': {
                            minHeight: 44,
                            height: 44,
                          },
                        }}
                      >
                        <Button
                          variant={isCopied ? 'contained' : 'outlined'}
                          color={isCopied ? 'success' : 'inherit'}
                          startIcon={isCopied ? <Check size={17} /> : <Copy size={17} />}
                          onClick={() => { void handleCopy(option.key, option.address) }}
                          sx={{ borderRadius: 1.25, fontWeight: 700, textTransform: 'none', width: { xs: '100%', sm: 'fit-content' } }}
                        >
                          {isCopied ? t('support.copiedAddress') : t('support.copyAddress')}
                        </Button>

                        <Button
                          variant="outlined"
                          component="a"
                          href={option.walletUrl}
                          endIcon={<ExternalLink size={16} />}
                          sx={{ borderRadius: 1.25, fontWeight: 700, textTransform: 'none', width: { xs: '100%', sm: 'fit-content' } }}
                        >
                          {t('support.openWallet')}
                        </Button>
                      </Stack>
                    </Stack>
                  </Paper>
                )
              })}
            </Box>
          </Stack>
        </Paper>
      </Container>
    </SimpleBarScrollArea>
  )
}
