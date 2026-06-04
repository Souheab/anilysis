# Anime Six Degrees

A small full-stack app for finding connections between anime. Uses the AniList GraphQL API as a data source

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

## Notes

The backend initializes its local database on startup and uses cached anime data to avoid repeated external requests where possible.