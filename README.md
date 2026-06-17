# Anime Analysis

A small full-stack app for analyzing anime connections and relationships. Uses the AniList GraphQL API as a data source

## Requirements

- Python 3.11+
- Node.js and npm

## Setup

Install backend dependencies:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Install frontend dependencies:

```bash
cd ../frontend
npm install
```

## Run Locally

From the repository root:

```bash
./scripts/start.sh
```

The app will be available at:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:8000`

You can override the default ports with `FRONTEND_PORT` and `BACKEND_PORT`.

## Run With Docker

From the repository root:

```bash
docker compose up --build
```

The app will be available at `http://localhost:8080`.

By default, the Docker container only prints the localhost URL. To include
server logs while it runs:

```bash
VERBOSE_LOGS=1 docker compose up --build
```

## Build Desktop App

From the repository root:

```bash
./scripts/build_desktop.sh
```

This builds the Electron desktop frontend/backend and creates a Linux AppImage in `desktop/release/`.

To build the Windows desktop app, run this from Windows:

```bash
./scripts/build_desktop.sh win
```

The Windows build creates an NSIS installer and a portable executable in `desktop/release/`.
