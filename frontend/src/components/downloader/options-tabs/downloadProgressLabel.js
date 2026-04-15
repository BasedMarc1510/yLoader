export function getDownloadProgressLabel(t, stage, percent) {
  const roundedPercent = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)))
  const normalizedStage = String(stage || '').trim().toLowerCase()

  if (!normalizedStage || normalizedStage === 'downloading') {
    return `${roundedPercent}%`
  }

  if (normalizedStage === 'complete') {
    return '100%'
  }

  const stageKeyByValue = {
    starting: 'downloader.stageStarting',
    initializing: 'downloader.stageInitializing',
    queued: 'downloader.stageQueued',
    merging: 'downloader.stageMerging',
    processing: 'downloader.stageProcessing',
  }

  const stageKey = stageKeyByValue[normalizedStage]
  if (!stageKey) {
    return `${roundedPercent}%`
  }

  return `${t(stageKey)} ${roundedPercent}%`
}
