// server.js — MediBook Hospital Appointment System
'use strict';
require('dotenv').config();

const express   = require('express');
const path      = require('path');
const fs        = require('fs');
const cors      = require('cors');
const rateLimit = require('express-rate-limit');
const session   = require('express-session');

// ── Inline DB setup ───────────────────────────────────────────
function setupDatabase() {
  const Database = require('better-sqlite3');
  const dbPath   = process.env.DB_PATH || '/tmp/medibook.sqlite';
  const dbDir    = path.dirname(path.resolve(dbPath));
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS doctors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL, specialty TEXT NOT NULL,
      emoji TEXT DEFAULT '👨‍⚕️', fee TEXT DEFAULT '$85',
      available_days TEXT DEFAULT 'Mon–Fri', rating REAL DEFAULT 4.5,
      bio TEXT, active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS patients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name TEXT NOT NULL, last_name TEXT NOT NULL,
      email TEXT NOT NULL, phone TEXT NOT NULL,
      dob TEXT, gender TEXT, blood_group TEXT, insurance TEXT,
      address TEXT, emergency_contact TEXT, allergies TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id TEXT UNIQUE NOT NULL,
      patient_id INTEGER NOT NULL, doctor_id INTEGER NOT NULL,
      appt_date TEXT NOT NULL, appt_slot TEXT NOT NULL,
      visit_type TEXT DEFAULT 'In-Person Visit',
      status TEXT DEFAULT 'confirmed',
      priority TEXT DEFAULT 'Routine',
      reason TEXT, notes TEXT, fee TEXT, email_sent INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (patient_id) REFERENCES patients(id),
      FOREIGN KEY (doctor_id)  REFERENCES doctors(id)
    );
    CREATE TABLE IF NOT EXISTS booked_slots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      doctor_id INTEGER NOT NULL, appt_date TEXT NOT NULL,
      appt_slot TEXT NOT NULL, appt_id INTEGER,
      UNIQUE(doctor_id, appt_date, appt_slot),
      FOREIGN KEY (doctor_id) REFERENCES doctors(id)
    );
    CREATE INDEX IF NOT EXISTS idx_appt_ticket   ON appointments(ticket_id);
    CREATE INDEX IF NOT EXISTS idx_appt_patient  ON appointments(patient_id);
    CREATE INDEX IF NOT EXISTS idx_patient_email ON patients(email);
  `);

  const count = db.prepare('SELECT COUNT(*) as c FROM doctors').get().c;
  if (count === 0) {
    const ins  = db.prepare(`INSERT INTO doctors (name,specialty,emoji,fee,available_days,rating,bio) VALUES (?,?,?,?,?,?,?)`);
    const seed = db.transaction(() => {
      ins.run('Dr. Sarah Chen',   'Cardiology',       '👩‍⚕️','$120','Mon–Fri',4.9,'Interventional cardiology specialist.');
      ins.run('Dr. Michael Ross', 'Neurology',        '👨‍⚕️','$150','Tue–Sat',4.8,'Expert in neurological disorders.');
      ins.run('Dr. Priya Patel',  'Orthopedics',      '👩‍⚕️','$110','Mon–Thu',4.7,'Joint replacement specialist.');
      ins.run('Dr. James Liu',    'Dermatology',      '👨‍⚕️','$95', 'Wed–Sun',4.9,'Board-certified dermatologist.');
      ins.run('Dr. Emma Wilson',  'Pediatrics',       '👩‍⚕️','$85', 'Mon–Fri',5.0,'Child health specialist.');
      ins.run('Dr. Robert King',  'General Medicine', '👨‍⚕️','$75', 'Mon–Sat',4.6,'Primary care physician.');
    });
    seed();
    console.log('[DB] Seeded 6 doctors');
  }
  db.close();
  console.log('[DB] Ready:', dbPath);
}

try { setupDatabase(); }
catch (err) { console.error('[DB] FATAL:', err.message); process.exit(1); }

// Write db/index.js pointing to correct path
const dbDir = path.join(__dirname, 'db');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
fs.writeFileSync(path.join(dbDir, 'index.js'), `
'use strict';
require('dotenv').config();
const Database = require('better-sqlite3');
const path = require('path');
const fs   = require('fs');
const dbPath = process.env.DB_PATH || '/tmp/medibook.sqlite';
const dir  = path.dirname(path.resolve(dbPath));
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
module.exports = db;
`);

const app  = express();
const PORT = process.env.PORT || 3000;

// ── CORS ──────────────────────────────────────────────────────
app.use(cors({ origin: '*' }));

// ── Security headers WITHOUT CSP (CSP was blocking onclick) ──
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// ── Rate limiting ─────────────────────────────────────────────
app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000, max: 200,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
}));

// ── Body parsing ──────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// ── Session ───────────────────────────────────────────────────
app.use(session({
  secret:            process.env.SESSION_SECRET || 'medibook-dev-secret',
  resave:            false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }
}));

// ── Static files ──────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── API Routes ────────────────────────────────────────────────
app.use('/api', require('./routes/appointments'));

// ── Health check ──────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'MediBook', time: new Date().toISOString() });
});

// ── SPA fallback ─────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Error handler ─────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Error]', err.message);
  res.status(err.status || 500).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(`\n  MediBook running → http://localhost:${PORT}\n`);
});

module.exports = app;
