# Six Degrees of Anime Desktop

Electron packaging for running Six Degrees of Anime as a Linux desktop app with the React frontend and FastAPI backend bundled together.

## Requirements

- Node.js and npm
- Python 3.11+

## Install

```bash
cd desktop
npm install
```

## Build

Build the React frontend and the PyInstaller backend executable:

```bash
npm run build
```

The desktop frontend is built with `VITE_API_BASE_URL=` so requests use relative `/api` paths. Electron serves the built frontend locally and proxies `/api` to the bundled backend.

## Run Locally

After `npm run build`:

```bash
npm start
```

The app stores its desktop cache database in Electron's per-user app data directory, not in `backend/data/anime_cache.db`.

## Package

Create an unpacked Linux app for smoke testing:

```bash
npm run pack
```

Create the Linux distributable:

```bash
npm run dist:linux
```

Build output is written to `desktop/release/`.

