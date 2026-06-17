const { app, BrowserWindow, dialog } = require('electron')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const http = require('node:http')
const net = require('node:net')
const path = require('node:path')

let mainWindow = null
let backendProcess = null
let frontendServer = null
let isQuitting = false

function getResourcePath(...parts) {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, ...parts)
  }
  return path.join(__dirname, 'dist', ...parts)
}

function getBackendExecutablePath() {
  const executableName = process.platform === 'win32'
    ? 'anime-six-degrees-backend.exe'
    : 'anime-six-degrees-backend'
  return getResourcePath('backend', executableName)
}

function findAvailablePort(host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, host, () => {
      const address = server.address()
      server.close(() => resolve(address.port))
    })
  })
}

function waitForBackend(port, attempts = 60) {
  return new Promise((resolve, reject) => {
    let attempt = 0

    const check = () => {
      attempt += 1
      const request = http.get(
        {
          host: '127.0.0.1',
          port,
          path: '/api/health',
          timeout: 1000,
        },
        (response) => {
          response.resume()
          if (response.statusCode === 200) {
            resolve()
            return
          }
          retry()
        },
      )

      request.on('error', retry)
      request.on('timeout', () => {
        request.destroy()
        retry()
      })
    }

    const retry = () => {
      if (attempt >= attempts) {
        reject(new Error('Backend did not become ready in time.'))
        return
      }
      setTimeout(check, 500)
    }

    check()
  })
}

function startBackend(port) {
  const backendPath = getBackendExecutablePath()
  if (!fs.existsSync(backendPath)) {
    throw new Error(`Missing backend executable at ${backendPath}. Run npm run build:backend first.`)
  }

  const userDataPath = app.getPath('userData')
  fs.mkdirSync(userDataPath, { recursive: true })
  const databasePath = path.join(userDataPath, 'anime_cache.db')

  const childProcess = spawn(backendPath, [], {
    env: {
      ...process.env,
      BACKEND_HOST: '127.0.0.1',
      BACKEND_PORT: String(port),
      DATABASE_URL: `sqlite:///${databasePath}`,
      PYTHONUNBUFFERED: '1',
    },
    stdio: app.isPackaged ? 'ignore' : 'inherit',
    windowsHide: true,
  })
  backendProcess = childProcess

  childProcess.on('exit', (code, signal) => {
    if (backendProcess === childProcess) {
      backendProcess = null
    }
    if (code !== 0 && signal !== 'SIGTERM' && signal !== 'SIGINT') {
      console.error(`Backend exited unexpectedly with code ${code} and signal ${signal}`)
    }
  })

  return childProcess
}

function getContentType(filePath) {
  switch (path.extname(filePath).toLowerCase()) {
    case '.css':
      return 'text/css; charset=utf-8'
    case '.html':
      return 'text/html; charset=utf-8'
    case '.js':
      return 'text/javascript; charset=utf-8'
    case '.json':
      return 'application/json; charset=utf-8'
    case '.png':
      return 'image/png'
    case '.svg':
      return 'image/svg+xml'
    case '.webp':
      return 'image/webp'
    default:
      return 'application/octet-stream'
  }
}

function proxyApiRequest(clientRequest, clientResponse, backendPort) {
  const proxyRequest = http.request(
    {
      host: '127.0.0.1',
      port: backendPort,
      method: clientRequest.method,
      path: clientRequest.url,
      headers: {
        ...clientRequest.headers,
        host: `127.0.0.1:${backendPort}`,
      },
    },
    (proxyResponse) => {
      clientResponse.writeHead(proxyResponse.statusCode || 502, proxyResponse.headers)
      proxyResponse.pipe(clientResponse)
    },
  )

  proxyRequest.on('error', (error) => {
    console.error('API proxy error:', error)
    clientResponse.writeHead(502, { 'Content-Type': 'application/json' })
    clientResponse.end(JSON.stringify({ detail: 'Desktop backend is not available.' }))
  })

  clientRequest.pipe(proxyRequest)
}

function startFrontendServer(frontendPort, backendPort) {
  const frontendDir = getResourcePath('frontend')
  const indexPath = path.join(frontendDir, 'index.html')

  if (!fs.existsSync(indexPath)) {
    throw new Error(`Missing frontend build at ${frontendDir}. Run npm run build:frontend first.`)
  }

  frontendServer = http.createServer((request, response) => {
    if (request.url && request.url.startsWith('/api/')) {
      proxyApiRequest(request, response, backendPort)
      return
    }

    const requestUrl = new URL(request.url || '/', `http://127.0.0.1:${frontendPort}`)
    const decodedPath = decodeURIComponent(requestUrl.pathname)
    const normalizedPath = path.normalize(decodedPath).replace(/^(\.\.[/\\])+/, '')
    const requestedPath = path.join(frontendDir, normalizedPath)
    const filePath = requestedPath.startsWith(frontendDir) && fs.existsSync(requestedPath) && fs.statSync(requestedPath).isFile()
      ? requestedPath
      : indexPath

    response.writeHead(200, {
      'Content-Type': getContentType(filePath),
      'Cache-Control': filePath === indexPath ? 'no-cache' : 'public, max-age=31536000, immutable',
    })
    fs.createReadStream(filePath).pipe(response)
  })

  return new Promise((resolve, reject) => {
    frontendServer.once('error', reject)
    frontendServer.listen(frontendPort, '127.0.0.1', () => {
      resolve(`http://127.0.0.1:${frontendPort}`)
    })
  })
}

function createWindow(appUrl) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1024,
    minHeight: 700,
    title: 'Six Degrees of Anime',
    frame: false,
    backgroundColor: '#02101f',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.loadURL(appUrl)
}

async function stopServices() {
  if (frontendServer) {
    await new Promise((resolve) => frontendServer.close(resolve))
    frontendServer = null
  }

  if (backendProcess && !backendProcess.killed) {
    const processToStop = backendProcess
    backendProcess = null
    await new Promise((resolve) => {
      const forceKillTimer = setTimeout(() => {
        processToStop.kill('SIGKILL')
        resolve()
      }, 5000)

      processToStop.once('exit', () => {
        clearTimeout(forceKillTimer)
        resolve()
      })

      processToStop.kill()
    })
  }
}

async function bootstrap() {
  const backendPort = await findAvailablePort()

  startBackend(backendPort)
  await waitForBackend(backendPort)
  const frontendPort = await findAvailablePort()
  const appUrl = await startFrontendServer(frontendPort, backendPort)
  createWindow(appUrl)
}

app.whenReady().then(() => {
  bootstrap().catch((error) => {
    console.error(error)
    dialog.showErrorBox('Unable to start Six Degrees of Anime', error.message)
    app.quit()
  })
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0 && frontendServer) {
    const address = frontendServer.address()
    createWindow(`http://127.0.0.1:${address.port}`)
  }
})

app.on('before-quit', async (event) => {
  if (isQuitting) {
    return
  }

  isQuitting = true
  event.preventDefault()
  await stopServices()
  app.exit(0)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
