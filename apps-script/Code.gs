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
  // get name inputs (normalize with accent removal)
  const norm = s => String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const firstNameInput = norm(p.firstName);
  const lastNameInput = norm(p.lastName);

  // open spreadsheet and get guest list sheet
  const ss = SpreadsheetApp.openById(SHEET_ID);    //spreadsheet
  const guestSheet = ss.getSheetByName(GUEST_LIST_SHEET);
  // const guestData = guestSheet.getDataRange().getValues();

  // read only needed guest columns and rows [guest_id, first_name, last_name, party_id]
  const gLastRow = guestSheet.getLastRow();
  const guestData = guestSheet.getRange(2, 1, gLastRow - 1, 4).getValues();

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

    // parse params (e.parameters holds arrays for each key)
    const p = e.parameters || {};
    const first = (arr, def='') => Array.isArray(arr) ? String(arr[0] ?? def) : String(def);

    const partyId = first(p.party_id);
    const email = first(p.email);
    const verifiedGuestId = first(p.verified_guest_id);

    // guests[] is an array of JSON strings--> ensure array shape
    let guestsParam = p['guests[]'] || (e.parameter && e.parameter['guests[]']);
    const guestsArray = Array.isArray(guestsParam) ? guestsParam : (guestsParam ? [guestsParam] : []);

    // parse and normalize payload --> [{guest_id, attending, dietary_pref}, ....]
    const guests = guestsArray.map(s => JSON.parse(s)).map(g => ({
      guest_id: String(g.guest_id),
      attending: (g.attending || 'no'),
      dietary_pref: (g.dietary_pref || 'none')
    }));
    logToSheet('Parsed submit payload', {partyId, email, verifiedGuestId, guests});

    /* ------ 1) update party_list: mark as responded-------------------- */
    const ss = SpreadsheetApp.openById(SHEET_ID);

    {
      const partySheet = ss.getSheetByName(PARTY_LIST_SHEET);
      const pLastRow = partySheet.getLastRow();

      if (partyId) {
        // read only party ids column
        const partyIdsCol = partySheet.getRange(2, 1, pLastRow - 1, 1)
          .getDisplayValues()
          .map(r => r[0] + '');

        const idx = partyIdsCol.indexOf(String(partyId));
        if (idx !== -1) {
          partySheet.getRange(2 + idx, 3).setValue('yes');
        } else {
          logToSheet('Party not found when marking responded', {partyId});
        }
      }
    }

    /* ------ 2) update guest_list: set attendance and dietary preferences-------------------- */
    let appliedCount = 0;

    {
      const guestSheet = ss.getSheetByName(GUEST_LIST_SHEET);
      const gLastRow = guestSheet.getLastRow();

      // build guest_id --> row# map from column a
      const guestIdsCol = guestSheet.getRange(2, 1, gLastRow - 1, 1).getDisplayValues();
      const idToRow = new Map(guestIdsCol.map((r, i) => [String(r[0] || ''), 2 + i]));

      // collect rows for attendance and dietary by value
      const rowsAttending = [];   
      const rowsNotAttending = [];
      const rowsByDiet = new Map();   // {diet --> [rows]}
      // let appliedCount = 0;

      for (const g of guests) {
        const row = idToRow.get(g.guest_id);
        if (!row) {
          // if provided guest id isn't in sheet, skip but log it
          logToSheet('Guest id not found; skipping', g);
          continue;
        }
        appliedCount++;

        // attendance
        (g.attending === 'yes' ? rowsAttending : rowsNotAttending).push(row);

        // dietary (group by value)
        const diet = String(g.dietary_pref || 'none');
        if(!rowsByDiet.has(diet)) rowsByDiet.set(diet, []);
        rowsByDiet.get(diet).push(row);
      }

      // batch writes: at most 2 calls for attending col and 1 call per unique diet for dietary_preference col
      if (rowsAttending.length) guestSheet.getRangeList(rowsAttending.map(r => `E${r}`)).setValue('yes');
      if (rowsNotAttending.length) guestSheet.getRangeList(rowsNotAttending.map(r => `E${r}`)).setValue('no');

      for (const [diet, rows] of rowsByDiet.entries()) {
        guestSheet.getRangeList(rows.map(r => `F${r}`)).setValue(diet);
      }
    }

    /* ------ 3) update response: add record-------------------- */
    const responseSheet = ss.getSheetByName(RESPONSES_SHEET);
    // const verifiedGuestId = String(p.verified_guest_id || '');
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
          updated_guests: appliedCount,
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