// db/setup.js  — Run once with: node db/setup.js
'use strict';
require('dotenv').config();
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DB_PATH || './db/medibook.sqlite';
const dir = path.dirname(dbPath);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
-- ── DOCTORS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS doctors (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  specialty   TEXT NOT NULL,
  emoji       TEXT DEFAULT '👨‍⚕️',
  fee         TEXT DEFAULT '$85',
  available_days TEXT DEFAULT 'Mon–Fri',
  rating      REAL DEFAULT 4.5,
  bio         TEXT,
  active      INTEGER DEFAULT 1,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ── PATIENTS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS patients (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name  TEXT NOT NULL,
  last_name   TEXT NOT NULL,
  email       TEXT NOT NULL,
  phone       TEXT NOT NULL,
  dob         TEXT,
  gender      TEXT,
  blood_group TEXT,
  insurance   TEXT,
  address     TEXT,
  emergency_contact TEXT,
  allergies   TEXT,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ── APPOINTMENTS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS appointments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id   TEXT UNIQUE NOT NULL,
  patient_id  INTEGER NOT NULL,
  doctor_id   INTEGER NOT NULL,
  appt_date   TEXT NOT NULL,
  appt_slot   TEXT NOT NULL,
  visit_type  TEXT DEFAULT 'In-Person Visit',
  status      TEXT DEFAULT 'confirmed' CHECK(status IN ('confirmed','prebooked','pending','cancelled','completed')),
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

-- ── BOOKED SLOTS (prevent double-booking) ────────────────────
CREATE TABLE IF NOT EXISTS booked_slots (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  doctor_id  INTEGER NOT NULL,
  appt_date  TEXT NOT NULL,
  appt_slot  TEXT NOT NULL,
  appt_id    INTEGER,
  UNIQUE(doctor_id, appt_date, appt_slot),
  FOREIGN KEY (doctor_id) REFERENCES doctors(id)
);

-- ── INDEXES ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_appt_patient  ON appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_appt_doctor   ON appointments(doctor_id);
CREATE INDEX IF NOT EXISTS idx_appt_date     ON appointments(appt_date);
CREATE INDEX IF NOT EXISTS idx_appt_ticket   ON appointments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_patient_email ON patients(email);
`);

// ── SEED DOCTORS ─────────────────────────────────────────────
const doctorCount = db.prepare('SELECT COUNT(*) as c FROM doctors').get().c;
if (doctorCount === 0) {
  const insert = db.prepare(`
    INSERT INTO doctors (name, specialty, emoji, fee, available_days, rating, bio)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const doctors = [
    ['Dr. Sarah Chen',    'Cardiology',       '👩‍⚕️', '$120', 'Mon–Fri', 4.9, 'Specialist in interventional cardiology with 15 years experience.'],
    ['Dr. Michael Ross',  'Neurology',        '👨‍⚕️', '$150', 'Tue–Sat', 4.8, 'Expert in neurological disorders and brain health.'],
    ['Dr. Priya Patel',   'Orthopedics',      '👩‍⚕️', '$110', 'Mon–Thu', 4.7, 'Joint replacement and sports injury specialist.'],
    ['Dr. James Liu',     'Dermatology',      '👨‍⚕️', '$95',  'Wed–Sun', 4.9, 'Board-certified dermatologist focusing on skin cancer prevention.'],
    ['Dr. Emma Wilson',   'Pediatrics',       '👩‍⚕️', '$85',  'Mon–Fri', 5.0, 'Dedicated to child health from infancy through adolescence.'],
    ['Dr. Robert King',   'General Medicine', '👨‍⚕️', '$75',  'Mon–Sat', 4.6, 'Primary care physician with a holistic approach to health.'],
  ];
  const insertMany = db.transaction((docs) => {
    for (const d of docs) insert.run(...d);
  });
  insertMany(doctors);
  console.log('✅ Seeded 6 doctors');
}

console.log('✅ Database setup complete:', dbPath);
db.close();
