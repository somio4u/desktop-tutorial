# Series Cast & Crew Platform

हर web series का अलग cast & crew database, और हर series का अपना shareable form link।

## Run
```bash
ADMIN_PASSWORD=yourpassword npm start     # http://localhost:3000
```
- `/` → admin dashboard (password login): series बनाएँ, series पर click करके पूरा database देखें
  (department tabs, search, CSV export, print, delete)
- `/s/<slug>` → public form link (हर series का अलग) जो cast & crew को भेजना है
- Data `data/db.json` में और selfies `data/uploads/` में save होती हैं (इस folder का backup रखें)।

Departments/designations बदलने के लिए `config.js` edit करें।

## Google Drive sync
Admin dashboard → **Connect Google Drive**. Drive में यह structure अपने-आप बनता है:
```
Database of Series/
  <Series name>/
    Artist Photos/        ← हर artist की selfie (Character_Name_Phone.jpg)
    <Series> – Cast & Crew   ← Google Sheet (सारी details + photo links), हर entry पर auto-update
```
App सिर्फ़ वही files छू सकता है जो उसने खुद बनाई हैं (scope `drive.file`)। Local `data/` हमेशा primary copy रहती है; Drive नीचे गिर जाए तो retry के लिए **Sync now** दबाएँ।

### One-time setup (Google Cloud)
1. https://console.cloud.google.com → नया project → **APIs & Services → Library → Google Drive API → Enable**
2. **OAuth consent screen** बनाएँ (External, अपना email test user में जोड़ें)
3. **Credentials → Create credentials → OAuth client ID → Web application**
   - *Authorized redirect URI*: `https://<आपका-domain>/auth/google/callback` (dashboard का Google card यही URL दिखाता है)
4. Server चलाते समय:
```bash
GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... ADMIN_PASSWORD=... PUBLIC_URL=https://<आपका-domain> npm start
```
Export: series page से **Excel (.xlsx)**, **CSV**, या **Print** (नाम, number, photo सब एक साथ)।
