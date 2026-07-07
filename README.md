# Kitchen Timer

A mobile-first, installable web app for running multiple named kitchen timers.
Timers can be saved for reuse, found via search, and shared as links. **No
backend, no accounts** — all state lives in the browser (`localStorage`), and
shared timers are fully encoded in the link itself.

Built as a dependency-free Progressive Web App: hand-authored ES modules, a
strict CSP, and alarm sounds synthesised with the Web Audio API (so there are
zero binary audio assets and it works fully offline).

## Features

- **Multiple concurrent timers** with a live dashboard; expired timers pin to
  the top, the rest sort soonest-first.
- **Reliable across reloads, backgrounded tabs, and phone lock** — remaining
  time is always derived from an absolute `endTime`, never decremented, so it
  can't drift.
- **Save, search, edit, and delete** favourite timers, with undo (no confirm
  dialogs).
- **Share as a link** via the Web Share API (clipboard fallback). Opening a link
  shows a preview with Start / Save — it never auto-starts.
- **Five synthesised alarm sounds**, looping until dismissed, with vibration and
  visual fallbacks when audio is blocked.
- **Installable PWA**: offline precache, light/dark themes, system
  notifications, screen wake lock, and full keyboard/screen-reader support.

## Project layout

```
index.html              App shell (strict CSP, no inline script)
manifest.webmanifest    PWA manifest
sw.js                   Service worker (offline precache)
css/app.css             Styles (theming, layout)
js/                     ES modules
  main.js               Entry point, routing, wiring
  engine.js             Timer model + tick loop (source of truth)
  store.js              localStorage persistence + schema validation
  sounds.js             Web Audio alarm synthesis
  share.js              Share-URL encode/decode
  dial.js               Accessible h/m/s dial component
  dashboard.js          Running-timer cards
  newtimer.js           New-timer view (dials, presets, sounds, search)
  sharepreview.js       Incoming share-link preview
  settings.js           Settings sheet (theme, default sound, wake lock)
  theme.js notify.js wakelock.js toast.js util.js
icons/                  App icons (SVG source + generated PNGs)
scripts/                build / check / serve tooling
test/                   Unit tests (node:test)
```

## Develop

Requires Node 20+ (only used for tooling/tests — the app itself ships no
dependencies).

```bash
npm run serve     # static dev server at http://localhost:5173
npm test          # run the unit test suite
npm run check     # syntax-gate every module
npm run build     # validate + test + assemble ./dist (+ enforce size budget)
```

Because the app is unbundled, you can also open it with any static file server.
A service worker is registered, so use a fresh browser profile or unregister it
between runs when hacking on the shell.

## Deploy to Netlify

The repo is configured for Netlify via [`netlify.toml`](./netlify.toml):

- **Build command:** `npm run build`
- **Publish directory:** `dist`

`npm run build` runs the syntax gate and unit tests, copies the app into
`dist/`, and fails if the gzipped bundle (HTML + CSS + JS) exceeds the 100 KB
budget. `netlify.toml` also sets the production security headers (CSP with
`frame-ancestors`, `X-Content-Type-Options`, `Referrer-Policy`,
`Permissions-Policy`), a `no-cache` policy for the service worker, and an
SPA/share-link fallback to `index.html`.

### One-time setup

1. Push this repository to GitHub.
2. In Netlify, **Add new site → Import an existing project**, pick the repo.
3. Netlify reads `netlify.toml` automatically — no manual settings needed.
   (Build command `npm run build`, publish directory `dist`.)
4. Deploy. The PWA is installable from the deployed URL.

To deploy from the CLI instead:

```bash
npm i -g netlify-cli
netlify deploy --build --prod
```

## Privacy

No analytics, no network calls, no accounts. Everything stays on the device.
