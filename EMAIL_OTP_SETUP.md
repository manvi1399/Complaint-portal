# Email OTP Setup

## ✅ Configuration Complete

Your Complaint Portal sends real email OTPs using **Brevo API**, **Gmail SMTP**, or **Resend API**. On Render Free, use Brevo API because Gmail SMTP ports are blocked.

### Environment Variables Configured

Recommended real email option on Render:

```env
BREVO_API_KEY="xkeysib-your-api-key"
BREVO_FROM_EMAIL="Complaint Portal <your-verified-brevo-sender@example.com>"
OTP_DEMO_PREVIEW="false"
```

Brevo uses HTTPS, so it works on Render Free without SMTP ports. The sender email must be added and verified in Brevo.

Free Gmail SMTP option outside Render Free:

```env
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER="yourgmail@gmail.com"
SMTP_PASS="your 16 character Google app password"
OTP_FROM_EMAIL="Complaint Portal <yourgmail@gmail.com>"
OTP_DEMO_PREVIEW="false"
```

Resend option after your domain is verified:

```env
RESEND_API_KEY="re_your_api_key"
OTP_FROM_EMAIL="Complaint Portal <noreply@your-verified-domain.com>"
OTP_DEMO_PREVIEW="false"
```

> **Important for Render:** values in your local `.env` file are not deployed automatically. Set `BREVO_API_KEY`, `BREVO_FROM_EMAIL`, and `OTP_DEMO_PREVIEW=false` in the Render service Environment tab, then redeploy.
>
> Resend's default `onboarding@resend.dev` sender is only for testing and can only send to the email address on your Resend account. For real users, verify a custom domain and use an address on that domain.

### What Was Updated

1. **Installation**
   - Added `resend` npm package for official SDK support
   - Added Brevo API support for Render Free
   - Added `nodemailer` SMTP support for Gmail or other SMTP providers

2. **Server Configuration** (`server.ts`)
   - Updated `sendEmailOtp()` to try Brevo API before SMTP or Resend
   - Improved provider-specific error logging

3. **Environment Variables** (`.env`)
   - Configured `BREVO_API_KEY`, SMTP, or `RESEND_API_KEY` with your email credentials
   - Set `BREVO_FROM_EMAIL` or `OTP_FROM_EMAIL` to your verified sender
   - Disabled `OTP_DEMO_PREVIEW` to enable real email delivery

### How OTP Delivery Works

1. **User Requests OTP**
   - Via login form or citizen registration
   - API endpoint: `/api/auth/login/request-otp` or `/api/auth/register/request-otp`

2. **OTP Generated & Sent**
   - 6-digit code generated
   - Sent via Brevo API, Gmail SMTP, or Resend API to user's email
   - Code expires in 5 minutes

3. **User Verifies OTP**
   - Enters code from email
   - API validates and issues authentication token

### Testing the Setup

1. Start the development server:
   ```bash
   npm run dev
   ```

2. Navigate to the citizen login page (http://localhost:3000)

3. Select **OTP** tab

4. Enter a test email address

5. Check email inbox for OTP code

### Troubleshooting

**Emails Not Sending on Render?**
- Verify `BREVO_API_KEY`, `BREVO_FROM_EMAIL`, and `OTP_DEMO_PREVIEW=false` are set in Render's Environment tab, not only in local `.env`
- Confirm `BREVO_FROM_EMAIL` is a verified Brevo sender
- If using Gmail SMTP, remember Render Free blocks SMTP ports; use Brevo API instead
- If using Resend, verify `RESEND_API_KEY` is set and `OTP_FROM_EMAIL` uses a verified Resend domain for real recipients
- Open `/api/health` on your Render URL and check `otpDelivery`
- Check Render logs for startup line: `OTP delivery: email via Brevo API`
- Check Resend console for delivery errors: https://resend.com/emails

**Emails Not Sending Locally?**
- Verify SMTP or `RESEND_API_KEY` is correctly set in `.env`
- Confirm `OTP_FROM_EMAIL` matches your Gmail account or verified Resend domain
- Check Resend console for delivery errors: https://resend.com/emails

### Brevo API Setup (Works on Render Free)

1. Create a free Brevo account.
2. Go to SMTP & API > API Keys and create an API key.
3. Go to Senders & IP and add/verify your sender email.
4. Add these variables in Render:
   ```env
   BREVO_API_KEY=xkeysib-your-api-key
   BREVO_FROM_EMAIL=Complaint Portal <your-verified-sender@example.com>
   OTP_DEMO_PREVIEW=false
   ```
5. Redeploy the Render service.
6. Check `/api/health`; `otpDelivery` should say `email via Brevo API`.

### Gmail SMTP Setup (Not for Render Free)

1. Enable 2-Step Verification on the Gmail account you want to send from.
2. Open Google Account > Security > App passwords.
3. Create an app password for Mail.
4. Add these variables in Render:
   ```env
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=yourgmail@gmail.com
   SMTP_PASS=your_16_character_app_password
   OTP_FROM_EMAIL=Complaint Portal <yourgmail@gmail.com>
   OTP_DEMO_PREVIEW=false
   ```
5. Redeploy the Render service.
6. Check `/api/health`; `otpDelivery` should say `email via SMTP (smtp.gmail.com:587)`.

**Domain Not Verified Error?**
If you see an error like "The domain is not verified", you need to either:
1. For a one-account test, send only to the email address that owns your Resend account, OR
2. Verify your custom domain following the steps below

### Custom Domain Setup (Production)

To use your own domain (e.g., `chandigarhmuncipality.com`) for sending emails:

1. **Go to Resend Domains Dashboard**
   - Visit: https://resend.com/domains
   - Click "Add Domain"

2. **Enter Your Domain**
   - Domain: `chandigarhmuncipality.com` (or your preferred domain)
   - Click "Add Domain"

3. **Add DNS Records**
   Resend will provide DNS records you need to add to your domain's DNS settings:
   - **TXT Record** (for SPF): Verifies domain ownership
   - **CNAME Records** (for DKIM): Enables email signing (usually 2-3 records)

   Example DNS records to add:
   ```
   Type: TXT
   Name: @ (or leave blank)
   Value: v=spf1 include=resend.com ~all

   Type: CNAME
   Name: resend._domainkey
   Value: resend._domainkey.chandigarhmuncipality.com.resend-dkim.com
   ```

4. **Verify Domain**
   - After adding DNS records, click "Verify" in the Resend dashboard
   - DNS propagation may take a few minutes to several hours

5. **Update OTP_FROM_EMAIL**
   Once verified, update your `.env` file:
   ```env
   OTP_FROM_EMAIL="Complaint Portal <noreply@chandigarhmuncipality.com>"
   ```

6. **Restart the Server**
   ```bash
   npm run dev
   ```

**Configuration Issues?**
- Both SMTP and Resend are supported
- Uncomment SMTP settings in `.env` to switch providers
- Server auto-detects which provider to use (SMTP takes priority)

### Files Modified

- `server.ts` - Updated email delivery logic
- `.env` - Added Resend API configuration
- `package.json` - Added resend dependency

### Next Steps

1. **Verify Sender Domain** in Resend Dashboard
   - Add your municipality domain as a verified sender
   - Update `OTP_FROM_EMAIL` with your domain email address

2. **Test Email Delivery**
   - Send a test OTP and verify it arrives
   - Check email delivery status in Resend dashboard

3. **Monitor Usage**
   - Resend provides email analytics at https://resend.com/emails
   - Track delivery rates and user engagement
