# Quick Reference

## 🚀 Getting Started (3 Steps)

```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env
# Edit .env with your API keys

# 3. Run
npm run dev
```

**Then open**: http://localhost:3000

---

## 📍 Portal URLs

| Role | URL | Port | Purpose |
|------|-----|------|---------|
| 👤 Citizen | localhost:3000 | 3000 | File complaints |
| 🔐 Admin | localhost:3001 | 3001 | Manage all |
| 🏢 Block North | localhost:3002 | 3002 | Operations |
| 🏢 Block Central | localhost:3003 | 3003 | Operations |

---

## 🔑 Demo Accounts

```
ADMIN
  Email: admin@chandigarh.gov.in
  Password: Admin@123

CITIZEN 1
  ID: CIT-1001
  Password: Citizen@123

CITIZEN 2
  ID: CIT-1002
  Password: Resident@123

BLOCK NORTH
  Username: north.blockb
  Password: Block@123

BLOCK CENTRAL
  Username: central.blockb
  Password: Block@123
```

---

## 🛠️ Development Commands

```bash
npm run dev          # Start all portals
npm run build        # Build for production
npm run preview      # Test production build
npm run lint         # Check TypeScript
npm run clean        # Remove build files
npm run seed:multilingual  # Load test data
```

---

## 📦 What's Required in .env

```env
# Essential for Production
RESEND_API_KEY=your_api_key_here
GEMINI_API_KEY=your_gemini_key

# Optional
MONGODB_URI=mongodb+srv://...
```

---

## 📧 Email Setup

1. **Sign up**: https://resend.com
2. **Create API key**
3. **Add to .env**: `RESEND_API_KEY=re_...`
4. **Test**: File complaint, check email

---

## 🚢 Deploy to Vercel

1. Push to GitHub:
   ```bash
   git init
   git add .
   git commit -m "initial"
   git remote add origin <your-repo>
   git push origin main
   ```

2. Go to: https://vercel.com/new
3. Import your GitHub repo
4. Add environment variables
5. Deploy!

---

## 🐛 Quick Troubleshooting

| Problem | Solution |
|---------|----------|
| Port in use | `Get-Process -Name node \| Stop-Process -Force` |
| Emails not sent | Check `RESEND_API_KEY` in `.env` |
| Data lost on restart | Use MongoDB (file storage is temp) |
| Slow responses | Check internet, Gemini API rate limit |
| Login fails | Verify `.env`, check browser cookies |

---

## 📁 Key Files

```
.env                 ← Your secrets (don't commit!)
.env.example         ← Template (safe to commit)
server.ts            ← Backend (Express)
src/                 ← Frontend (React)
data/                ← Stored complaints (JSON)
vercel.json          ← Deployment config
```

---

## 🔒 Security Checklist

- ✅ `.env` in `.gitignore` (not pushed to GitHub)
- ✅ API keys only in `.env` file
- ✅ HTTPS in production (automatic with Vercel)
- ✅ Rate limiting on OTP requests
- ✅ Password hashed with bcryptjs

---

## 📊 API Endpoints Cheat Sheet

```bash
# Auth
POST /api/auth/login/request-otp
POST /api/auth/login/verify-otp
POST /api/auth/register/request-otp
POST /api/auth/register/verify

# Complaints
GET  /api/complaints              # List my complaints
POST /api/complaints              # File new complaint
PATCH /api/complaints/:id/update  # Update status

# Admin Only
POST /api/admin/complaints/:id/assign

# Block Only
PATCH /api/block/complaints/:id/update
```

---

## 🆘 Emergency Help

**Server won't start?**
```bash
npm run clean
npm install
npm run dev
```

**Lost in .env?**
```bash
cat .env.example  # See all options
```

**Check what's running?**
```bash
Get-Process -Name node, tsx
```

---

## 📚 Full Documentation

- [README.md](./README.md) - Overview & features
- [ARCHITECTURE.md](./ARCHITECTURE.md) - System design
- [VERCEL_DEPLOYMENT.md](./VERCEL_DEPLOYMENT.md) - Deployment guide
- [EMAIL_OTP_SETUP.md](./EMAIL_OTP_SETUP.md) - Email config
- [CONTRIBUTING.md](./CONTRIBUTING.md) - How to contribute
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) - Problem solving

---

**Last Updated**: May 2026  
**Version**: 1.0.0
