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
 *   - Appends a row (timestamp, name, age, city, experience, photo links)
 *     to the "Sheet1" tab.
 *   - Saves any attached photos into the Drive folder below, shared as
 *     "anyone with the link can view" so the links in the sheet open
 *     directly.
 */

var SHEET_NAME = 'Sheet1';
var DRIVE_FOLDER_ID = '1AlDwFgAxo9TVkkMaGNln-ejU2v2-rLB5';

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var data = JSON.parse(e.postData.contents);
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
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

    sheet.appendRow([new Date(), data.fullName || '', data.age || '', data.city || '', data.experience || '', photoLinks.join('\n')]);

    return ContentService.createTextOutput(JSON.stringify({ status: 'success' })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.message })).setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}
