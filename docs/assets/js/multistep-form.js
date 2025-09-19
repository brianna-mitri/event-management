/* --------------------------------------------------------- */
// Step Management System
/* --------------------------------------------------------- */
// configuration
GOOGLE_APPS_SCRIPT = 'https://script.google.com/macros/s/AKfycbzjmubkgAzt1qUdjQ8yBTFLHAFpFPKj1bx0KxVlZBtlyZyBY7ovQrG4zdI1DJNW9pV6/exec';

// define step paths
const stepOrder = {
    attending: ['name', 'attendance', 'dietary', 'confirm'],
    notAttending: ['name', 'attendance', 'confirm']
};

// track current flow and position
let currentOrder = stepOrder.attending;      //current step sequence
let currentStepIndex = 0;   //current index
let guestVerified = false;  //track if guest is verified
let guestInfo = null;       //store guest info



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
            guestInfo = result.guest;
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
}


/*-------------------------- Function: changeStep(direction) --------------------------*/
// Called when user clicks "Next" (+1) or "Back" (-1)
/*-----------------------------------------------------------------------------*/
async function changeStep(direction) {
    // validate current step before moving forward
    if (direction === 1 && !await validateCurrentStep()) {
        return;
    }

    // update step order, if they just answered attendance
    if (currentOrder[currentStepIndex] === 'attendance' && direction === 1) {
        updateOrder();
    }

    // move to the next/previous step
    currentStepIndex += direction;

    // boundary checks: don't go below 0 or above max steps
    if (currentStepIndex < 0) currentStepIndex = 0;
    if (currentStepIndex >= currentOrder.length) currentStepIndex = currentOrder.length - 1;

    // display the new step
    showStep(currentStepIndex);


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

    return isValid; //all validation passed

    // return true;  //all validation passed
}

/*-------------------------- Function: updateSummary() --------------------------*/
// Fills in the confirmation page with user's choices
/*-----------------------------------------------------------------------------*/
function updateSummary() {
    // get values
    const firstName = document.getElementById('firstName').value;
    const lastName = document.getElementById('lastName').value;
    const attending = document.querySelector('input[name="attendingInput"]:checked');

    // update summary
    document.getElementById('summaryName').textContent = `${firstName} ${lastName}`;
    document.getElementById('summaryAttending').textContent = document.querySelector(`label[for="${attending.id}"]`).textContent;
    // document.getElementById('summaryAttending').textContent = attending.value === 'yes' ? 'Yes, I\'ll be there!' : 'Sorry, can\'t make it :(';

    // show only if attending
    const attendingSummary = document.getElementById('attendingSummary');
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
    } else {
        // on final step, validate current step before 'submit'
        e.preventDefault();
        const ok = await validateCurrentStep();
        if (!ok) return;

        // collect all form data on submit
        const formData = new FormData(this);
        const data = Object.fromEntries(formData.entries());

        alert('RSVP submitted successfully! Thank you!');
        console.log('Form data:', data);
        console.log('Guest info:', guestInfo);
    }

})

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
    currentOrder = stepOrder.attending;
    currentStepIndex = 0;
    showStep(0); //show the first step
});
