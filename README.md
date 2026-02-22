# Recoda — Screen & Audio Recorder

A browser-based screen and audio recorder with a premium dark UI.

## Project Structure

```
Recoda/
├── index.html          ← HTML shell (no inline CSS/JS)
├── css/                ← Modular stylesheets
│   ├── variables.css   ← Design tokens
│   ├── base.css        ← Reset, body, scrollbar
│   ├── layout.css      ← App container, header, responsive
│   ├── timer.css       ← Hero timer + animations
│   ├── preview.css     ← Monitor, rec badge, webcam PiP
│   ├── meters.css      ← Segmented VU bars
│   ├── controls.css    ← Primary & ghost buttons
│   ├── settings.css    ← Panel, toggles, selects
│   ├── recordings.css  ← List, rows, entry animation
│   └── components.css  ← Toast, banner, shortcuts
├── js/                 ← ES modules
│   ├── app.js          ← Entry point — wires everything
│   ├── state.js        ← Central state machine (EventTarget)
│   ├── recorder.js     ← MediaRecorder engine
│   ├── audio.js        ← AudioContext mixing & analysers
│   ├── meters.js       ← VU meter rendering & animation
│   ├── webcam.js       ← Webcam PiP + drag
│   ├── ui.js           ← DOM updates from state events
│   ├── recordings.js   ← Session list: add/play/download
│   ├── settings.js     ← Panel, MIME detection, constraints
│   ├── keyboard.js     ← Shortcut bindings
│   ├── toast.js        ← Notification system
│   └── utils.js        ← Shared helpers
└── README.md
```

## Getting Started

ES modules require HTTP — you can't open `index.html` via `file://`. Use a local server:

```bash
# Option 1: npx (no install needed)
npx -y serve .

# Option 2: Python
python3 -m http.server 3000
```

Then open `http://localhost:3000` (or the port shown) in Chrome or Edge.

## Architecture

The app uses a **central state machine** (`state.js`) that emits `statechange` events via `EventTarget`. Other modules subscribe to these events and update independently — no module reaches into another's DOM.

**States:** `idle` → `recording` → `paused` → `idle`

## Keyboard Shortcuts

| Key     | Action          |
| ------- | --------------- |
| `R`     | Start recording |
| `Space` | Pause / Resume  |
| `Esc`   | Stop recording  |

## Browser Requirements

- Chrome 72+ or Edge 79+
- MP4 recording requires Chrome 121+

## Environment Variables

For backend/API and migration scripts, configure:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_URL` (or `DATABASE_URL`) for `server/*.js` Postgres scripts
- `CORS_ORIGINS` comma-separated list of allowed browser origins in production
- `MAX_JSON_BODY` optional JSON request body limit (default `1mb`)
- `MAX_UPLOAD_BYTES` optional upload size limit in bytes (default `104857600`)

Example:

```bash
CORS_ORIGINS=https://your-domain.com,https://app.your-domain.com
```

In local development, localhost origins are allowed automatically.

## Testing

- `npm run lint` runs repository security/lint checks.
- `npm run test:api` runs Node API validation/auth tests.
- `npm run test:smoke` runs Playwright browser smoke tests.

CI workflow lives at `.github/workflows/ci.yml` and runs lint, API tests, npm audit, and browser smoke tests.
