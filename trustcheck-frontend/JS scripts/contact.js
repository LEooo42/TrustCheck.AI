/*
Function to set the current year in the footer.
Paramaters:
- none: Uses the #year element from the page
Returns:
- none: Updates the footer text
*/
function setFooterYear()
{
    const yearElement = document.getElementById("year")

    if (!yearElement)
    {
        return
    }

    yearElement.textContent = new Date().getFullYear()
}

setFooterYear()

const form = document.getElementById("contactForm")
const nameInput = document.getElementById("name")
const emailInput = document.getElementById("email")
const messageInput = document.getElementById("message")
const nameError = document.getElementById("nameError")
const emailError = document.getElementById("emailError")
const messageError = document.getElementById("messageError")
const sendButton = form.querySelector(".register-button")
const loadingDots = document.getElementById("emailLoadingDots")
const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/

/*
Function to make sure the form has a status message element.
Paramaters:
- none: Uses the existing contact form elements
Returns:
- HTMLElement formStatus: The status element below the button
*/
function ensureStatusElement()
{
    let formStatus = document.getElementById("formStatus")

    if (!formStatus)
    {
        formStatus = document.createElement("p")
        formStatus.id = "formStatus"
        formStatus.classList.add("form-status")
        sendButton.insertAdjacentElement("afterend", formStatus)
    }

    return formStatus
}

const formStatus = ensureStatusElement()

/*
Function to initialize EmailJS.
Paramaters:
- none: Uses the public key stored in the script
Returns:
- none: Starts EmailJS for this page
*/
function initializeEmailService()
{
    emailjs.init("hEQMW1kEwHHpV3DvS")
}

initializeEmailService()

/*
Function to clear old validation errors.
Paramaters:
- none: Uses the contact form fields and labels
Returns:
- none: Resets the form error state
*/
function resetErrors()
{
    [nameInput, emailInput, messageInput].forEach(function(input)
    {
        input.classList.remove("error")
        input.disabled = false
    })

    [nameError, emailError, messageError].forEach(function(label)
    {
        label.textContent = ""
        label.style.display = "none"
    })

    formStatus.textContent = ""
    formStatus.style.color = ""
}

/*
Function to validate the contact form.
Paramaters:
- none: Reads the current field values from the form
Returns:
- boolean hasError: True if the form has invalid input
*/
function validateForm()
{
    let hasError = false

    if (!nameInput.value.trim())
    {
        nameInput.classList.add("error")
        nameError.textContent = "Name is required."
        nameError.style.display = "block"
        hasError = true
    }

    if (!emailInput.value.trim())
    {
        emailInput.classList.add("error")
        emailError.textContent = "Email is required."
        emailError.style.display = "block"
        hasError = true
    }
    else if (!emailPattern.test(emailInput.value))
    {
        emailInput.classList.add("error")
        emailError.textContent = "Please enter a valid email address."
        emailError.style.display = "block"
        hasError = true
    }

    if (!messageInput.value.trim())
    {
        messageInput.classList.add("error")
        messageError.textContent = "Message cannot be empty."
        messageError.style.display = "block"
        hasError = true
    }

    return hasError
}

/*
Function to switch the form into loading mode.
Paramaters:
- none: Uses the current form elements
Returns:
- none: Hides the button and shows the loading dots
*/
function showLoadingState()
{
    [nameInput, emailInput, messageInput].forEach(function(input)
    {
        input.disabled = true
    })

    sendButton.style.display = "none"
    loadingDots.style.display = "flex"
}

/*
Function to restore the form after sending finishes.
Paramaters:
- none: Uses the current form elements
Returns:
- none: Enables the form and restores the button
*/
function restoreFormState()
{
    [nameInput, emailInput, messageInput].forEach(function(input)
    {
        input.disabled = false
    })

    sendButton.style.display = "block"
    loadingDots.style.display = "none"
}

/*
Function to send the form through EmailJS.
Paramaters:
- none: Reads the current form field values
Returns:
- Promise<void> none: Resolves when the request finishes
*/
async function sendMessage()
{
    console.log("Sending with:", "service_lnaywvo", "template_kagf4cu")

    try
    {
        await emailjs.send("service_lnaywvo", "template_kagf4cu",
        {
            name: nameInput.value,
            email: emailInput.value,
            message: messageInput.value
        })

        formStatus.style.display = "block"
        formStatus.style.color = "#1abc9c"
        formStatus.textContent = "Message sent successfully!"

        form.reset()

        setTimeout(function()
        {
            formStatus.style.display = "none"
        }, 4000)
    }
    catch (error)
    {
        console.error("EmailJS error:", error)
        formStatus.style.display = "block"
        formStatus.style.color = "#f26c6c"
        formStatus.textContent = "Failed to send. Please try again later."
    }
    finally
    {
        restoreFormState()
    }
}

/*
Function to handle contact form submission.
Paramaters:
- Event event: The submit event from the form
Returns:
- Promise<void> none: Stops default submit and sends the message
*/
async function handleSubmit(event)
{
    event.preventDefault()

    resetErrors()

    if (validateForm())
    {
        return
    }

    showLoadingState()
    await sendMessage()
}

form.addEventListener("submit", handleSubmit)
