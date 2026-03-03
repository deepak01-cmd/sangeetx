# SangeetX — Deployment Guide

## Why this structure?
The previous version used `saavn.dev` — a third-party proxy that went offline.
This version runs its OWN backend on Netlify Functions (serverless), calling JioSaavn
directly from the server. No third-party proxy. No CORS issues. Full 320kbps songs.

## Folder structure
```
sangeetx5/
├── netlify.toml              ← Netlify config (auto-detected)
├── netlify/
│   └── functions/
│       └── api.js            ← Serverless function (the backend proxy)
└── public/
    ├── index.html
    ├── style.css
    ├── data.js
    └── app.js
```

## How to deploy on Netlify

### Option A — Netlify Drop (easiest, no account setup)
1. Go to https://app.netlify.com/drop
2. Drag the entire `sangeetx5` FOLDER onto the page
3. Done — it auto-deploys with the serverless function

### Option B — GitHub + Netlify (recommended for updates)
1. Push this folder to a GitHub repo
2. Go to https://app.netlify.com → "Add new site" → "Import from Git"
3. Select your repo
4. Build settings are auto-detected from `netlify.toml`
5. Deploy

## How it works
- Browser calls `/api?action=search&query=...`
- Netlify routes that to `netlify/functions/api.js`
- The function calls JioSaavn's own API server-side (no CORS)
- Returns clean JSON with full 320kbps MP3 URLs
- Browser plays audio with `<audio>` tag

## Local development
```bash
npm install -g netlify-cli
netlify dev
# Opens at http://localhost:8888
```
