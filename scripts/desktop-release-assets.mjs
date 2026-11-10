import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { copyFile, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

const tag = process.env.GITHUB_REF_NAME
const version = JSON.parse(await readFile('package.json', 'utf8')).version
const prerelease = version.includes('-')

if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version) || tag !== `v${version}`) {
  throw new Error(`Tag ${tag} must match the application version v${version}`)
}

const jsonVersions = await Promise.all([
  'frontend/package.json', 'backend/package.json', 'src-tauri/tauri.conf.json',
].map(async (file) => JSON.parse(await readFile(file, 'utf8')).version))
const rustVersions = await Promise.all([
  'src-tauri/Cargo.toml', 'src-tauri/Cargo.lock',
].map(async (file) => (await readFile(file, 'utf8')).match(/^name = "yloader"\r?\nversion = "([^"]+)"$/m)?.[1]))
if ([...jsonVersions, ...rustVersions].some((value) => value !== version)) {
  throw new Error('Desktop, web and backend application versions must match')
}

if (!process.argv.includes('--check-version')) await assemble()

async function assemble() {
  const repository = process.env.GITHUB_REPOSITORY
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository ?? '')) throw new Error('Missing GitHub repository')
  const output = 'release-upload'
  const input = 'release-assets'
  const baseUrl = `https://github.com/${repository}/releases/download/${tag}`
  const platforms = {}
  const pubDate = new Date().toISOString()
  await mkdir(output, { recursive: true })

  async function copyUnique(target, suffix, name) {
    const root = path.join(input, `desktop-${target}`)
    const files = await readdir(root, { recursive: true, withFileTypes: true })
    const matching = files.filter((entry) => entry.isFile() && entry.name.endsWith(suffix))
    if (matching.length !== 1) throw new Error(`Expected one ${suffix} for ${target}, got ${matching.length}`)
    const entry = matching[0]
    const source = path.join(entry.parentPath, entry.name)
    await copyFile(source, path.join(output, name))
    return source
  }

  async function addUpdate(target, suffix, name, updatePlatforms) {
    const source = await copyUnique(target, suffix, name)
    const signature = (await readFile(`${source}.sig`, 'utf8')).trim()
    if (!signature || !/^[A-Za-z0-9+/=]+$/.test(signature)) {
      throw new Error(`Invalid Tauri signature for ${name}`)
    }
    await writeFile(path.join(output, `${name}.sig`), `${signature}\n`)
    for (const platform of updatePlatforms) {
      platforms[platform] = { signature, url: `${baseUrl}/${name}` }
    }
  }

  async function writeLegacyManifest(filename, asset) {
    const file = path.join(output, asset)
    const hash = createHash('sha512')
    for await (const chunk of createReadStream(file)) hash.update(chunk)
    const sha512 = hash.digest('base64')
    const { size } = await stat(file)
    await writeJson(filename, { version, files: [{ url: asset, sha512, size }], path: asset, sha512, releaseDate: pubDate })
  }

  async function writeJson(name, value) {
    await writeFile(path.join(output, name), `${JSON.stringify(value, null, 2)}\n`)
  }

  await copyUnique('universal-apple-darwin', '.dmg', 'yLoaderSetup.dmg')
  await addUpdate('universal-apple-darwin', '.app.tar.gz', 'yLoader.app.tar.gz', ['darwin-aarch64', 'darwin-x86_64'])
  await addUpdate('x86_64-pc-windows-msvc', '-setup.exe', 'yLoaderSetup.exe', ['windows-x86_64'])
  await addUpdate('x86_64-unknown-linux-gnu', '.AppImage', 'yLoaderSetup.AppImage', ['linux-x86_64'])
  await writeJson('latest.json', { version, pub_date: pubDate, platforms })

  // These manifests let existing installations find the Tauri installer.
  // The old macOS app uses the manifest to offer a link to the release page.
  if (!prerelease) {
    await writeLegacyManifest('latest-mac.yml', 'yLoaderSetup.dmg')
    await writeLegacyManifest('latest.yml', 'yLoaderSetup.exe')
    await writeLegacyManifest('latest-linux.yml', 'yLoaderSetup.AppImage')
  }
}
