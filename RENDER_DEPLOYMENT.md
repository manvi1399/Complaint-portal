# Render Deployment Guide

Deploy the Complaint Portal to Render in 5 minutes.

## Prerequisites
- GitHub account with this repo pushed
- Render account (sign up at https://render.com)
- API keys ready: `GEMINI_API_KEY`
- For OTP email: Brevo API key and verified Brevo sender

## Steps

### 1. Push to GitHub
```bash
git add .
git commit -m "Switch to Render deployment"
git push origin main
```

### 2. Create Render Web Service
- Go to [render.com/dashboard](https://render.com/dashboard)
- Click **"New +"** → **"Web Service"**
- Select your repository
- Fill in:
  - **Name**: `complaint-portal`
  - **Branch**: `main`
  - **Build Command**: Pre-filled (should be `npm install && npm run build`)
  - **Start Command**: Pre-filled from `render.yaml` (should be `npx tsx server.ts`)
  - **Plan**: Free tier (good for demo)

### 3. Add Environment Variables
In the Render dashboard, add these under **Environment**:

```
GEMINI_API_KEY=your_gemini_api_key_here
MONGODB_URI=your_mongodb_uri_here (optional - uses JSON files if empty)
MONGODB_DB_NAME=complaint_portal
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=yourgmail@gmail.com
SMTP_PASS=your_16_character_google_app_password
OTP_FROM_EMAIL=Complaint Portal <yourgmail@gmail.com>
BREVO_API_KEY=xkeysib-your-brevo-api-key
BREVO_FROM_EMAIL=Complaint Portal <your-verified-brevo-sender@example.com>
OTP_DEMO_PREVIEW=false
ADMIN_SEED_PASSWORD=Admin@123
```

For real email on Render Free, use Brevo. The app sends through Brevo's HTTPS API before trying SMTP or Resend, so it avoids Render's SMTP port restrictions.

### 4. Deploy
Click **"Create Web Service"** and watch the logs. Takes 2-3 minutes.

### 5. Get Your URL
Once deployed, you'll see a URL like:
```
https://complaint-portal-abc.onrender.com
```

Visit it to access the Complaint Portal!

Production portal URLs:
```
Citizen:        https://your-service.onrender.com/
Admin:          https://your-service.onrender.com/admin
North Block:    https://your-service.onrender.com/block/north
Central Block:  https://your-service.onrender.com/block/central
Health:         https://your-service.onrender.com/api/health
```

## Free Tier Notes
- App sleeps after 15 minutes of inactivity
- First access after sleep takes ~30 seconds to wake up
- Upgrade to paid tier ($7/month) to keep it always running

## Troubleshooting

**Build fails:**
- Check `npm run build` works locally
- Ensure `render.yaml` `startCommand` matches a script in `package.json`

**Crashes on deploy:**
- Check logs in Render dashboard
- Verify all required environment variables are set
- Check `npm run dev` works locally

**OTP not sending:**
- Confirm Render logs show `OTP delivery: email via Brevo API`
- Visit `https://your-service.onrender.com/api/health` and check `otpDelivery`
- Confirm `brevoConfigured` is `true`
- Confirm `BREVO_FROM_EMAIL` is a verified sender in Brevo
- Make sure the citizen account has an email address; phone/SMS OTP is not implemented
- If Resend returns a 403 for `onboarding@resend.dev`, verify a domain and update `OTP_FROM_EMAIL`

**Port issues:**
- Render automatically assigns port via `PORT` env var
- `server.ts` reads it with `process.env.PORT ?? "3000"`

## Next Steps
- Add MongoDB Atlas URI for persistence (optional)
- Configure Brevo API or Resend for real emails
- Set up domain custom domain (paid tier only)
