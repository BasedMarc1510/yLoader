import React from 'react'
import MultiDownloader from './downloader/MultiDownloader'
import SingleDownloader from './SingleDownloader'

export default function Downloader(props) {
  const search = String(props?.routeSearch || '').trim()

  const isMultiDownloaderRoute = React.useMemo(() => {
    if (!search) return false

    const params = new URLSearchParams(search)
    const multiFlag = String(params.get('multiDownload') || '').trim()
    if (multiFlag !== '1') return false

    const token = String(params.get('multiImportToken') || '').trim()
    const inlineLinks = String(params.get('links') || '').trim()
    return Boolean(token || inlineLinks)
  }, [search])

  if (isMultiDownloaderRoute) {
    return (
      <MultiDownloader
        routeSearch={props?.routeSearch || ''}
        routeToken={props?.routeToken || 0}
        tabsReady={props?.tabsReady !== false}
        onNavigate={props?.onNavigate}
        onTabStateChange={props?.onTabStateChange}
      />
    )
  }

  return <SingleDownloader {...props} />
}
