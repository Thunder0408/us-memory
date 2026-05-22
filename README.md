# Us Memory ♡

A private couple diary and memory site for Thunder and BF. Log daily notes, rate your days, and share photos and videos — all tied to a shared calendar.

---

## Features

- **Calendar view** — Browse memories month by month; days with entries are highlighted
- **Daily diary** — Each person writes their own note for the day, stored separately and shown side by side
- **Day ratings** — Rate each day (1–10); both ratings appear together on the day view
- **Photo & video gallery** — Upload images and videos (up to 500 MB each) per day or to a shared gallery; supports JPEG, PNG, GIF, WebP, AVIF, HEIC, MP4, MOV, WebM, AVI, and more
- **Monthly summary** — Click the chart icon next to any month to see a stats modal: photo/video count, journal days, total word count, average day rating, and days rated
- **Lightbox viewer** — Full-screen image/video viewer with prev/next navigation
- **No-password login** — Pick your identity (Thunder or BF) from an avatar selector; session persists for 30 days
- **Shared music player** — YouTube-backed queue with play/pause/skip/restart/repeat controls; playback state is shared so both users stay in sync
- **Remote access** — Share via Tailscale Funnel so both can use the site from anywhere

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js |
| Server | Express 4 |
| Database | SQLite via better-sqlite3 |
| Sessions | express-session |
| File uploads | multer (UUID-named files) |
| Frontend | Vanilla JS SPA (no framework, no bundler) |
| Styling | Plain CSS with variables, responsive at 600px |
| Process manager | PM2 + pm2-windows-startup |
| Remote tunnel | Tailscale Funnel |

---

## Project Structure

```
us-memory/
├── server.js          # Express server — all API routes + SQLite schema
├── public/
│   ├── index.html     # Single HTML shell
│   ├── app.js         # Vanilla JS SPA (hash routing: #login, #calendar, #day/YYYY-MM-DD, #gallery)
│   ├── style.css      # All styles
│   └── animals/       # Avatar images (capybara, chihuahua, monkey, piglet)
├── database/          # SQLite DB — memories.db (gitignored)
├── uploads/           # UUID-named media files (gitignored)
├── setup.bat          # First-time setup script
└── start-tunnel.bat   # Starts Tailscale Funnel for remote access
```

### Database Tables

- `notes` — `(date, author)` → diary text
- `ratings` — `(date, author)` → integer rating
- `media` — file metadata linked to a date and author
- `music_queue` — YouTube URLs with title, position, and who added them
- `music_state` — key/value store for shared playback state (current track, play/pause, seek position, repeat)

---

## Installation

### Prerequisites

- [Node.js](https://nodejs.org) (LTS recommended)
- [PM2](https://pm2.keymetrics.io/) for auto-start on Windows login (installed by setup script)
- [Tailscale](https://tailscale.com/) (optional, for remote access)

### First-Time Setup (Windows)

Run the setup script — it installs dependencies, sets up PM2, and starts the server:

```bat
setup.bat
```

The server will be available at `http://localhost:3001` and will auto-start on Windows login.

### Manual Setup

```bash
npm install
node server.js
```

Server runs on port `3001` by default. Override with the `PORT` environment variable.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | Port the server listens on |
| `SESSION_SECRET` | `us-memory-secret` | Secret key for session signing |

---

## Remote Access (Tailscale Funnel)

To share the site so both Thunder and BF can access it from anywhere:

1. Install [Tailscale](https://tailscale.com/) and log in
2. Rename the device to `usmemory` in the [Tailscale admin panel](https://login.tailscale.com/admin/machines)
3. Run `start-tunnel.bat`

The site will be permanently available at:

```
https://usmemory.tail01df1e.ts.net
```

---

## PM2 Commands

```bash
pm2 list                    # Show running processes
pm2 logs us-memory          # View server logs
pm2 restart us-memory       # Restart the server
pm2 stop us-memory          # Stop the server
```
