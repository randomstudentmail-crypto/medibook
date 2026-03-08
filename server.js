// server.js — MediBook Hospital Appointment System
'use strict';
require('dotenv').config();

const express   = require('express');
const path      = require('path');
const fs        = require('fs');
const helmet    = require('helmet');
const cors      = require('cors');
const rateLimit = require('express-rate-limit');
const session   = require('express-session');

// ── Inline DB setup (runs on every cold start) ────────────────
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
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      name           TEXT NOT NULL,
      specialty      TEXT NOT NULL,
      emoji          TEXT DEFAULT '👨‍⚕️',
      fee            TEXT DEFAULT '$85',
      available_days TEXT DEFAULT 'Mon–Fri',
      rating         REAL DEFAULT 4.5,
      bio            TEXT,
      active         INTEGER DEFAULT 1,
      created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS patients (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name        TEXT NOT NULL,
      last_name         TEXT NOT NULL,
      email             TEXT NOT NULL,
      phone             TEXT NOT NULL,
      dob               TEXT,
      gender            TEXT,
      blood_group       TEXT,
      insurance         TEXT,
      address           TEXT,
      emergency_contact TEXT,
      allergies         TEXT,
      created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS appointments (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id   TEXT UNIQUE NOT NULL,
      patient_id  INTEGER NOT NULL,
      doctor_id   INTEGER NOT NULL,
      appt_date   TEXT NOT NULL,
      appt_slot   TEXT NOT NULL,
      visit_type  TEXT DEFAULT 'In-Person Visit',
      status      TEXT DEFAULT 'confirmed',
      priority    TEXT DEFAULT 'Routine',
      reason      TEXT,
      notes       TEXT,
      fee         TEXT,
      email_sent  INTEGER DEFAULT 0,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (patient_id) REFERENCES patients(id),
      FOREIGN KEY (doctor_id)  REFERENCES doctors(id)
    );
    CREATE TABLE IF NOT EXISTS booked_slots (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      doctor_id INTEGER NOT NULL,
      appt_date TEXT NOT NULL,
      appt_slot TEXT NOT NULL,
      appt_id   INTEGER,
      UNIQUE(doctor_id, appt_date, appt_slot),
      FOREIGN KEY (doctor_id) REFERENCES doctors(id)
    );
    CREATE INDEX IF NOT EXISTS idx_appt_patient  ON appointments(patient_id);
    CREATE INDEX IF NOT EXISTS idx_appt_doctor   ON appointments(doctor_id);
    CREATE INDEX IF NOT EXISTS idx_appt_date     ON appointments(appt_date);
    CREATE INDEX IF NOT EXISTS idx_appt_ticket   ON appointments(ticket_id);
    CREATE INDEX IF NOT EXISTS idx_patient_email ON patients(email);
  `);

  const count = db.prepare('SELECT COUNT(*) as c FROM doctors').get().c;
  if (count === 0) {
    const ins  = db.prepare(`INSERT INTO doctors (name,specialty,emoji,fee,available_days,rating,bio) VALUES (?,?,?,?,?,?,?)`);
    const seed = db.transaction(() => {
      ins.run('Dr. Sarah Chen',   'Cardiology',       '👩‍⚕️','$120','Mon–Fri',4.9,'Interventional cardiology specialist, 15 years experience.');
      ins.run('Dr. Michael Ross', 'Neurology',        '👨‍⚕️','$150','Tue–Sat',4.8,'Expert in neurological disorders and brain health.');
      ins.run('Dr. Priya Patel',  'Orthopedics',      '👩‍⚕️','$110','Mon–Thu',4.7,'Joint replacement and sports injury specialist.');
      ins.run('Dr. James Liu',    'Dermatology',      '👨‍⚕️','$95', 'Wed–Sun',4.9,'Board-certified dermatologist, skin cancer prevention.');
      ins.run('Dr. Emma Wilson',  'Pediatrics',       '👩‍⚕️','$85', 'Mon–Fri',5.0,'Dedicated to child health from infancy through adolescence.');
      ins.run('Dr. Robert King',  'General Medicine', '👨‍⚕️','$75', 'Mon–Sat',4.6,'Primary care physician with a holistic approach.');
    });
    seed();
    console.log('[DB] Seeded 6 doctors');
  }

  db.close();
  console.log('[DB] Ready:', dbPath);
}

try { setupDatabase(); }
catch (err) { console.error('[DB] FATAL:', err.message); process.exit(1); }

// ── Also update db/index.js path to match ─────────────────────
// Write a fresh db/index.js pointing to the correct path
const dbIndexDir = path.join(__dirname, 'db');
if (!fs.existsSync(dbIndexDir)) fs.mkdirSync(dbIndexDir, { recursive: true });
fs.writeFileSync(path.join(dbIndexDir, 'index.js'), `
'use strict';
require('dotenv').config();
const Database = require('better-sqlite3');
const path     = require('path');
const fs       = require('fs');
const dbPath   = process.env.DB_PATH || '/tmp/medibook.sqlite';
const dbDir    = path.dirname(path.resolve(dbPath));
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
module.exports = db;
`);

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc:   ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc:    ["'self'", "https://fonts.gstatic.com"],
      scriptSrc:  ["'self'", "'unsafe-inline'"],
      imgSrc:     ["'self'", "data:", "https:"],
    }
  }
}));

app.use(cors({ origin: process.env.ALLOWED_ORIGINS || '*' }));

app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
}));

app.use('/api/appointments', rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many booking attempts. Please wait a moment.' }
}));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

app.use(session({
  secret:            process.env.SESSION_SECRET || 'medibook-dev-secret',
  resave:            false,
  saveUninitialized: false,
  cookie: {
    secure:   process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge:   24 * 60 * 60 * 1000
  }
}));

app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0
}));

app.use('/api', require('./routes/appointments'));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'MediBook', time: new Date().toISOString(), uptime: Math.floor(process.uptime()) + 's' });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  console.error('[Error]', err.message);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message
  });
});

app.listen(PORT, () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════╗');
  console.log('  ║   MediBook Server Started            ║');
  console.log(`  ║   http://localhost:${PORT}              ║`);
  console.log(`  ║   ENV: ${(process.env.NODE_ENV||'development').padEnd(29)}║`);
  console.log('  ╚══════════════════════════════════════╝');
  console.log('');
});

module.exports = app;
