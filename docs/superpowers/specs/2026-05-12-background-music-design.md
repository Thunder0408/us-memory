# Background Music Feature — Design Spec

**Date:** 2026-05-12  
**Project:** Us Memory  
**Status:** Approved

---

## Context

Thunder and BF want to play shared background music while browsing their couple diary. The music should feel like a shared listening experience — when one person picks a song, the other hears it too at approximately the same moment. The player should be unobtrusive (a floating corner widget) and persist across all page navigations so music doesn't stop when switching between Calendar, Day view, and Gallery.

---

## Requirements

- YouTube-only (supports seeking for sync; no API key needed for title fetching via oEmbed)
- Both users share one queue and one playback state
- Either user can add, skip, or remove songs
- Paste a YouTube URL to add a song — title is fetched automatically
- Widget floats in the bottom-right corner, always on top of page content
- Two visual states: **collapsed** (pill with song name + play/pause) and **expanded** (full controls + queue list)
- Music persists across hash-based page navigation (widget lives outside the routed view)
- Approximate sync: a new client calculates how far into the song to seek based on `started_at` timestamp

---

## Architecture

### Data Layer — two new SQLite tables (added to `server.js` schema setup)

**`music_queue`**
```sql
CREATE TABLE IF NOT EXISTS music_queue (
  id TEXT PRIMARY KEY,
  youtube_url TEXT NOT NULL,
  title TEXT NOT NULL,
  added_by TEXT NOT NULL,
  position INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
```

**`music_state`**
```sql
CREATE TABLE IF NOT EXISTS music_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- Keys: current_id, started_at, paused_at, is_playing
```

`music_state` is a simple key-value store. `started_at` is a Unix timestamp (ms) of when the current song started from position 0. When paused, `paused_at` stores the elapsed ms. On resume, `started_at` is recalculated as `now - paused_at` so position is preserved.

### API Routes — all added to `server.js`

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/music/state` | Returns current song, queue, playback state |
| `POST` | `/api/music/queue` | Add song `{ youtube_url, title }` to end of queue |
| `DELETE` | `/api/music/queue/:id` | Remove a song from the queue |
| `POST` | `/api/music/play` | Play a specific song by queue ID (sets `started_at = now`) |
| `POST` | `/api/music/pause` | Pause, recording elapsed position |
| `POST` | `/api/music/skip` | Advance to next song in queue |

All routes require `requireAuth`.

`GET /api/music/state` response shape:
```json
{
  "queue": [{ "id": "...", "youtube_url": "...", "title": "...", "added_by": "...", "position": 0 }],
  "current_id": "abc",
  "is_playing": true,
  "started_at": 1715500000000,
  "paused_at": null
}
```

### Frontend — `public/app.js` + `public/index.html`

**`index.html` changes:**
- Load YouTube IFrame Player API: `<script src="https://www.youtube.com/iframe_api"></script>`
- Add a hidden YouTube iframe container `<div id="yt-player"></div>` (off-screen)
- Add music widget markup `<div id="music-widget"></div>` (persistent, outside `#app`)

**`app.js` changes:**

New state variables:
```js
let musicState = null;   // last fetched state from server
let ytPlayer = null;     // YT.Player instance
let musicPollTimer = null;
let widgetExpanded = false;
```

New functions:
- `initMusicWidget()` — called once on page load; creates `YT.Player`, starts polling, renders widget
- `pollMusicState()` — fetches `/api/music/state` every 5s; calls `syncPlayback()` if state changed
- `syncPlayback(state)` — if `is_playing`, seeks player to `(now - started_at) / 1000` seconds; if paused, pauses at `paused_at / 1000`
- `renderMusicWidget()` — renders collapsed or expanded widget HTML into `#music-widget`
- `addToQueue(youtubeUrl)` — fetches title from YouTube oEmbed, POSTs to `/api/music/queue`, auto-plays if queue was empty
- `removeSong(id)` — DELETEs from queue
- `skipSong()` — POSTs to `/api/music/skip`
- `togglePlayPause()` — POSTs to `/api/music/play` or `/api/music/pause`
- `extractYouTubeId(url)` — parses video ID from any YouTube URL format

**YouTube title fetch (no API key):**
```
GET https://www.youtube.com/oembed?url=<youtube_url>&format=json
→ { title: "Song Name" }
```

**Sync logic:**
- On `pollMusicState`: compare `started_at` and `is_playing` with previous state
- If changed, call `ytPlayer.seekTo((Date.now() - state.started_at) / 1000)`
- Tolerance: skip seek if client is within ±3 seconds of target (avoids constant micro-seeking)

### Widget UI

**Collapsed state** (pill, bottom-right corner):
```
[ 🎵(spinning) | Lover - Taylor Swift   | ⏸ | ︿ ]
                  2 songs in queue
```

**Expanded state** (card, bottom-right corner):
```
┌──────────────────────────────┐
│  🎵  Lover                ✕  │  ← gradient header
│      Taylor Swift             │
│      Added by Thunder         │
├──────────────────────────────┤
│      ⏮    ⏸    ⏭            │
│  ████████░░░░░  1:24 / 3:41  │
├──────────────────────────────┤
│  Queue                [+ Add]│
│  ▶ Lover - Taylor Swift    ✕ │  ← currently playing
│  2  Perfect - Ed Sheeran   ✕ │
├──────────────────────────────┤
│  🔈 ─────────────────── 🔊   │
└──────────────────────────────┘
```

**Add URL flow:** clicking `+ Add` shows an inline input inside the expanded widget. On submit, title is auto-fetched and song is appended to queue.

**Empty queue state:** Widget still renders but shows "No songs yet — add a YouTube URL" instead of song info. Play/skip controls are hidden.

**Song ends (YouTube `onStateChange = YT.PlayerState.ENDED`):** Frontend calls `POST /api/music/skip`. If there is a next song, it begins playing. If the queue is exhausted, `current_id` is set to `null` and `is_playing` to `false` — widget returns to the empty state.

### CSS — added to `public/style.css`

New rules for `#music-widget`, `.music-widget-collapsed`, `.music-widget-expanded` — uses existing CSS variables (`--primary`, `--card`, `--border`, `--shadow`, `--radius`, `--text`, `--text-light`). Widget has `position: fixed; bottom: 20px; right: 20px; z-index: 1000`.

---

## Sync Mechanism Detail

| Event | Server action | Other client effect |
|---|---|---|
| User presses Play | Records `started_at = now`, `is_playing = true` | Next poll seeks to `(now - started_at) / 1000` |
| User presses Pause | Records `paused_at = elapsed_ms`, `is_playing = false` | Next poll pauses player |
| User presses Skip | Advances `current_id`, resets `started_at = now` | Next poll loads new video and plays from 0 |
| User resumes | Recalculates `started_at = now - paused_at`, clears `paused_at` | Next poll seeks to correct position |

Poll interval: 5 seconds. This gives <5s desync, which is acceptable for background music.

---

## Out of Scope

- Spotify support (seeking not possible with free embeds)
- Volume sync between users (volume is local only)
- Song history / play counts
- Mobile-specific mini player (widget works on mobile at same position)

---

## Verification

1. Start server: `node server.js`
2. Open site in two browsers (one as Thunder, one as BF)
3. In Thunder's browser: paste a YouTube URL, add to queue, press play
4. Verify BF's browser auto-starts the same song within 5 seconds and seeks to ~the same position
5. Pause in Thunder's browser — verify BF's browser pauses within 5 seconds
6. Skip in Thunder's browser — verify both browsers advance to next song
7. Add a second song from BF's browser — verify Thunder sees it in the queue
8. Navigate between Calendar / Day / Gallery — verify music keeps playing uninterrupted
