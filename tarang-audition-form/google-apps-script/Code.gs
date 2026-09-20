/**
 * Tarang Plus Audition Registration — backend.
 *
 * Setup (see ../README.md for full step-by-step instructions):
 *   1. Create a Google Sheet, e.g. "Tarang Plus Audition Responses".
 *   2. Open it, then Extensions > Apps Script.
 *   3. Replace the default Code.gs contents with this file, save.
 *   4. Deploy > New deployment > Web app.
 *        Execute as: Me
 *        Who has access: Anyone
 *   5. Copy the Web app URL and paste it into CONFIG.SCRIPT_URL in
 *      tarang-audition-form/index.html.
 *
 * On each submission this script:
 *   - Appends a row to the "Responses" sheet (created automatically).
 *   - Saves any attached photos into a Drive folder named
 *     "Tarang Plus Audition Photos" (created automatically, shared as
 *     "anyone with the link can view" so the links in the sheet open
 *     directly), and records their links in the sheet.
 */

var SHEET_NAME = 'Responses';
var DRIVE_FOLDER_NAME = 'Tarang Plus Audition Photos';
var SHEET_HEADERS = ['Timestamp', 'Full name', 'Age', 'City', 'Experience', 'Photos'];

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var data = JSON.parse(e.postData.contents);

    var sheet = getOrCreateSheet_();
    var folder = getOrCreateFolder_();

    var photoLinks = [];
    (data.photos || []).forEach(function (photo, i) {
      if (!photo || !photo.data) return;
      var safeName = sanitizeFileName_(data.fullName || 'attendee') + '_' + (i + 1) +
        '_' + (photo.filename || 'photo.jpg');
      var blob = Utilities.newBlob(
        Utilities.base64Decode(photo.data),
        photo.mimeType || 'image/jpeg',
        safeName
      );
      var file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      photoLinks.push(file.getUrl());
    });

    sheet.appendRow([
      new Date(),
      data.fullName || '',
      data.age || '',
      data.city || '',
      data.experience || '',
      photoLinks.join('\n')
    ]);

    return jsonOutput_({ status: 'success' });
  } catch (err) {
    return jsonOutput_({ status: 'error', message: err.message || String(err) });
  } finally {
    lock.releaseLock();
  }
}

function getOrCreateSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(SHEET_HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getOrCreateFolder_() {
  var folders = DriveApp.getFoldersByName(DRIVE_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(DRIVE_FOLDER_NAME);
}

function sanitizeFileName_(name) {
  return String(name).replace(/[^a-zA-Z0-9-_ ]/g, '').trim().replace(/\s+/g, '_') || 'attendee';
}

function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
