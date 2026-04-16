import React from 'react'
import { Box } from '@mui/material'
import { useTheme } from '@mui/material/styles'
import {
  SiAparat,
  SiAppletv,
  SiAudiomack,
  SiBandcamp,
  SiBilibili,
  SiCbc,
  SiCloudflare,
  SiCoursera,
  SiCrunchyroll,
  SiDailymotion,
  SiDazn,
  SiEdx,
  SiEgghead,
  SiEnvato,
  SiFacebook,
  SiFubo,
  SiGamejolt,
  SiGoogleearth,
  SiGofundme,
  SiIgn,
  SiImdb,
  SiInstagram,
  SiItchdotio,
  SiItvx,
  SiKhanacademy,
  SiKakao,
  SiKick,
  SiKickstarter,
  SiLastdotfm,
  SiMax,
  SiMetacritic,
  SiMlb,
  SiMixcloud,
  SiNaver,
  SiNba,
  SiNetflix,
  SiNewgrounds,
  SiOdysee,
  SiOnlyfans,
  SiOreilly,
  SiPackt,
  SiParamountplus,
  SiPatreon,
  SiPinterest,
  SiPluralsight,
  SiPond5,
  SiQq,
  SiReddit,
  SiReverbnation,
  SiRoku,
  SiRottentomatoes,
  SiRumble,
  SiSkillshare,
  SiSky,
  SiSnapchat,
  SiSoundcloud,
  SiSpotify,
  SiSteam,
  SiSubstack,
  SiTreehouse,
  SiTiktok,
  SiTubi,
  SiTwitch,
  SiUdemy,
  SiVimeo,
  SiWistia,
  SiX,
  SiYoutube,
  SiZdf,
} from '@icons-pack/react-simple-icons'
import {
  getServiceAccentColor,
  getServiceIconExportName,
  getServiceThemeColor,
} from '../utils/metadata'

const ICON_BY_EXPORT = {
  SiAparat,
  SiAppletv,
  SiAudiomack,
  SiBandcamp,
  SiBilibili,
  SiCbc,
  SiCloudflare,
  SiCoursera,
  SiCrunchyroll,
  SiDailymotion,
  SiDazn,
  SiEdx,
  SiEgghead,
  SiEnvato,
  SiFacebook,
  SiFubo,
  SiGamejolt,
  SiGoogleearth,
  SiGofundme,
  SiIgn,
  SiImdb,
  SiInstagram,
  SiItchdotio,
  SiItvx,
  SiKhanacademy,
  SiKakao,
  SiKick,
  SiKickstarter,
  SiLastdotfm,
  SiMax,
  SiMetacritic,
  SiMlb,
  SiMixcloud,
  SiNaver,
  SiNba,
  SiNetflix,
  SiNewgrounds,
  SiOdysee,
  SiOnlyfans,
  SiOreilly,
  SiPackt,
  SiParamountplus,
  SiPatreon,
  SiPinterest,
  SiPluralsight,
  SiPond5,
  SiQq,
  SiReddit,
  SiReverbnation,
  SiRoku,
  SiRottentomatoes,
  SiRumble,
  SiSkillshare,
  SiSky,
  SiSnapchat,
  SiSoundcloud,
  SiSpotify,
  SiSteam,
  SiSubstack,
  SiTreehouse,
  SiTiktok,
  SiTubi,
  SiTwitch,
  SiUdemy,
  SiVimeo,
  SiWistia,
  SiX,
  SiYoutube,
  SiZdf,
}

const FALLBACK_ICON = SiGoogleearth

function resolveIconColor(serviceKey, mode) {
  const baseColor = getServiceThemeColor(serviceKey)
  const accentColor = getServiceAccentColor(serviceKey)

  if (/^#000000$/i.test(baseColor) && mode === 'dark') {
    return accentColor || '#FFFFFF'
  }

  return baseColor
}

export default function ServiceIcon({ serviceKey = 'generic', size = 18, title, sx, color }) {
  const theme = useTheme()
  const iconExportName = getServiceIconExportName(serviceKey)
  const Icon = iconExportName && ICON_BY_EXPORT[iconExportName] ? ICON_BY_EXPORT[iconExportName] : FALLBACK_ICON
  const resolvedColor = color || resolveIconColor(serviceKey, theme.palette.mode)

  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        lineHeight: 0,
        ...sx,
      }}
    >
      <Icon size={size} color={resolvedColor} title={title} />
    </Box>
  )
}
