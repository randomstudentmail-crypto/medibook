// routes/appointments.js
'use strict';
const express = require('express');
const router  = express.Router();
const db      = require('../db/index');
const mailer  = require('../services/mailer');

// ── helpers ───────────────────────────────────────────────────
function genTicket(prefix = 'TKT') {
  const ts   = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${ts}-${rand}`;
}

function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function getOrCreatePatient(data) {
  const existing = db.prepare('SELECT id FROM patients WHERE email = ? LIMIT 1').get(data.email);
  if (existing) {
    db.prepare(`UPDATE patients SET first_name=?,last_name=?,phone=?,dob=?,gender=?,blood_group=?,insurance=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .run(data.firstName, data.lastName, data.phone, data.dob||null, data.gender||null, data.blood||null, data.insurance||null, existing.id);
    return existing.id;
  }
  const res = db.prepare(`INSERT INTO patients (first_name,last_name,email,phone,dob,gender,blood_group,insurance) VALUES (?,?,?,?,?,?,?,?)`)
    .run(data.firstName, data.lastName, data.email, data.phone, data.dob||null, data.gender||null, data.blood||null, data.insurance||null);
  return res.lastInsertRowid;
}

// ── GET /api/doctors ──────────────────────────────────────────
router.get('/doctors', (req, res) => {
  const { specialty } = req.query;
  let docs;
  if (specialty) {
    docs = db.prepare('SELECT * FROM doctors WHERE specialty=? AND active=1 ORDER BY name').all(specialty);
  } else {
    docs = db.prepare('SELECT * FROM doctors WHERE active=1 ORDER BY specialty, name').all();
  }
  res.json({ success: true, data: docs });
});

// ── GET /api/slots ────────────────────────────────────────────
router.get('/slots', (req, res) => {
  const { doctorId, date } = req.query;
  if (!doctorId || !date) return res.status(400).json({ error: 'doctorId and date required' });

  const ALL_SLOTS = [
    '08:00 AM','08:30 AM','09:00 AM','09:30 AM','10:00 AM','10:30 AM',
    '11:00 AM','11:30 AM','01:00 PM','01:30 PM','02:00 PM','02:30 PM',
    '03:00 PM','03:30 PM','04:00 PM','04:30 PM'
  ];

  const bookedRows = db.prepare('SELECT appt_slot FROM booked_slots WHERE doctor_id=? AND appt_date=?').all(doctorId, date);
  const booked     = bookedRows.map(r => r.appt_slot);

  const slots = ALL_SLOTS.map(s => ({ time: s, available: !booked.includes(s) }));
  res.json({ success: true, data: slots });
});

// ── POST /api/appointments — Book ─────────────────────────────
router.post('/appointments', async (req, res) => {
  const { firstName, lastName, email, phone, dob, gender, blood, insurance,
          doctorId, date, slot, visitType, reason, status = 'confirmed', priority = 'Routine' } = req.body;

  // Validate
  if (!firstName || !lastName || !email || !phone || !doctorId || !date || !slot) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRe.test(email)) return res.status(400).json({ error: 'Invalid email address' });

  // Check doctor exists
  const doctor = db.prepare('SELECT * FROM doctors WHERE id=? AND active=1').get(doctorId);
  if (!doctor) return res.status(404).json({ error: 'Doctor not found' });

  // Check slot availability
  const slotTaken = db.prepare('SELECT id FROM booked_slots WHERE doctor_id=? AND appt_date=? AND appt_slot=?').get(doctorId, date, slot);
  if (slotTaken) return res.status(409).json({ error: 'This slot is already booked. Please choose another.' });

  const ticket    = genTicket(status === 'prebooked' ? 'PRE' : 'TKT');
  const patientId = getOrCreatePatient({ firstName, lastName, email, phone, dob, gender, blood, insurance });

  // Transaction: insert appointment + lock slot
  const bookTx = db.transaction(() => {
    const apptRes = db.prepare(`
      INSERT INTO appointments (ticket_id,patient_id,doctor_id,appt_date,appt_slot,visit_type,status,priority,reason,fee)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `).run(ticket, patientId, doctorId, date, slot, visitType || 'In-Person Visit', status, priority, reason || null, doctor.fee);

    db.prepare('INSERT INTO booked_slots (doctor_id,appt_date,appt_slot,appt_id) VALUES (?,?,?,?)')
      .run(doctorId, date, slot, apptRes.lastInsertRowid);

    return apptRes.lastInsertRowid;
  });

  const apptId = bookTx();

  // Send email (async, non-blocking)
  const emailData = {
    ticketId:   ticket,
    firstName, lastName, email,
    doctorName: doctor.name,
    specialty:  doctor.specialty,
    date:       fmtDate(date),
    slot,
    visitType:  visitType || 'In-Person Visit',
    reason,
    priority,
    fee:        doctor.fee
  };

  const emailFn = status === 'prebooked' ? mailer.sendPreBookConfirmation : mailer.sendBookingConfirmation;
  emailFn(emailData).then(result => {
    if (result.success) db.prepare('UPDATE appointments SET email_sent=1 WHERE id=?').run(apptId);
  }).catch(err => console.error('[Email]', err));

  res.json({
    success: true,
    ticketId: ticket,
    appointmentId: apptId,
    message: 'Appointment booked. Confirmation email sent.'
  });
});

// ── GET /api/appointments ─────────────────────────────────────
router.get('/appointments', (req, res) => {
  const { email, status, date_from, date_to } = req.query;
  if (!email) return res.status(400).json({ error: 'email required' });

  let sql = `
    SELECT a.*, p.first_name, p.last_name, p.email, p.phone,
           d.name as doctor_name, d.specialty, d.emoji, d.fee as doctor_fee, d.rating
    FROM appointments a
    JOIN patients p ON a.patient_id = p.id
    JOIN doctors  d ON a.doctor_id  = d.id
    WHERE p.email = ?
  `;
  const params = [email];
  if (status) { sql += ' AND a.status = ?'; params.push(status); }
  if (date_from) { sql += ' AND a.appt_date >= ?'; params.push(date_from); }
  if (date_to)   { sql += ' AND a.appt_date <= ?'; params.push(date_to); }
  sql += ' ORDER BY a.appt_date DESC, a.appt_slot';

  const rows = db.prepare(sql).all(...params);
  res.json({ success: true, data: rows });
});

// ── GET /api/appointments/:ticketId ──────────────────────────
router.get('/appointments/:ticketId', (req, res) => {
  const row = db.prepare(`
    SELECT a.*, p.first_name, p.last_name, p.email, p.phone, p.gender, p.blood_group,
           d.name as doctor_name, d.specialty, d.emoji, d.fee as doctor_fee
    FROM appointments a
    JOIN patients p ON a.patient_id = p.id
    JOIN doctors  d ON a.doctor_id  = d.id
    WHERE a.ticket_id = ?
  `).get(req.params.ticketId);

  if (!row) return res.status(404).json({ error: 'Appointment not found' });
  res.json({ success: true, data: row });
});

// ── PATCH /api/appointments/:ticketId — Edit ─────────────────
router.patch('/appointments/:ticketId', async (req, res) => {
  const { date, slot, visitType, reason, status } = req.body;
  const { ticketId } = req.params;

  const appt = db.prepare(`
    SELECT a.*, p.email, p.first_name, p.last_name,
           d.name as doctor_name, d.specialty
    FROM appointments a
    JOIN patients p ON a.patient_id = p.id
    JOIN doctors  d ON a.doctor_id  = d.id
    WHERE a.ticket_id = ?
  `).get(ticketId);

  if (!appt) return res.status(404).json({ error: 'Appointment not found' });
  if (appt.status === 'cancelled') return res.status(400).json({ error: 'Cannot edit a cancelled appointment' });

  const newDate = date   || appt.appt_date;
  const newSlot = slot   || appt.appt_slot;
  const oldDate = appt.appt_date;
  const oldSlot = appt.appt_slot;

  // If date/slot changing, check availability
  if ((newDate !== oldDate || newSlot !== oldSlot)) {
    const slotTaken = db.prepare('SELECT id FROM booked_slots WHERE doctor_id=? AND appt_date=? AND appt_slot=? AND appt_id != ?')
      .get(appt.doctor_id, newDate, newSlot, appt.id);
    if (slotTaken) return res.status(409).json({ error: 'New slot is already taken' });

    db.transaction(() => {
      db.prepare('DELETE FROM booked_slots WHERE doctor_id=? AND appt_date=? AND appt_slot=?').run(appt.doctor_id, oldDate, oldSlot);
      db.prepare('INSERT OR REPLACE INTO booked_slots (doctor_id,appt_date,appt_slot,appt_id) VALUES (?,?,?,?)').run(appt.doctor_id, newDate, newSlot, appt.id);
    })();
  }

  const newStatus = status || appt.status;
  db.prepare(`UPDATE appointments SET appt_date=?,appt_slot=?,visit_type=?,reason=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE ticket_id=?`)
    .run(newDate, newSlot, visitType || appt.visit_type, reason || appt.reason, newStatus, ticketId);

  // Send reschedule email if date/slot changed
  if (newDate !== oldDate || newSlot !== oldSlot) {
    mailer.sendRescheduleEmail({
      ticketId, email: appt.email, firstName: appt.first_name, lastName: appt.last_name,
      doctorName: appt.doctor_name, specialty: appt.specialty,
      date: fmtDate(newDate), slot: newSlot, visitType: visitType || appt.visit_type
    }, fmtDate(oldDate), oldSlot).catch(console.error);
  }

  res.json({ success: true, message: 'Appointment updated' });
});

// ── DELETE /api/appointments/:ticketId — Cancel ──────────────
router.delete('/appointments/:ticketId', async (req, res) => {
  const appt = db.prepare(`
    SELECT a.*, p.email, p.first_name, p.last_name,
           d.name as doctor_name
    FROM appointments a
    JOIN patients p ON a.patient_id = p.id
    JOIN doctors  d ON a.doctor_id  = d.id
    WHERE a.ticket_id = ?
  `).get(req.params.ticketId);

  if (!appt) return res.status(404).json({ error: 'Appointment not found' });
  if (appt.status === 'cancelled') return res.status(400).json({ error: 'Already cancelled' });

  db.transaction(() => {
    db.prepare('UPDATE appointments SET status=?,updated_at=CURRENT_TIMESTAMP WHERE ticket_id=?').run('cancelled', req.params.ticketId);
    db.prepare('DELETE FROM booked_slots WHERE doctor_id=? AND appt_date=? AND appt_slot=?').run(appt.doctor_id, appt.appt_date, appt.appt_slot);
  })();

  mailer.sendCancellationEmail({
    ticketId: req.params.ticketId, email: appt.email,
    firstName: appt.first_name, lastName: appt.last_name,
    doctorName: appt.doctor_name, date: fmtDate(appt.appt_date), slot: appt.appt_slot
  }).catch(console.error);

  res.json({ success: true, message: 'Appointment cancelled' });
});

// ── GET /api/patients/profile ─────────────────────────────────
router.get('/patients/profile', (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: 'email required' });
  const patient = db.prepare('SELECT * FROM patients WHERE email=? LIMIT 1').get(email);
  res.json({ success: true, data: patient || null });
});

// ── PUT /api/patients/profile ─────────────────────────────────
router.put('/patients/profile', (req, res) => {
  const { firstName, lastName, email, phone, dob, gender, blood, insurance, address, emergencyContact, allergies } = req.body;
  if (!email) return res.status(400).json({ error: 'email required' });

  const existing = db.prepare('SELECT id FROM patients WHERE email=?').get(email);
  if (existing) {
    db.prepare(`UPDATE patients SET first_name=?,last_name=?,phone=?,dob=?,gender=?,blood_group=?,insurance=?,address=?,emergency_contact=?,allergies=?,updated_at=CURRENT_TIMESTAMP WHERE email=?`)
      .run(firstName, lastName, phone, dob||null, gender||null, blood||null, insurance||null, address||null, emergencyContact||null, allergies||null, email);
  } else {
    db.prepare(`INSERT INTO patients (first_name,last_name,email,phone,dob,gender,blood_group,insurance,address,emergency_contact,allergies) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(firstName, lastName, email, phone, dob||null, gender||null, blood||null, insurance||null, address||null, emergencyContact||null, allergies||null);
  }
  res.json({ success: true, message: 'Profile saved' });
});

// ── GET /api/stats ─────────────────────────────────────────────
router.get('/stats', (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: 'email required' });
  const today = new Date().toISOString().split('T')[0];
  const patient = db.prepare('SELECT id FROM patients WHERE email=?').get(email);
  if (!patient) return res.json({ success: true, data: { total:0, confirmed:0, prebooked:0, cancelled:0, upcoming:0 } });

  const pid = patient.id;
  const total     = db.prepare('SELECT COUNT(*) as c FROM appointments WHERE patient_id=?').get(pid).c;
  const confirmed = db.prepare("SELECT COUNT(*) as c FROM appointments WHERE patient_id=? AND status='confirmed'").get(pid).c;
  const prebooked = db.prepare("SELECT COUNT(*) as c FROM appointments WHERE patient_id=? AND status='prebooked'").get(pid).c;
  const cancelled = db.prepare("SELECT COUNT(*) as c FROM appointments WHERE patient_id=? AND status='cancelled'").get(pid).c;
  const upcoming  = db.prepare("SELECT COUNT(*) as c FROM appointments WHERE patient_id=? AND appt_date>=? AND status NOT IN ('cancelled')").get(pid, today).c;
  res.json({ success: true, data: { total, confirmed, prebooked, cancelled, upcoming } });
});

module.exports = router;
