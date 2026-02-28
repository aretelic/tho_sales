import { api, toast, formatDate, getStatusBadge, esc } from './app.js';

let consultations = [];

async function loadConsultations() {
  try {
    consultations = await api('/consultations');
    renderConsultations();
  } catch (error) {
    toast('Failed to load consultations', 'error');
  }
}

function renderConsultations() {
  const container = document.getElementById('consultationsTable');
  const emptyState = document.getElementById('emptyState');

  if (consultations.length === 0) {
    container.innerHTML = '';
    emptyState.style.display = 'block';
    return;
  }

  emptyState.style.display = 'none';

  let html = `
    <table class="consultations-table">
      <thead>
        <tr>
          <th>Client</th>
          <th>Date</th>
          <th>Consultant</th>
          <th>Status</th>
          <th>Score</th>
          <th>Extractions</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
  `;

  for (const c of consultations) {
    html += `
      <tr>
        <td><strong>${esc(c.client_name)}</strong></td>
        <td>${formatDate(c.consultation_date)}</td>
        <td>${esc(c.consultant_name) || '—'}</td>
        <td>${getStatusBadge(c.analysis_status)}</td>
        <td>${c.score_composite_pct !== null ? c.score_composite_pct + '%' : '—'}</td>
        <td>${c.total_extractions || 0}</td>
        <td>
          ${c.analysis_status === 'pending' ?
            `<button class="btn btn-sm btn-primary" onclick="window.analyseConsultation('${c.id}')">Analyse</button>` :
            `<a href="/consultation.html?id=${c.id}" class="btn btn-sm">View</a>`
          }
        </td>
      </tr>
    `;
  }

  html += `
      </tbody>
    </table>
  `;

  container.innerHTML = html;
}

window.analyseConsultation = async function(id) {
  try {
    toast('Analysis started...', 'info');
    await api(`/consultations/${id}/analyse`, { method: 'POST' });
    toast('Analysis complete!', 'success');
    await loadConsultations();
  } catch (error) {
    toast(`Analysis failed: ${error.message}`, 'error');
    await loadConsultations();
  }
};

// Initial load
loadConsultations();
