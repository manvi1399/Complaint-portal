# Vercel Deployment Guide

## Prerequisites
- GitHub account
- Vercel account (free)
- Your project pushed to GitHub

## Step 1: Push to GitHub

```bash
# Initialize git (if not already done)
git init
git add .
git commit -m "Initial commit: Complaint Portal"

# Create a repository on GitHub, then:
git remote add origin https://github.com/YOUR_USERNAME/complaint-portal.git
git branch -M main
git push -u origin main
```

## Step 2: Deploy on Vercel

1. Go to https://vercel.com/new
2. Click "Import Git Repository"
3. Paste: `https://github.com/YOUR_USERNAME/complaint-portal`
4. Click "Import"
5. Skip project configuration (uses vercel.json)
6. Click "Deploy"

## Step 3: Add Environment Variables

**In Vercel Dashboard:**
1. Go to your project → Settings → Environment Variables
2. Add these variables:

```
RESEND_API_KEY = re_4b1rqo38_3f5joBSA5bgtjujUrdyHfpTz
OTP_FROM_EMAIL = Complaint Portal <noreply@chandigarhmuncipality.com>
GEMINI_API_KEY = [your key]
MONGODB_URI = [optional - if using MongoDB]
MONGODB_DB_NAME = complaint_portal
```

3. Click "Save"

## Step 4: Redeploy

After adding env vars:
1. Go to Deployments tab
2. Click the latest deployment
3. Click "Redeploy" button

## Important Notes

- **Ports don't matter on Vercel** — all portals run on the same domain
- **File-based storage works** — complaints save in-memory or to temp storage
- **For production, use MongoDB** — file storage won't persist between deployments
- **First deploy takes ~2-3 minutes**

## Your URLs After Deployment

- Citizen Portal: `https://your-project-name.vercel.app`
- Admin Portal: `https://your-project-name.vercel.app/admin` (or separate URL depending on setup)
- Block Portals: `https://your-project-name.vercel.app/block-north`, `/block-central`

## Troubleshooting

**Deployment fails?**
- Check build logs in Vercel dashboard
- Ensure all environment variables are set
- Run `npm run build` locally to test

**Emails not sending?**
- Verify RESEND_API_KEY is correct in Vercel env vars
- Check Resend dashboard: https://resend.com/emails

**Database errors?**
- Use MongoDB for production (file storage doesn't persist)
- Or accept that data resets on each deployment
