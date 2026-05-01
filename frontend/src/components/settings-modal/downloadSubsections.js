export const DOWNLOAD_SUBSECTION_KEYS = Object.freeze({
  formatQuality: 'format-quality',
  filenameConventions: 'filename-conventions',
  advancedDownloadSettings: 'advanced-download-settings',
  autoDownloadDefaults: 'auto-download-defaults',
})

export const DOWNLOAD_SUBSECTIONS = Object.freeze([
  {
    key: DOWNLOAD_SUBSECTION_KEYS.formatQuality,
    labelKey: 'settings.downloadsFormatTitle',
    subtitleKey: 'settings.downloadsFormatSubtitle',
  },
  {
    key: DOWNLOAD_SUBSECTION_KEYS.filenameConventions,
    labelKey: 'settings.downloadsNamingTitle',
    subtitleKey: 'settings.downloadsNamingSubtitle',
  },
  {
    key: DOWNLOAD_SUBSECTION_KEYS.advancedDownloadSettings,
    labelKey: 'settings.downloadsAdvancedTitle',
    subtitleKey: 'settings.downloadsAdvancedSubtitle',
  },
  {
    key: DOWNLOAD_SUBSECTION_KEYS.autoDownloadDefaults,
    labelKey: 'settings.downloadsAutoDefaultsTitle',
    subtitleKey: 'settings.downloadsAutoDefaultsSubtitle',
  },
])

export const DOWNLOAD_SUBSECTION_RESET_FIELDS = Object.freeze({
  [DOWNLOAD_SUBSECTION_KEYS.formatQuality]: Object.freeze([
    'defaultAudioContainer',
    'defaultVideoContainer',
    'maxVideoHeight',
    'maxAudioBitrateKbps',
  ]),
  [DOWNLOAD_SUBSECTION_KEYS.filenameConventions]: Object.freeze([
    'audioFilenamePattern',
    'videoFilenamePattern',
    'thumbnailFilenamePattern',
  ]),
  [DOWNLOAD_SUBSECTION_KEYS.advancedDownloadSettings]: Object.freeze([
    'maxConcurrentDownloads',
    'staggerDownloadsMs',
    'defaultEmbedCoverArt',
    'downloadLocationMode',
    'globalDownloadPath',
    'globalAlwaysAsk',
    'audioDownloadPath',
    'videoDownloadPath',
    'thumbnailDownloadPath',
    'audioAlwaysAsk',
    'videoAlwaysAsk',
    'thumbnailAlwaysAsk',
  ]),
})

export const AUTO_DOWNLOAD_RESET_FIELDS = Object.freeze([
  'useMetadata',
  'embedCoverArt',
  'maxAudioBitrateKbps',
  'maxVideoHeight',
  'useFixedDownloadPath',
  'fixedDownloadPath',
])

export const RESETTABLE_DOWNLOAD_SUBSECTIONS = Object.freeze([
  ...Object.keys(DOWNLOAD_SUBSECTION_RESET_FIELDS),
  DOWNLOAD_SUBSECTION_KEYS.autoDownloadDefaults,
])
