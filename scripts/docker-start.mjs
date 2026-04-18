import { spawn } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import process from 'process'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT_DIR = path.resolve(__dirname, '..')
const DOWNLOADS_DIR = path.join(ROOT_DIR, 'downloads')
const BACKEND_DATA_DIR = path.join(ROOT_DIR, 'backend-data')
const FRONTEND_PORT = Number.parseInt(String(process.env.YLOADER_FRONTEND_PORT || '8080'), 10) || 8080

function info(message) {
  process.stdout.write(`[yloader] ${message}\n`)
}

function fail(message) {
  process.stderr.write(`[yloader] ERROR: ${message}\n`)
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function streamWithPrefix(stream, prefix, target) {
  let buffer = ''
  stream.setEncoding('utf8')
  stream.on('data', (chunk) => {
    buffer += chunk
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() ?? ''
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

function getReachableIpv4Addresses() {
  const interfaces = os.networkInterfaces()
  const addresses = new Set()

  for (const entries of Object.values(interfaces)) {
    if (!Array.isArray(entries)) continue

    for (const entry of entries) {
      if (!entry || entry.internal || entry.family !== 'IPv4') continue

      const address = String(entry.address || '').trim()
      if (!address || address.startsWith('169.254.')) continue

      addresses.add(address)
    }
  }

  return Array.from(addresses).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
}

function runCommand(command, args, options = {}) {
  const { cwd = ROOT_DIR, prefix = 'docker', captureOutput = false } = options

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })

    let stdout = ''
    let stderr = ''

    child.on('error', (error) => reject(error))

    if (captureOutput) {
      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString()
      })
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString()
      })
    } else {
      streamWithPrefix(child.stdout, prefix, process.stdout)
      streamWithPrefix(child.stderr, prefix, process.stderr)
    }

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr })
      } else {
        const output = (stderr || stdout || '').trim()
        const tail = output
          ? `\n${output.split(/\r?\n/).slice(-8).join('\n')}`
          : ''
        reject(new Error(`${command} ${args.join(' ')} exited with code ${code}.${tail}`))
      }
    })
  })
}

async function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const response = await fetch(url)
      if (response.ok || response.status < 500) {
        return true
      }
    } catch {
      // not ready
    }

    // eslint-disable-next-line no-await-in-loop
    await delay(1000)
  }

  return false
}

async function main() {
  info('Checking Docker availability...')
  try {
    await runCommand('docker', ['version'], { captureOutput: true })
  } catch (error) {
    throw new Error('Docker is not available or the Docker daemon is not running. Start Docker and try again.')
  }

  try {
    await runCommand('docker', ['compose', 'version'], { captureOutput: true })
  } catch (error) {
    throw new Error('Docker Compose v2 is not available. Install or enable Docker Compose and try again.')
  }

  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true })
  fs.mkdirSync(BACKEND_DATA_DIR, { recursive: true })

  info('Building images and starting containers...')
  await runCommand('docker', ['compose', 'up', '-d', '--build', '--remove-orphans'])

  info('Waiting for containers to become reachable...')
  const backendReady = await waitForHttp(`http://127.0.0.1:${FRONTEND_PORT}/health`, 90000)
  const frontendReady = await waitForHttp(`http://127.0.0.1:${FRONTEND_PORT}`, 90000)

  if (!backendReady) {
    info('Backend health endpoint is not ready yet. Check logs with: npm run docker:logs')
  }
  if (!frontendReady) {
    info('Frontend endpoint is not ready yet. Check logs with: npm run docker:logs')
  }

  process.stdout.write('\n')
  info('Docker stack is running.')
  process.stdout.write(`  App     : http://localhost:${FRONTEND_PORT}\n`)
  process.stdout.write(`  API     : http://localhost:${FRONTEND_PORT}/api\n`)
  process.stdout.write(`  Health  : http://localhost:${FRONTEND_PORT}/health\n`)

  const lanAddresses = getReachableIpv4Addresses()
  if (lanAddresses.length > 0) {
    process.stdout.write('  LAN URLs:\n')
    for (const address of lanAddresses) {
      process.stdout.write(`    - App   : http://${address}:${FRONTEND_PORT}\n`)
      process.stdout.write(`    - Health: http://${address}:${FRONTEND_PORT}/health\n`)
    }
  }

  process.stdout.write('  Logs    : npm run docker:logs\n')
  process.stdout.write('  Stop    : npm run docker:stop\n\n')
}

main().catch((error) => {
  fail(error.message || String(error))
  process.exit(1)
})
