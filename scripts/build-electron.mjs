import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import process from 'process'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT_DIR = path.resolve(__dirname, '..')
const BACKEND_DIR = path.join(ROOT_DIR, 'backend')
const TOOLS_DIR = path.join(ROOT_DIR, '.tools')
const STAGE_DIR = path.join(ROOT_DIR, '.electron-build')
const STAGE_BACKEND_DIR = path.join(STAGE_DIR, 'backend')
const STAGE_TOOLS_DIR = path.join(STAGE_DIR, 'tools')
const SQLITE_SMOKE_FILE = path.join(STAGE_BACKEND_DIR, '.sqlite3-electron-smoke.cjs')

const IS_WINDOWS = process.platform === 'win32'
const NPM_CMD = IS_WINDOWS ? 'cmd.exe' : 'npm'
const require = createRequire(import.meta.url)
const ELECTRON_BINARY = require('electron')
const ELECTRON_BUILDER_CLI = require.resolve('electron-builder/cli.js')

function info(message) {
  process.stdout.write(`[electron-build] ${message}\n`)
}

function fail(message) {
  process.stderr.write(`[electron-build] ERROR: ${message}\n`)
}

function streamWithPrefix(stream, prefix, target) {
  let buffer = ''
  stream.setEncoding('utf8')
  stream.on('data', (chunk) => {
    buffer += chunk
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() || ''
    for (const line of lines) {
      target.write(`[${prefix}] ${line}\n`)
    }
  })
  stream.on('end', () => {
    if (buffer.trim().length > 0) {
      target.write(`[${prefix}] ${buffer}\n`)
    }
  })
}

function npmArgs(args) {
  return IS_WINDOWS ? ['/d', '/s', '/c', 'npm', ...args] : args
}

function runCommand(command, args, options = {}) {
  const { cwd = ROOT_DIR, env = process.env, prefix = 'cmd' } = options

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    streamWithPrefix(child.stdout, prefix, process.stdout)
    streamWithPrefix(child.stderr, prefix, process.stderr)

    child.on('error', (error) => reject(error))
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} ${args.join(' ')} failed with exit code ${code}.`))
    })
  })
}

function getElectronVersion() {
  const packageJsonPath = path.join(ROOT_DIR, 'package.json')
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
  const rawVersion = packageJson?.devDependencies?.electron || packageJson?.dependencies?.electron || ''
  const parsed = String(rawVersion).match(/\d+\.\d+\.\d+/)

  if (!parsed) {
    throw new Error('Could not determine Electron version from package.json.')
  }

  return parsed[0]
}

function stageBackendFiles() {
  fs.rmSync(STAGE_DIR, { recursive: true, force: true })
  fs.mkdirSync(STAGE_BACKEND_DIR, { recursive: true })

  fs.copyFileSync(path.join(BACKEND_DIR, 'package.json'), path.join(STAGE_BACKEND_DIR, 'package.json'))
  fs.copyFileSync(path.join(BACKEND_DIR, 'server.js'), path.join(STAGE_BACKEND_DIR, 'server.js'))
}

function stageToolBinaries() {
  if (!fs.existsSync(TOOLS_DIR)) {
    throw new Error('Missing .tools directory. Preparation step did not produce local binaries.')
  }

  fs.mkdirSync(STAGE_TOOLS_DIR, { recursive: true })
  fs.cpSync(TOOLS_DIR, STAGE_TOOLS_DIR, { recursive: true })
}

function writeSqliteSmokeScript() {
  const script = [
    "const sqlite3 = require('sqlite3').verbose()",
    "const db = new sqlite3.Database(':memory:', (err) => {",
    '  if (err) {',
    "    console.error(err && err.message ? err.message : String(err))",
    '    process.exit(1)',
    '  }',
    "  db.get('SELECT 1 AS ok', (queryErr, row) => {",
    '    if (queryErr || !row || row.ok !== 1) {',
    "      console.error(queryErr && queryErr.message ? queryErr.message : 'sqlite3 query check failed')",
    '      process.exit(1)',
    '    }',
    '    db.close((closeErr) => {',
    '      if (closeErr) {',
    "        console.error(closeErr && closeErr.message ? closeErr.message : String(closeErr))",
    '        process.exit(1)',
    '      }',
    "      process.stdout.write('sqlite3-electron-ok\\n')",
    '      process.exit(0)',
    '    })',
    '  })',
    '})',
    '',
  ].join('\n')

  fs.writeFileSync(SQLITE_SMOKE_FILE, script, 'utf8')
}

async function verifySqliteInElectronRuntime(prefix = 'backend:sqlite-check') {
  const checkEnv = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
  }

  await runCommand(ELECTRON_BINARY, [SQLITE_SMOKE_FILE], {
    cwd: STAGE_BACKEND_DIR,
    env: checkEnv,
    prefix,
  })
}

async function main() {
  const builderArgs = process.argv.slice(2)
  const electronVersion = getElectronVersion()

  info('Preparing local dependencies and tool binaries...')
  await runCommand(process.execPath, ['scripts/start.mjs', '--prepare-only'], { prefix: 'prepare' })

  info('Building frontend bundle...')
  await runCommand(NPM_CMD, npmArgs(['run', 'build', '--prefix', 'frontend']), { prefix: 'frontend:build' })

  info('Staging backend runtime files...')
  stageBackendFiles()

  info('Installing backend production dependencies into Electron stage...')
  await runCommand(NPM_CMD, npmArgs(['install', '--omit=dev', '--no-audit', '--no-fund']), {
    cwd: STAGE_BACKEND_DIR,
    prefix: 'backend:install',
  })

  info('Staging local yt-dlp/ffmpeg binaries...')
  stageToolBinaries()

  writeSqliteSmokeScript()

  info('Checking sqlite3 compatibility in Electron runtime...')
  let sqliteReady = true

  try {
    await verifySqliteInElectronRuntime('backend:sqlite-check')
  } catch {
    sqliteReady = false
  }

  if (!sqliteReady) {
    info('sqlite3 check failed. Attempting Electron-targeted rebuild...')

    const electronRebuildEnv = {
      ...process.env,
      npm_config_runtime: 'electron',
      npm_config_target: electronVersion,
      npm_config_disturl: 'https://electronjs.org/headers',
      npm_config_build_from_source: 'true',
    }

    await runCommand(NPM_CMD, npmArgs(['rebuild', 'sqlite3', '--build-from-source']), {
      cwd: STAGE_BACKEND_DIR,
      prefix: 'backend:rebuild',
      env: electronRebuildEnv,
    })

    await verifySqliteInElectronRuntime('backend:sqlite-check:post-rebuild')
  }

  info('Running electron-builder...')
  await runCommand(process.execPath, [ELECTRON_BUILDER_CLI, ...builderArgs], {
    prefix: 'builder',
  })

  fs.rmSync(SQLITE_SMOKE_FILE, { force: true })
}

main().catch((error) => {
  fail(error.message || String(error))
  process.exit(1)
})