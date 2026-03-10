# 🎵 SangeetX

Free full-song music player — Bollywood, Punjabi, Tamil & more. 320kbps. No login. No ads.

## 🚀 Deploy to Vercel (Free — 2 minutes)

### Option A — Drag & Drop (no Git needed)

1. Go to [vercel.com](https://vercel.com) → Sign up free (GitHub/Google)
2. Click **Add New → Project**
3. Scroll down → click **"Browse"** under *Import from your computer*  
   *(or just drag the unzipped folder onto the page)*
4. Click **Deploy**
5. Done ✅ — Vercel gives you a free `.vercel.app` URL instantly

### Option B — GitHub + Vercel (auto-deploy on every push)

1. Create a GitHub repo, upload these files
2. On Vercel → **Add New → Project → Import Git Repository**
3. Select your repo → click **Deploy**
4. Every `git push` auto-deploys 🎉

---

## 📁 Project Structure

```
sangeetx-vercel/
├── api/
│   ├── search.js      ← Vercel serverless function (replaces Netlify function)
│   └── lyrics.js      ← Vercel serverless function for lyrics
├── public/
│   ├── index.html
│   ├── style.css
│   ├── app.js
│   ├── data.js        ← calls /api/search and /api/lyrics
│   ├── sw.js
│   ├── manifest.json
│   └── icons/
│       ├── icon-192.png
│       └── icon-512.png
└── vercel.json        ← routes /api/* to functions, serves public/
```

**No npm, no build step.** Vercel detects the `api/` folder automatically.

---

## ✨ Features

- 🎵 Full songs at 320kbps via JioSaavn
- 🔍 Search songs, albums & artists
- 📂 Multiple playlists with custom icons/colors
- 🎚️ 8-band Equalizer with presets
- 🔊 Crossfade (2–8 seconds)
- ⏱️ Sleep timer
- 📖 Lyrics
- 📱 PWA — install to home screen
- 🔀 Shuffle, repeat, queue management
- ⌨️ Keyboard shortcuts (Space, ←→, L)

---

## 🔌 API

Uses [saavn.dev](https://saavn.dev) — free, open-source, no API key needed.  
The Vercel functions proxy requests server-side (avoids any CORS issues).
