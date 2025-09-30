/**--------------------------------------------------------------
 * SEND RSVP EMAIL BASED ON PARTY TYPE AND IS ATTENDING
 * - if attending, email includes calendar invite
 * - if single, send appropriate email wording depending on attendance
 * - if group + attending, list all attendees
 * - if group + not attending, send appropriate email wording
 * 
 * Set sendRSVPConfirmations() as time based trigger
 ---------------------------------------------------------------*/
// configuration (email)
const EVENT_NAME = 'Event Name';
const HOST_NAME = 'Host Name';
const WEBSITE_URL = 'website url .com';

// calendar invite (uses 'floating' time)
const EVENT_DATE_START = new Date('2025-11-05T14:00:00-08:00'); //pst (November 5 at 2 pm)
const EVENT_DATE_END = new Date('2025-11-05T22:00:00-08:00'); //November 5 at 10pm
const EVENT_LOCATION = 'Event Venue Address';
// const EVENT_DESCRIPTION = 'Event Name';
const EVENT_DESCRIPTION = 'Join us for our celebration! Please note that the event time is set to Pacific.';


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
    let shouldSendCalendarInvite = false;

    // branch based on party type
    if (isSingle) {
      // for single guests, check their attending status
      const isAttending = respondingGuest.attending === 'yes';

      if (isAttending) {
        // if attending then send calendar invite with email
        emailBody = generateSingleComingEmail(fullName);
        shouldSendCalendarInvite = true;
      } else {
        // if not attending then only confirmation email
        emailBody = generateSingleNotComingEmail(fullName);
      }
    } else {
      // for couples/families get all party members and check who's attending
      const partyGuests = Object.values(guestMap).filter(g => g.partyId === partyId);
      const attendingGuests = partyGuests.filter(g => g.attending === 'yes');
      const isAttending = attendingGuests.length > 0;

      if (isAttending) {
        // if attending then send calendar invite with email
        emailBody = generateGroupComingEmail(fullName, attendingGuests);
        shouldSendCalendarInvite = true;
      } else {
        // if not attending then only confirmation email
        emailBody = generateGroupNotComingEmail(fullName);
      }
  
    }

    // send email
    const emailSubject = `RSVP Confirmation - ${EVENT_NAME}`;

    try {

      if (shouldSendCalendarInvite) {
        // send email with calendar invite (attending)
        sendEmailWithCalendarInvite(email, emailSubject, emailBody);
      } else {
        // send regular email without calendar invite (not attending)
        // MailApp.sendEmail(email, emailSubject, emailBody);
        MailApp.sendEmail({
          to: email,
          subject: emailSubject,
          body: emailBody,
          headers: {
            'Importance': 'high',
            'X-Priority': '1'
          }
        });
      }

      // mark as sent in the responses sheet
      responseSheet.getRange(index + 2, 5).setValue('sent');

      Logger.log(`Email sent to ${email}`);
      logToSheet('Email sent', email);
    } catch (error) {
      Logger.log(`Error sending email to ${email}: ${error.message}`);
      logToSheet('Email NOT sent', email);
    }
  });
  
}

// ------------------ calendar invite ----------------------------------------
/* Function: send email with embedded calendar invite */
function sendEmailWithCalendarInvite(guestEmail, subject, body) {
  // create the .ics file content
  const icsContent = createIcsFile(guestEmail);

  // send email with calendar attachment
  MailApp.sendEmail({
    to: guestEmail,
    subject: subject,
    body: body,
    attachments: [
      Utilities.newBlob(icsContent, 'text/calendar', 'calendar-event.ics')
    ],
    headers: {
      'Importance': 'high',
      'X-Priority': '1'
    }
  });
}

/* Function: create ICS calendar file content */
function createIcsFile(guestEmail) {
  // Format dates in simpler way
  const formatSimpleDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}${month}${day}T${hours}${minutes}${seconds}`;
  };

  const dtStamp = formatSimpleDate(new Date());
  const dtStart = formatSimpleDate(EVENT_DATE_START);
  const dtEnd = formatSimpleDate(EVENT_DATE_END);
  const uid = Utilities.getUuid();

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//RSVP Calendar//EN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${EVENT_NAME}`,
    `DESCRIPTION:${EVENT_DESCRIPTION}`,
    `LOCATION:${EVENT_LOCATION}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');

  return ics;
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
  return `Hi ${fullName},\n\nThanks for your RSVP. We're excited to see that you're coming to our ${EVENT_NAME}!\n\nIf anything changes, please reply to this email.\n\nFor now, please explore our website: ${WEBSITE_URL}\n\n\nThanks,\n${HOST_NAME}`
}

/* Function: single guest NOT attending email template*/
function generateSingleNotComingEmail(fullName) {
  return `Hi ${fullName},\n\nThanks for letting us know that you can't make it to our ${EVENT_NAME}. We'll miss you, but we appreciate the update.\n\nIf anything happens to change, please reply to this email.\n\n\nThanks,\n${HOST_NAME}`
}

/* Function: group with attendees email template */
function generateGroupComingEmail(fullName, attendingGuests) {
  const guestList = attendingGuests
    .map(g => `• ${g.firstName} ${g.lastName}`)
    .join('\n');

  return `Hi ${fullName},\n\nThanks for your RSVP! We're glad to see that the following from your group can come to our ${EVENT_NAME}:\n\n${guestList}\n\nIf anything changes, please reply to this email.\n\nFor now, please explore our website: ${WEBSITE_URL}\n\n\nThanks,\n${HOST_NAME}`
}

/* Function: group NOT attending email template*/
function generateGroupNotComingEmail(fullName) {
  return `Hi ${fullName},\n\nThanks for letting us know that your group can't make it to our ${EVENT_NAME}. We'll miss you all, but we appreciate the update.\n\nIf anything happens to change, please reply to this email.\n\n\nThanks,\n${HOST_NAME}`
}