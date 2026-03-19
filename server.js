import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// Set up SQLite inside the Render persistent disk folder or local root
const dbPath = process.env.RENDER ? '/data/database.sqlite' : 'database.sqlite';
const db = new Database(dbPath, { verbose: console.log });
db.pragma('journal_mode = WAL');

// --- Create DB schema ---
db.exec(`
  CREATE TABLE IF NOT EXISTS folders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    createdAt INTEGER
  );

  CREATE TABLE IF NOT EXISTS sets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    folderId INTEGER,
    createdAt INTEGER
  );

  CREATE TABLE IF NOT EXISTS cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    setId INTEGER,
    front TEXT,
    back TEXT,
    createdAt INTEGER
  );
`);

// ======================== API ENDPOINTS ========================

// Folders
app.get('/api/folders', (req, res) => {
    res.json(db.prepare('SELECT * FROM folders').all());
});
app.post('/api/folders', (req, res) => {
    const { name, createdAt } = req.body;
    const info = db.prepare('INSERT INTO folders (name, createdAt) VALUES (?, ?)').run(name, createdAt);
    res.json({ id: info.lastInsertRowid });
});
app.put('/api/folders/:id', (req, res) => {
    const { name } = req.body;
    db.prepare('UPDATE folders SET name = ? WHERE id = ?').run(name, req.params.id);
    res.json({ success: true });
});
app.delete('/api/folders/:id', (req, res) => {
    const folderId = req.params.id;
    // Cascade delete manually (simpler than enforcing PRAGMA foreign_keys here)
    const sets = db.prepare('SELECT id FROM sets WHERE folderId = ?').all(folderId);
    for (const s of sets) {
        db.prepare('DELETE FROM cards WHERE setId = ?').run(s.id);
        db.prepare('DELETE FROM sets WHERE id = ?').run(s.id);
    }
    db.prepare('DELETE FROM folders WHERE id = ?').run(folderId);
    res.json({ success: true });
});

// Sets
app.get('/api/sets', (req, res) => {
    res.json(db.prepare('SELECT * FROM sets').all());
});
app.get('/api/sets/folder/:folderId', (req, res) => {
    res.json(db.prepare('SELECT * FROM sets WHERE folderId = ?').all(req.params.folderId));
});
app.get('/api/sets/:id', (req, res) => {
    res.json(db.prepare('SELECT * FROM sets WHERE id = ?').get(req.params.id) || null);
});
app.post('/api/sets', (req, res) => {
    const { title, folderId, createdAt } = req.body;
    const info = db.prepare('INSERT INTO sets (title, folderId, createdAt) VALUES (?, ?, ?)').run(title, folderId || null, createdAt);
    res.json({ id: info.lastInsertRowid });
});
app.put('/api/sets/:id', (req, res) => {
    const { title, folderId } = req.body;
    db.prepare('UPDATE sets SET title = ?, folderId = ? WHERE id = ?').run(title, folderId || null, req.params.id);
    res.json({ success: true });
});
app.delete('/api/sets/:id', (req, res) => {
    const setId = req.params.id;
    db.prepare('DELETE FROM cards WHERE setId = ?').run(setId);
    db.prepare('DELETE FROM sets WHERE id = ?').run(setId);
    res.json({ success: true });
});

// Cards
app.get('/api/cards/set/:setId', (req, res) => {
    res.json(db.prepare('SELECT * FROM cards WHERE setId = ?').all(req.params.setId));
});
app.post('/api/cards', (req, res) => {
    const { setId, front, back, createdAt } = req.body;
    const info = db.prepare('INSERT INTO cards (setId, front, back, createdAt) VALUES (?, ?, ?, ?)').run(setId, front, back, createdAt);
    res.json({ id: info.lastInsertRowid });
});
app.put('/api/cards/:id', (req, res) => {
    const { front, back } = req.body;
    db.prepare('UPDATE cards SET front = ?, back = ? WHERE id = ?').run(front, back, req.params.id);
    res.json({ success: true });
});
app.delete('/api/cards/:id', (req, res) => {
    db.prepare('DELETE FROM cards WHERE id = ?').run(req.params.id);
    res.json({ success: true });
});

// ======================== SERVE FRONTEND ========================
app.use(express.static(join(__dirname, 'dist')));
app.get('*', (req, res) => {
    res.sendFile(join(__dirname, 'dist', 'index.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Backend API + Static server running on port ${PORT}`);
});
