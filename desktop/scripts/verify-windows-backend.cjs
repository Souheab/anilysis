const fs = require('node:fs')
const path = require('node:path')

const backendExecutable = path.resolve(__dirname, '..', 'dist', 'backend', 'animeanalysis-backend.exe')

if (!fs.existsSync(backendExecutable)) {
  console.error(`Missing Windows backend executable: ${backendExecutable}`)
  console.error('Run npm run build on Windows before packaging with npm run dist:win.')
  process.exit(1)
}
