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

function npmInvocation() {
  if (process.env.npm_execpath && fs.existsSync(process.env.npm_execpath)) {
    return { command: process.execPath, args: [process.env.npm_execpath] }
  }

  if (process.platform === 'win32') {
    return { command: 'cmd.exe', args: ['/d', '/c', 'npm.cmd'] }
  }

  return { command: 'npm', args: [] }
}

const npm = npmInvocation()

fs.rmSync(desktopFrontendDir, { force: true, recursive: true })

run(npm.command, [...npm.args, '--prefix', frontendDir, 'run', 'build'], {
  env: {
    ...process.env,
    VITE_API_BASE_URL: '',
  },
})

fs.mkdirSync(path.dirname(desktopFrontendDir), { recursive: true })
fs.cpSync(path.join(frontendDir, 'dist'), desktopFrontendDir, { recursive: true })
