# Tarang Plus Audition Registration Form

A mobile-friendly audition sign-up page for Tarang Plus. Attendees enter their
**name, age, city and experience**, and can **take a selfie** and/or
**attach as many photos as they like** — there's no limit on file count,
size or format built into the form.

Files:
- `index.html` — the form itself.
- `assets/tarang-logo.jpg` — the Tarang Plus logo used on the page.
- `google-apps-script/Code.gs` — the deployed backend script (see below).

## Status: connected and live

This form is already wired up to Google:

- **Responses sheet:** [Tarang Plus Audition Responses](https://docs.google.com/spreadsheets/d/1ifTKO5dg2C9qzX1-KzNkcBk6NDfHqg9QwJ4-TjKXmuM/edit)
- **Photos folder:** [Tarang Plus Auditions](https://drive.google.com/drive/folders/1AlDwFgAxo9TVkkMaGNln-ejU2v2-rLB5)
- **Backend:** `google-apps-script/Code.gs`, deployed as a Web App and
  configured as `CONFIG.SCRIPT_URL` in `index.html`.

Every submission appends a row to the sheet above; every attached photo is
saved into the Drive folder above and shared as "anyone with the link can
view" so the links in the sheet open directly.

If the deployment is ever re-created (e.g. a new Web App version, or a new
Google account), update two things to match:
1. `DRIVE_FOLDER_ID` / `SHEET_NAME` constants at the top of `Code.gs`
2. `CONFIG.SCRIPT_URL` near the bottom of `index.html`

## Publishing the page so people can open it

Any static hosting works since this is a single HTML file. The simplest free
option with this repo:

1. On GitHub, go to **Settings → Pages** for this repository.
2. Under "Build and deployment", choose **Deploy from a branch**, pick this
   branch, and set the folder to `/tarang-audition-form`.
3. Save — GitHub gives you a public URL a minute or two later
   (something like `https://<user>.github.io/<repo>/`).

## Generating a QR code

Turn the published URL into a QR code (e.g. with
[qr-code-generator.com](https://www.qr-code-generator.com/) or any QR app)
and print/paste it wherever attendees will scan it.

## Notes

- Very large photos can occasionally fail if they exceed Google Apps
  Script's own request-size limit (~50MB per submission) — this is a Google
  platform limit, not a restriction added by this form.
- Photo links are stored in the "Photos" column, one link per line.
