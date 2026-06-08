const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const desktopDir = path.resolve(__dirname, '..')
const venvDir = path.join(desktopDir, '.venv')
const distBackendDir = path.join(desktopDir, 'dist', 'backend')
const pyinstallerBuildDir = path.join(desktopDir, 'build', 'pyinstaller')
const isWindows = process.platform === 'win32'

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

function pythonCommand() {
  if (process.env.PYTHON) {
    return { command: process.env.PYTHON, args: [] }
  }

  if (isWindows) {
    return { command: 'py', args: ['-3'] }
  }

  return { command: 'python3', args: [] }
}

function venvExecutable(name) {
  return path.join(venvDir, isWindows ? 'Scripts' : 'bin', isWindows ? `${name}.exe` : name)
}

const python = pythonCommand()
const venvPython = venvExecutable('python')

if (fs.existsSync(venvDir) && !fs.existsSync(venvPython)) {
  fs.rmSync(venvDir, { force: true, recursive: true })
}

if (!fs.existsSync(venvDir)) {
  run(python.command, [...python.args, '-m', 'venv', venvDir])
}

const pyinstaller = venvExecutable('pyinstaller')

run(venvPython, ['-m', 'pip', 'install', '--upgrade', 'pip'])
run(venvPython, ['-m', 'pip', 'install', '-r', path.join(desktopDir, 'requirements.txt')])

fs.rmSync(distBackendDir, { force: true, recursive: true })
fs.rmSync(pyinstallerBuildDir, { force: true, recursive: true })

run(pyinstaller, [
  path.join(desktopDir, 'backend_launcher.spec'),
  '--noconfirm',
  '--distpath',
  distBackendDir,
  '--workpath',
  pyinstallerBuildDir,
])
