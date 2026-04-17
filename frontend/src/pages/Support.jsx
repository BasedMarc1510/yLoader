import React from 'react'
import {
  Box,
  Button,
  Chip,
  Container,
  Grid,
  Paper,
  Stack,
  Typography,
} from '@mui/material'
import { Check, Copy, ExternalLink, Heart, Wallet } from 'lucide-react'
import { useTheme } from '@mui/material/styles'
import QRCode from 'qrcode'
import { useI18n } from '../providers/I18nProvider'
import SimpleBarScrollArea from '../components/SimpleBarScrollArea'

const COFFEE_URL = 'https://buymeacoffee.com/michaelsant0s'
const DONATION_OPTIONS = [
  {
    key: 'btc',
    label: 'Bitcoin',
    code: 'BTC',
    address: 'bc1q273jxf4xq87qggcjfw6d8v038rwqyygcsxmw8f',
    walletUrl: 'bitcoin:bc1q273jxf4xq87qggcjfw6d8v038rwqyygcsxmw8f',
  },
  {
    key: 'doge',
    label: 'Dogecoin',
    code: 'DOGE',
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
  const theme = useTheme()
  const isDark = theme.palette.mode === 'dark'
  const [copiedKey, setCopiedKey] = React.useState('')
  const [qrCodes, setQrCodes] = React.useState({})
  const resetTimerRef = React.useRef(null)

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
            await QRCode.toDataURL(option.address, {
              errorCorrectionLevel: 'M',
              margin: 1,
              width: 220,
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

  return (
    <SimpleBarScrollArea sx={{ height: '100%' }}>
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Grid container spacing={2.5}>
          <Grid item xs={12}>
            <Paper
              elevation={0}
              sx={{
                p: { xs: 2.5, md: 4 },
                borderRadius: 3,
                border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
                background: isDark
                  ? 'linear-gradient(135deg, rgba(36,36,36,0.98), rgba(22,22,22,0.98))'
                  : 'linear-gradient(135deg, #fff7ec, #ffffff 60%)',
              }}
            >
              <Stack spacing={2.5}>
                <Chip
                  icon={<Heart size={16} />}
                  label={t('support.kicker')}
                  sx={{
                    width: 'fit-content',
                    fontWeight: 700,
                    bgcolor: isDark ? 'rgba(255,255,255,0.08)' : '#fff1df',
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
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', sm: 'center' }}>
                  <Button
                    variant="contained"
                    color="error"
                    component="a"
                    href={COFFEE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    endIcon={<ExternalLink size={18} />}
                    sx={{ width: { xs: '100%', sm: 'fit-content' }, borderRadius: 999, px: 2.25, py: 1.1, fontWeight: 700 }}
                  >
                    {t('support.coffeeButton')}
                  </Button>
                  <Typography variant="body2" color="text.secondary">
                    {t('support.pullRequestHint')}
                  </Typography>
                </Stack>
              </Stack>
            </Paper>
          </Grid>

          {DONATION_OPTIONS.map((option) => {
            const isCopied = copiedKey === option.key

            return (
              <Grid item xs={12} md={6} key={option.key}>
                <Paper
                  elevation={0}
                  sx={{
                    height: '100%',
                    p: 3,
                    borderRadius: 3,
                    border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
                    bgcolor: isDark ? '#1d1d1d' : '#ffffff',
                  }}
                >
                  <Stack spacing={2}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1.5}>
                      <Box>
                        <Typography variant="h5" component="h2" sx={{ fontWeight: 800 }}>
                          {option.label}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {t('support.donationAddress')}
                        </Typography>
                      </Box>
                      <Chip
                        label={option.code}
                        sx={{
                          fontWeight: 800,
                          bgcolor: isDark ? 'rgba(255,255,255,0.08)' : '#f3f4f6',
                        }}
                      />
                    </Stack>

                    <Box
                      sx={{
                        p: 2,
                        borderRadius: 2,
                        bgcolor: isDark ? '#111111' : '#f8f8f8',
                        border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
                      }}
                    >
                      <Typography
                        component="code"
                        sx={{
                          display: 'block',
                          fontSize: '0.94rem',
                          lineHeight: 1.7,
                          wordBreak: 'break-all',
                          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                        }}
                      >
                        {option.address}
                      </Typography>
                    </Box>

                    {qrCodes[option.key] && (
                      <Box
                        sx={{
                          alignSelf: 'center',
                          p: 1.25,
                          borderRadius: 2.5,
                          bgcolor: '#ffffff',
                          border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
                        }}
                      >
                        <Box
                          component="img"
                          src={qrCodes[option.key]}
                          alt={`${option.label} donation QR code`}
                          sx={{ display: 'block', width: 180, height: 180 }}
                        />
                      </Box>
                    )}

                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
                      <Button
                        variant={isCopied ? 'contained' : 'outlined'}
                        color={isCopied ? 'success' : 'inherit'}
                        startIcon={isCopied ? <Check size={18} /> : <Copy size={18} />}
                        onClick={() => { void handleCopy(option.key, option.address) }}
                        sx={{ borderRadius: 999, fontWeight: 700 }}
                      >
                        {isCopied ? t('support.copiedAddress') : t('support.copyAddress')}
                      </Button>
                      <Button
                        variant="text"
                        component="a"
                        href={option.walletUrl}
                        startIcon={<Wallet size={18} />}
                        sx={{ borderRadius: 999, fontWeight: 700, width: { xs: '100%', sm: 'fit-content' } }}
                      >
                        {t('support.openWallet')}
                      </Button>
                    </Stack>
                  </Stack>
                </Paper>
              </Grid>
            )
          })}
        </Grid>
      </Container>
    </SimpleBarScrollArea>
  )
}
