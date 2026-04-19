import { spawnSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import process from 'process'
import { fileURLToPath } from 'url'
import { createInterface } from 'readline/promises'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT_DIR = path.resolve(__dirname, '..')
const FRONTEND_DIR = path.join(ROOT_DIR, 'frontend')
const BACKEND_DIR = path.join(ROOT_DIR, 'backend')
const IS_WINDOWS = process.platform === 'win32'
const NPM_CMD = IS_WINDOWS ? 'cmd.exe' : 'npm'
const WORKFLOW_NAME = 'Electron Build and Release'
const DEFAULT_TIMEOUT_MS = 90 * 60 * 1000
const RELEASE_TIMEOUT_MS = 45 * 60 * 1000
const AUTH_TOKEN = String(process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '').trim()

function info(message) {
  process.stdout.write(`[release] ${message}\n`)
}

function fail(message) {
  process.stderr.write(`[release] ERROR: ${message}\n`)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function run(command, args = [], options = {}) {
  const {
    cwd = ROOT_DIR,
    capture = false,
    allowFailure = false,
  } = options

  // On Windows, .cmd/.bat wrappers (like npm.cmd) require shell execution.
  const useShell = IS_WINDOWS && /\.(?:cmd|bat)$/i.test(command)

  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    shell: useShell,
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0 && !allowFailure) {
    const stderr = String(result.stderr || '').trim()
    const stdout = String(result.stdout || '').trim()
    const details = stderr || stdout || `exit code ${result.status}`
    throw new Error(`${command} ${args.join(' ')} failed: ${details}`)
  }

  return {
    status: Number(result.status || 0),
    stdout: String(result.stdout || ''),
    stderr: String(result.stderr || ''),
  }
}

function readPackageJson(packageDir) {
  const packageJsonPath = path.join(packageDir, 'package.json')
  return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
}

function parseRepositorySlug() {
  const packageJson = readPackageJson(ROOT_DIR)
  const repositoryValue = typeof packageJson.repository === 'string'
    ? packageJson.repository
    : packageJson.repository?.url

  const raw = String(repositoryValue || '').trim()
  const match = raw.match(/github\.com[:/]([^/]+\/[^/.]+)(?:\.git)?$/i)

  if (!match || !match[1]) {
    throw new Error('Could not parse GitHub repository slug from package.json repository.url')
  }

  return match[1]
}

function normalizeVersionInput(value) {
  const raw = String(value || '').trim()
  const withoutPrefix = raw.startsWith('v') ? raw.slice(1) : raw

  if (!withoutPrefix) {
    throw new Error('Version must not be empty')
  }

  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(withoutPrefix)) {
    throw new Error('Version must follow x.y.z or x.y.z-suffix (for example 2026.1.2-beta)')
  }

  return withoutPrefix
}

function getArgValue(flagName) {
  const idx = process.argv.indexOf(flagName)
  if (idx < 0) return ''
  return String(process.argv[idx + 1] || '').trim()
}

function npmArgs(args) {
  return IS_WINDOWS ? ['/d', '/s', '/c', 'npm', ...args] : args
}

async function askVersionIfMissing(initialValue) {
  if (initialValue) return initialValue

  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const answer = await rl.question('Neue Version eingeben (z.B. 2026.1.2-beta): ')
    return String(answer || '').trim()
  } finally {
    rl.close()
  }
}

function assertCleanGitWorktree() {
  const status = run('git', ['status', '--porcelain'], { capture: true }).stdout.trim()
  if (status) {
    throw new Error('Git working tree is not clean. Commit or stash your changes first.')
  }
}

function assertTagDoesNotExist(tagName) {
  const localTag = run('git', ['tag', '--list', tagName], { capture: true }).stdout.trim()
  if (localTag) {
    throw new Error(`Tag ${tagName} already exists locally.`)
  }

  const remoteTag = run('git', ['ls-remote', '--tags', 'origin', tagName], { capture: true }).stdout.trim()
  if (remoteTag) {
    throw new Error(`Tag ${tagName} already exists on origin.`)
  }
}

function getCurrentBranchName() {
  const branch = run('git', ['branch', '--show-current'], { capture: true }).stdout.trim()
  if (!branch) {
    throw new Error('Could not determine current branch name.')
  }
  return branch
}

function updateAllPackageVersions(version) {
  run(NPM_CMD, npmArgs(['version', version, '--no-git-tag-version']), { cwd: ROOT_DIR })
  run(NPM_CMD, npmArgs(['version', version, '--no-git-tag-version']), { cwd: FRONTEND_DIR })
  run(NPM_CMD, npmArgs(['version', version, '--no-git-tag-version']), { cwd: BACKEND_DIR })
}

function stageVersionFiles() {
  run('git', [
    'add',
    'package.json',
    'package-lock.json',
    'frontend/package.json',
    'frontend/package-lock.json',
    'backend/package.json',
    'backend/package-lock.json',
  ])
}

function getApiHeaders() {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'yLoader-release-script',
  }

  if (AUTH_TOKEN) {
    headers.Authorization = `Bearer ${AUTH_TOKEN}`
  }

  return headers
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...getApiHeaders(),
      ...(options.headers || {}),
    },
  })

  const text = await response.text()
  let data = null

  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = null
  }

  return {
    ok: response.ok,
    status: response.status,
    data,
    text,
  }
}

async function waitForWorkflowCompletion(repositorySlug, tagName) {
  const pollIntervalMs = AUTH_TOKEN ? 15000 : 60000
  const deadline = Date.now() + DEFAULT_TIMEOUT_MS

  info(`Warte auf GitHub Actions Run fuer ${tagName}...`)

  while (Date.now() < deadline) {
    const result = await fetchJson(`https://api.github.com/repos/${repositorySlug}/actions/runs?event=push&per_page=50`)

    if (!result.ok) {
      if (result.status === 404 && !AUTH_TOKEN) {
        info('GitHub Actions API liefert ohne GH_TOKEN/GITHUB_TOKEN HTTP 404 (private Repo naheliegend).')
        info('Workflow-Statusabfrage wird uebersprungen. Setze GH_TOKEN/GITHUB_TOKEN, um den Run hier zu verfolgen.')
        return null
      }

      throw new Error(`Failed to query workflow runs (HTTP ${result.status}). ${result.text || ''}`)
    }

    const runs = Array.isArray(result.data?.workflow_runs) ? result.data.workflow_runs : []
    const run = runs.find((entry) => entry?.head_branch === tagName && entry?.name === WORKFLOW_NAME)

    if (!run) {
      info('Run noch nicht sichtbar, warte weiter...')
      await sleep(pollIntervalMs)
      continue
    }

    const status = String(run.status || '')
    const conclusion = String(run.conclusion || '')

    if (status !== 'completed') {
      info(`Run gefunden (${status}), warte auf Abschluss...`)
      await sleep(pollIntervalMs)
      continue
    }

    if (conclusion !== 'success') {
      const runUrl = String(run.html_url || '').trim()
      throw new Error(`Workflow failed for ${tagName} (conclusion=${conclusion || 'unknown'}). ${runUrl}`)
    }

    info('Workflow erfolgreich abgeschlossen.')
    return run
  }

  throw new Error(`Timed out while waiting for workflow completion for ${tagName}`)
}

async function waitForRelease(repositorySlug, tagName, options = {}) {
  const { allowUnauthenticated404Skip = false } = options
  const pollIntervalMs = AUTH_TOKEN ? 15000 : 60000
  const deadline = Date.now() + RELEASE_TIMEOUT_MS

  info(`Warte auf GitHub Release ${tagName}...`)

  while (Date.now() < deadline) {
    const result = await fetchJson(`https://api.github.com/repos/${repositorySlug}/releases/tags/${encodeURIComponent(tagName)}`)

    if (result.status === 404) {
      if (allowUnauthenticated404Skip) {
        info('GitHub Release API liefert ohne GH_TOKEN/GITHUB_TOKEN HTTP 404 (private Repo naheliegend).')
        info('Release-Statusabfrage wird uebersprungen. Setze GH_TOKEN/GITHUB_TOKEN, um Releases hier zu verfolgen.')
        return null
      }

      info('Release noch nicht angelegt, warte weiter...')
      await sleep(pollIntervalMs)
      continue
    }

    if (!result.ok) {
      throw new Error(`Failed to query release ${tagName} (HTTP ${result.status}). ${result.text || ''}`)
    }

    const assets = Array.isArray(result.data?.assets) ? result.data.assets : []
    if (!assets.length) {
      info('Release ist da, Assets werden noch veroeffentlicht...')
      await sleep(pollIntervalMs)
      continue
    }

    info(`Release bereit mit ${assets.length} Assets.`)
    return result.data
  }

  throw new Error(`Timed out while waiting for release ${tagName}`)
}

async function main() {
  const argVersion = getArgValue('--version') || String(process.argv[2] || '').trim()
  const requestedVersion = await askVersionIfMissing(argVersion)
  const version = normalizeVersionInput(requestedVersion)
  const tagName = `v${version}`
  const repositorySlug = parseRepositorySlug()
  const branchName = getCurrentBranchName()
  const rootVersion = String(readPackageJson(ROOT_DIR)?.version || '').trim()

  if (rootVersion === version) {
    throw new Error(`Root package.json already uses version ${version}. Provide a newer version.`)
  }

  assertCleanGitWorktree()
  assertTagDoesNotExist(tagName)

  info(`Setze Versionen auf ${version}...`)
  updateAllPackageVersions(version)

  info('Stage und Commit der Versionsdateien...')
  stageVersionFiles()
  run('git', ['commit', '-m', `chore: prepare release ${tagName}`])

  info(`Tag ${tagName} erstellen...`)
  run('git', ['tag', '-a', tagName, '-m', `release ${tagName}`])

  info(`Push branch ${branchName}...`)
  run('git', ['push', 'origin', branchName])

  info(`Push tag ${tagName}...`)
  run('git', ['push', 'origin', tagName])

  const workflowRun = await waitForWorkflowCompletion(repositorySlug, tagName)
  const release = await waitForRelease(repositorySlug, tagName, {
    allowUnauthenticated404Skip: !workflowRun && !AUTH_TOKEN,
  })

  const releaseUrl = String(release?.html_url || '').trim()
  const assets = Array.isArray(release?.assets) ? release.assets : []

  const runUrl = String(workflowRun?.html_url || '').trim()
  if (runUrl) {
    info(`Fertig. Run: ${runUrl}`)
  } else {
    info('Fertig. Run-URL nicht verfuegbar (Remote-Status nicht verifiziert).')
  }
  if (releaseUrl) {
    info(`Release: ${releaseUrl}`)
  }

  if (assets.length) {
    info('Assets:')
    for (const asset of assets) {
      const name = String(asset?.name || '').trim()
      if (!name) continue
      process.stdout.write(`  - ${name}\n`)
    }
  }
}

main().catch((error) => {
  fail(error?.message || String(error))
  process.exitCode = 1
})
