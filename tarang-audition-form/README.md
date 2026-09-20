# Tarang Plus Audition Registration Form

A mobile-friendly audition sign-up page for Tarang Plus. Attendees enter their
**name, age, city and experience**, and can **take a selfie** and/or
**attach as many photos as they like** — there's no limit on file count,
size or format built into the form.

Every submission is saved straight into **your own Google Sheet**, and every
photo into **your own Google Drive folder** — using a free Google Apps Script
backend (no server or paid hosting needed).

Files:
- `index.html` — the form itself.
- `assets/tarang-logo.jpg` — the Tarang Plus logo used on the page.
- `google-apps-script/Code.gs` — the backend script that writes to Sheets/Drive.

## 1. Connect it to your Google Sheet + Drive

1. Go to [sheets.google.com](https://sheets.google.com) and create a new
   blank spreadsheet. Name it something like **"Tarang Plus Audition
   Responses"**.
2. In that sheet, open **Extensions → Apps Script**.
3. Delete the placeholder code in `Code.gs`, then paste in the full contents
   of `google-apps-script/Code.gs` from this folder. Save (Ctrl/Cmd+S).
4. Click **Deploy → New deployment**.
   - Click the gear icon next to "Select type" and choose **Web app**.
   - Description: anything, e.g. "Tarang audition form".
   - **Execute as:** Me
   - **Who has access:** Anyone
   - Click **Deploy**, then **Authorize access** and approve the permissions
     (it needs to write to your Sheet and Drive).
5. Copy the **Web app URL** it gives you (ends in `/exec`).

That's it on the Google side — the script automatically creates a
`Responses` tab in your sheet (with headers) and a Drive folder called
**"Tarang Plus Audition Photos"** the first time someone submits the form.

## 2. Point the form at your Web App URL

Open `index.html` and find this near the bottom of the file:

```js
var CONFIG = {
  SCRIPT_URL: "" // e.g. "https://script.google.com/macros/s/AKfycb.../exec"
};
```

Paste your Web app URL between the quotes and save.

## 3. Publish the page so people can open it

Any static hosting works since this is a single HTML file. The simplest free
option with this repo:

1. On GitHub, go to **Settings → Pages** for this repository.
2. Under "Build and deployment", choose **Deploy from a branch**, pick this
   branch, and set the folder to `/tarang-audition-form`.
3. Save — GitHub gives you a public URL a minute or two later
   (something like `https://<user>.github.io/<repo>/`).

## 4. Generate the QR code

Once you have the published URL, turn it into a QR code (for example with
[the free generator at qr-code-generator.com](https://www.qr-code-generator.com/)
or any QR app) and print/paste it wherever attendees will scan it — they'll
land straight on the form.

## Notes

- Very large photos can occasionally fail if they exceed Google Apps
  Script's own request-size limit (~50MB per submission) — this is a Google
  platform limit, not a restriction added by this form.
- Photo links are stored in the "Photos" column of the Responses sheet, one
  link per line, shared as "anyone with the link can view" so they open
  directly for whoever reviews entries.
