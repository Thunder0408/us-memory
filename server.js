const express = require('express');
const Database = require('better-sqlite3');
const multer = require('multer');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3001;
const SESSION_SECRET = process.env.SESSION_SECRET || 'us-memory-secret';
const USERS = ['Thunder', 'BF'];

const DB_DIR = path.join(__dirname, 'database');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR);
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);

const db = new Database(path.join(DB_DIR, 'memories.db'));
db.exec(`
  CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    author TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(date, author)
  );
  CREATE TABLE IF NOT EXISTS ratings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    rating INTEGER NOT NULL,
    author TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(date, author)
  );
  CREATE TABLE IF NOT EXISTS media (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mimetype TEXT NOT NULL,
    author TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
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

function getMusicVal(key, fallback = null) {
  const row = db.prepare('SELECT value FROM music_state WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

function setMusicVal(key, value) {
  db.prepare('INSERT OR REPLACE INTO music_state (key, value) VALUES (?, ?)').run(key, String(value));
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: true }
}));

const MIME_TO_EXT = {
  'image/jpeg': '.jpg', 'image/jpg': '.jpg', 'image/png': '.png',
  'image/gif': '.gif', 'image/webp': '.webp', 'image/avif': '.avif',
  'image/heic': '.heic', 'image/heif': '.heif',
  'video/mp4': '.mp4', 'video/quicktime': '.mov', 'video/webm': '.webm',
  'video/x-msvideo': '.avi', 'video/ogg': '.ogv', 'video/3gpp': '.3gp'
};

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
      const ext = MIME_TO_EXT[file.mimetype];
      if (!ext) return cb(new Error(`Unsupported file type: ${file.mimetype}`));
      cb(null, `${uuidv4()}${ext}`);
    }
  }),
  limits: { fileSize: 500 * 1024 * 1024 }
});

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
  next();
}

function isValidDate(str) {
  return typeof str === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(str);
}

// --- Auth ---
app.post('/api/login', (req, res) => {
  const { user } = req.body;
  if (!USERS.includes(user)) return res.status(400).json({ error: 'Invalid user' });
  req.session.user = user;
  res.json({ user });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  res.json({ user: req.session.user || null });
});

// --- Notes ---
app.get('/api/notes/:date', requireAuth, (req, res) => {
  if (!isValidDate(req.params.date)) return res.status(400).json({ error: 'Invalid date' });
  const rows = db.prepare('SELECT * FROM notes WHERE date = ?').all(req.params.date);
  res.json(rows);
});

app.post('/api/notes', requireAuth, (req, res) => {
  const { date, content } = req.body;
  if (!isValidDate(date)) return res.status(400).json({ error: 'Invalid date' });
  const author = req.session.user;
  db.prepare(`
    INSERT INTO notes (date, content, author) VALUES (?, ?, ?)
    ON CONFLICT(date, author) DO UPDATE SET content = ?, updated_at = CURRENT_TIMESTAMP
  `).run(date, content, author, content);
  res.json({ ok: true });
});

// --- Ratings ---
app.get('/api/ratings/:date', requireAuth, (req, res) => {
  if (!isValidDate(req.params.date)) return res.status(400).json({ error: 'Invalid date' });
  const rows = db.prepare('SELECT * FROM ratings WHERE date = ?').all(req.params.date);
  res.json(rows);
});

app.post('/api/ratings', requireAuth, (req, res) => {
  const { date } = req.body;
  const rating = parseInt(req.body.rating, 10);
  if (!isValidDate(date)) return res.status(400).json({ error: 'Invalid date' });
  if (!Number.isInteger(rating) || rating < 1 || rating > 10) return res.status(400).json({ error: 'Rating must be 1–10' });
  const author = req.session.user;
  db.prepare(`
    INSERT INTO ratings (date, rating, author) VALUES (?, ?, ?)
    ON CONFLICT(date, author) DO UPDATE SET rating = ?, updated_at = CURRENT_TIMESTAMP
  `).run(date, rating, author, rating);
  res.json({ ok: true });
});

// --- Media ---
app.get('/api/media/:date', requireAuth, (req, res) => {
  if (!isValidDate(req.params.date)) return res.status(400).json({ error: 'Invalid date' });
  const rows = db.prepare('SELECT * FROM media WHERE date = ? ORDER BY created_at DESC').all(req.params.date);
  res.json(rows);
});

app.get('/api/gallery', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM media ORDER BY created_at DESC').all();
  res.json(rows);
});

app.post('/api/media', requireAuth, upload.array('files', 30), (req, res) => {
  const { date } = req.body;
  const author = req.session.user;
  const insert = db.prepare('INSERT INTO media (date, filename, original_name, mimetype, author) VALUES (?, ?, ?, ?, ?)');
  try {
    db.transaction(() => {
      req.files.forEach(f => insert.run(date || null, f.filename, f.originalname, f.mimetype, author));
    })();
    res.json({ ok: true, count: req.files.length });
  } catch (e) {
    req.files.forEach(f => { try { fs.unlinkSync(path.join(UPLOADS_DIR, f.filename)); } catch {} });
    res.status(500).json({ error: 'Upload failed' });
  }
});

app.delete('/api/media/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM media WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (row.author !== req.session.user) return res.status(403).json({ error: 'Not your file' });
  const filePath = path.join(UPLOADS_DIR, row.filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  db.prepare('DELETE FROM media WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// --- Calendar summary ---
app.get('/api/calendar/:year/:month', requireAuth, (req, res) => {
  if (!/^\d{4}$/.test(req.params.year) || !/^\d{1,2}$/.test(req.params.month)) return res.status(400).json({ error: 'Invalid year/month' });
  const prefix = `${req.params.year}-${req.params.month.padStart(2, '0')}`;
  const noteEntries = db.prepare(`SELECT date, author FROM notes WHERE date LIKE ? AND content != ''`).all(`${prefix}%`);
  const ratings = db.prepare('SELECT date, author, rating FROM ratings WHERE date LIKE ?').all(`${prefix}%`);
  const mediaCounts = db.prepare(`SELECT date, author, COUNT(*) as count FROM media WHERE date LIKE ? AND date IS NOT NULL GROUP BY date, author`).all(`${prefix}%`);
  res.json({ noteEntries, ratings, mediaCounts });
});

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

app.listen(PORT, () => {
  console.log(`\n💕 Our Memory is running!`);
  console.log(`   Local:  http://localhost:${PORT}`);
  console.log(`\n   Share your tunnel URL with BF so she can access it too.\n`);
});
