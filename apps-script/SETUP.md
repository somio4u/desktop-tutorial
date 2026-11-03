# Google Apps Script version — setup (GitHub/Render/Google Cloud की ज़रूरत नहीं)

सारा data आपके Google Drive में रहता है:
```
Database of Series/
  <Series name>/
    Artist Photos/
    <Series> – Cast & Crew   (Google Sheet)
```

## Steps
1. https://script.google.com खोलें (अपने Google account से) → **New project**।
2. Project का नाम रखें, जैसे `Series Platform`।
3. `Code.gs` में जो है सब हटाकर इस repo की `apps-script/Code.gs` का पूरा code paste करें।
4. **ADMIN_PASSWORD** वाली line (line 9) में `CHANGE-ME` की जगह अपना password लिखें।
5. बाईं तरफ़ **Files +** → **HTML** से तीन files बनाएँ। नाम बिल्कुल ऐसे हों (`.html` खुद लग जाता है):
   `form`, `admin`, `styles` — और हर एक में repo की उसी नाम वाली file का code paste करें।
6. ऊपर function list में **setup** चुनकर **Run** दबाएँ → **Review permissions** → अपना account →
   "Google hasn't verified this app" आए तो **Advanced → Go to … (unsafe)** → **Allow**।
   (यह आपकी अपनी script है; permission सिर्फ़ आपके Drive/Sheets के लिए है।)
7. **Deploy → New deployment → ⚙ Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - **Deploy** → मिला `https://script.google.com/macros/s/…/exec` URL ही आपका dashboard है।
8. उस URL को खोलें → password से login → series बनाएँ → **Copy link** से form link cast & crew को भेजें।

## Code बदलने के बाद
**Deploy → Manage deployments → ✏ Edit → Version: New version → Deploy**। (URL वही रहता है।)
