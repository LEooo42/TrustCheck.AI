/* 
===========================================================================================================
Footer Year Setup
Block Contains:
 - Dynamically sets the current year in the footer
===========================================================================================================
*/

document.getElementById("year").textContent = new Date().getFullYear(); 

/* 
===========================================================================================================
Form Elements
Block Contains:
 - Form and field references
 - Error message references
===========================================================================================================
*/

const form = document.getElementById("contactForm");
const name = document.getElementById("name");
const email = document.getElementById("email");
const message = document.getElementById("message");
const nameError = document.getElementById("nameError");
const emailError = document.getElementById("emailError");
const messageError = document.getElementById("messageError");

const sendBtn = form.querySelector(".register-button");
const loadingDots = document.getElementById("emailLoadingDots");

/* Create a status element below the button */
let formStatus = document.getElementById("formStatus");
if (!formStatus) {
  formStatus = document.createElement("p");
  formStatus.id = "formStatus";
  formStatus.classList.add("form-status");
  sendBtn.insertAdjacentElement("afterend", formStatus);
}

/* 
===========================================================================================================
EmailJS Initialization
Block Contains:
 - Initializes EmailJS with public key
 - Must match the key in .env / EmailJS dashboard
===========================================================================================================
*/

(function() {
  emailjs.init("0slvH8QVP6B_8NgcO");
})();

/* 
===========================================================================================================
Form Submission Logic
Block Contains:
 - Input validation
 - Loading animation
 - EmailJS send logic
 - Success / error messages
===========================================================================================================
*/

form.addEventListener("submit", function (e) 
{
  e.preventDefault();

  /* Reset previous error states */
  [name, email, message].forEach(input => 
  {
    input.classList.remove("error");
    input.disabled = false; 
  });

  [nameError, emailError, messageError].forEach(label => 
  {
    label.textContent = "";
    label.style.display = "none";
  });

  formStatus.textContent = "";
  formStatus.style.color = "";

  let hasError = false;

  /* Input validation */
  if(!name.value.trim()) 
  {
    name.classList.add("error");
    nameError.textContent = "Name is required.";
    nameError.style.display = "block";
    hasError = true;
  }

  /* Proper email validation */
  const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if(!email.value.trim()) 
  {
    email.classList.add("error");
    emailError.textContent = "Email is required.";
    emailError.style.display = "block";
    hasError = true;
  }
  else if(!emailPattern.test(email.value)) 
  {
    email.classList.add("error");
    emailError.textContent = "Please enter a valid email address.";
    emailError.style.display = "block";
    hasError = true;
  }

  if(!message.value.trim()) 
  {
    message.classList.add("error");
    messageError.textContent = "Message cannot be empty.";
    messageError.style.display = "block";
    hasError = true;
  }

  if(hasError) return;

  /* UI: Disable input, show animation, hide button */
  [name, email, message].forEach(input => input.disabled = true);
  sendBtn.style.display = "none";
  loadingDots.style.display = "flex";

  /* 
  ===========================================================================================================
  EmailJS Send Logic
  ===========================================================================================================
  */

  emailjs.send("service_obwp6eu", "template_crpdttk", 
  {
    name: name.value,
    email: email.value,
    message: message.value
  })
  .then(() => 
  {
    /* Success message */
    formStatus.style.display = "block";
    formStatus.style.color = "#1abc9c";
    formStatus.textContent = "Message sent successfully!";

    /* Reset form fields after successful send */
    form.reset();

    /* Optional: small fade-out for success message after a few seconds */
    setTimeout(() => {
      formStatus.style.display = "none";
    }, 4000);
  })
  .catch((error) => 
  {
    console.error("EmailJS error:", error);
    formStatus.style.display = "block";
    formStatus.style.color = "#f26c6c";
    formStatus.textContent = "Failed to send. Please try again later.";
  })
  .finally(() => 
  {
    [name, email, message].forEach(input => input.disabled = false);
    sendBtn.style.display = "block";
    loadingDots.style.display = "none";
  });
});
