/**
 * Tarang Plus Audition Registration — backend.
 *
 * This is the exact script deployed at the Web app URL configured as
 * CONFIG.SCRIPT_URL in ../index.html. It's bound to the
 * "Tarang Plus Audition Responses" Google Sheet and writes photos into
 * the "Tarang Plus Auditions" Drive folder (see ../README.md for the
 * live links and full setup notes).
 *
 * On each submission it:
 *   - Ensures the header row matches HEADERS below (fixes it up if not,
 *     so adding a column here never leaves stale headers behind).
 *   - Appends a row (timestamp, name, phone, email, age, city,
 *     experience, photo links) to the "Sheet1" tab.
 *   - Saves any attached photos into the Drive folder below, shared as
 *     "anyone with the link can view" so the links in the sheet open
 *     directly.
 */

var SHEET_NAME = 'Sheet1';
var DRIVE_FOLDER_ID = '1AlDwFgAxo9TVkkMaGNln-ejU2v2-rLB5';
var HEADERS = ['Timestamp', 'Full name', 'Phone', 'Email', 'Age', 'City', 'Experience', 'Photos'];

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  var result;
  try {
    // The page submits as a real HTML form (a hidden iframe target) rather
    // than fetch(), since Apps Script's redirecting URL gets blocked by
    // fetch()/XHR in many browsers/in-app browsers ("Failed to fetch") but
    // never for a plain form POST. That means the payload arrives as a
    // form field, not a raw JSON body — but fall back to the raw body too,
    // so a direct JSON POST (e.g. for testing with curl) still works.
    var raw = (e.parameter && e.parameter.payload) ? e.parameter.payload : e.postData.contents;
    var data = JSON.parse(raw);
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    ensureHeaders_(sheet);
    var folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);

    var photoLinks = [];
    (data.photos || []).forEach(function (photo, i) {
      if (!photo || !photo.data) return;
      var safeName = String(data.fullName || 'attendee').replace(/[^a-zA-Z0-9-_ ]/g, '').trim().replace(/\s+/g, '_') +
        '_' + (i + 1) + '_' + (photo.filename || 'photo.jpg');
      var blob = Utilities.newBlob(Utilities.base64Decode(photo.data), photo.mimeType || 'image/jpeg', safeName);
      var file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      photoLinks.push(file.getUrl());
    });

    sheet.appendRow([
      new Date(),
      data.fullName || '',
      data.phone || '',
      data.email || '',
      data.age || '',
      data.city || '',
      data.experience || '',
      photoLinks.join('\n')
    ]);

    result = { status: 'success' };
  } catch (err) {
    result = { status: 'error', message: err.message };
  } finally {
    lock.releaseLock();
  }
  // The page can't read this response directly (it arrives inside a
  // cross-origin hidden iframe), so hand the real result back via
  // postMessage instead of just returning JSON the page can't see —
  // window.top always reaches the page's actual top-level window, no
  // matter how many iframes Apps Script itself wraps this response in.
  var html = '<!DOCTYPE html><html><body><script>' +
    'window.top.postMessage(' + JSON.stringify({ source: 'tarang-audition-form', result: result }) + ', "*");' +
    '</script></body></html>';
  return HtmlService.createHtmlOutput(html);
}

function ensureHeaders_(sheet) {
  var current = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  var matches = HEADERS.every(function (h, i) { return current[i] === h; });
  if (!matches) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
  }
}
