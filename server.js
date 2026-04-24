const express = require('express');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3002;
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS || 120000);

// Ensure data dir and DB
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const dbFile = path.join(dataDir, 'swimmers.db');
const db = new sqlite3.Database(dbFile);

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS practices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    title TEXT,
    content TEXT,
    created_at TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    practice_id INTEGER,
    role TEXT,
    content TEXT,
    created_at TEXT
  )`);
});

function dbRun(sql, params = []){
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err){ if(err) reject(err); else resolve(this); });
  });
}
function dbAll(sql, params = []){
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => { if(err) reject(err); else resolve(rows); });
  });
}

// Create a practice
app.post('/api/practice', async (req, res) => {
  const { title, content, sessionId } = req.body;
  if (!content) return res.status(400).json({ error: 'content required' });
  const sid = sessionId || 'default';
  try{
    const r = await dbRun('INSERT INTO practices (session_id, title, content, created_at) VALUES (?, ?, ?, datetime("now"))', [sid, title || '', content]);
    return res.json({ id: r.lastID });
  }catch(e){ return res.status(500).json({ error: e.toString() }); }
});

// Get practice and comments
app.get('/api/practice/:id', async (req, res) => {
  const id = Number(req.params.id);
  try{
    const rows = await dbAll('SELECT * FROM practices WHERE id = ?', [id]);
    if(!rows || rows.length === 0) return res.status(404).json({ error: 'not found' });
    const practice = rows[0];
    const comments = await dbAll('SELECT * FROM comments WHERE practice_id = ? ORDER BY id ASC', [id]);
    return res.json({ practice, comments });
  }catch(e){ return res.status(500).json({ error: e.toString() }); }
});

// Ask AI to comment on a practice
app.post('/api/comment', async (req, res) => {
  const { practiceId, sessionId } = req.body;
  if (!practiceId) return res.status(400).json({ error: 'practiceId required' });
  try{
    const pRows = await dbAll('SELECT * FROM practices WHERE id = ?', [practiceId]);
    if(!pRows || pRows.length === 0) return res.status(404).json({ error: 'practice not found' });
    const practice = pRows[0];

    const prev = await dbAll('SELECT role, content FROM comments WHERE practice_id = ? ORDER BY id ASC', [practiceId]);
    const messages = [];
    messages.push({ role: 'system', content: 'あなたは水泳コーチ向けの高度な分析アシスタントです。作成された練習プランについて、良い点、改善点、具体的な修正案（セット内容・インテンシティ・目的に沿った調整）を示してください。出力は日本語でお願いします。' });
    messages.push({ role: 'user', content: `練習タイトル: ${practice.title}\n\n練習内容:\n${practice.content}` });
    for(const c of prev) messages.push({ role: c.role, content: c.content });

    const payload = {
      model: process.env.GEMMA_MODEL || 'gemma4:26b',
      messages,
      temperature: 0.3,
    };

    const r = await axios.post('http://localhost:11434/v1/chat/completions', payload, { timeout: OLLAMA_TIMEOUT_MS });

    // save assistant replies
    try{
      if(r.data && r.data.choices){
        for(const c of r.data.choices){
          const text = (c.message && c.message.content) ? c.message.content : JSON.stringify(c);
          await dbRun('INSERT INTO comments (practice_id, role, content, created_at) VALUES (?, ?, ?, datetime("now"))', [practiceId, 'assistant', text]);
        }
      }
    }catch(e){ console.error('failed to save comment', e); }

    return res.json(r.data);
  }catch(e){ return res.status(500).json({ error: e.toString() }); }
});

app.listen(PORT, ()=>{ console.log(`AI Swimmers Note demo listening on http://localhost:${PORT}`); });
