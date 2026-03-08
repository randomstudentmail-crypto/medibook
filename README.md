# 🏥 MediBook — Hospital Appointment Booking System

A full-stack web application with **SQLite database**, **email confirmations**, and a complete REST API.

---

## 📁 Project Structure

```
medibook/
├── server.js              ← Express server (entry point)
├── package.json           ← Dependencies
├── .env.example           ← Environment config template
│
├── db/
│   ├── setup.js           ← Database schema + seed data
│   └── index.js           ← DB connection singleton
│
├── routes/
│   └── appointments.js    ← All API endpoints
│
├── services/
│   └── mailer.js          ← Email service (confirmation, cancellation, reschedule)
│
└── public/
    └── index.html         ← Complete frontend SPA
```

---

## 🚀 Quick Start (Local)

### 1. Install Node.js (v18+)
Download from: https://nodejs.org

### 2. Install dependencies
```bash
npm install
```

### 3. Configure environment
```bash
cp .env.example .env
```
Edit `.env` and fill in your values (especially email credentials).

### 4. Set up the database
```bash
npm run setup
```
This creates `db/medibook.sqlite` with tables and 6 seed doctors.

### 5. Start the server
```bash
npm start          # Production
npm run dev        # Development (auto-reload, requires: npm i -g nodemon)
```

### 6. Open in browser
```
http://localhost:3000
```

---

## 📧 Email Configuration

### Gmail (Recommended for testing)
1. Go to https://myaccount.google.com
2. Security → 2-Step Verification → Turn on
3. Security → App Passwords → Generate for "Mail"
4. Copy the 16-character password into `.env`

```env
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your@gmail.com
EMAIL_PASS=xxxx xxxx xxxx xxxx
EMAIL_FROM=MediBook <your@gmail.com>
```

### SendGrid (For production)
```env
EMAIL_HOST=smtp.sendgrid.net
EMAIL_PORT=587
EMAIL_USER=apikey
EMAIL_PASS=SG.your_api_key_here
```

### Outlook / Office 365
```env
EMAIL_HOST=smtp.office365.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your@outlook.com
EMAIL_PASS=your_password
```

---

## 🌐 Deploy to Production

### Option A: Railway (Easiest — Free tier available)
1. Push code to GitHub
2. Go to https://railway.app → New Project → Deploy from GitHub
3. Add environment variables in Railway dashboard
4. Railway auto-detects Node.js and starts `npm start`
5. Get your live URL instantly!

### Option B: Render.com (Free tier)
1. Push to GitHub
2. https://render.com → New Web Service → Connect repo
3. Build command: `npm install && npm run setup`
4. Start command: `npm start`
5. Add environment variables in dashboard

### Option C: VPS / DigitalOcean / AWS EC2
```bash
# On your server:
git clone <your-repo>
cd medibook
npm install
npm run setup
npm install -g pm2
pm2 start server.js --name medibook
pm2 save && pm2 startup

# With Nginx reverse proxy:
# Point nginx to localhost:3000
```

### Option D: Heroku
```bash
heroku create your-medibook-app
heroku config:set NODE_ENV=production SESSION_SECRET=... EMAIL_USER=... EMAIL_PASS=...
git push heroku main
heroku run node db/setup.js
```

---

## 🔌 API Endpoints

| Method | Endpoint                          | Description                  |
|--------|-----------------------------------|------------------------------|
| GET    | `/api/doctors`                    | List all doctors              |
| GET    | `/api/doctors?specialty=X`        | Filter doctors by specialty   |
| GET    | `/api/slots?doctorId=1&date=...`  | Get available time slots      |
| POST   | `/api/appointments`               | Book appointment (sends email)|
| GET    | `/api/appointments?email=...`     | Get patient's appointments    |
| GET    | `/api/appointments/:ticketId`     | Get single appointment        |
| PATCH  | `/api/appointments/:ticketId`     | Edit appointment (sends email)|
| DELETE | `/api/appointments/:ticketId`     | Cancel appointment            |
| GET    | `/api/patients/profile?email=...` | Get patient profile           |
| PUT    | `/api/patients/profile`           | Save patient profile          |
| GET    | `/api/stats?email=...`            | Get booking statistics        |
| GET    | `/health`                         | Server health check           |

---

## 📬 Emails Sent Automatically

| Trigger          | Email Type         | Contains                              |
|------------------|--------------------|---------------------------------------|
| New Booking      | Booking Confirmation | Ticket ID, doctor, date, time, fee  |
| Pre-Booking      | Pre-Book Receipt   | Reference ID, slot details, next steps|
| Edit/Reschedule  | Reschedule Notice  | Old vs. new date/time                 |
| Cancel           | Cancellation Conf. | Ticket ID, rebooking link             |

---

## 🗄️ Database Schema

- **doctors** — Doctor profiles (name, specialty, fee, schedule)
- **patients** — Patient records (linked by email)
- **appointments** — Bookings (ticket ID, date, slot, status, reason)
- **booked_slots** — Prevents double-booking (unique constraint per doctor+date+slot)

---

## 🔒 Security Features

- Helmet.js security headers
- Rate limiting (100 req/15min general, 10 bookings/min)
- Input validation on all endpoints
- SQL injection prevention (parameterized queries)
- Session management with HTTP-only cookies
- Environment variables for all secrets

---

## 🛠️ Tech Stack

| Layer      | Technology                |
|------------|---------------------------|
| Backend    | Node.js + Express.js      |
| Database   | SQLite (via better-sqlite3)|
| Email      | Nodemailer                |
| Frontend   | Vanilla HTML/CSS/JS (SPA) |
| Security   | Helmet, express-rate-limit|
| Sessions   | express-session           |

---

## 📝 Notes

- SQLite is perfect for small-to-medium hospitals. For 10,000+ daily bookings, migrate to PostgreSQL by replacing `better-sqlite3` with `pg`.
- All email templates are in `services/mailer.js` — fully customizable HTML.
- The frontend is a single `public/index.html` file — no build step needed.

---

*Built with ❤️ using Node.js + Express + SQLite + Nodemailer*
