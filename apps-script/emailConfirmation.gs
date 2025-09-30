// configuration
const EVENT_NAME = 'Event Name';
const HOST_NAME = 'Host Name';
const WEBSITE_URL = 'website url .com';

// ------------------ send confirmation email ----------------------------------------
function sendRSVPConfirmations() {
  // open spreadsheet and get sheets
  const ss = SpreadsheetApp.openById(SHEET_ID);    //spreadsheet
  const responseSheet = ss.getSheetByName(RESPONSES_SHEET);
  const guestSheet = ss.getSheetByName(GUEST_LIST_SHEET);
  const partySheet = ss.getSheetByName(PARTY_LIST_SHEET);

  // get all data at once
  const responseData = responseSheet.getRange(2, 1, responseSheet.getLastRow() - 1, 5).getValues();
  const guestData = guestSheet.getRange(2, 1, guestSheet.getLastRow() - 1, 5).getValues();
  const partyData = partySheet.getRange(2, 1, partySheet.getLastRow() - 1, 2).getValues();

  // create lookup maps
  const guestMap = createGuestMap(guestData);
  const partyMap = createPartyMap(partyData);

  // process each response 
  responseData.forEach((row, index) => {
    const [timestamp, userId, partyId, email, sentConfirmation] = row;

    // skip if confirmation already send or if missing data
    if (sentConfirmation || !email || !partyId) return;

    const respondingGuest = guestMap[userId];
    if (!respondingGuest) return;

    const party = partyMap[partyId];
    if (!party) return;

    const fullName = `${respondingGuest.firstName} ${respondingGuest.lastName}`;
    const isSingle = party.type === 'single';
    let emailBody;

    // branch based on party type
    if (isSingle) {
      // for single guests, check their attending status
      const isAttending = respondingGuest.attending === 'yes';
      emailBody = isAttending
        ? generateSingleComingEmail(fullName)
        : generateSingleNotComingEmail(fullName);
    } else {
      // for couples/families get all party members and check who's attending
      const partyGuests = Object.values(guestMap).filter(g => g.partyId === partyId);
      const attendingGuests = partyGuests.filter(g => g.attending === 'yes');
      const isAttending = attendingGuests.length > 0;

      emailBody = isAttending
        ? generateGroupComingEmail(fullName, attendingGuests)
        : generateGroupNotComingEmail(fullName);
    }

    // send email
    const emailSubject = `RSVP Confirmation - ${EVENT_NAME}`;

    try {
      MailApp.sendEmail(email, emailSubject, emailBody);

      // mark as sent in the responses sheet
      responseSheet.getRange(index + 2, 5).setValue('sent');

      Logger.log(`Email sent to ${email}`);
    } catch (error) {
      Logger.log(`Error sending email to ${email}: ${e.message}`);
    }
  });
  
}

// ------------------ maps ----------------------------------------
/* Function: create map of guest info by guest_id for quick lookup*/
function createGuestMap(guestData) {
  const map = {};
  guestData.forEach(row => {
    const [guestId, firstName, lastName, partyId, attending] = row;
    map[guestId] = {
      firstName,
      lastName,
      partyId,
      attending
    };
  });
  return map;
}

/* Function: create map of parties by party_id for quick lookup */
function createPartyMap(partyData) {
  const map = {};
  partyData.forEach(row => {
    const [partyId, type] = row;
    map[partyId] = {
      type
    };
  });
  return map;

}

// ------------------ email templates ----------------------------------------
/* Function: single guest attending email template*/
function generateSingleComingEmail(fullName) {
  return `Hi ${fullName},

Thanks for your RSVP. We're excited to see that you're coming to our {EVENT_NAME}!

If anything changes, please reply to this email.

For now, please explore our website: ${WEBSITE_URL}


Thanks,
${HOST_NAME}`
}

/* Function: single guest NOT attending email template*/
function generateSingleNotComingEmail(fullName) {
  return `Hi ${fullName},

Thanks for letting us know that you can't make it to our ${EVENT_NAME}. We'll miss you, but we appreciate the update!

If anything changes, please reply to this email.


Thanks,
${HOST_NAME}`
}

/* Function: group with attendees email template */
function generateGroupComingEmail(fullName, attendingGuests) {
  const guestList = attendingGuests
    .map(g => `• ${g.firstName} ${g.lastName}`)
    .join('\n');

  return `Hi ${fullName},

Thanks for your RSVP! We're glad to see that the following from your group can come to our ${EVENT_NAME}:

${guestList}

If anything changes, please reply to this email.

For now, please explore our website: ${WEBSITE_URL}


Thanks,
${HOST_NAME}`
}

/* Function: group NOT attending email template*/
function generateGroupNotComingEmail(fullName) {
  return `Hi ${fullName},

Thanks for letting us know that your group can't make it to our ${EVENT_NAME}. We'll miss you all, but we appreciate the update!

If anything happens to change, please reply to this email.


Thanks,
${HOST_NAME}`
}