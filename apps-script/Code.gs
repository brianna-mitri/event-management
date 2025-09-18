// configuration - connection to google sheets
const sheetId = () => PropertiesService.getScriptProperties().getProperty('SHEET_ID');
const SHEET_ID = sheetId();

const PARTY_LIST_SHEET = 'party_list';
const GUEST_LIST_SHEET = 'guest_list';
const RESPONSES_SHEET = 'responses';

/* ---------------- GET/POST functions --------------------------------------------- */
/* Handle GET requests (when website ASKS for data) */
function doGet() {
  return ContentService
    .createTextOutput('RSVP guest list API is running')
    .setMimeType(ContentService.MimeType.TEXT);
}

/* Handle POST requests from form (when website SENDS data) */
function doPost(e) {

  try {

    // // get form data from website
    // const formData = JSON.parse(e.postData.contents);
    // const action = formData.action;
    const action = (e.parameter.action || '').trim();

    // route to different functions based on action
    switch (action) {
      case 'verifyGuest':
        return verifyGuestName(e.parameter);
        // return verifyGuestName(formData);
      default:
        return ContentService
          .createTextOutput(JSON.stringify({
            success: false,
            message: 'Invalid action specified'
          }))
          .setMimeType(ContentService.MimeType.JSON);
        // return createResponse(false, 'Invalid action');
    }


  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        message: 'Server error: ' + error
      }))
      .setMimeType(ContentService.MimeType.JSON);

  }

}


/* ---------------- Action functions --------------------------------------------- */
/* Function: verify if name is on guest list */
function verifyGuestName(p) {

  // get name inputs
  const firstNameInput = (p.firstName || '').toLowerCase().trim();
  const lastNameInput = (p.lastName || '').toLowerCase().trim();

  // open spreadsheet and get guest list sheet
  const guestSheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(GUEST_LIST_SHEET);
  const guestData = guestSheet.getDataRange().getValues();

  // look for matching name (skip header row)
  let found = false;
  let guestInfo = null;

  for (let i = 1; i < guestData.length; i++) {
    const row = guestData[i];
    const sheetFirstName = String(row[1] || '').toLowerCase().trim();
    const sheetLastName = String(row[2] || '').toLowerCase().trim();

    // if match found
    if (
      sheetFirstName === firstNameInput
      && sheetLastName === lastNameInput
    ) {
      found = true;

      // get additional guest info needed
      guestInfo = {
        guest_id: row[0],
        first_name: row[1],
        last_name: row[2],
        party_id: row[3]
      };

      break;

    }
  }

  // return null;
  return ContentService
    .createTextOutput(JSON.stringify({
      success: true,
      found: found,
      guest: guestInfo,
      message: found ? 'Guest found in list' : 'Guest not found in list'
    }))
    .setMimeType(ContentService.MimeType.JSON);

} 