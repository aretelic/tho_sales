import { api, toast, esc, formatDate, getStatusBadge } from './app.js';

async function load() {
  try {
    const drafts = await api('/case-studies');
    render(drafts);
  } catch {
    toast('Failed to load case studies', 'error');
  }
}

function render(drafts) {
  if (!drafts.length) {
    document.getElementById('caseStudiesContent').innerHTML = `
      <div class="empty-state">
        <h2>No case studies yet</h2>
        <p>Open a completed consultation and use the Case Study tab to start a draft.</p>
        <a href="/" class="btn btn-primary">Go to Dashboard</a>
      </div>
    `;
    return;
  }

  let html = `
    <table class="consultations-table">
      <thead>
        <tr>
          <th>Client</th>
          <th>Headline</th>
          <th>Status</th>
          <th>Date</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
  `;

  for (const d of drafts) {
    const statusMap = { draft: 'status-draft', reviewed: 'status-reviewed', published: 'status-published' };
    html += `
      <tr>
        <td><strong>${esc(d.client_name || '—')}</strong><br>
          <span style="color:var(--text-3);font-size:12px">${formatDate(d.consultation_date)}</span>
        </td>
        <td>${esc(d.headline || 'Untitled Draft')}</td>
        <td><span class="status-badge ${statusMap[d.edit_status] || ''}">${d.edit_status}</span></td>
        <td style="color:var(--text-3);font-size:12px">${formatDate(d.created_at)}</td>
        <td><a href="/consultation.html?id=${d.consultation_id}&tab=case-study" class="btn btn-sm">Edit</a></td>
      </tr>
    `;
  }

  html += '</tbody></table>';
  document.getElementById('caseStudiesContent').innerHTML = html;
}

load();
