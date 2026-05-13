# Email OTP Setup with Resend

## ✅ Configuration Complete

Your Complaint Portal is now configured to send email OTPs using **Resend API**.

### Environment Variables Configured

```env
RESEND_API_KEY="re_4b1rqo38_3f5joBSA5bgtjujUrdyHfpTz"
OTP_FROM_EMAIL="Complaint Portal <noreply@chandigarhmuncipality.com>"
OTP_DEMO_PREVIEW="false"
```

### What Was Updated

1. **Installation**
   - Added `resend` npm package for official SDK support

2. **Server Configuration** (`server.ts`)
   - Imported Resend SDK
   - Updated `sendEmailOtp()` function to use the official Resend client
   - Improved error handling with typed Resend responses

3. **Environment Variables** (`.env`)
   - Configured `RESEND_API_KEY` with your API credentials
   - Set `OTP_FROM_EMAIL` to your verified Chandigarh Municipality domain
   - Disabled `OTP_DEMO_PREVIEW` to enable real email delivery

### How OTP Delivery Works

1. **User Requests OTP**
   - Via login form or citizen registration
   - API endpoint: `/api/auth/login/request-otp` or `/api/auth/register/request-otp`

2. **OTP Generated & Sent**
   - 6-digit code generated
   - Sent via Resend API to user's email
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

**Emails Not Sending?**
- Verify `RESEND_API_KEY` is correctly set in `.env`
- Confirm `OTP_FROM_EMAIL` domain is verified in Resend dashboard
- Check Resend console for delivery errors: https://resend.com/emails

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
