// services/mailer.js
'use strict';
require('dotenv').config();
const nodemailer = require('nodemailer');

// ── Create transporter ───────────────────────────────────────
let transporter;
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host:   process.env.EMAIL_HOST  || 'smtp.gmail.com',
      port:   parseInt(process.env.EMAIL_PORT || '587'),
      secure: process.env.EMAIL_SECURE === 'true',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
      tls: { rejectUnauthorized: false }
    });
  }
  return transporter;
}

const HOSPITAL_NAME    = process.env.HOSPITAL_NAME    || 'MediBook Hospital';
const HOSPITAL_PHONE   = process.env.HOSPITAL_PHONE   || '1-800-MEDIBOOK';
const HOSPITAL_ADDRESS = process.env.HOSPITAL_ADDRESS || '123 Health Avenue, Medical City';
const HOSPITAL_WEBSITE = process.env.HOSPITAL_WEBSITE || 'https://medibook.health';
const FROM             = process.env.EMAIL_FROM        || `MediBook <${process.env.EMAIL_USER}>`;

// ── HTML email wrapper ────────────────────────────────────────
function wrap(title, body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" style="max-width:580px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
      <!-- HEADER -->
      <tr>
        <td style="background:linear-gradient(135deg,#0a1628 0%,#0f2a4a 100%);padding:32px 36px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td><span style="font-size:24px;font-weight:700;color:#ffffff;letter-spacing:0.5px;">Medi<span style="color:#14b8a6;">Book</span></span></td>
              <td align="right"><span style="font-size:12px;color:#9ca3af;">${HOSPITAL_NAME}</span></td>
            </tr>
          </table>
        </td>
      </tr>
      <!-- BODY -->
      <tr><td style="padding:36px;">${body}</td></tr>
      <!-- FOOTER -->
      <tr>
        <td style="background:#f9fafb;padding:24px 36px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.7;">
            <strong>${HOSPITAL_NAME}</strong><br>
            📍 ${HOSPITAL_ADDRESS}<br>
            📞 ${HOSPITAL_PHONE} &nbsp;|&nbsp; 🌐 <a href="${HOSPITAL_WEBSITE}" style="color:#0d9488;">${HOSPITAL_WEBSITE}</a>
          </p>
          <p style="margin:14px 0 0;font-size:11px;color:#9ca3af;">
            This is an automated message from MediBook. Please do not reply directly to this email.
            For support, contact us at ${HOSPITAL_PHONE}.
          </p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

// ── Detail row helper ─────────────────────────────────────────
function row(label, value, highlight = false) {
  return `<tr>
    <td style="padding:9px 14px;font-size:13px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.3px;background:#f9fafb;border-bottom:1px solid #f0f0f0;width:38%;">${label}</td>
    <td style="padding:9px 14px;font-size:14px;color:${highlight ? '#0d9488' : '#111827'};font-weight:${highlight ? '700' : '600'};border-bottom:1px solid #f0f0f0;">${value}</td>
  </tr>`;
}

// ═══════════════════════════════════════════════════════════════
//  1.  BOOKING CONFIRMATION EMAIL
// ═══════════════════════════════════════════════════════════════
async function sendBookingConfirmation(appt) {
  const body = `
    <h2 style="margin:0 0 6px;font-size:22px;color:#111827;">Appointment Confirmed! ✅</h2>
    <p style="margin:0 0 24px;font-size:15px;color:#6b7280;">Hi <strong>${appt.firstName}</strong>, your appointment has been successfully booked. Here are your details:</p>

    <!-- TICKET BOX -->
    <div style="background:linear-gradient(135deg,rgba(13,148,136,0.07),rgba(13,148,136,0.02));border:2px dashed #0d9488;border-radius:12px;padding:18px 24px;text-align:center;margin-bottom:24px;">
      <p style="margin:0 0 4px;font-size:11px;color:#9ca3af;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Ticket ID</p>
      <p style="margin:0;font-family:monospace;font-size:22px;font-weight:700;color:#0d9488;letter-spacing:3px;">${appt.ticketId}</p>
      <p style="margin:6px 0 0;font-size:12px;color:#9ca3af;">Keep this ID for check-in at the hospital</p>
    </div>

    <!-- DETAILS TABLE -->
    <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:10px;overflow:hidden;border:1px solid #e5e7eb;margin-bottom:24px;">
      ${row('Patient Name',   `${appt.firstName} ${appt.lastName}`)}
      ${row('Doctor',         appt.doctorName)}
      ${row('Specialty',      appt.specialty)}
      ${row('Date',           appt.date)}
      ${row('Time Slot',      appt.slot)}
      ${row('Visit Type',     appt.visitType)}
      ${row('Consultation Fee', appt.fee, true)}
      ${row('Status',         '✅ Confirmed')}
    </table>

    ${appt.reason ? `<div style="background:#f9fafb;border-left:3px solid #0d9488;padding:12px 16px;border-radius:4px;margin-bottom:24px;font-size:13px;color:#4b5563;"><strong>Reason for Visit:</strong><br>${appt.reason}</div>` : ''}

    <!-- WHAT TO BRING -->
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px 20px;margin-bottom:24px;">
      <p style="margin:0 0 10px;font-size:14px;font-weight:700;color:#166534;">📋 What to bring:</p>
      <ul style="margin:0;padding-left:20px;font-size:13px;color:#15803d;line-height:1.9;">
        <li>This confirmation email or your Ticket ID</li>
        <li>Government-issued photo ID</li>
        <li>Insurance card (if applicable)</li>
        <li>List of current medications</li>
        <li>Previous medical records / test results (if any)</li>
      </ul>
    </div>

    <!-- CTA BUTTON -->
    <div style="text-align:center;margin-bottom:24px;">
      <a href="${HOSPITAL_WEBSITE}" style="display:inline-block;background:#0d9488;color:#ffffff;padding:13px 32px;border-radius:8px;font-size:14px;font-weight:700;text-decoration:none;">View Appointment Details →</a>
    </div>

    <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.7;">
      Need to reschedule or cancel? Contact us at least <strong>24 hours before</strong> your appointment at ${HOSPITAL_PHONE}.
    </p>`;

  return send({
    to: appt.email,
    subject: `✅ Appointment Confirmed — ${appt.ticketId} | ${appt.date} at ${appt.slot}`,
    html: wrap('Appointment Confirmed', body),
    text: `Appointment Confirmed!\n\nTicket ID: ${appt.ticketId}\nPatient: ${appt.firstName} ${appt.lastName}\nDoctor: ${appt.doctorName}\nDate: ${appt.date}\nTime: ${appt.slot}\nFee: ${appt.fee}\n\nPlease bring this confirmation and a photo ID.\n\n${HOSPITAL_NAME} | ${HOSPITAL_PHONE}`
  });
}

// ═══════════════════════════════════════════════════════════════
//  2.  PRE-BOOKING CONFIRMATION EMAIL
// ═══════════════════════════════════════════════════════════════
async function sendPreBookConfirmation(appt) {
  const body = `
    <h2 style="margin:0 0 6px;font-size:22px;color:#111827;">Pre-Booking Received! ⏰</h2>
    <p style="margin:0 0 24px;font-size:15px;color:#6b7280;">Hi <strong>${appt.firstName}</strong>, your pre-booking request has been received and is being processed.</p>

    <div style="background:linear-gradient(135deg,rgba(99,102,241,0.07),rgba(99,102,241,0.02));border:2px dashed #6366f1;border-radius:12px;padding:18px 24px;text-align:center;margin-bottom:24px;">
      <p style="margin:0 0 4px;font-size:11px;color:#9ca3af;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Pre-Booking Reference</p>
      <p style="margin:0;font-family:monospace;font-size:22px;font-weight:700;color:#6366f1;letter-spacing:3px;">${appt.ticketId}</p>
    </div>

    <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:10px;overflow:hidden;border:1px solid #e5e7eb;margin-bottom:24px;">
      ${row('Patient Name',  `${appt.firstName} ${appt.lastName}`)}
      ${row('Doctor',        appt.doctorName)}
      ${row('Specialty',     appt.specialty)}
      ${row('Requested Date', appt.date)}
      ${row('Requested Time', appt.slot)}
      ${row('Priority',      appt.priority || 'Routine')}
      ${row('Status',        '⏰ Pre-Booked — Awaiting Confirmation')}
    </table>

    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:16px 20px;margin-bottom:24px;">
      <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#92400e;">⏳ What happens next?</p>
      <ul style="margin:0;padding-left:20px;font-size:13px;color:#78350f;line-height:1.9;">
        <li>Our team will review your request within <strong>2 hours</strong></li>
        <li>You will receive a confirmation email once approved</li>
        <li>Your slot is <strong>held with priority</strong> during processing</li>
        <li>Free cancellation up to 24 hours before the appointment</li>
      </ul>
    </div>

    <p style="margin:0;font-size:13px;color:#9ca3af;">Questions? Call us at ${HOSPITAL_PHONE}</p>`;

  return send({
    to: appt.email,
    subject: `⏰ Pre-Booking Received — ${appt.ticketId} | ${appt.date}`,
    html: wrap('Pre-Booking Received', body),
    text: `Pre-Booking Received!\n\nReference: ${appt.ticketId}\nPatient: ${appt.firstName} ${appt.lastName}\nDoctor: ${appt.doctorName}\nDate: ${appt.date}\nTime: ${appt.slot}\n\nYour request is being processed. We will confirm within 2 hours.\n\n${HOSPITAL_NAME}`
  });
}

// ═══════════════════════════════════════════════════════════════
//  3.  CANCELLATION EMAIL
// ═══════════════════════════════════════════════════════════════
async function sendCancellationEmail(appt) {
  const body = `
    <h2 style="margin:0 0 6px;font-size:22px;color:#111827;">Appointment Cancelled ❌</h2>
    <p style="margin:0 0 24px;font-size:15px;color:#6b7280;">Hi <strong>${appt.firstName}</strong>, your appointment has been cancelled as requested.</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:10px;overflow:hidden;border:1px solid #e5e7eb;margin-bottom:24px;">
      ${row('Ticket ID',   appt.ticketId)}
      ${row('Doctor',      appt.doctorName)}
      ${row('Date',        appt.date)}
      ${row('Time',        appt.slot)}
      ${row('Status',      '❌ Cancelled')}
    </table>

    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:16px 20px;margin-bottom:24px;">
      <p style="margin:0;font-size:13px;color:#991b1b;">The time slot has been released and is now available for other patients. If you wish to rebook, please visit our website.</p>
    </div>

    <div style="text-align:center;margin-bottom:20px;">
      <a href="${HOSPITAL_WEBSITE}" style="display:inline-block;background:#0d9488;color:#ffffff;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:700;text-decoration:none;">Book a New Appointment →</a>
    </div>`;

  return send({
    to: appt.email,
    subject: `❌ Appointment Cancelled — ${appt.ticketId}`,
    html: wrap('Appointment Cancelled', body),
    text: `Your appointment ${appt.ticketId} has been cancelled.\n\nDoctor: ${appt.doctorName}\nDate: ${appt.date}\nTime: ${appt.slot}\n\nTo rebook: ${HOSPITAL_WEBSITE}`
  });
}

// ═══════════════════════════════════════════════════════════════
//  4.  RESCHEDULE EMAIL
// ═══════════════════════════════════════════════════════════════
async function sendRescheduleEmail(appt, oldDate, oldSlot) {
  const body = `
    <h2 style="margin:0 0 6px;font-size:22px;color:#111827;">Appointment Rescheduled ✏️</h2>
    <p style="margin:0 0 24px;font-size:15px;color:#6b7280;">Hi <strong>${appt.firstName}</strong>, your appointment has been updated successfully.</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:10px;overflow:hidden;border:1px solid #e5e7eb;margin-bottom:24px;">
      ${row('Ticket ID',   appt.ticketId)}
      ${row('Doctor',      appt.doctorName)}
      ${row('Previous Date', `<s style="color:#9ca3af;">${oldDate}</s>`)}
      ${row('Previous Time', `<s style="color:#9ca3af;">${oldSlot}</s>`)}
      ${row('New Date',    `<strong style="color:#0d9488;">${appt.date}</strong>`)}
      ${row('New Time',    `<strong style="color:#0d9488;">${appt.slot}</strong>`)}
      ${row('Visit Type',  appt.visitType)}
    </table>

    <p style="margin:0;font-size:13px;color:#9ca3af;">If you did not request this change, please contact us immediately at ${HOSPITAL_PHONE}.</p>`;

  return send({
    to: appt.email,
    subject: `✏️ Appointment Rescheduled — ${appt.ticketId} | New: ${appt.date} at ${appt.slot}`,
    html: wrap('Appointment Rescheduled', body),
    text: `Appointment Rescheduled!\n\nTicket: ${appt.ticketId}\nNew Date: ${appt.date}\nNew Time: ${appt.slot}\n\n${HOSPITAL_NAME}`
  });
}

// ── Core send ─────────────────────────────────────────────────
async function send({ to, subject, html, text }) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn('[Mailer] Email credentials not configured — skipping send');
    return { skipped: true };
  }
  try {
    const info = await getTransporter().sendMail({ from: FROM, to, subject, html, text });
    console.log(`[Mailer] Sent to ${to}: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error('[Mailer] Error:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = { sendBookingConfirmation, sendPreBookConfirmation, sendCancellationEmail, sendRescheduleEmail };
