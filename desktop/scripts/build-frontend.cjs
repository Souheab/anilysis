const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const desktopDir = path.resolve(__dirname, '..')
const repoRoot = path.resolve(desktopDir, '..')
const frontendDir = path.join(repoRoot, 'frontend')
const desktopFrontendDir = path.join(desktopDir, 'dist', 'frontend')

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: desktopDir,
    env: process.env,
    stdio: 'inherit',
    shell: false,
    ...options,
  })

  if (result.error) {
    console.error(result.error.message)
    process.exit(1)
  }

  if (result.status !== 0) {
    process.exit(result.status || 1)
  }
}

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'

fs.rmSync(desktopFrontendDir, { force: true, recursive: true })

run(npmCommand, ['--prefix', frontendDir, 'run', 'build'], {
  env: {
    ...process.env,
    VITE_API_BASE_URL: '',
  },
})

fs.mkdirSync(path.dirname(desktopFrontendDir), { recursive: true })
fs.cpSync(path.join(frontendDir, 'dist'), desktopFrontendDir, { recursive: true })
