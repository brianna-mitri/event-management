// configuration - connection to google sheets
const sheetId = () => PropertiesService.getScriptProperties().getProperty('SHEET_ID');
const SHEET_ID = sheetId();

const PARTY_LIST_SHEET = 'party_list';
const GUEST_LIST_SHEET = 'guest_list';
const RESPONSES_SHEET = 'responses';
const DEBUG_SHEET = 'debug_log';

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

    const action = (e.parameter.action || '').trim();
    logToSheet('doPost called', {action: action});

    // route to different functions based on action
    switch (action) {
      case 'verifyGuest':
        return verifyGuestName(e.parameter);
      case 'submitRSVP':
        return submitRSVP(e);
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
    logToSheet('doPost error', error.toString());
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        message: 'Server error: ' + error
      }))
      .setMimeType(ContentService.MimeType.JSON);

  }

}


/* ---------------- Action functions --------------------------------------------- */
/* Function: verify if name is on guest list and get party info*/
function verifyGuestName(p) {

  logToSheet('verifyGuestName started', p);

  /* ------ 1) verify guest is on guest list-------------------- */
  // get name inputs (normalize)
  const norm = s => String(s || '').trim().toLowerCase();
  const firstNameInput = norm(p.firstName);
  const lastNameInput = norm(p.lastName);

  // open spreadsheet and get guest list sheet
  const ss = SpreadsheetApp.openById(SHEET_ID);    //spreadsheet
  const guestSheet = ss.getSheetByName(GUEST_LIST_SHEET);
  // const guestData = guestSheet.getDataRange().getValues();

  // read only needed guest columns and rows [guest_id, first_name, last_name, party_id]
  const gLastRow = guestSheet.getLastRow();
  const guestData = guestSheet.getRange(2, 1, gLastRow - 1, 4).getDisplayValues();

  // look for matching name (skip header row)
  const idx = guestData.findIndex(row =>
    norm(row[1]) === firstNameInput && norm(row[2]) === lastNameInput
  );

  let found = idx !== -1;
  let guestInfo = null;
  let partyInfo = null;
  let partyMembers = [];

  if (found) {
    const row = guestData[idx];
    guestInfo = {
      guest_id: row[0],
      first_name: row[1],
      last_name: row[2],
      party_id: row[3]
    };


    /* ------ 2) get party info (for verified guest) -------------------- */
    const partySheet = ss.getSheetByName(PARTY_LIST_SHEET);
    const pLastRow = partySheet.getLastRow();

    // get party data if party id
    if (guestInfo.party_id !== '') {
      const partyData = partySheet.getRange(2, 1, pLastRow - 1, 3).getDisplayValues();
      const partyRow = partyData.find(row => String(row[0]) === String(guestInfo.party_id));

      if (partyRow) {
        partyInfo = {
          party_type: partyRow[1],
          has_responded: partyRow[2]
        };
      }
    }

    // for non single parties, collect all guests in same party
    if (partyInfo && partyInfo.party_type !== 'single') {
      const partyId = String(guestInfo.party_id);
      for (const row of guestData) {
        if (String(row[3]) === partyId) {
          partyMembers.push({
            guest_id: row[0],
            first_name: row[1],
            last_name: row[2]
          });
        }
      }
    }

  }

  /* ------ 3) result -------------------- */
  return ContentService
  .createTextOutput(JSON.stringify({
    success: true,
    found: found,
    guest: guestInfo,
    party: partyInfo,
    members: partyMembers,
    message: found ? 'Guest found in list' : 'Guest not found in list'
  }))
  .setMimeType(ContentService.MimeType.JSON);

} 

/* Function: submit RSVP data and update sheets*/
function submitRSVP(e) {
  try {
    logToSheet('submitRSVP started', e.parameters);

    const p = e.parameter || {};
    // logToSheet('e.parameter:', p);
    // logToSheet('e.parameters:', e.parameters);

    const ss = SpreadsheetApp.openById(SHEET_ID);
    const partyId = String(p.party_id || '');
    const email = String(p.email || '');

    // use e.parameterS for repeated keys
    // parse guests data from form submission (form sends: guests[]={"guest_id": "1", "attending": "yes", "dietary_pref": "vegan"})
    const multiParams = e.parameters || {};
    let guestsParam = multiParams['guests[]'];

    // fallback if only a single value was sent
    if (!guestsParam) guestsParam = p['guests[]'];
    

    // logToSheet('Raw guestParam received', {
    //   isArray: Array.isArray(guestsParam),
    //   type: typeof guestsParam,
    //   value: guestsParam
    // });


    let guests = [];
    if (Array.isArray(guestsParam)) {
      // multiple guests, parse each JSON string (grp party)
      guests = guestsParam.map(g => JSON.parse(g));
      // logToSheet('Parsed multiple guests', guests);
    } else if (guestsParam) {
      // single guest, parse the json string (single party)
      guests = [JSON.parse(guestsParam)];
      // logToSheet('Parsed single guest', guests);
    }

    logToSheet('Final guests array', guests);

    /* ------ 1) update party_list: mark as responded-------------------- */
    const partySheet = ss.getSheetByName(PARTY_LIST_SHEET);
    const partyData = partySheet.getDataRange().getValues();

    for (let i = 1; i < partyData.length; i++) {
      if (String(partyData[i][0]) === partyId) {
        partySheet.getRange(i + 1, 3).setValue('yes');  //has_responded column
        break;
      }
    }

    /* ------ 2) update guest_list: set attendance and dietary preferences-------------------- */
    const guestSheet = ss.getSheetByName(GUEST_LIST_SHEET);
    const guestData = guestSheet.getDataRange().getValues();

    // create lookup map for guest updates
    const guestUpdates = new Map();
    guests.forEach(guest => {
      guestUpdates.set(String(guest.guest_id), {
        attending: guest.attending,
        dietary_pref: guest.dietary_pref || 'none'
      });
    });

    // logToSheet('Created guestUpdates map', Array.from(guestUpdates.entries()));

    // update all guests in this party
    let updatedGuestCount = 0;
    for (let i = 1; i < guestData.length; i++) {
      const guestId = String(guestData[i][0]);
      const guestPartyId = String(guestData[i][3]);

      // if this guest belongs to the party being updated
      if (guestPartyId === partyId) {

        if (guestUpdates.has(guestId)) {
          // guest has explicit data (update their info accordingly)
          const update = guestUpdates.get(guestId);
          console.log(`Updating guest ${guestId} with:`, update);
          guestSheet.getRange(i + 1, 5).setValue(update.attending);
          guestSheet.getRange(i + 1, 6).setValue(update.dietary_pref);
        } else {
          // guest not in submission data (set to not attending)
          guestSheet.getRange(i + 1, 5).setValue('no');
          guestSheet.getRange(i + 1, 6).setValue('none');
        }
        updatedGuestCount++;
      }
    }

    /* ------ 3) update response: add record-------------------- */
    const responseSheet = ss.getSheetByName(RESPONSES_SHEET);
    const verifiedGuestId = String(p.verified_guest_id || '');
    // const attendingCnt = guests.filter(g=> g.attending === 'yes').length;

    // append row
    responseSheet.appendRow([
      new Date().toISOString(),
      verifiedGuestId,
      partyId,
      email
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({
        success: true,
        message: 'RSVP submitted successfully',
        data: {
          party_id: partyId,
          updated_guests: updatedGuestCount,
          total_guests: guests.length
        }
      }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    console.error('submitRSVP error:', error);
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        message: 'Error submitting RSVP: ' + error.toString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/* ---------------- Logging function --------------------------------------------- */
function logToSheet(message, data = '') {
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    let debugSheet = ss.getSheetByName(DEBUG_SHEET);

    // create debug sheet if it doesn't exist
    if (!debugSheet) {
      debugSheet = ss.insertSheet(DEBUG_SHEET);
      debugSheet.getRange(1,1,1,3).setValues([['Timestamp', 'Message', 'Data']]);
    }

    // add log entry
    debugSheet.appendRow([
      new Date().toISOString(),
      String(message),
      typeof data === 'object' ? JSON.stringify(data) : String(data)
    ]);
  } catch (error) {
    console.log('Failed to log to sheet:', error);
  }
}