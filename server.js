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
`);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 }
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
      const ext = MIME_TO_EXT[file.mimetype] || path.extname(file.originalname) || '';
      cb(null, `${uuidv4()}${ext}`);
    }
  }),
  limits: { fileSize: 500 * 1024 * 1024 }
});

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
  next();
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
app.get('/api/notes/:date', (req, res) => {
  const rows = db.prepare('SELECT * FROM notes WHERE date = ?').all(req.params.date);
  res.json(rows);
});

app.post('/api/notes', requireAuth, (req, res) => {
  const { date, content } = req.body;
  const author = req.session.user;
  db.prepare(`
    INSERT INTO notes (date, content, author) VALUES (?, ?, ?)
    ON CONFLICT(date, author) DO UPDATE SET content = ?, updated_at = CURRENT_TIMESTAMP
  `).run(date, content, author, content);
  res.json({ ok: true });
});

// --- Ratings ---
app.get('/api/ratings/:date', (req, res) => {
  const rows = db.prepare('SELECT * FROM ratings WHERE date = ?').all(req.params.date);
  res.json(rows);
});

app.post('/api/ratings', requireAuth, (req, res) => {
  const { date, rating } = req.body;
  const author = req.session.user;
  db.prepare(`
    INSERT INTO ratings (date, rating, author) VALUES (?, ?, ?)
    ON CONFLICT(date, author) DO UPDATE SET rating = ?, updated_at = CURRENT_TIMESTAMP
  `).run(date, rating, author, rating);
  res.json({ ok: true });
});

// --- Media ---
app.get('/api/media/:date', (req, res) => {
  const rows = db.prepare('SELECT * FROM media WHERE date = ? ORDER BY created_at DESC').all(req.params.date);
  res.json(rows);
});

app.get('/api/gallery', (req, res) => {
  const rows = db.prepare('SELECT * FROM media ORDER BY created_at DESC').all();
  res.json(rows);
});

app.post('/api/media', requireAuth, upload.array('files', 30), (req, res) => {
  const { date } = req.body;
  const author = req.session.user;
  const insert = db.prepare('INSERT INTO media (date, filename, original_name, mimetype, author) VALUES (?, ?, ?, ?, ?)');
  req.files.forEach(f => insert.run(date || null, f.filename, f.originalname, f.mimetype, author));
  res.json({ ok: true, count: req.files.length });
});

app.delete('/api/media/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM media WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const filePath = path.join(UPLOADS_DIR, row.filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  db.prepare('DELETE FROM media WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// --- Calendar summary ---
app.get('/api/calendar/:year/:month', (req, res) => {
  const prefix = `${req.params.year}-${req.params.month.padStart(2, '0')}`;
  const noteEntries = db.prepare(`SELECT date, author FROM notes WHERE date LIKE ? AND content != ''`).all(`${prefix}%`);
  const ratings = db.prepare('SELECT date, author, rating FROM ratings WHERE date LIKE ?').all(`${prefix}%`);
  const mediaCounts = db.prepare(`SELECT date, author, COUNT(*) as count FROM media WHERE date LIKE ? AND date IS NOT NULL GROUP BY date, author`).all(`${prefix}%`);
  res.json({ noteEntries, ratings, mediaCounts });
});

app.listen(PORT, () => {
  console.log(`\n💕 Our Memory is running!`);
  console.log(`   Local:  http://localhost:${PORT}`);
  console.log(`\n   Share your tunnel URL with BF so she can access it too.\n`);
});
