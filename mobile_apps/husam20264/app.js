// Get the contact form element
const contactForm = document.getElementById('contact-form');

// Add event listener for form submission
contactForm.addEventListener('submit', (event) => {
  event.preventDefault(); // Prevent default form submission

  // Get form field values
  const name = document.getElementById('name').value;
  const email = document.getElementById('email').value;
  const message = document.getElementById('message').value;

  // Perform form validation
  if (name.trim() === '' || email.trim() === '' || message.trim() === '') {
    alert('Please fill in all the required fields.');
    return;
  }

  // Perform form submission logic here
  console.log('Form submitted:', { name, email, message });

  // Reset the form fields
  contactForm.reset();
});