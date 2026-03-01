import { api, toast, formatDate, getStatusBadge, esc } from './app.js';

let consultations = [];

// --- Calendar ---

async function loadCalendarEvents() {
  try {
    const events = await api('/calendar/events');
    if (events) renderCalendarEvents(events);
  } catch {
    // Non-critical — fail silently, consultations table unaffected
    document.getElementById('calendarEvents').innerHTML =
      '<p class="calendar-empty">Could not load calendar events.</p>';
  }
}

function renderCalendarEvents(events) {
  const container = document.getElementById('calendarEvents');

  if (!events.length) {
    container.innerHTML = '<p class="calendar-empty">No upcoming appointments in the next 2 weeks.</p>';
    return;
  }

  container.innerHTML = `<div class="calendar-events-row">${events.map(buildEventCard).join('')}</div>`;
}

function buildEventCard(event) {
  const startDt = event.start?.dateTime
    ? new Date(event.start.dateTime)
    : new Date(event.start?.date);

  const dayName  = startDt.toLocaleDateString('en-GB', { weekday: 'short' });
  const dayNum   = startDt.getDate();
  const month    = startDt.toLocaleDateString('en-GB', { month: 'short' });
  const timeStr  = event.start?.dateTime
    ? startDt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : 'All day';

  const link = event.linkedConsultationId
    ? `<a href="/consultation.html?id=${esc(event.linkedConsultationId)}" class="event-link">View consultation →</a>`
    : '';

  return `
    <div class="calendar-event-card">
      <div class="event-date-block">
        <div class="event-month">${month}</div>
        <div class="event-day-num">${dayNum}</div>
        <div class="event-day-name">${dayName}</div>
      </div>
      <div class="event-title">${esc(event.summary)}</div>
      <div class="event-time">${timeStr}</div>
      ${link}
    </div>
  `;
}

// --- Consultations ---

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
          <button class="btn btn-sm btn-ghost" style="color:var(--red)"
            onclick="window.deleteConsultation('${c.id}', '${esc(c.client_name)}')">Delete</button>
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

window.deleteConsultation = async function(id, name) {
  if (!confirm(`Delete "${name}"? This will permanently remove all extractions, comments and case study drafts.`)) return;
  try {
    await api(`/consultations/${id}`, { method: 'DELETE' });
    consultations = consultations.filter(c => c.id !== id);
    renderConsultations();
    toast('Consultation deleted', 'success');
  } catch (error) {
    toast(`Delete failed: ${error.message}`, 'error');
  }
};

// Initial load
loadCalendarEvents();
loadConsultations();
