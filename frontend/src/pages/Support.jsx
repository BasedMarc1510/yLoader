import React from 'react'
import {
  Box,
  Button,
  Chip,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { Check, Copy, ExternalLink, Heart, Wallet } from 'lucide-react'
import QRCode from 'qrcode'
import { useI18n } from '../providers/I18nProvider'
import SimpleBarScrollArea from '../components/SimpleBarScrollArea'

const COFFEE_URL = 'https://buymeacoffee.com/michaelsant0s'
const REPOSITORY_URL = 'https://github.com/BasedMarc1510/yLoader'
const DONATION_OPTIONS = [
  {
    key: 'btc',
    labelKey: 'support.currencyBitcoin',
    code: 'BTC',
    address: 'bc1q273jxf4xq87qggcjfw6d8v038rwqyygcsxmw8f',
    walletUrl: 'bitcoin:bc1q273jxf4xq87qggcjfw6d8v038rwqyygcsxmw8f',
  },
  {
    key: 'doge',
    labelKey: 'support.currencyDogecoin',
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
  const [copiedKey, setCopiedKey] = React.useState('')
  const [qrCodes, setQrCodes] = React.useState({})
  const [activeCurrencyKey, setActiveCurrencyKey] = React.useState(DONATION_OPTIONS[0].key)
  const [qrDialogOpen, setQrDialogOpen] = React.useState(false)
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
            await QRCode.toDataURL(option.walletUrl, {
              errorCorrectionLevel: 'M',
              margin: 1,
              width: 260,
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

  const activeDonation = React.useMemo(() => {
    return DONATION_OPTIONS.find((option) => option.key === activeCurrencyKey) || DONATION_OPTIONS[0]
  }, [activeCurrencyKey])

  const isCopied = copiedKey === activeDonation.key

  return (
    <SimpleBarScrollArea sx={{ height: '100%' }}>
      <Container maxWidth="lg" sx={{ py: { xs: 3, md: 4 } }}>
        <Paper
          elevation={0}
          sx={{
            p: { xs: 2.5, md: 4 },
            borderRadius: 2,
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
                  variant="contained"
                  color="error"
                  component="a"
                  href={COFFEE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  endIcon={<ExternalLink size={18} />}
                  sx={{
                    width: { xs: '100%', sm: 'fit-content' },
                    borderRadius: 999,
                    px: 2.25,
                    py: 1.1,
                    fontWeight: 700,
                    textTransform: 'none',
                  }}
                >
                  {t('support.coffeeButton')}
                </Button>
                <Button
                  variant="outlined"
                  color="inherit"
                  component="a"
                  href={REPOSITORY_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  endIcon={<ExternalLink size={18} />}
                  sx={{
                    width: { xs: '100%', sm: 'fit-content' },
                    borderRadius: 999,
                    px: 2,
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
            p: { xs: 2.25, md: 3 },
            borderRadius: 2,
            bgcolor: 'background.paper',
            border: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Stack spacing={2.25}>
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
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.75,
                p: 0.75,
                borderRadius: 999,
                bgcolor: 'action.hover',
                width: 'fit-content',
              }}
            >
              {DONATION_OPTIONS.map((option) => {
                const isActive = option.key === activeCurrencyKey
                return (
                  <Button
                    key={option.key}
                    size="small"
                    onClick={() => setActiveCurrencyKey(option.key)}
                    variant={isActive ? 'contained' : 'text'}
                    color={isActive ? 'error' : 'inherit'}
                    sx={{
                      minWidth: 120,
                      borderRadius: 999,
                      textTransform: 'none',
                      fontWeight: 700,
                      boxShadow: isActive ? 'none' : 'none',
                    }}
                  >
                    {t(option.labelKey)}
                  </Button>
                )
              })}
            </Box>

            <Box
              sx={{
                p: { xs: 1.6, md: 2 },
                borderRadius: 2,
                bgcolor: 'background.default',
                border: '1px solid',
                borderColor: 'divider',
              }}
            >
              <Stack spacing={1.5}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1.5}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                    {t(activeDonation.labelKey)}
                  </Typography>
                  <Chip
                    label={activeDonation.code}
                    size="small"
                    sx={{
                      fontWeight: 800,
                      bgcolor: 'action.hover',
                    }}
                  />
                </Stack>

                <TextField
                  fullWidth
                  size="small"
                  value={activeDonation.address}
                  inputProps={{ readOnly: true }}
                  label={t('support.donationAddress')}
                  sx={{
                    '& .MuiInputBase-input': {
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                      fontSize: 13,
                    },
                  }}
                />

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.1}>
                  <Button
                    variant={isCopied ? 'contained' : 'outlined'}
                    color={isCopied ? 'success' : 'inherit'}
                    startIcon={isCopied ? <Check size={17} /> : <Copy size={17} />}
                    onClick={() => { void handleCopy(activeDonation.key, activeDonation.address) }}
                    sx={{ borderRadius: 999, fontWeight: 700, textTransform: 'none' }}
                  >
                    {isCopied ? t('support.copiedAddress') : t('support.copyAddress')}
                  </Button>

                  <Button
                    variant="outlined"
                    onClick={() => setQrDialogOpen(true)}
                    sx={{ borderRadius: 999, fontWeight: 700, textTransform: 'none' }}
                  >
                    {t('support.showQr')}
                  </Button>

                  <Button
                    variant="text"
                    component="a"
                    href={activeDonation.walletUrl}
                    startIcon={<Wallet size={17} />}
                    sx={{ borderRadius: 999, fontWeight: 700, textTransform: 'none', width: { xs: '100%', sm: 'fit-content' } }}
                  >
                    {t('support.openWallet')}
                  </Button>
                </Stack>
              </Stack>
            </Box>
          </Stack>
        </Paper>
      </Container>

      <Dialog
        open={qrDialogOpen}
        onClose={() => setQrDialogOpen(false)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>
          {t('support.qrDialogTitle', { currency: t(activeDonation.labelKey) })}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} alignItems="center" sx={{ pt: 0.25 }}>
            <Box
              sx={{
                p: 1,
                borderRadius: 2,
                bgcolor: '#ffffff',
                border: '1px solid',
                borderColor: 'divider',
              }}
            >
              {qrCodes[activeDonation.key] ? (
                <Box
                  component="img"
                  src={qrCodes[activeDonation.key]}
                  alt={t('support.qrImageAlt', { currency: t(activeDonation.labelKey) })}
                  sx={{ display: 'block', width: 230, height: 230 }}
                />
              ) : (
                <Box sx={{ width: 230, height: 230, bgcolor: '#f3f4f6' }} />
              )}
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center' }}>
              {t('support.qrDialogHint')}
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setQrDialogOpen(false)} sx={{ textTransform: 'none', fontWeight: 700 }}>
            {t('support.closeQr')}
          </Button>
        </DialogActions>
      </Dialog>
    </SimpleBarScrollArea>
  )
}
