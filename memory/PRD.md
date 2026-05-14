# Complaint Portal — PRD (working notes)

## Original problem statement (this session)
"fix otp issues in this project I need otps and also help keep the ui same"

## Stack
- Express + Vite + React (TypeScript)
- MongoDB (optional) or file-based JSON storage in /app/data
- Email OTP via Brevo SMTP / Gmail SMTP / Resend (auto-detected)

## What was fixed this session (2026-05-14)
- Diagnosed: OTP emails were not being delivered because there was **no `.env` file** in `/app`.
  The server's OTP delivery code (server.ts) was correct, but with no SMTP/Resend/Brevo
  credentials it fell back to demo-preview mode.
- Created `/app/.env` with Brevo SMTP credentials provided by the user:
  - SMTP_HOST=smtp-relay.brevo.com
  - SMTP_PORT=587
  - SMTP_USER=ab36c2001@smtp-brevo.com
  - SMTP_PASS=********
  - OTP_FROM_EMAIL="Complaint-classifier <manvi.raina.31@gmail.com>"
  - OTP_DEMO_PREVIEW=false
- Verified delivery end-to-end:
  - SMTP `verify()` passed.
  - Test email delivered to manvi.raina.31@gmail.com.
  - `/api/auth/register/request-otp` → email sent, 201 OK.
  - `/api/auth/login/request-otp` → email sent, 201 OK.
  - `/api/admin/login/request-otp` → email sent, 201 OK.
  - `/api/health` reports `otpDelivery: "email via SMTP (smtp-relay.brevo.com:587)"`.
- UI was not modified (per user request to keep UI the same).

## Deployment note
The `.env` file is local only. If deployed on Render / any host, the same variables
(SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, OTP_FROM_EMAIL, OTP_DEMO_PREVIEW=false) must be
set in that platform's Environment tab and the service redeployed.

## Backlog / Next
- Verify a custom domain in Brevo so OTPs come from an official domain (e.g. noreply@chandigarhmuncipality.com) rather than a Gmail address — improves deliverability and trust.
- Consider rate-limiting OTP requests per email (currently per IP+identifier window).
