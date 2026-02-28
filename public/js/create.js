import { api, toast } from './app.js';

const form = document.getElementById('createForm');

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const formData = new FormData(form);
  const data = Object.fromEntries(formData.entries());

  try {
    const consultation = await api('/consultations', {
      method: 'POST',
      body: JSON.stringify(data)
    });

    toast('Consultation created!', 'success');

    // Redirect to consultation detail page
    setTimeout(() => {
      window.location.href = `/consultation.html?id=${consultation.id}`;
    }, 500);
  } catch (error) {
    toast(`Failed to create consultation: ${error.message}`, 'error');
  }
});
