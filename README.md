# Complaint Portal

A full-stack municipal complaint management platform built with React, Express, and Node.js. Citizens file complaints, admins route them to appropriate blocks, and block operators track progress.

## 🎯 Features

- **Citizen Portal**: Register via OTP, file complaints, track real-time updates
- **Admin Dashboard**: View all complaints, route to blocks, update status
- **Block Portal**: Update complaint progress, mark work completion
- **Email OTP**: Secure authentication via Resend API
- **AI Classification**: Auto-categorizes complaints using Google Gemini API
- **Multi-municipality**: Routes to North/Central Chandigarh blocks
- **Real-time UI**: Live dashboard with complaint statistics
- **Persistent Storage**: MongoDB Atlas or file-based storage

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- npm or yarn

### Setup
```bash
# 1. Clone and install
git clone <your-repo-url>
cd complaint-portal
npm install

# 2. Configure environment
cp .env.example .env

# 3. Add your API keys to .env:
# RESEND_API_KEY=re_your_key_here
# GEMINI_API_KEY=your_gemini_key_here
# MONGODB_URI=your_mongodb_connection_string (optional)

# 4. Start development
npm run dev
```

### Local Portals
| Portal | URL | Purpose |
|--------|-----|---------|
| Citizen | http://localhost:3000 | File & track complaints |
| Admin | http://localhost:3001 | Manage all complaints |
| North Block B | http://localhost:3002 | Block operations |
| Central Block B | http://localhost:3003 | Block operations |

## 👥 Default Accounts

### Admin
- Username: `admin@chandigarh.gov.in`
- Password: `Admin@123`

### Citizens
- `CIT-1001` / `Citizen@123`
- `CIT-1002` / `Resident@123`

### Block Operators
- `north.blockb` / `Block@123`
- `central.blockb` / `Block@123`

## 🔧 Environment Variables

```env
# Email OTP (Required for production)
RESEND_API_KEY=your_api_key
OTP_FROM_EMAIL="Complaint Portal <noreply@domain.com>"
OTP_DEMO_PREVIEW=false

# AI Classification
GEMINI_API_KEY=your_api_key

# Database (Optional - uses JSON files if not set)
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/
MONGODB_DB_NAME=complaint_portal

# Admin Seeding
ADMIN_SEED_USERNAME=admin@chandigarh.gov.in
ADMIN_SEED_PASSWORD=Admin@123

# Rate Limiting
LOGIN_RATE_LIMIT=10
OTP_RATE_LIMIT=5
```

## 📁 Project Structure

```
complaint-portal/
├── server.ts                 # Express backend
├── src/                      # React frontend
│   ├── components/          # React components
│   ├── index.css            # Global styles
│   └── main.tsx             # App entry
├── shared/                  # Shared types & utils
├── data/                    # JSON file storage
├── .env.example             # Environment template
├── render.yaml              # Render deployment config
└── package.json             # Dependencies
```

## 🚢 Deployment

### Render (Free & Easiest)
```bash
# 1. Push to GitHub
git add .
git commit -m "Ready for Render deployment"
git push origin main

# 2. Go to render.com, connect your GitHub repo
# 3. Add environment variables (RESEND_API_KEY, GEMINI_API_KEY)
# 4. Deploy!
```

See [RENDER_DEPLOYMENT.md](./RENDER_DEPLOYMENT.md) for detailed steps.

## 🔐 Security

- ✅ `.env` files excluded via `.gitignore`
- ✅ Password hashing with bcryptjs
- ✅ OTP rate limiting
- ✅ Email validation
- ✅ Session token expiry

## 📧 Email OTP Setup

Emails sent via [Resend API](https://resend.com):

1. Sign up at https://resend.com
2. Create API key
3. Verify sender domain
4. Add `RESEND_API_KEY` to `.env`

See [EMAIL_OTP_SETUP.md](./EMAIL_OTP_SETUP.md) for troubleshooting.

## 🛠️ Scripts

```bash
npm run dev        # Start development server
npm run build      # Build for production
npm run preview    # Preview production build
npm run lint       # TypeScript type check
npm run clean      # Remove build artifacts
```

## 📝 API Endpoints

### Authentication
- `POST /api/auth/login/request-otp` - Request login OTP
- `POST /api/auth/login/verify-otp` - Verify login OTP
- `POST /api/auth/register/request-otp` - Request registration OTP
- `POST /api/auth/register/verify` - Complete registration

### Complaints
- `GET /api/complaints` - List complaints (authenticated)
- `POST /api/complaints` - Create complaint
- `PATCH /api/complaints/:id/update` - Update complaint status

### Admin Only
- `POST /api/admin/complaints/:id/assign` - Route complaint to block

### Block Operator
- `PATCH /api/block/complaints/:id/update` - Update complaint progress

## 🧪 Testing

```bash
# Test OTP locally
# Set OTP_DEMO_PREVIEW=true in .env to see OTP in UI

# Test production email
# Set RESEND_API_KEY and OTP_DEMO_PREVIEW=false
```

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/your-feature`)
3. Commit changes (`git commit -m 'Add feature'`)
4. Push to branch (`git push origin feature/your-feature`)
5. Open Pull Request

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## 📄 License

MIT License - feel free to use for educational and commercial projects.

## 🆘 Support

- Check [RENDER_DEPLOYMENT.md](./RENDER_DEPLOYMENT.md) for deployment issues
- See [EMAIL_OTP_SETUP.md](./EMAIL_OTP_SETUP.md) for email problems
- Review logs in `npm run dev` output

## 🎓 Built For

Chandigarh Municipal Corporation complaint management system.

- `north.blockb` / `Block@123`
- `central.blockb` / `Block@123`

OTP notes:

- Registration requires OTP verification
- Citizen sign-in supports password or OTP
- **Real email:** Configure `.env` with either **SMTP** (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, and `OTP_FROM_EMAIL`) or **`RESEND_API_KEY`** (and a valid `OTP_FROM_EMAIL`). Restart the server. See `.env.example`.
- **Demo (no inbox):** With no SMTP and no Resend in development, OTP is returned as `otpPreview` and shown on the page only.
- **Production:** Set `NODE_ENV=production` and configure SMTP or Resend; keep `OTP_DEMO_PREVIEW` unset or `false` so the OTP is not exposed in API responses.
- On startup the server logs **`OTP delivery:`** so you can confirm demo vs SMTP vs Resend.
- Citizen OTP uses **email** only when you sign in with an identifier that matches the account email; otherwise it targets **phone**, and real SMS is not implemented in this repo.

## API surface

- `GET /api/health` returns service health, complaint count, persistence mode, and AI availability
- `GET /api/municipalities` returns the Chandigarh municipality/block/sector map
- `POST /api/complaints` creates a complaint for the authenticated citizen
- `POST /api/auth/register/request-otp` starts citizen registration
- `POST /api/auth/register/verify` completes citizen registration
- `POST /api/auth/login/password` signs in a citizen with ID/phone/email and password
- `POST /api/auth/login/request-otp` starts citizen OTP login
- `POST /api/auth/login/verify-otp` completes citizen OTP login
- `GET /api/citizen/dashboard` returns the citizen profile and their complaints
- `POST /api/admin/login` signs into the admin portal
- `GET /api/admin/complaints` returns all complaints and municipality definitions for authenticated admins
- `PATCH /api/admin/complaints/:id/assign` manually routes an incomplete complaint to a municipality block
- `PATCH /api/admin/complaints/:id/update` adds admin remarks or status/work-done updates
- `POST /api/block/login` signs into a block website
- `GET /api/block/dashboard` returns complaints for the authenticated block only
- `PATCH /api/block/complaints/:id/update` adds block remarks and marks work done or in progress

Example request:

```json
{
  "city": "Chandigarh",
  "sector": "22",
  "locationDetails": "Near sector market",
  "complaint": "Water pipeline leakage near the Sector 22 market is flooding the road and affecting nearby homes."
}
```

## Build checks

- Typecheck: `npm run lint`
- Frontend build: `npm run build`

## Multilingual testing

To bulk-test English, Hindi, and Hinglish complaint routing:

1. Start the app with `npm run dev`
2. In another terminal, run `npm run seed:multilingual`

This posts the sample cases from `fixtures/multilingual-complaints.json` to the live API and prints:

- complaint language
- predicted category
- predicted severity
- expected category/severity for a quick sanity check
- classification source and generated case ID

If your app is running on a different port or host, set `APP_BASE_URL` first:

```powershell
$env:APP_BASE_URL="http://localhost:3001"
npm run seed:multilingual
```

## Persistence

Complaint records are saved to `data/complaints.json` at runtime. The server creates this file automatically if it does not exist.

Admin users are stored in `data/admin-users.json`.

Citizen users are stored in `data/citizen-users.json`.

Block users are stored in `data/block-users.json`.
