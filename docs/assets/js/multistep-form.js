/* --------------------------------------------------------- */
// Step Management System
/* --------------------------------------------------------- */
// configuration
GOOGLE_APPS_SCRIPT = 'https://script.google.com/macros/s/AKfycbzjmubkgAzt1qUdjQ8yBTFLHAFpFPKj1bx0KxVlZBtlyZyBY7ovQrG4zdI1DJNW9pV6/exec';

// define step paths
const stepOrder = {

    // single party routes
    attending: ['name', 'attendance', 'dietary', 'confirm'],
    notAttending: ['name', 'attendance', 'confirm'],

    // grp party routes
    attendingGrp: ['name', 'attendance-grp', 'dietary-grp', 'confirm'],        //checks at least one person in attendance
    notAttendingGrp: ['name', 'attendance-grp', 'confirm']                 //checks 'none' for attendance
};

// track current flow and position
let currentOrder = stepOrder.attendingGrp;      //current step sequence
let currentStepIndex = 0;   //current index
let guestVerified = false;  //track if guest is verified
let guestInfo = null;       //store guest info

// navigation controls
let navigating = false;

// grp dropdown dietary preferences options
const dietOptions = [
        ['none', 'None'],
        ['vegan', 'Vegan'],
        ['vegetarian', 'Vegetarian'],
        ['pescatarian', 'Pescatarian']
    ]

// ---- helpers---------------------
function isGroupParty() {
    return (guestInfo?.party?.party_type || 'single').toLowerCase() !== 'single';
}

function getSelectedGroupIds() {
    return Array.from(document.querySelectorAll('input[name="grpAttendees[]"]:checked'))
        .map(el => el.value)
        .filter(v => v !== 'none');
}

function idToNameMap() {
    return new Map((guestInfo?.members || []).map(m => [String(m.guest_id), `${m.first_name} ${m.last_name}`]));
}

/* -------------------------------- Google Sheets API Functions ---------------------------------------------------------------------------------------------------------------------------------------- */

// function: verify guest name
async function verifyGuestName(firstName, lastName) {
    try {
        const body = new URLSearchParams({
            action: 'verifyGuest',
            firstName: firstName.trim(),
            lastName: lastName.trim()
        });

        const response = await fetch(GOOGLE_APPS_SCRIPT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body
        });

        if (!response.ok) {
            console.error('Apps script http error', response.status, await response.text());
            alert('Unable to verify guest at the moment. Please try again.');
            return false;
        }

        const result = await response.json();

        if (result.success && result.found) {
            // name found on guest list
            guestVerified = true;
            guestInfo = result;

            // decide step order (based on party of 1 or more)
            const partyType = (result.party?.party_type  || 'single').toLowerCase();
            if (partyType !== 'single') {

                // group of 2+
                currentOrder = stepOrder.attendingGrp;
                renderGrpChecklist(result.members);
            } else {
                // single party
                currentOrder = stepOrder.attending;
            }
            // alert(`Welcome ${firstName} ${lastName}!`);
            return true;
        } else {
            // name not found on guest list  
            guestVerified = false;
            guestInfo = null;
            alert("Sorry, we couldn't find you on our guest list. Please check the spelling.");
            return false;
        }


        // return result;
    } catch (error) {
        console.error('Error verifying guest: ', error);
        guestVerified = false;
        guestInfo = null;
        alert('Unable to verify guest at moment. Please try again. Network Error: ' + error);
        return false;
        // return { found: false, error: 'Network error' };
    }
}

/*-------------------------- Function: updateOrder() --------------------------*/
// Called when user chagnes their attendance choice
/*-----------------------------------------------------------------------------*/
function updateOrder() {
    const attending = document.querySelector('input[name="attendingInput"]:checked');

    // set up appropriate step order depending on attending answer
    if (attending && attending.value === 'yes') {
        currentOrder = stepOrder.attending;
    } else if (attending && attending.value === 'no') {
        currentOrder = stepOrder.notAttending;
    } // else let it stay at default
    // else {
    //     currentOrder = ['name', 'attendance', 'confirm']; // default until they choose
    // }
}

/*-------------------------- Function: showStep(stepIndex) --------------------------*/
// Controls which step is visible
/*-----------------------------------------------------------------------------*/
function showStep(stepIndex) {
    // hide all steps
    document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));

    // show current step
    const currentStepName = currentOrder[stepIndex];
    if (currentStepName) {
        document.getElementById(`step-${currentStepName}`).classList.add('active');
    }

    // update progress bar
    const progress = ((stepIndex + 1) / currentOrder.length) * 100;
    document.getElementById('progressBar').style.width = progress + '%';

    // update navigation buttons
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const submitBtn = document.getElementById('submitBtn');

    // hide back button on first step
    prevBtn.style.display = stepIndex === 0 ? 'none' : 'inline-block';

    // for last step, hide next button and show submit button
    if (stepIndex === currentOrder.length - 1) {
        nextBtn.style.display = 'none';
        submitBtn.style.display = 'inline-block';
        updateSummary();
    } else {
        nextBtn.style.display = 'inline-block';
        submitBtn.style.display = 'none';
    }

    // lifecycle for dietary step
    if (currentStepName === 'dietary-grp') {
        enterDietaryGrpStep();
    }
}


/*-------------------------- Function: changeStep(direction) --------------------------*/
// Called when user clicks "Next" (+1) or "Back" (-1)
/*-----------------------------------------------------------------------------*/
async function changeStep(direction) {

    // ignore rentrancy
    if (navigating) return;
    navigating = true;

    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const submitBtn = document.getElementById('submitBtn');

    // disable nav buttons during async work
    [prevBtn, nextBtn, submitBtn].forEach(b => b && (b.disabled = true));

    try {
        // validate before moving forward
        if (direction === 1) {
            const ok = await validateCurrentStep();
            if (!ok) return;   //stop here if invalid
            
            // update step order, if they just answered attendance
            if (currentOrder[currentStepIndex] === 'attendance') {
                updateOrder();
            }
        }

        // move to the next/previous step
        currentStepIndex += direction;

        // boundary checks: don't go below 0 or above max steps
        if (currentStepIndex < 0) currentStepIndex = 0;
        if (currentStepIndex >= currentOrder.length) currentStepIndex = currentOrder.length - 1;

        // display the new step
        showStep(currentStepIndex);

    } finally {
        navigating = false;
        //re-enable buttons appropriate for the new step
        [prevBtn, nextBtn, submitBtn].forEach(b => b && (b.disabled = false));
    }

    // // validate current step before moving forward
    // if (direction === 1 && !await validateCurrentStep()) {
    //     return;
    // }

    // // update step order, if they just answered attendance
    // if (currentOrder[currentStepIndex] === 'attendance' && direction === 1) {
    //     updateOrder();
    // }

    // // move to the next/previous step
    // currentStepIndex += direction;

    // // boundary checks: don't go below 0 or above max steps
    // if (currentStepIndex < 0) currentStepIndex = 0;
    // if (currentStepIndex >= currentOrder.length) currentStepIndex = currentOrder.length - 1;

    // // display the new step
    // showStep(currentStepIndex);


}


/*-------------------------- Function: validateCurrentStep() --------------------------*/
// Checks if required fields have been filled out before moving on
/*-----------------------------------------------------------------------------*/
async function validateCurrentStep() {
    const currentStepName = currentOrder[currentStepIndex];
    const step = document.getElementById(`step-${currentStepName}`);
    const inputs = step.querySelectorAll('input[required]');
    let isValid = true;

    // check each required input
    for (let input of inputs) {
        if (input.type === 'radio') {

            // for radio buttons, check if any in the group is selected
            const radioGroup = step.querySelectorAll(`input[name="${input.name}"]`);
            const isChecked = Array.from(radioGroup).some(radio => radio.checked);

            if(!isChecked) {
                // add invalid class to all radio buttons
                radioGroup.forEach(radio => {
                    radio.classList.add('is-invalid');
                });
                isValid = false;
                // alert('Please make a selection before continuing.');
                // return false;
            } else {
                // remove invalid class
                radioGroup.forEach(radio => {
                    radio.classList.remove('is-invalid');
                });
            }

        } else if (input.type !== 'checkbox') {
            if (!input.value.trim()) {
                input.classList.add('is-invalid');
                input.focus();
                isValid = false;
                // alert('Please fill in all required fields.');
                // return false;
            } else {
                input.classList.remove('is-invalid');
            }
        }
    }


    // special validation for name step (verifying if on guest list)
    if (currentStepName === 'name' && isValid) {
        const firstName = document.getElementById('firstName').value.trim();
        const lastName = document.getElementById('lastName').value.trim();

        const verified = await verifyGuestName(firstName, lastName);
        if (!verified) {
            isValid = false
        }
    }


    // require at least one checkbox for grp attendance step
    if (currentStepName === 'attendance-grp') {
        const selected = Array.from(document.querySelectorAll('input[name="grpAttendees[]"]:checked'));  //all checked boxes (including none)
        const noneChecked = selected.some(checked => checked.value === 'none');
        const step = document.getElementById('step-attendance-grp');
        const msg = step.querySelector('.invalid-feedback');

        // valid if none is checked or if at least one member is checked
        const ok = noneChecked || selected.length > 0;
        if (msg) msg.style.display = ok ? 'none' : 'block';
        if (!ok) return false;
    }

    // for group dietary preference, if checked "yes" then need to not have "None" for each party member
    if (currentStepName === 'dietary-grp') {
        if (dietaryGrpState.answer === 'yes') {
            // selected attendees
            const ids = getSelectedGroupIds();

            // must have at least one preference that isn't 'none'
            const hasRealPref = ids.some(id => (dietaryGrpState.perGuest[id] || 'none') !== 'none');
            if (!hasRealPref) {
                showDietaryGrpError('Please choose at least one dietary preference (other than "None")')
                return false;
            }

            // clear any prior erro if "no" or valid "yes"
            showDietaryGrpError('');
        }
    }

    return isValid; //all validation passed
}

/*-------------------------- Function: renderGrpChecklist() --------------------------*/
// For grp attendance, render checklist (create checkboxes of grp members)
/*-----------------------------------------------------------------------------*/
function renderGrpChecklist(members = []) {
    const container = document.getElementById('grpChecklist');
    container.innerHTML = '';  //clear old content

    // if no members info
    if (!Array.isArray(members) || members.length === 0) {
        container.innerHTML = '<p class="text-danger">No party members found.</p>';
        return;
    }

    // get each member info for checklist
    members.forEach(m => {
        const member_id = `guest_${m.guest_id}`;
        const wrapper = document.createElement('div');
        wrapper.className = 'form-check';

        wrapper.innerHTML = `
            <input class="form-check-input grp-member" type="checkbox" id="${member_id}" name="grpAttendees[]" value="${m.guest_id}">
            <label class="form-check-label" for="${member_id}">
                ${m.first_name} ${m.last_name}
            </label>
        `;
        container.appendChild(wrapper);
    });

    // "none" check option
    const noneWrapper = document.createElement('div');
    noneWrapper.className = 'form-check';
    noneWrapper.innerHTML = `
        <input class="form-check-input" type="checkbox" id="grpNone" name="grpAttendees[]" value="none">
        <label class="form-check-label" for="grpNone">None</label>
    `;
    container.appendChild(noneWrapper);

    // if "none" checked then uncheck other options; if any member checked then uncheck "none"
    const noneBox = document.getElementById('grpNone');
    const memberBoxes = document.querySelectorAll('.grp-member');

    function updateOrderGrp() {    //function: update group order based on checking none
        const anyMember = Array.from(memberBoxes).some(box => box.checked);
        if (noneBox.checked && anyMember) {
            noneBox.checked = false;
        }

        // update step order--> if "none" checked then notAttendingGrp otherwise attendingGrp
        currentOrder = (noneBox.checked || !anyMember)
            ? stepOrder.notAttendingGrp
            : stepOrder.attendingGrp;

    }

    // event listeners 
    noneBox.addEventListener('change', () => {
        // uncheck member boxes if none checked
        if (noneBox.checked) memberBoxes.forEach(box => (box.checked = false));
        updateOrderGrp();
    });

    memberBoxes.forEach(box => box.addEventListener('change', () => {
        // uncheck None if any member box is checked
        if (Array.from(memberBoxes).some(member => member.checked)) noneBox.checked = false;
        updateOrderGrp();
    }));

    // initialize order (default to notAttendingGrp)
    updateOrderGrp();
}

/*-------------------------- Functions: Render Grp Dietary Table --------------------------*/
// 1) renderGrpDietaryTable(): builds the per person dietary table
// 2) setupDietaryGrpUI(): one-time wiring for the Yes/No radios
// 3) enterDietaryGrpStep(): lifecycle when entering the dietary-grp step
// 4) showDietaryGrpError(): show/hide error message under table
/*-----------------------------------------------------------------------------*/
// persis group dietary UI between navigations
const dietaryGrpState = {
    answer: null,               // 'yes' | 'no' | null
    perGuest: {}                // { [guestId]: 'vegan' | 'vegetarian' | 'pescatarian' | 'none' }
}

function renderGrpDietaryTable(selectedIds) {
    const wrap = document.getElementById('grp-dietary-table-wrap');
    const tbody = document.querySelector('#grp-dietary-table tbody');
    tbody.innerHTML = '';  //clear old content
    
    // set up input values (selected party members 'First Last')
    const map = idToNameMap();
    // const options = [
    //     ['none', 'None'],
    //     ['vegan', 'Vegan'],
    //     ['vegetarian', 'Vegetarian'],
    //     ['pescatarian', 'Pescatarian']
    // ]

    // keep only entries for currently selected guests
    Object.keys(dietaryGrpState.perGuest).forEach(id => {
        if (!selectedIds.includes(id)) delete dietaryGrpState.perGuest[id];
    });

    // build table row for each selected attendee
    selectedIds.forEach(id => {

        // default to 'none' if this if newly selected guest
        if (!dietaryGrpState.perGuest[id]) dietaryGrpState.perGuest[id] = 'none';

        const tr = document.createElement('tr');

        // left cell: name
        const name = map.get(String(id)) || id;
        tr.innerHTML = `<td>${name}</td>`;
        
        // right cell: <select> with options (default is none)
        const td = document.createElement('td');
        const selectId = `diet_${id}`;
        const select = document.createElement('select');
        select.className = 'form-select form-select-sm grp-diet-select';
        select.id = selectId;
        select.name = selectId;

        dietOptions.forEach(([val, label]) => {
            const opt = document.createElement('option');
            opt.value = val;
            opt.textContent = label;
            if (val === 'none') opt.selected = true;  //default
            select.appendChild(opt);
        });

        // restore saved value
        select.value = dietaryGrpState.perGuest[id];

        // keep state up to date as user changes dropdowns
        select.addEventListener('change', () => {
            dietaryGrpState.perGuest[id] = select.value || 'none';
        });

        td.appendChild(select);
        tr.appendChild(td);
        tbody.appendChild(tr);
    });

    // show table only if there are attendees
    wrap.style.display = selectedIds.length ? 'block' : 'none';
}

let dietaryGrpWired = false;
function setupDietaryGrpUI() {
    if (dietaryGrpWired) return;
    dietaryGrpWired = true;

    const yes = document.getElementById('dietaryGrpYes');
    const no = document.getElementById('dietaryGrpNo');
    const wrap = document.getElementById('grp-dietary-table-wrap');

    // hide any validation message from previous try
    const hideMsg = () => {
        const msg = document.querySelector('#step-dietary-grp .invalid-feedback');
        if (msg) msg.style.display = 'none';
    };

    if (yes) {
        // open table when user picks yes
        yes.addEventListener('change', () => {
            hideMsg();
            dietaryGrpState.answer = yes.checked ? 'yes' : dietaryGrpState.answer;
            showDietaryGrpError('');  //clear any previous error
            renderGrpDietaryTable(getSelectedGroupIds());
            wrap.style.display = 'block';
        });
    } 
    if (no) {
        // open table when user picks no
        no.addEventListener('change', () => {
            hideMsg();
            dietaryGrpState.answer = no.checked ? 'no' : dietaryGrpState.answer;
            showDietaryGrpError('');  //clear any previous error
            wrap.style.display = 'none';
        });
    }

    // if attendee checkboxes change WHILE on this step and Yes is selected, refresh table so rows match attendees
    const refreshIfNeeded = () => {
        const onThisStep = document.getElementById('step-dietary-grp')?.classList.contains('active');
        if (onThisStep && dietaryGrpState.answer === 'yes') {
            renderGrpDietaryTable(getSelectedGroupIds());
        }
    };
    document.getElementById('grpChecklist')?.addEventListener('change', refreshIfNeeded);
}

function enterDietaryGrpStep() {
    setupDietaryGrpUI();

    const yes = document.getElementById('dietaryGrpYes');
    const no = document.getElementById('dietaryGrpNo');
    const wrap = document.getElementById('grp-dietary-table-wrap');
    
    // restore radios from state
    if (dietaryGrpState.answer === 'yes') {
        if (yes) yes.checked = true;
        if (no) no.checked = false;
        renderGrpDietaryTable(getSelectedGroupIds());
        if (wrap) wrap.style.display = 'block';
    } else if (dietaryGrpState.answer === 'no') {
        if (yes) yes.checked = false;
        if (no) no.checked = true;
        if (wrap) wrap.style.display = 'none';
    } else {
        // first time here, keep both unchecked and table hidden
        if (yes) yes.checked = false;
        if (no) no.checked = false;
        if (wrap) wrap.style.display = 'none';
    }
}

function showDietaryGrpError(text) {
    const wrap = document.getElementById('grp-dietary-table-wrap');
    if (!wrap) return;

    // reuse/create a message element
    let msg = document.getElementById('dietary-grp-extra-msg');
    if (!msg) {
        msg = document.createElement('div');
        msg.id = 'dietary-grp-extra-msg';
        msg.className = 'invalid-feedback d-block';
        wrap.appendChild(msg);
    }

    msg.textContent = text || '';
    msg.style.display = text ? 'block' : 'none';
}

/*-------------------------- Function: updateSummary() --------------------------*/
// Fills in the confirmation page with user's choices
/*-----------------------------------------------------------------------------*/
function updateSummary() {
    // get values
    const firstName = document.getElementById('firstName').value;
    const lastName = document.getElementById('lastName').value;
    // const attending = document.querySelector('input[name="attendingInput"]:checked');
    const attendingSummary = document.getElementById('attendingSummary');           // show only if attending

    // update user name
    document.getElementById('summaryName').textContent = `${firstName} ${lastName}`;
    
    // output based on party single or not
    const partyType = (guestInfo?.party?.party_type  || 'single').toLowerCase();
    const isGroup = partyType !== 'single';

    // summary if single
    if (!isGroup) {
        // single attending input
        const attending = document.querySelector('input[name="attendingInput"]:checked');
        
        // // update summary
        // document.getElementById('summaryName').textContent = `${firstName} ${lastName}`;
        document.getElementById('summaryAttending').textContent = document.querySelector(`label[for="${attending.id}"]`).textContent;
        // document.getElementById('summaryAttending').textContent = attending.value === 'yes' ? 'Yes, I\'ll be there!' : 'Sorry, can\'t make it :(';

        // show only if attending
        // const attendingSummary = document.getElementById('attendingSummary');
        if (attending.value === 'yes') {
            // dietary input
            const dietary = document.querySelector('input[name="dietaryInput"]:checked');
            const dietaryLabel = document.querySelector(`label[for="${dietary.id}"]`).textContent;
            document.getElementById('summaryDietary').textContent = dietaryLabel;

            // display
            attendingSummary.style.display = 'block';
        } else {
            // hide
            attendingSummary.style.display = 'none';
        }
    } else {
        // summary if group party
        const selected = Array.from(document.querySelectorAll('input[name="grpAttendees[]"]:checked'));
        const none = selected.some(box => box.value === 'none');

        // show attendingSummary (with dietary preference) only if attending
        if (none || selected.length === 0) {
            document.getElementById('summaryAttending').textContent = 'None';
            attendingSummary.style.display = 'none';   //hide
        } else {
            // show attending names
            const map = new Map((guestInfo?.members || []).map(m => [String(m.guest_id), `${m.first_name} ${m.last_name}`]));
            const names = selected.map(box => map.get(String(box.value)) || box.value);
            document.getElementById('summaryAttending').textContent = names.join(', ');

            // show dietary input
            const dietary = document.querySelector('input[name="dietaryInput"]:checked');
            const dietaryLabel = document.querySelector(`label[for="${dietary.id}"]`).textContent;
            document.getElementById('summaryDietary').textContent = dietaryLabel;

            // display
            attendingSummary.style.display = 'block';
        }
    }
    
}

/*-----------------------------------------------------------------------------*/
// Form Submission Handler
/*-----------------------------------------------------------------------------*/
document.getElementById('rsvpForm').addEventListener('submit', async function (e) {

    // prevent incomplete/invalid form submissions (treat "enter" as "next" and validate last step)
    if (currentStepIndex !== currentOrder.length - 1) {
        // treat submit as "next" (if not final step)
        e.preventDefault();
        await changeStep(1);
        return;
    } 
    // on final step, validate current step before 'submit'
    e.preventDefault();
    const ok = await validateCurrentStep();
    if (!ok) return;

    // collect all form data on submit
    const formData = new FormData(this);
    const data = Object.fromEntries(formData.entries());

    // add group selections explicitly
    const selected = formData.getAll('grpAttendees[]');
    if (selected && selected.length) {
        data.grpAttendees = selected;
        // data.selected_guest_ids = JSON.stringify(
        //     selected.filter(v => v !== 'none')
        // );
    }

    // success
    console.log('Form data:', data);
    console.log('Guest info:', guestInfo);
    alert('RSVP submitted successfully! Thank you!');
    

});

/*-----------------------------------------------------------------------------*/
// Event Listeners
/*-----------------------------------------------------------------------------*/
// listen for attendance changes to update steps order
document.querySelectorAll('input[name="attendingInput"]').forEach(radio => {
    radio.addEventListener('change', updateOrder);
});

// clear guest verification when name field change
document.getElementById('firstName').addEventListener('input', function() {
    guestVerified = false;
    guestInfo = null;
});
document.getElementById('lastName').addEventListener('input', function() {
    guestVerified = false;
    guestInfo = null;
});

/*-----------------------------------------------------------------------------*/
// Initialization
/*-----------------------------------------------------------------------------*/
// initialize
document.addEventListener('DOMContentLoaded', function() {
    currentOrder = stepOrder.attendingGrp;  // default to group flow
    currentStepIndex = 0;
    showStep(0); //show the first step
});
