# Background Music Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a shared YouTube background music player to the Us Memory website as a persistent floating corner widget that syncs playback state between both users in real time via polling.

**Architecture:** Two new SQLite tables (`music_queue`, `music_state`) store the shared queue and playback state in `server.js`. Seven new API routes expose queue and playback control. The frontend widget is a fixed DOM overlay outside `#app` (rendered by `app.js`) that polls `/api/music/state` every 5 seconds and uses the YouTube IFrame Player API to seek to the correct position for approximate sync. The widget has two visual states — a collapsed pill and an expanded card — and survives all hash-based page navigations.

**Tech Stack:** Node.js/Express, better-sqlite3, vanilla JS, YouTube IFrame Player API (no API key required)

---

## Files Modified

| File | Changes |
|---|---|
| `server.js` | 2 new SQLite tables, 2 helper functions, 7 new API routes |
| `public/index.html` | YouTube IFrame API `<script>`, hidden `#yt-player` div, `#music-widget` div |
| `public/style.css` | All widget CSS (collapsed + expanded states) |
| `public/app.js` | Music state vars, YouTube callback, helpers, action functions, sync logic, render function, init |

---

## Task 1: Database schema + state helpers

**Files:**
- Modify: `server.js`

- [ ] **Step 1: Add the two new tables to the schema setup block**

Find the section in `server.js` where `db.exec(...)` or `db.prepare(...).run()` creates the `notes`, `ratings`, and `media` tables. Add the following immediately after the `media` table creation:

```js
db.exec(`
  CREATE TABLE IF NOT EXISTS music_queue (
    id TEXT PRIMARY KEY,
    youtube_url TEXT NOT NULL,
    title TEXT NOT NULL,
    added_by TEXT NOT NULL,
    position INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS music_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);
```

- [ ] **Step 2: Add two helper functions after the schema block**

Add these immediately after the schema setup and before the first `app.get` / `app.post` route. They are the only way music routes read and write state, so define them once here:

```js
function getMusicVal(key, fallback = null) {
  const row = db.prepare('SELECT value FROM music_state WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

function setMusicVal(key, value) {
  db.prepare('INSERT OR REPLACE INTO music_state (key, value) VALUES (?, ?)').run(key, String(value));
}
```

- [ ] **Step 3: Verify tables are created**

```bash
node server.js
# In a second terminal:
sqlite3 "database/memories.db" ".tables"
```

Expected output includes: `music_queue  music_state`

Stop the server (`Ctrl+C`).

- [ ] **Step 4: Commit**

```bash
git add server.js
git commit -m "feat: add music_queue and music_state tables + getMusicVal/setMusicVal helpers"
```

---

## Task 2: GET /api/music/state

**Files:**
- Modify: `server.js`

- [ ] **Step 1: Add the route**

Add the following after all existing routes, just before `app.listen(...)`:

```js
// ── Music routes ──────────────────────────────────────────────────────────
app.get('/api/music/state', requireAuth, (req, res) => {
  const queue = db.prepare('SELECT * FROM music_queue ORDER BY position ASC').all();
  const current_id = getMusicVal('current_id', null);
  const rawStarted = getMusicVal('started_at');
  const rawPaused  = getMusicVal('paused_at');
  const started_at = rawStarted ? Number(rawStarted) : null;
  const paused_at  = rawPaused  ? Number(rawPaused)  : null;
  const is_playing = getMusicVal('is_playing') === 'true';
  const repeat     = getMusicVal('repeat') === 'true';
  res.json({ queue, current_id, started_at, paused_at, is_playing, repeat });
});
```

- [ ] **Step 2: Verify**

Start the server, log in through the browser, then run in the browser console:

```js
fetch('/api/music/state').then(r => r.json()).then(console.log)
```

Expected:
```json
{ "queue": [], "current_id": null, "started_at": null, "paused_at": null, "is_playing": false, "repeat": false }
```

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "feat: add GET /api/music/state route"
```

---

## Task 3: Queue management routes

**Files:**
- Modify: `server.js`

- [ ] **Step 1: Check for existing uuid import**

Look at the top of `server.js` for a line like `const { v4: uuidv4 } = require('uuid')` or `const uuid = require('uuid')`. If it exists, note the variable name used for generating UUIDs. If it does not exist, add this line near the other `require` statements at the top:

```js
const { v4: uuidv4 } = require('uuid');
```

- [ ] **Step 2: Add POST /api/music/queue**

```js
app.post('/api/music/queue', requireAuth, (req, res) => {
  const { youtube_url, title } = req.body;
  if (!youtube_url || !title) {
    return res.status(400).json({ error: 'youtube_url and title are required' });
  }
  const id = uuidv4();
  const maxRow = db.prepare('SELECT MAX(position) AS m FROM music_queue').get();
  const position = (maxRow.m != null ? maxRow.m : -1) + 1;
  db.prepare(
    'INSERT INTO music_queue (id, youtube_url, title, added_by, position, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, youtube_url, title, req.session.user, position, Date.now());
  // Auto-play if nothing is currently set
  if (!getMusicVal('current_id')) {
    setMusicVal('current_id', id);
    setMusicVal('started_at', Date.now());
    setMusicVal('is_playing', 'true');
    setMusicVal('paused_at', '');
  }
  res.json({ ok: true, id });
});
```

- [ ] **Step 3: Add DELETE /api/music/queue/:id**

```js
app.delete('/api/music/queue/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM music_queue WHERE id = ?').run(id);
  if (getMusicVal('current_id') === id) {
    const next = db.prepare('SELECT * FROM music_queue ORDER BY position ASC LIMIT 1').get();
    if (next) {
      setMusicVal('current_id', next.id);
      setMusicVal('started_at', Date.now());
      setMusicVal('paused_at', '');
      setMusicVal('is_playing', 'true');
    } else {
      setMusicVal('current_id', '');
      setMusicVal('is_playing', 'false');
    }
  }
  res.json({ ok: true });
});
```

- [ ] **Step 4: Verify**

In the browser console (logged in):

```js
// Add a song
const r = await fetch('/api/music/queue', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ youtube_url: 'https://www.youtube.com/watch?v=3tmd-ClpJxA', title: 'Test Song' })
}).then(r => r.json());
console.log(r); // Expected: { ok: true, id: "some-uuid" }

// Check state — should now have current_id and is_playing: true
const s = await fetch('/api/music/state').then(r => r.json());
console.log(s.current_id, s.is_playing); // Expected: "some-uuid", true
```

- [ ] **Step 5: Commit**

```bash
git add server.js
git commit -m "feat: add POST and DELETE /api/music/queue routes"
```

---

## Task 4: Playback control routes

**Files:**
- Modify: `server.js`

- [ ] **Step 1: Add POST /api/music/play**

```js
app.post('/api/music/play', requireAuth, (req, res) => {
  const { id } = req.body;
  const target = id || getMusicVal('current_id');
  if (!target) return res.status(400).json({ error: 'No song to play' });
  const rawPaused = getMusicVal('paused_at');
  const resumeOffset = rawPaused ? Number(rawPaused) : 0;
  setMusicVal('current_id', target);
  setMusicVal('started_at', Date.now() - resumeOffset);
  setMusicVal('paused_at', '');
  setMusicVal('is_playing', 'true');
  res.json({ ok: true });
});
```

- [ ] **Step 2: Add POST /api/music/pause**

```js
app.post('/api/music/pause', requireAuth, (req, res) => {
  const rawStarted = getMusicVal('started_at');
  const elapsed = rawStarted ? Date.now() - Number(rawStarted) : 0;
  setMusicVal('paused_at', elapsed);
  setMusicVal('is_playing', 'false');
  res.json({ ok: true });
});
```

- [ ] **Step 3: Add POST /api/music/skip**

```js
app.post('/api/music/skip', requireAuth, (req, res) => {
  const current_id = getMusicVal('current_id');
  const currentSong = current_id
    ? db.prepare('SELECT * FROM music_queue WHERE id = ?').get(current_id)
    : null;
  const next = currentSong
    ? db.prepare('SELECT * FROM music_queue WHERE position > ? ORDER BY position ASC LIMIT 1').get(currentSong.position)
    : db.prepare('SELECT * FROM music_queue ORDER BY position ASC LIMIT 1').get();
  if (next) {
    setMusicVal('current_id', next.id);
    setMusicVal('started_at', Date.now());
    setMusicVal('paused_at', '');
    setMusicVal('is_playing', 'true');
  } else {
    setMusicVal('current_id', '');
    setMusicVal('is_playing', 'false');
  }
  res.json({ ok: true });
});
```

- [ ] **Step 4: Add POST /api/music/repeat**

```js
app.post('/api/music/repeat', requireAuth, (req, res) => {
  const current = getMusicVal('repeat') === 'true';
  setMusicVal('repeat', !current);
  res.json({ repeat: !current });
});
```

- [ ] **Step 5: Verify play/pause cycle**

With a song in the queue (from Task 3 verification), run in browser console:

```js
// Pause
await fetch('/api/music/pause', { method: 'POST' }).then(r => r.json());
const s1 = await fetch('/api/music/state').then(r => r.json());
console.log('paused_at:', s1.paused_at, 'is_playing:', s1.is_playing);
// Expected: paused_at is a positive number, is_playing: false

// Resume
await fetch('/api/music/play', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: '{}'
}).then(r => r.json());
const s2 = await fetch('/api/music/state').then(r => r.json());
console.log('is_playing:', s2.is_playing, 'paused_at:', s2.paused_at);
// Expected: is_playing: true, paused_at: null
```

- [ ] **Step 6: Commit**

```bash
git add server.js
git commit -m "feat: add play, pause, skip, repeat routes"
```

---

## Task 5: index.html — YouTube API + widget container

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: Add three elements before `</body>`**

Open `public/index.html`. Immediately before the closing `</body>` tag, add:

```html
  <!-- YouTube IFrame Player API — must load after DOM -->
  <script src="https://www.youtube.com/iframe_api"></script>
  <!-- Offscreen YouTube player target (1×1px, off-screen) -->
  <div id="yt-player" style="position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;pointer-events:none;"></div>
  <!-- Music widget overlay — rendered by app.js, outside #app so it survives navigation -->
  <div id="music-widget"></div>
```

- [ ] **Step 2: Verify no regressions**

Start server. Open browser. Navigate through Login → Calendar → Day view → Gallery. No console errors. All existing UI works normally.

- [ ] **Step 3: Commit**

```bash
git add public/index.html
git commit -m "feat: add YouTube IFrame API and music widget container to index.html"
```

---

## Task 6: style.css — widget styles

**Files:**
- Modify: `public/style.css`

- [ ] **Step 1: Append all widget CSS at the end of style.css**

```css
/* ── Music Widget ──────────────────────────────────────────── */
#music-widget {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 1000;
  font-family: 'Nunito', sans-serif;
}

/* Collapsed pill ────────────────────────────────────────────── */
.mw-collapsed {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--card);
  border: 2px solid var(--border);
  border-radius: 50px;
  padding: 8px 14px 8px 10px;
  box-shadow: var(--shadow);
  cursor: pointer;
  min-width: 200px;
  max-width: 290px;
}

.mw-disc {
  width: 34px;
  height: 34px;
  background: linear-gradient(135deg, var(--primary) 0%, #c45a70 100%);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  color: #fff;
  flex-shrink: 0;
}

.mw-disc.spinning {
  animation: mw-spin 4s linear infinite;
}

@keyframes mw-spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}

.mw-info {
  flex: 1;
  overflow: hidden;
}

.mw-song-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mw-meta {
  font-size: 10px;
  color: var(--text-light);
}

.mw-empty-label {
  font-size: 12px;
  color: var(--text-light);
}

.mw-play-btn {
  background: var(--primary);
  border: none;
  border-radius: 50%;
  width: 28px;
  height: 28px;
  color: #fff;
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.mw-expand-btn {
  background: none;
  border: none;
  font-size: 14px;
  color: var(--text-light);
  cursor: pointer;
  padding: 0 2px;
  flex-shrink: 0;
}

/* Expanded card ─────────────────────────────────────────────── */
.mw-expanded {
  background: var(--card);
  border: 2px solid var(--border);
  border-radius: 20px;
  box-shadow: 0 8px 32px rgba(232,114,138,0.18);
  width: 240px;
  overflow: hidden;
}

.mw-header {
  background: linear-gradient(135deg, var(--primary) 0%, #c45a70 100%);
  padding: 14px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.mw-header-thumb {
  width: 40px;
  height: 40px;
  background: rgba(255,255,255,0.2);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  flex-shrink: 0;
}

.mw-header-info {
  flex: 1;
  overflow: hidden;
}

.mw-header-title {
  font-size: 13px;
  font-weight: 800;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mw-header-sub {
  font-size: 10px;
  color: rgba(255,255,255,0.75);
}

.mw-close-btn {
  background: none;
  border: none;
  color: rgba(255,255,255,0.8);
  font-size: 16px;
  cursor: pointer;
  flex-shrink: 0;
  line-height: 1;
}

.mw-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 12px 14px;
  border-bottom: 1.5px solid var(--border);
}

.mw-ctrl-btn {
  background: none;
  border: none;
  font-size: 18px;
  color: var(--primary);
  cursor: pointer;
  padding: 2px;
  line-height: 1;
}

.mw-ctrl-btn.repeat-off {
  opacity: 0.3;
}

.mw-big-play-btn {
  background: var(--primary);
  border: none;
  border-radius: 50%;
  width: 38px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 16px;
  cursor: pointer;
}

.mw-progress {
  padding: 0 14px 8px;
}

.mw-prog-bar {
  height: 3px;
  background: var(--border);
  border-radius: 2px;
  margin: 6px 0 4px;
}

.mw-prog-fill {
  height: 100%;
  background: var(--primary);
  border-radius: 2px;
  width: 0%;
  transition: width 0.5s linear;
}

.mw-prog-times {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: var(--text-light);
}

.mw-queue {
  border-bottom: 1.5px solid var(--border);
}

.mw-queue-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 14px 4px;
  font-size: 10px;
  font-weight: 800;
  color: var(--text-light);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.mw-add-btn {
  background: var(--primary-light);
  border: none;
  border-radius: 6px;
  padding: 3px 8px;
  font-size: 10px;
  font-weight: 800;
  color: var(--primary);
  cursor: pointer;
}

.mw-queue-list {
  max-height: 120px;
  overflow-y: auto;
}

.mw-queue-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  font-size: 11px;
}

.mw-queue-item.active {
  background: var(--primary-light);
}

.mw-q-icon {
  font-size: 10px;
  color: var(--primary);
  width: 14px;
  text-align: center;
  flex-shrink: 0;
}

.mw-q-num {
  font-size: 10px;
  color: var(--text-light);
  width: 14px;
  text-align: center;
  flex-shrink: 0;
}

.mw-q-title {
  flex: 1;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-weight: 600;
  color: var(--text);
}

.mw-q-del {
  background: none;
  border: none;
  font-size: 12px;
  color: var(--text-light);
  cursor: pointer;
  flex-shrink: 0;
  padding: 0;
}

.mw-add-input-row {
  display: flex;
  gap: 6px;
  padding: 8px 14px;
  border-top: 1.5px solid var(--border);
}

.mw-url-input {
  flex: 1;
  border: 1.5px solid var(--border);
  border-radius: 8px;
  padding: 5px 8px;
  font-size: 11px;
  font-family: 'Nunito', sans-serif;
  color: var(--text);
  outline: none;
  min-width: 0;
}

.mw-url-input:focus {
  border-color: var(--primary);
}

.mw-url-submit {
  background: var(--primary);
  border: none;
  border-radius: 8px;
  padding: 5px 10px;
  font-size: 11px;
  font-weight: 700;
  color: #fff;
  cursor: pointer;
  flex-shrink: 0;
}

.mw-footer {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
}

.mw-vol-icon {
  font-size: 12px;
  color: var(--text-light);
}

.mw-vol-track {
  flex: 1;
  height: 3px;
  background: var(--border);
  border-radius: 2px;
  cursor: pointer;
  position: relative;
}

.mw-vol-fill {
  height: 100%;
  background: var(--primary);
  border-radius: 2px;
  width: 70%;
  pointer-events: none;
}
```

- [ ] **Step 2: Verify no visual regressions**

Reload browser. All existing pages (login, calendar, day view, gallery) look unchanged. No CSS errors in console.

- [ ] **Step 3: Commit**

```bash
git add public/style.css
git commit -m "feat: add music widget CSS styles"
```

---

## Task 7: app.js — state vars, YouTube callback, helper functions

**Files:**
- Modify: `public/app.js`

- [ ] **Step 1: Add music state variables**

Find where existing top-level `let` state variables are declared in `app.js` (e.g. `let currentUser`, `let calMonth`). Add these immediately after:

```js
// Music player
let musicState    = null;
let ytPlayer      = null;
let ytPlayerReady = false;
let musicPollTimer = null;
let progressTimer  = null;
let widgetExpanded = false;
let showAddInput   = false;
let localRepeat    = false;
```

- [ ] **Step 2: Add the global YouTube IFrame API callback**

This function **must** be declared at the top level of `app.js` (not nested inside any other function). YouTube's API script calls `window.onYouTubeIframeAPIReady` automatically when it loads:

```js
function onYouTubeIframeAPIReady() {
  ytPlayer = new YT.Player('yt-player', {
    height: '1',
    width: '1',
    playerVars: { autoplay: 0, controls: 0 },
    events: {
      onReady: () => { ytPlayerReady = true; },
      onStateChange: (e) => {
        if (e.data === YT.PlayerState.ENDED) {
          if (localRepeat) {
            ytPlayer.seekTo(0);
            ytPlayer.playVideo();
          } else {
            api('POST', '/api/music/skip').then(pollMusicState);
          }
        }
      }
    }
  });
}
```

- [ ] **Step 3: Add helper utilities**

```js
function extractYouTubeId(url) {
  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /\/embed\/([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

function formatTime(secs) {
  if (!secs || isNaN(secs)) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
```

- [ ] **Step 4: Verify no syntax errors**

Reload browser. Open DevTools console. No new JS errors.

- [ ] **Step 5: Commit**

```bash
git add public/app.js
git commit -m "feat: add music state vars, YouTube callback, and helper functions to app.js"
```

---

## Task 8: app.js — action functions

**Files:**
- Modify: `public/app.js`

- [ ] **Step 1: Add all music action functions**

```js
async function addToQueue(youtubeUrl) {
  const videoId = extractYouTubeId(youtubeUrl);
  if (!videoId) {
    alert('Invalid YouTube URL. Please paste a full YouTube link (e.g. https://www.youtube.com/watch?v=...)');
    return;
  }
  let title = youtubeUrl;
  try {
    const r = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
    );
    if (r.ok) {
      const data = await r.json();
      title = data.title;
    }
  } catch (_) {}
  await api('POST', '/api/music/queue', { youtube_url: youtubeUrl, title });
  showAddInput = false;
  await pollMusicState();
}

async function togglePlayPause() {
  if (!musicState) return;
  if (musicState.is_playing) {
    await api('POST', '/api/music/pause');
  } else {
    await api('POST', '/api/music/play', {});
  }
  await pollMusicState();
}

async function restartSong() {
  if (!musicState || !musicState.current_id) return;
  await api('POST', '/api/music/play', { id: musicState.current_id });
  await pollMusicState();
}

async function skipSong() {
  await api('POST', '/api/music/skip');
  await pollMusicState();
}

async function removeSong(id) {
  await api('DELETE', `/api/music/queue/${id}`);
  await pollMusicState();
}

async function toggleRepeat() {
  localRepeat = !localRepeat;   // optimistic — makes the button respond instantly
  renderMusicWidget();
  await api('POST', '/api/music/repeat');
}

function toggleWidgetExpanded() {
  widgetExpanded = !widgetExpanded;
  renderMusicWidget();
}

function toggleAddInput() {
  showAddInput = !showAddInput;
  renderMusicWidget();
  if (showAddInput) {
    setTimeout(() => {
      const inp = document.getElementById('mw-url-input');
      if (inp) inp.focus();
    }, 50);
  }
}

function submitAddUrl() {
  const inp = document.getElementById('mw-url-input');
  if (!inp || !inp.value.trim()) return;
  addToQueue(inp.value.trim());
}

function handleVolumeClick(e) {
  if (!ytPlayer || !ytPlayerReady) return;
  const rect = e.currentTarget.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  const volume = Math.round(ratio * 100);
  ytPlayer.setVolume(volume);
  const fill = e.currentTarget.querySelector('.mw-vol-fill');
  if (fill) fill.style.width = `${volume}%`;
}
```

- [ ] **Step 2: Verify no syntax errors**

Reload browser. No new console errors.

- [ ] **Step 3: Commit**

```bash
git add public/app.js
git commit -m "feat: add music action functions (play, pause, skip, repeat, queue management)"
```

---

## Task 9: app.js — syncPlayback + pollMusicState

**Files:**
- Modify: `public/app.js`

- [ ] **Step 1: Add syncPlayback**

```js
function syncPlayback(state, prev) {
  if (!ytPlayerReady || !ytPlayer) return;

  const currentSong = state.queue.find(s => s.id === state.current_id) || null;
  const prevSong    = prev && prev.queue ? prev.queue.find(s => s.id === prev.current_id) : null;

  if (!currentSong) {
    if (ytPlayer.stopVideo) ytPlayer.stopVideo();
    return;
  }

  const videoId = extractYouTubeId(currentSong.youtube_url);
  if (!videoId) return;

  const songChanged = !prevSong || prevSong.id !== currentSong.id;
  if (songChanged) {
    if (state.is_playing) {
      const seekTo = state.started_at ? Math.max(0, (Date.now() - state.started_at) / 1000) : 0;
      ytPlayer.loadVideoById(videoId, seekTo);
    } else {
      ytPlayer.cueVideoById(videoId, state.paused_at ? state.paused_at / 1000 : 0);
    }
    return;
  }

  const playerState = ytPlayer.getPlayerState ? ytPlayer.getPlayerState() : -1;

  if (state.is_playing) {
    const seekTo = state.started_at ? Math.max(0, (Date.now() - state.started_at) / 1000) : 0;
    const currentTime = ytPlayer.getCurrentTime ? ytPlayer.getCurrentTime() : 0;
    if (Math.abs(currentTime - seekTo) > 3) {
      ytPlayer.seekTo(seekTo, true);
    }
    if (playerState !== YT.PlayerState.PLAYING && playerState !== YT.PlayerState.BUFFERING) {
      ytPlayer.playVideo();
    }
  } else {
    if (playerState === YT.PlayerState.PLAYING) {
      ytPlayer.pauseVideo();
    }
  }
}
```

- [ ] **Step 2: Add pollMusicState**

```js
async function pollMusicState() {
  try {
    const state = await api('GET', '/api/music/state');
    const prev = musicState;
    musicState = state;
    localRepeat = state.repeat;
    syncPlayback(state, prev);
    renderMusicWidget();
  } catch (_) {}
}
```

- [ ] **Step 3: Verify**

Reload browser. In console:

```js
await pollMusicState()
console.log(musicState)
// Expected: { queue: [...], current_id: ..., is_playing: ..., repeat: false, ... }
```

- [ ] **Step 4: Commit**

```bash
git add public/app.js
git commit -m "feat: add syncPlayback and pollMusicState"
```

---

## Task 10: app.js — renderMusicWidget

**Files:**
- Modify: `public/app.js`

- [ ] **Step 1: Add renderMusicWidget**

```js
function renderMusicWidget() {
  const el = document.getElementById('music-widget');
  if (!el) return;

  const queue       = musicState ? musicState.queue : [];
  const currentSong = musicState ? queue.find(s => s.id === musicState.current_id) : null;
  const isPlaying   = musicState ? musicState.is_playing : false;

  if (!widgetExpanded) {
    el.innerHTML = `
      <div class="mw-collapsed" onclick="toggleWidgetExpanded()">
        <div class="mw-disc ${isPlaying ? 'spinning' : ''}">🎵</div>
        <div class="mw-info">
          ${currentSong
            ? `<div class="mw-song-title">${escHtml(currentSong.title)}</div>
               <div class="mw-meta">${queue.length} song${queue.length !== 1 ? 's' : ''} in queue</div>`
            : `<div class="mw-empty-label">No music playing</div>`}
        </div>
        ${currentSong ? `
          <button class="mw-play-btn" onclick="event.stopPropagation(); togglePlayPause()">
            ${isPlaying ? '⏸' : '▶'}
          </button>` : ''}
        <button class="mw-expand-btn" onclick="event.stopPropagation(); toggleWidgetExpanded()">︿</button>
      </div>`;
    return;
  }

  // ── Expanded ──
  const duration    = ytPlayer && ytPlayerReady && ytPlayer.getDuration    ? ytPlayer.getDuration()    : 0;
  const currentTime = ytPlayer && ytPlayerReady && ytPlayer.getCurrentTime ? ytPlayer.getCurrentTime() : 0;
  const progress    = duration > 0 ? (currentTime / duration) * 100 : 0;

  el.innerHTML = `
    <div class="mw-expanded">
      <div class="mw-header">
        <div class="mw-header-thumb">🎵</div>
        <div class="mw-header-info">
          <div class="mw-header-title">${currentSong ? escHtml(currentSong.title) : 'No song playing'}</div>
          ${currentSong ? `<div class="mw-header-sub">Added by ${escHtml(currentSong.added_by)}</div>` : ''}
        </div>
        <button class="mw-close-btn" onclick="toggleWidgetExpanded()">✕</button>
      </div>

      <div class="mw-controls">
        <button class="mw-ctrl-btn" onclick="restartSong()" ${!currentSong ? 'disabled' : ''}>⏮</button>
        <button class="mw-big-play-btn" onclick="togglePlayPause()" ${!currentSong ? 'disabled' : ''}>
          ${isPlaying ? '⏸' : '▶'}
        </button>
        <button class="mw-ctrl-btn" onclick="skipSong()" ${!currentSong ? 'disabled' : ''}>⏭</button>
        <button class="mw-ctrl-btn ${localRepeat ? '' : 'repeat-off'}" onclick="toggleRepeat()" title="Repeat one">🔁</button>
      </div>

      <div class="mw-progress">
        <div class="mw-prog-bar">
          <div class="mw-prog-fill" style="width:${progress.toFixed(1)}%"></div>
        </div>
        <div class="mw-prog-times">
          <span class="mw-current-time">${formatTime(currentTime)}</span>
          <span>${formatTime(duration)}</span>
        </div>
      </div>

      <div class="mw-queue">
        <div class="mw-queue-header">
          Queue
          <button class="mw-add-btn" onclick="toggleAddInput()">+ Add</button>
        </div>
        <div class="mw-queue-list">
          ${queue.length === 0
            ? `<div style="padding:8px 14px;font-size:11px;color:var(--text-light);">No songs yet — add a YouTube URL</div>`
            : queue.map((song, i) => `
                <div class="mw-queue-item ${song.id === (musicState && musicState.current_id) ? 'active' : ''}">
                  ${song.id === (musicState && musicState.current_id)
                    ? `<span class="mw-q-icon">▶</span>`
                    : `<span class="mw-q-num">${i + 1}</span>`}
                  <span class="mw-q-title" title="${escHtml(song.title)}">${escHtml(song.title)}</span>
                  <button class="mw-q-del" onclick="removeSong('${song.id}')">✕</button>
                </div>`).join('')}
        </div>
        ${showAddInput ? `
          <div class="mw-add-input-row">
            <input id="mw-url-input" class="mw-url-input"
              placeholder="Paste YouTube URL..."
              onkeydown="if(event.key==='Enter') submitAddUrl()">
            <button class="mw-url-submit" onclick="submitAddUrl()">Add</button>
          </div>` : ''}
      </div>

      <div class="mw-footer">
        <span class="mw-vol-icon">🔈</span>
        <div class="mw-vol-track" onclick="handleVolumeClick(event)">
          <div class="mw-vol-fill"></div>
        </div>
        <span class="mw-vol-icon">🔊</span>
      </div>
    </div>`;
}
```

- [ ] **Step 2: Verify no syntax errors**

Reload browser. No new console errors.

- [ ] **Step 3: Commit**

```bash
git add public/app.js
git commit -m "feat: add renderMusicWidget (collapsed + expanded states)"
```

---

## Task 11: app.js — initMusicWidget + wire to page load

**Files:**
- Modify: `public/app.js`

- [ ] **Step 1: Add initMusicWidget**

```js
function initMusicWidget() {
  renderMusicWidget();
  pollMusicState();
  musicPollTimer = setInterval(pollMusicState, 5000);
  // Update progress bar every second when expanded and playing
  progressTimer = setInterval(() => {
    if (!widgetExpanded || !musicState || !musicState.is_playing || !ytPlayerReady) return;
    const fill   = document.querySelector('.mw-prog-fill');
    const timeEl = document.querySelector('.mw-current-time');
    if (!fill || !timeEl || !ytPlayer) return;
    const current  = ytPlayer.getCurrentTime ? ytPlayer.getCurrentTime() : 0;
    const duration = ytPlayer.getDuration    ? ytPlayer.getDuration()    : 0;
    if (duration > 0) {
      fill.style.width    = `${(current / duration) * 100}%`;
      timeEl.textContent  = formatTime(current);
    }
  }, 1000);
}
```

- [ ] **Step 2: Call initMusicWidget when the user is confirmed logged in**

In `app.js`, find the section that runs on page load — it checks `GET /api/me`, sets `currentUser`, and calls `renderRoute()`. Add `initMusicWidget()` in the same block, right after `renderRoute()` is called and only when a user is confirmed logged in. It will look something like this (the exact surrounding code will vary — adapt accordingly):

```js
// Example of what the existing block might look like.
// Find it and add initMusicWidget() as shown:
api('GET', '/api/me').then(data => {
  if (data.user) {
    currentUser = data.user;
    renderRoute();
    initMusicWidget();   // ← add this line
  } else {
    navigate('login');
  }
});
```

- [ ] **Step 3: Full end-to-end verification**

Open `http://localhost:3001` in **two browser windows** — log in as Thunder in one, BF in the other.

**Verify the widget appears:**
- Collapsed pill appears in the bottom-right corner showing "No music playing"
- Click ︿ — expanded card opens with empty queue and "+ Add" button

**Verify adding a song:**
- Click "+ Add" — URL input appears inside the widget
- Paste `https://www.youtube.com/watch?v=3tmd-ClpJxA` and click Add
- Song title appears in the queue; playback starts automatically in the background
- The disc icon spins; collapsed pill shows the song title

**Verify sync (both browser windows open):**
- BF's browser: within 5 seconds the widget shows the same song playing at ~the same position
- Thunder clicks ⏸ — both browsers pause within 5 seconds
- Thunder clicks ▶ — both browsers resume

**Verify skip and queue:**
- BF adds a second song via "+ Add" — Thunder sees it appear within 5 seconds
- Thunder clicks ⏭ — both advance to the second song
- After last song, widget returns to idle (collapsed, "No music playing")

**Verify repeat:**
- Add one song, play it, click 🔁 — button becomes fully opaque (repeat on)
- Let the song play to the end — it restarts from the beginning automatically
- Click ⏭ skip while repeat is on — advances past the repeated song normally
- Click 🔁 again — button dims (repeat off)

**Verify navigation persistence:**
- While music is playing, navigate Calendar → Day view → Gallery
- Music keeps playing uninterrupted across all pages

- [ ] **Step 4: Commit**

```bash
git add public/app.js
git commit -m "feat: wire initMusicWidget to page load — shared background music complete"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** All 9 requirements covered. Tables, 7 routes, YouTube IFrame, widget states, sync, repeat, empty state, song-end behavior, navigation persistence.
- [x] **Placeholder scan:** No TBDs, TODOs, or "handle edge cases" phrases. Every step has complete code.
- [x] **Type consistency:** `getMusicVal`/`setMusicVal` used uniformly in Tasks 1–4. `extractYouTubeId`, `formatTime`, `escHtml` defined in Task 7 and used in Tasks 8–10. `pollMusicState` defined in Task 9, called in Tasks 8 and 11. `renderMusicWidget` defined in Task 10, called in Tasks 9 and 11. All CSS class names match between Task 6 and Task 10.
