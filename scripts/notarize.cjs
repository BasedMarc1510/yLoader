const path = require('path')

module.exports = async function notarizeApp(context) {
  if (process.platform !== 'darwin') {
    return
  }

  const appleId = process.env.APPLE_ID
  const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD
  const teamId = process.env.APPLE_TEAM_ID

  if (!appleId || !appleIdPassword || !teamId) {
    process.stdout.write('[notarize] Skipping notarization (APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID not fully set).\n')
    return
  }

  const appName = context?.packager?.appInfo?.productFilename
  const appOutDir = context?.appOutDir

  if (!appName || !appOutDir) {
    process.stdout.write('[notarize] Skipping notarization (missing app output metadata).\n')
    return
  }

  const appPath = path.join(appOutDir, `${appName}.app`)

  // Load only when needed to keep non-mac builds lightweight.
  const { notarize } = require('@electron/notarize')

  process.stdout.write(`[notarize] Notarizing ${appPath}...\n`)

  await notarize({
    appPath,
    appleId,
    appleIdPassword,
    teamId,
  })

  process.stdout.write('[notarize] Notarization finished.\n')
}
