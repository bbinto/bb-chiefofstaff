# Settings Endpoint Troubleshooting

If you see: **"Failed to fetch settings"** when opening Settings panel, follow these steps:

## 🔧 Quick Fix

### Step 1: Restart the Frontend Server
The code changes need to be reloaded:

```bash
# Cancel current server (Ctrl+C)
# Then start fresh:
npm run server
```

### Step 2: Clear Browser Cache
```bash
# Hard refresh in browser:
- Windows/Linux: Ctrl+Shift+R
- Mac: Cmd+Shift+R
- Or manually clear cache in DevTools
```

### Step 3: Check Browser Console
Open DevTools (F12) → Console tab and look for:
- 📡 messages showing API calls
- Error messages with HTTP status codes
- 401 Unauthorized errors

## 🔍 Diagnostic Steps

### Option A: Using Diagnostic Script
```bash
chmod +x test-llm-settings.sh
./test-llm-settings.sh
```

This will check:
- ✅ Server is running
- ✅ GET /api/settings/llm endpoint responds
- ✅ PUT /api/settings/llm endpoint responds
- ✅ Environment variables are set

### Option B: Manual Testing
Test the API endpoint directly:

```bash
# Test GET (fetch settings)
curl -v http://localhost:3000/api/settings/llm

# Test PUT (save settings)
curl -X PUT http://localhost:3000/api/settings/llm \
  -H "Content-Type: application/json" \
  -d '{"useOllama": false}'
```

## 🚨 Common Issues & Solutions

### Issue 1: "401 Unauthorized"
**Cause**: Password protection is enabled  
**Solution**:
- Make sure you're logged in (Settings button shouldn't appear without login)
- Check that `APP_PASSWORD` env var matches what you entered in login
- Try logging out and back in

### Issue 2: "404 Not Found"
**Cause**: Endpoint not registered  
**Solution**:
- Restart the frontend server: `npm run server`
- Verify endpoints exist:
  ```bash
  grep -n "app.get.*settings/llm" frontend/server.js
  grep -n "app.put.*settings/llm" frontend/server.js
  ```

### Issue 3: "CORS Error"
**Cause**: Frontend and backend on different origins  
**Solution**:
- CORS is already enabled with `app.use(cors())`
- Make sure `VITE_API_URL` is set correctly (if using proxy)
- Check browser console for actual CORS error message

### Issue 4: Settings loads but won't save
**Cause**: PUT endpoint issue  
**Solution**:
- Check server logs for errors
- Verify Content-Type header is set (should be "application/json")
- Try deleting browser cache and local storage:
  ```javascript
  // In browser console:
  localStorage.clear()
  location.reload()
  ```

## 📋 Check Server Logs

Look for these log messages indicating proper startup:

```
✅ LLM settings updated: { useOllama: false, model: 'claude-sonnet...' }
🔄 LLM settings initialized: { useOllama: false, ollamaModel: 'mistral', ... }
📡 GET /api/settings/llm
📡 PUT /api/settings/llm
```

## 🧪 Debug Mode

Add logging to see what's happening:

```javascript
// In Settings.jsx, look at browser console for:
// 📡 Fetching settings from: http://localhost:3000/api/settings/llm
// 📡 Saving settings: { useOllama: false, ... }
```

## 🔄 Full Reset

If nothing works, do a complete reset:

```bash
# 1. Stop all servers (Ctrl+C)
# 2. Clear all caches
rm -rf frontend/node_modules/.vite
rm -rf frontend/dist

# 3. Start fresh
npm install
npm run server
```

Then:
- Click Settings
- Watch browser console (F12 → Console tab)
- Report any errors you see

## 📞 If Still Not Working

1. **Check if backend endpoint exists**:
   ```bash
   grep -A5 "app.get.*settings/llm" frontend/server.js
   ```

2. **Check if port 3000 is listening**:
   ```bash
   lsof -i :3000
   # or
   netstat -an | grep 3000
   ```

3. **Check Node/npm versions**:
   ```bash
   node --version # Should be v14+
   npm --version  # Should be v6+
   ```

4. **View raw error in browser**:
   - Open DevTools Network tab
   - Click on the failed /api/settings/llm request
   - Look at Response tab for actual error message

5. **Check system logs**:
   ```bash
   # macOS
   log stream --predicate 'process == "node"' --level debug
   
   # Linux
   journalctl -u node -f
   ```

## 💡 Tips

- **Password**: If you see "401 Unauthorized", Settings button proves you're logged in, so the password should be passed correctly
- **Environment Variables**: Initial settings come from env vars - check them with `printenv | grep -E "USE_OLLAMA|OLLAMA|CLAUDE"`
- **Session**: Settings persist in memory until server restart - reload frontend won't reset them

## ✅ Verification Checklist

- [ ] Frontend server is running (`npm run server`)
- [ ] Can access http://localhost:3000 in browser
- [ ] Can click Settings button (means logged in)
- [ ] Browser console shows 📡 fetch messages
- [ ] Network tab shows `/api/settings/llm` with 200 status
- [ ] Settings page loads without "Failed to fetch"
