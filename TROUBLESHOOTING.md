# Troubleshooting Guide

## Common Issues & Solutions

### 🔴 Port Already in Use

**Error**: `Error: listen EADDRINUSE: address already in use 0.0.0.0:3000`

**Solution**:
```powershell
# Kill existing Node processes
Get-Process -Name 'node','tsx' -ErrorAction SilentlyContinue | Stop-Process -Force

# Or change port in .env
PORT=3001
```

---

### 📧 Emails Not Sending

**Symptoms**: OTP not received, email verification fails

**Check**:
1. Verify `RESEND_API_KEY` in `.env`:
   ```
   RESEND_API_KEY=re_4b1rqo38_3f5joBSA5bgtjujUrdyHfpTz
   ```

2. Check server logs show: `OTP delivery: email via Resend API`

3. If showing `demo — OTP shown in UI`: 
   - Set `OTP_DEMO_PREVIEW=false` in `.env`

4. Verify sender domain in Resend dashboard:
   - https://resend.com/emails
   - Add verified domain if using custom email

**Fix**:
```bash
# Restart server after env changes
npm run dev
```

---

### 🤖 AI Classification Not Working

**Error**: Complaints show generic category

**Check**:
```
✅ GEMINI_API_KEY set in .env
✅ API key is valid (test at ai.google.dev)
✅ Internet connection active
```

**Fallback**: Uses rules-based classification if Gemini unavailable

---

### 💾 Data Not Persisting (File Storage)

**Issue**: Complaints disappear after server restart

**This is expected with file-based storage**. Use MongoDB for production:

```bash
# Add to .env
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/complaint_portal
MONGODB_DB_NAME=complaint_portal
```

---

### 🔑 Lost Admin Password

**Solution**: Seeded admin account credentials are in `.env`:
```
ADMIN_SEED_USERNAME=admin@chandigarh.gov.in
ADMIN_SEED_PASSWORD=Admin@123
```

To reset:
1. Delete `data/admin-users.json`
2. Restart server (auto-recreates with seed credentials)

---

### 🐛 Login Not Working

**Check**:
1. User account exists (check `data/citizen-users.json`)
2. OTP is correct and not expired (5 min timeout)
3. Email address format is valid
4. Browser cookies/localStorage not cleared

**Debug**:
```bash
# Check network tab in browser DevTools
# Look for API responses in Console
```

---

### 🚀 Deployment Fails on Render

**Check Build Logs**:
1. Go to Render dashboard → Services → complaint-portal
2. Click "Logs" tab
3. Look for errors

**Common Issues**:

**"Cannot find module resend"**
- Check `package.json` includes resend
- Run `npm install resend` locally and push

**"RESEND_API_KEY is not defined"**
- Add environment variable in Render dashboard
- Redeploy after adding

**"Build failed: npm run build"**
- Run `npm run build` locally to test
- Check TypeScript errors: `npm run lint`

**App keeps restarting (crashes)**
- Check logs for errors
- Verify all required env variables are set
- Test with `npm run dev` locally

---

### 📱 Complaints Not Routing to Blocks

**Check**:
1. Location details are specific (sector, municipality)
2. AI classification ran successfully
3. Block exists (North Block B, Central Block B)

**Verify**:
- Chandigarh sectors covered: 1-63
- Municipalities configured: North/Central Chandigarh

---

### 🔐 Session Expired

**Expected**: Sessions last 15 minutes

**Solution**: 
- Re-login after expiry
- Check `AUTH_WINDOW_MS` in `server.ts` (default 15 min)

---

### 📊 Admin Dashboard Shows No Complaints

**Check**:
1. Admin is logged in (verify at http://localhost:3001)
2. Complaints exist in database (`data/complaints.json`)
3. API responds: `GET /api/complaints`

**Debug**:
```bash
# Check browser Console for errors
# Check server logs for API calls
npm run dev  # See server output
```

---

### 🔌 Cannot Connect to MongoDB

**Error**: `MongoServerError` or connection timeout

**Check**:
1. Connection string format: `mongodb+srv://user:pass@cluster.mongodb.net/`
2. IP address whitelisted in MongoDB Atlas
3. Credentials are correct (no special chars issues)
4. Network access allowed

**Fix**:
```bash
# Test connection string
# Copy from MongoDB Atlas → Connect → Node.js

# Add to .env
MONGODB_URI=<paste_connection_string>

# Restart
npm run dev
```

---

### 🎨 UI Looks Broken

**Solutions**:
1. **Clear browser cache**: Ctrl+Shift+Del → Clear all
2. **Hard refresh**: Ctrl+Shift+R
3. **Rebuild CSS**: Delete `dist/` and rebuild
4. **Check console errors**: F12 → Console tab

---

### ⚡ App Very Slow

**Check**:
1. Network tab in DevTools (slow API calls?)
2. `npm run dev` server logs for errors
3. Gemini API response time (AI classification)

**Optimization**:
- Use MongoDB instead of JSON files
- Add caching for categories
- Reduce OTP timeout polling

---

## Getting Help

1. **Check logs**: `npm run dev` output
2. **Browser DevTools**: F12 → Console & Network tabs
3. **GitHub Issues**: Search similar problems
4. **Environment**: Verify `.env` has all required keys

## Useful Commands

```bash
# Clean rebuild
npm run clean && npm run build && npm run preview

# Type check before deployment
npm run lint

# View active processes
Get-Process | Where-Object {$_.ProcessName -like "*node*"}

# Check if port is free
netstat -ano | findstr :3000
```

## Still Stuck?

1. Document the error message
2. Note steps to reproduce
3. Share `.env` template (not actual values!)
4. Post GitHub issue with details
