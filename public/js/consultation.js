import {
  api, toast, esc, formatDate, formatKey,
  getScoreClass, getStatusBadge, CATEGORY_META, DESTINATION_TAGS
} from './app.js';

let consultation = null;
let extractions = [];
let currentFilter = 'all';
let caseStudyDraft = null;
const commentCache = new Map();

let capsuleState = {
  partyId: null,
  opportunityId: null,
  opportunityName: null,
  linkedName: null,
  searchResults: [],
  searching: false,
  logging: false,
  logged: false,
};

// Get consultation ID from URL
const params = new URLSearchParams(window.location.search);
const consultationId = params.get('id');

if (!consultationId) {
  toast('No consultation ID provided', 'error');
  window.location.href = '/';
}

// Tab switching
document.getElementById('mainTabs').addEventListener('click', (e) => {
  if (!e.target.classList.contains('tab')) return;

  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));

  e.target.classList.add('active');
  document.getElementById('panel-' + e.target.dataset.tab).classList.add('active');
});

async function loadConsultation() {
  try {
    consultation = await api(`/consultations/${consultationId}`);

    // Update header
    document.getElementById('consultationTitle').textContent = consultation.client_name;
    document.getElementById('consultationMeta').innerHTML = `
      ${formatDate(consultation.consultation_date)}
      ${consultation.consultant_name ? `• ${esc(consultation.consultant_name)}` : ''}
    `;

    // Render status bar
    renderStatusBar();

    // Render appropriate view based on status
    if (consultation.analysis_status === 'complete') {
      await loadExtractions();
      await loadCaseStudy();
      renderScorecard();
      renderNextSteps();
      renderExtractions();
      renderTranscript();
      renderCaseStudy();
    } else if (consultation.analysis_status === 'pending') {
      renderPendingState();
    } else if (consultation.analysis_status === 'analysing') {
      renderAnalysingState();
    } else if (consultation.analysis_status === 'failed') {
      renderFailedState();
    }

    // Deep-link to tab if ?tab= is in URL
    const tabParam = params.get('tab');
    if (tabParam) {
      const tabBtn = document.querySelector(`.tab[data-tab="${tabParam}"]`);
      if (tabBtn) tabBtn.click();
    }

  } catch (error) {
    toast(`Failed to load consultation: ${error.message}`, 'error');
  }
}

function renderStatusBar() {
  const statusBar = document.getElementById('statusBar');

  if (consultation.analysis_status === 'pending') {
    statusBar.innerHTML = `
      <div class="status-bar-content">
        ${getStatusBadge('pending')}
        <span>This consultation has not been analysed yet.</span>
        <button class="btn btn-primary btn-sm" onclick="window.triggerAnalysis()">Analyse Now</button>
      </div>
    `;
    statusBar.style.display = 'block';
  } else if (consultation.analysis_status === 'analysing') {
    statusBar.innerHTML = `
      <div class="status-bar-content">
        ${getStatusBadge('analysing')}
        <span>Analysis in progress... This may take 30-60 seconds. Refresh the page to check for completion.</span>
      </div>
    `;
    statusBar.style.display = 'block';
  } else if (consultation.analysis_status === 'failed') {
    statusBar.innerHTML = `
      <div class="status-bar-content status-bar-error">
        ${getStatusBadge('failed')}
        <span>Analysis failed: ${esc(consultation.analysis_error)}</span>
        <button class="btn btn-sm" onclick="window.triggerAnalysis()">Retry</button>
      </div>
    `;
    statusBar.style.display = 'block';
  } else {
    statusBar.style.display = 'none';
  }
}

function renderPendingState() {
  document.getElementById('scorecardContent').innerHTML = `
    <div class="empty-state">
      <h2>Not yet analysed</h2>
      <p>Click "Analyse Now" to process this consultation with Claude.</p>
    </div>
  `;
  document.getElementById('extractionsContent').innerHTML = '';
  document.getElementById('transcriptContent').innerHTML = '<pre style="padding: 20px; color: var(--text-2);">' + esc(consultation.transcript_text) + '</pre>';
}

function renderAnalysingState() {
  document.getElementById('scorecardContent').innerHTML = `
    <div class="empty-state">
      <h2>Analysis in progress...</h2>
      <p>Claude is analysing this consultation. This usually takes 30-60 seconds.</p>
      <p><em>Refresh the page to check for completion.</em></p>
    </div>
  `;
}

function renderFailedState() {
  document.getElementById('scorecardContent').innerHTML = `
    <div class="empty-state">
      <h2>Analysis failed</h2>
      <p>${esc(consultation.analysis_error)}</p>
      <button class="btn btn-primary" onclick="window.triggerAnalysis()">Retry Analysis</button>
    </div>
  `;
}

async function loadExtractions() {
  try {
    extractions = await api(`/extractions?consultation_id=${consultationId}`);
  } catch (error) {
    toast('Failed to load extractions', 'error');
  }
}

function renderScorecard() {
  if (!consultation.analysis_json) return;

  const data = consultation.analysis_json;
  const meta = data.consultation_meta;
  const scores = data.framework_scores;

  let html = '';

  // Meta cards
  html += '<div class="meta-grid">';
  html += metaCard('Client', meta.client_name);
  html += metaCard('Date', formatDate(meta.date));
  html += metaCard('Consultant', meta.consultant_name);
  html += metaCard('Duration', meta.duration_minutes ? `${meta.duration_minutes} mins` : '—');
  html += metaCard('Outcome', meta.outcome || '—');
  html += metaCard('Value', meta.deal_value || '—');
  html += '</div>';

  // Executive summary
  if (data.executive_summary) {
    html += `<div class="summary-card">
      <h3>Executive Summary</h3>
      <p>${esc(data.executive_summary)}</p>
    </div>`;
  }

  // Composite score bar chart
  html += renderCompositeScores(scores);

  // Framework detail cards
  html += '<div class="framework-grid">';
  html += renderFrameworkCard('BANT', scores.bant);
  html += renderFrameworkCard('SPIN', scores.spin);
  html += renderFrameworkCard('NEAT', scores.neat);
  html += renderFrameworkCard('Challenger', scores.challenger);
  html += renderFrameworkCard('JTBD', scores.jtbd);
  html += renderFrameworkCard('Sandler Pain', scores.sandler_pain);
  html += '</div>';

  // Top improvements
  if (data.top_3_improvements?.length) {
    html += '<div class="summary-card"><h3>Top Improvements</h3><ul class="improvements-list">';
    for (const imp of data.top_3_improvements) {
      html += `<li>
        <div class="imp-title">${esc(imp.title)}</div>
        <div class="imp-desc">${esc(imp.description)}</div>
        <span class="tag imp-priority tag-${imp.priority}">${imp.priority}</span>
      </li>`;
    }
    html += '</ul></div>';
  }

  document.getElementById('scorecardContent').innerHTML = html;
}

function metaCard(label, value) {
  return `<div class="meta-card">
    <div class="label">${label}</div>
    <div class="value">${esc(value || '—')}</div>
  </div>`;
}

function renderCompositeScores(scores) {
  const frameworks = [
    { label: 'BANT', data: scores.bant },
    { label: 'SPIN', data: scores.spin },
    { label: 'NEAT', data: scores.neat },
    { label: 'Challenger', data: scores.challenger },
    { label: 'JTBD', data: scores.jtbd },
    { label: 'Sandler Pain', data: scores.sandler_pain }
  ];

  let html = '<div class="composite-bar-wrap"><h3>Framework Scores</h3>';

  for (const f of frameworks) {
    if (!f.data) continue;
    const pct = Math.round((f.data.total / f.data.max) * 100);
    const col = pct >= 70 ? 'var(--accent)' : pct >= 50 ? 'var(--accent-2)' : 'var(--red)';
    html += `<div class="composite-row">
      <span class="composite-label">${f.label}</span>
      <div class="composite-track">
        <div class="composite-fill" style="width:${pct}%;background:${col}"></div>
      </div>
      <span class="composite-pct">${pct}%</span>
    </div>`;
  }

  if (scores.composite) {
    html += `<div class="composite-row" style="margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border);">
      <span class="composite-label" style="font-weight:700;">Composite</span>
      <div class="composite-track">
        <div class="composite-fill" style="width:${scores.composite.percentage}%;background:var(--text)"></div>
      </div>
      <span class="composite-pct" style="font-weight:700;">${scores.composite.percentage}%</span>
    </div>`;
  }

  html += '</div>';
  return html;
}

function renderFrameworkCard(name, data) {
  if (!data) return '';

  const pct = Math.round((data.total / data.max) * 100);
  const scoreClass = getScoreClass(pct);

  let rows = '';
  for (const [key, val] of Object.entries(data)) {
    if (key === 'total' || key === 'max') continue;
    if (typeof val === 'object' && val.score !== undefined) {
      rows += `<div class="criterion-row">
        <span class="criterion-name">${formatKey(key)}</span>
        <span class="criterion-score">${val.score}/10</span>
        <span class="criterion-just">${esc(val.justification || val.identified_job || '')}</span>
      </div>`;
    }
  }

  return `<div class="framework-card">
    <div class="framework-card-header">
      <h3>${name}</h3>
      <span class="framework-score ${scoreClass}">${data.total}/${data.max} (${pct}%)</span>
    </div>
    ${rows}
  </div>`;
}

function renderExtractions() {
  if (extractions.length === 0) {
    document.getElementById('extractionsContent').innerHTML = `
      <div class="empty-state">
        <h2>No extractions</h2>
        <p>The analysis did not produce any extractions.</p>
      </div>
    `;
    return;
  }

  const getStatus = e => e.review_status || 'pending';
  const counts = {
    all:      extractions.length,
    pending:  extractions.filter(e => getStatus(e) === 'pending').length,
    approved: extractions.filter(e => getStatus(e) === 'approved').length,
    rejected: extractions.filter(e => getStatus(e) === 'rejected').length,
    parked:   extractions.filter(e => getStatus(e) === 'parked').length,
  };
  const reviewed = counts.approved + counts.rejected;
  const pct = extractions.length ? Math.round((reviewed / extractions.length) * 100) : 0;

  const filtered = currentFilter === 'all'
    ? extractions
    : extractions.filter(e => getStatus(e) === currentFilter);

  const filterLabels = { all: 'All', pending: 'Pending', approved: 'Approved', rejected: 'Rejected', parked: 'Parked' };

  let html = `
    <div class="review-bar">
      <div class="review-progress">
        <span class="review-progress-text">Reviewed ${reviewed} of ${extractions.length}</span>
        <div class="review-track"><div class="review-fill" style="width:${pct}%"></div></div>
        <span class="review-pct">${pct}%</span>
      </div>
      <div class="filter-bar">
        ${Object.keys(filterLabels).map(f => `
          <button class="filter-btn${currentFilter === f ? ' active' : ''}" onclick="window.setExtractionFilter('${f}')">
            ${filterLabels[f]} <span class="filter-count">${counts[f]}</span>
          </button>
        `).join('')}
      </div>
    </div>
  `;

  // Group filtered items by category
  const byCategory = {};
  for (const ext of filtered) {
    if (!byCategory[ext.category]) byCategory[ext.category] = [];
    byCategory[ext.category].push(ext);
  }

  if (filtered.length === 0) {
    html += `<div class="empty-state"><p>No ${currentFilter} items.</p></div>`;
  }

  for (const [category, items] of Object.entries(byCategory)) {
    const meta = CATEGORY_META[category] || { label: formatKey(category), color: 'var(--text-2)', desc: '' };
    html += `
      <div class="category-block">
        <div class="category-header">
          <h3 style="color: ${meta.color}">${meta.label}</h3>
          <span class="category-count">${items.length}</span>
        </div>
        <div class="category-desc">${meta.desc}</div>
        ${items.map(buildCardHTML).join('')}
      </div>
    `;
  }

  document.getElementById('extractionsContent').innerHTML = html;
}

function buildCardHTML(item) {
  const status = item.review_status || 'pending';
  const displayInsight = item.insight_edited || item.insight;
  const displayUse = item.suggested_use_edited || item.suggested_use;
  const tags = JSON.parse(item.destination_tags || '[]');

  return `
    <div class="extraction-card ${status}" id="card-${item.id}">
      <div class="insight">${esc(displayInsight)}</div>
      ${item.quote ? `<div class="quote"><em>${esc(item.speaker || 'Client')}:</em> "${esc(item.quote)}"</div>` : ''}
      <div class="meta-row">
        ${item.confidence ? `<span class="tag tag-${item.confidence}">${item.confidence}</span>` : ''}
        ${item.status ? `<span class="tag tag-${item.status}">${item.status}</span>` : ''}
      </div>
      ${displayUse ? `<div class="suggested-use"><strong>Use:</strong> ${esc(displayUse)}</div>` : ''}
      <div class="dest-tags" id="tags-${item.id}">${buildTagChips(item.id, tags)}</div>
      <div class="card-footer">
        <div class="card-actions">
          <button class="btn btn-sm btn-approve${status === 'approved' ? ' active' : ''}" onclick="window.reviewExtraction('${item.id}', 'approved')">✓ Approve</button>
          <button class="btn btn-sm btn-reject${status === 'rejected' ? ' active' : ''}" onclick="window.reviewExtraction('${item.id}', 'rejected')">✗ Reject</button>
          <button class="btn btn-sm btn-park${status === 'parked' ? ' active' : ''}" onclick="window.reviewExtraction('${item.id}', 'parked')">◎ Park</button>
        </div>
        <button class="btn btn-sm btn-ghost" onclick="window.toggleExtractEdit('${item.id}')">Edit</button>
      </div>
      <div class="edit-panel hidden" id="edit-${item.id}">
        <label class="edit-label">Insight</label>
        <textarea class="edit-textarea" id="insight-input-${item.id}">${esc(item.insight_edited || item.insight)}</textarea>
        <label class="edit-label">Suggested use</label>
        <textarea class="edit-textarea" id="use-input-${item.id}">${esc(item.suggested_use_edited || item.suggested_use || '')}</textarea>
        <div class="edit-actions">
          <button class="btn btn-primary btn-sm" onclick="window.saveExtractEdit('${item.id}')">Save edits</button>
          <button class="btn btn-ghost btn-sm" onclick="window.toggleExtractEdit('${item.id}')">Cancel</button>
        </div>
      </div>
      <div class="comments-section">
        <button class="comments-toggle" onclick="window.toggleComments('${item.id}')">
          💬 ${item.comment_count > 0 ? `${item.comment_count} comment${item.comment_count !== 1 ? 's' : ''}` : 'Add comment'}
        </button>
        <div class="comments-thread hidden" id="thread-${item.id}">
          <div class="comments-list" id="comments-list-${item.id}"></div>
          <div class="comment-form">
            <textarea class="comment-input" id="comment-input-${item.id}" placeholder="Add a comment..." rows="2"></textarea>
            <button class="btn btn-sm btn-primary" onclick="window.postComment('${item.id}')">Post</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function buildTagChips(id, activeTags) {
  return DESTINATION_TAGS.map(tag => {
    const active = activeTags.includes(tag.slug);
    return `<button class="dest-chip${active ? ' active' : ''}" onclick="window.toggleDestTag('${id}', '${tag.slug}')">${esc(tag.label)}</button>`;
  }).join('');
}

// --- Review action handlers ---

window.setExtractionFilter = function(filter) {
  currentFilter = filter;
  renderExtractions();
};

window.reviewExtraction = async function(id, newStatus) {
  const idx = extractions.findIndex(e => e.id === id);
  if (idx === -1) return;

  const current = extractions[idx].review_status || 'pending';
  const status = current === newStatus ? 'pending' : newStatus;

  try {
    await api(`/extractions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ review_status: status })
    });
    extractions[idx] = { ...extractions[idx], review_status: status };
    renderExtractions();
  } catch {
    toast('Update failed', 'error');
  }
};

window.toggleExtractEdit = function(id) {
  document.getElementById('edit-' + id)?.classList.toggle('hidden');
};

window.saveExtractEdit = async function(id) {
  const insight_edited = document.getElementById('insight-input-' + id)?.value.trim();
  const suggested_use_edited = document.getElementById('use-input-' + id)?.value.trim();

  try {
    await api(`/extractions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ insight_edited, suggested_use_edited })
    });
    const idx = extractions.findIndex(e => e.id === id);
    extractions[idx] = { ...extractions[idx], insight_edited, suggested_use_edited };
    renderExtractions();
    toast('Saved', 'success');
  } catch {
    toast('Save failed', 'error');
  }
};

window.toggleDestTag = async function(id, slug) {
  const idx = extractions.findIndex(e => e.id === id);
  if (idx === -1) return;

  const tags = JSON.parse(extractions[idx].destination_tags || '[]');
  const newTags = tags.includes(slug) ? tags.filter(t => t !== slug) : [...tags, slug];

  try {
    await api(`/extractions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ destination_tags: newTags })
    });
    extractions[idx] = { ...extractions[idx], destination_tags: JSON.stringify(newTags) };
    // Update just the chip row — no full re-render needed
    const container = document.getElementById('tags-' + id);
    if (container) container.innerHTML = buildTagChips(id, newTags);
  } catch {
    toast('Update failed', 'error');
  }
};

function renderTranscript() {
  const transcript = consultation.transcript_text || '';
  const lines = transcript.split('\n');

  let html = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    // Simple speaker detection
    const speakerMatch = line.match(/^([A-Za-z\s]+?):\s*(.*)/);
    if (speakerMatch) {
      html += `<div class="transcript-line" data-line="${i + 1}">
        <span class="line-number">${i + 1}</span>
        <span class="speaker">${esc(speakerMatch[1])}:</span>
        <span class="speech">${esc(speakerMatch[2])}</span>
      </div>`;
    } else {
      html += `<div class="transcript-line" data-line="${i + 1}">
        <span class="line-number">${i + 1}</span>
        <span class="text">${esc(line)}</span>
      </div>`;
    }
  }

  document.getElementById('transcriptContent').innerHTML = html;
}

window.triggerAnalysis = async function() {
  try {
    toast('Starting analysis...', 'info');
    consultation.analysis_status = 'analysing';
    renderStatusBar();

    await api(`/consultations/${consultationId}/analyse`, { method: 'POST' });

    toast('Analysis complete!', 'success');

    // Reload page to show results
    window.location.reload();
  } catch (error) {
    toast(`Analysis failed: ${error.message}`, 'error');
    consultation.analysis_status = 'failed';
    consultation.analysis_error = error.message;
    renderStatusBar();
    renderFailedState();
  }
};

// --- Case Study ---

async function loadCaseStudy() {
  try {
    const drafts = await api(`/case-studies?consultation_id=${consultationId}`);
    caseStudyDraft = drafts[0] || null;
  } catch {
    caseStudyDraft = null;
  }
}

function renderCaseStudy() {
  const moments = extractions.filter(e => e.category === 'case_study_moments');
  const draft = caseStudyDraft;
  const v = field => esc(draft?.[field] || '');

  let html = '<div class="case-study-layout">';

  // Left: reference moments
  html += '<div class="cs-moments">';
  html += '<h3>Case Study Moments</h3>';
  if (moments.length) {
    for (const m of moments) {
      const insight = m.insight_edited || m.insight;
      html += `
        <div class="cs-moment-card">
          <div class="insight">${esc(insight)}</div>
          ${m.quote ? `<div class="quote"><em>${esc(m.speaker || 'Client')}:</em> "${esc(m.quote)}"</div>` : ''}
        </div>
      `;
    }
  } else {
    html += '<p class="cs-empty">No case study moments extracted.</p>';
  }
  html += '</div>';

  // Right: draft form
  html += '<div class="cs-form">';
  if (draft) {
    const statusMap = { draft: 'status-draft', reviewed: 'status-reviewed', published: 'status-published' };
    html += `
      <div class="cs-form-header">
        <h3>Draft</h3>
        <span class="status-badge ${statusMap[draft.edit_status] || ''}">${draft.edit_status}</span>
      </div>
    `;
  } else {
    html += '<h3>Start a Case Study</h3>';
  }

  html += `
    <div class="form-group">
      <label>Headline</label>
      <input type="text" id="cs-headline" value="${v('headline')}" placeholder="A transformation headline">
    </div>
    <div class="form-group">
      <label>Client Situation</label>
      <textarea id="cs-situation" placeholder="Where were they before?">${v('client_situation')}</textarea>
    </div>
    <div class="form-group">
      <label>Catalyst</label>
      <textarea id="cs-catalyst" placeholder="What triggered the consultation?">${v('catalyst')}</textarea>
    </div>
    <div class="form-group">
      <label>Challenge</label>
      <textarea id="cs-challenge" placeholder="The specific problem they faced...">${v('challenge')}</textarea>
    </div>
    <div class="form-group">
      <label>Approach</label>
      <textarea id="cs-approach" placeholder="How the work unfolded...">${v('approach')}</textarea>
    </div>
    <div class="form-group">
      <label>Key Quote</label>
      <textarea id="cs-quote" placeholder="The most compelling thing they said...">${v('key_quote')}</textarea>
    </div>
    <div class="form-group">
      <label>Outcome</label>
      <textarea id="cs-outcome" placeholder="What changed for them?">${v('outcome')}</textarea>
    </div>
    <div class="form-group">
      <label>Call to Action</label>
      <input type="text" id="cs-cta" value="${v('call_to_action')}" placeholder="What should the reader do?">
    </div>
    <div class="form-group">
      <label>Editor Notes</label>
      <textarea id="cs-notes" placeholder="Internal notes...">${v('editor_notes')}</textarea>
    </div>
  `;

  if (draft) {
    html += `
      <div class="form-group">
        <label>Status</label>
        <select id="cs-status">
          <option value="draft"${draft.edit_status === 'draft' ? ' selected' : ''}>Draft</option>
          <option value="reviewed"${draft.edit_status === 'reviewed' ? ' selected' : ''}>Reviewed</option>
          <option value="published"${draft.edit_status === 'published' ? ' selected' : ''}>Published</option>
        </select>
      </div>
    `;
  }

  html += `
    <div class="form-actions">
      <button class="btn btn-primary" onclick="window.saveCaseStudy()">${draft ? 'Save changes' : 'Create draft'}</button>
      ${draft ? `<button class="btn btn-ghost" style="color:var(--red)" onclick="window.deleteCaseStudy('${draft.id}')">Delete draft</button>` : ''}
    </div>
  `;
  html += '</div></div>';

  document.getElementById('caseStudyContent').innerHTML = html;
}

window.saveCaseStudy = async function() {
  const get = id => document.getElementById(id)?.value.trim() || null;
  const body = {
    headline:        get('cs-headline'),
    client_situation: get('cs-situation'),
    catalyst:        get('cs-catalyst'),
    challenge:       get('cs-challenge'),
    approach:        get('cs-approach'),
    key_quote:       get('cs-quote'),
    outcome:         get('cs-outcome'),
    call_to_action:  get('cs-cta'),
    editor_notes:    get('cs-notes'),
  };
  const statusEl = document.getElementById('cs-status');
  if (statusEl) body.edit_status = statusEl.value;

  try {
    if (caseStudyDraft) {
      caseStudyDraft = await api(`/case-studies/${caseStudyDraft.id}`, {
        method: 'PATCH',
        body: JSON.stringify(body)
      });
    } else {
      caseStudyDraft = await api('/case-studies', {
        method: 'POST',
        body: JSON.stringify({ ...body, consultation_id: consultationId })
      });
    }
    renderCaseStudy();
    toast('Saved', 'success');
  } catch {
    toast('Save failed', 'error');
  }
};

window.deleteCaseStudy = async function(id) {
  if (!confirm('Delete this draft? This cannot be undone.')) return;
  try {
    await api(`/case-studies/${id}`, { method: 'DELETE' });
    caseStudyDraft = null;
    renderCaseStudy();
    toast('Draft deleted', 'success');
  } catch {
    toast('Delete failed', 'error');
  }
};

// --- Comments ---

window.toggleComments = async function(id) {
  const thread = document.getElementById('thread-' + id);
  if (!thread) return;

  const wasHidden = thread.classList.contains('hidden');
  thread.classList.toggle('hidden');

  if (wasHidden && !commentCache.has(id)) {
    await refreshComments(id);
  }
};

async function refreshComments(id) {
  try {
    const comments = await api(`/extractions/${id}/comments`);
    commentCache.set(id, comments);
    renderCommentList(id, comments);
    updateCommentToggle(id, comments.length);
  } catch {
    toast('Failed to load comments', 'error');
  }
}

function renderCommentList(id, comments) {
  const list = document.getElementById('comments-list-' + id);
  if (!list) return;

  if (!comments.length) {
    list.innerHTML = '<p class="no-comments">No comments yet.</p>';
    return;
  }

  list.innerHTML = comments.map(c => `
    <div class="comment-item" id="comment-${c.id}">
      <div class="comment-text">${esc(c.comment_text)}</div>
      <div class="comment-meta">
        <span>${formatDate(c.created_at)}</span>
        <button class="comment-delete" onclick="window.deleteComment('${id}', '${c.id}')">Delete</button>
      </div>
    </div>
  `).join('');
}

function updateCommentToggle(extractionId, count) {
  const btn = document.querySelector(`#card-${extractionId} .comments-toggle`);
  if (btn) {
    btn.textContent = count > 0
      ? `💬 ${count} comment${count !== 1 ? 's' : ''}`
      : '💬 Add comment';
  }
}

window.postComment = async function(id) {
  const input = document.getElementById('comment-input-' + id);
  const text = input?.value.trim();
  if (!text) return;

  try {
    await api(`/extractions/${id}/comments`, {
      method: 'POST',
      body: JSON.stringify({ comment_text: text })
    });
    input.value = '';
    commentCache.delete(id);
    await refreshComments(id);
  } catch {
    toast('Failed to post comment', 'error');
  }
};

window.deleteComment = async function(extractionId, commentId) {
  try {
    await api(`/extractions/${extractionId}/comments/${commentId}`, { method: 'DELETE' });
    commentCache.delete(extractionId);
    await refreshComments(extractionId);
  } catch {
    toast('Failed to delete comment', 'error');
  }
};

// --- Next Steps / Capsule CRM ---

function renderNextSteps() {
  const container = document.getElementById('nextStepsContainer');
  if (!container) return;

  // Sync capsuleState from current consultation data on first render
  if (consultation.capsule_party_id && !capsuleState.partyId) {
    capsuleState.partyId = consultation.capsule_party_id;
    capsuleState.opportunityId = consultation.capsule_opportunity_id || null;
  }

  const outcome = consultation.outcome || null;
  const dealValue = consultation.deal_value || '';

  const outcomes = [
    { value: 'lost', label: 'No Show / Qualified Out', warn: true },
    { value: 'follow_up_required', label: 'Send Proposal' },
    { value: 'closed', label: 'Close / Invoice' },
  ];

  let html = '<div class="next-steps-panel">';
  html += '<h3>Next Steps</h3>';

  // Outcome buttons
  html += '<div class="ns-outcome-row">';
  for (const o of outcomes) {
    const isActive = outcome === o.value;
    const cls = isActive ? (o.warn ? 'ns-outcome-btn active-warn' : 'ns-outcome-btn active') : 'ns-outcome-btn';
    html += `<button class="${cls}" onclick="window.setOutcome('${o.value}')">${esc(o.label)}</button>`;
  }
  html += '</div>';

  // Deal value (hide for no-show/lost)
  if (outcome !== 'lost') {
    html += `<div class="ns-deal-row">
      <label for="nsDealValue">Deal value</label>
      <input type="text" id="nsDealValue" class="ns-deal-input" value="${esc(dealValue)}" placeholder="e.g. £1,500" onblur="window.saveDealValue()">
    </div>`;
  }

  html += '<hr class="ns-divider">';

  // Capsule CRM section
  html += '<div class="ns-capsule-label">Capsule CRM</div>';

  if (capsuleState.partyId) {
    // Linked contact
    html += `<div class="ns-linked-contact">
      <div>
        <div class="ns-linked-name">${esc(capsuleState.linkedName || `Contact #${capsuleState.partyId}`)}</div>
        ${capsuleState.opportunityName ? `<div class="ns-linked-opp">Opportunity: ${esc(capsuleState.opportunityName)}</div>` : ''}
      </div>
      <button class="btn btn-sm btn-ghost" onclick="window.unlinkCapsule()">Unlink</button>
    </div>`;
  } else {
    // Search form
    html += `<div class="ns-search-row">
      <input type="email" id="nsCapsuleEmail" class="ns-email-input" placeholder="Search by email address">
      <button class="btn btn-sm btn-primary" onclick="window.searchCapsule()" ${capsuleState.searching ? 'disabled' : ''}>
        ${capsuleState.searching ? 'Searching…' : 'Search'}
      </button>
    </div>`;

    if (capsuleState.searchResults.length > 0) {
      html += '<div class="ns-party-list">';
      for (const party of capsuleState.searchResults) {
        html += `<div class="ns-party-card">
          <div class="ns-party-info">
            <div class="ns-party-name">${esc(party.name)}</div>
            ${party.emailAddress ? `<div class="ns-party-email">${esc(party.emailAddress)}</div>` : ''}
            ${party.opportunities?.length ? `<div class="ns-party-opps">${party.opportunities.length} opportunity(s)</div>` : ''}
          </div>
          <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end">
            <button class="btn btn-sm btn-primary" onclick="window.linkCapsuleContact(${party.id}, null, ${JSON.stringify(party.name)}, null)">Link</button>
            ${party.opportunities?.map(o =>
              `<button class="btn btn-sm" onclick="window.linkCapsuleContact(${party.id}, ${o.id}, ${JSON.stringify(party.name)}, ${JSON.stringify(o.name)})" style="font-size:11px">+ ${esc(o.name)}</button>`
            ).join('') || ''}
          </div>
        </div>`;
      }
      html += '</div>';
    } else if (capsuleState.searchResults !== null && !capsuleState.searching) {
      // show nothing if no search yet
    }
  }

  const logDisabled = !capsuleState.partyId || capsuleState.logging;
  html += `<button class="ns-log-btn${capsuleState.logged ? ' logged' : ''}" onclick="window.logToCapsule()" ${logDisabled ? 'disabled' : ''}>
    ${capsuleState.logged ? '✓ Logged to Capsule' : capsuleState.logging ? 'Logging…' : 'Log note to Capsule'}
  </button>`;

  html += '</div>';

  container.innerHTML = html;
}

window.setOutcome = async function(value) {
  try {
    const updated = await api(`/consultations/${consultationId}`, {
      method: 'PATCH',
      body: JSON.stringify({ outcome: value }),
    });
    consultation = { ...consultation, outcome: updated.outcome };
    renderNextSteps();
  } catch {
    toast('Failed to update outcome', 'error');
  }
};

window.saveDealValue = async function() {
  const input = document.getElementById('nsDealValue');
  const value = input?.value.trim() || null;
  try {
    await api(`/consultations/${consultationId}`, {
      method: 'PATCH',
      body: JSON.stringify({ deal_value: value }),
    });
    consultation = { ...consultation, deal_value: value };
    toast('Deal value saved', 'success');
  } catch {
    toast('Failed to save deal value', 'error');
  }
};

window.searchCapsule = async function() {
  const email = document.getElementById('nsCapsuleEmail')?.value.trim();
  if (!email) {
    toast('Enter an email address to search', 'error');
    return;
  }
  capsuleState.searching = true;
  capsuleState.searchResults = [];
  renderNextSteps();

  try {
    const results = await api(`/capsule/search?email=${encodeURIComponent(email)}`);
    capsuleState.searchResults = results || [];
  } catch {
    toast('Capsule search failed', 'error');
    capsuleState.searchResults = [];
  } finally {
    capsuleState.searching = false;
    renderNextSteps();
  }
};

window.linkCapsuleContact = async function(partyId, opportunityId, partyName, opportunityName) {
  try {
    await api(`/consultations/${consultationId}`, {
      method: 'PATCH',
      body: JSON.stringify({ capsule_party_id: partyId, capsule_opportunity_id: opportunityId || null }),
    });
    consultation = { ...consultation, capsule_party_id: partyId, capsule_opportunity_id: opportunityId || null };
    capsuleState.partyId = partyId;
    capsuleState.opportunityId = opportunityId || null;
    capsuleState.linkedName = partyName;
    capsuleState.opportunityName = opportunityName || null;
    capsuleState.searchResults = [];
    capsuleState.logged = false;
    renderNextSteps();
    toast('Contact linked', 'success');
  } catch {
    toast('Failed to link contact', 'error');
  }
};

window.unlinkCapsule = async function() {
  try {
    await api(`/consultations/${consultationId}`, {
      method: 'PATCH',
      body: JSON.stringify({ capsule_party_id: null, capsule_opportunity_id: null }),
    });
    consultation = { ...consultation, capsule_party_id: null, capsule_opportunity_id: null };
    capsuleState.partyId = null;
    capsuleState.opportunityId = null;
    capsuleState.linkedName = null;
    capsuleState.opportunityName = null;
    capsuleState.logged = false;
    renderNextSteps();
  } catch {
    toast('Failed to unlink contact', 'error');
  }
};

window.logToCapsule = async function() {
  if (!capsuleState.partyId) return;
  capsuleState.logging = true;
  renderNextSteps();

  try {
    await api('/capsule/log', {
      method: 'POST',
      body: JSON.stringify({ consultationId }),
    });
    capsuleState.logged = true;
    toast('Note logged to Capsule', 'success');
  } catch (error) {
    toast(`Failed to log to Capsule: ${error.message}`, 'error');
  } finally {
    capsuleState.logging = false;
    renderNextSteps();
  }
};

document.getElementById('headerDeleteBtn').addEventListener('click', async () => {
  const name = consultation?.client_name || 'this consultation';
  if (!confirm(`Delete "${name}"? This will permanently remove all extractions, comments and case study drafts.`)) return;
  try {
    await api(`/consultations/${consultationId}`, { method: 'DELETE' });
    toast('Deleted', 'success');
    window.location.href = '/';
  } catch (error) {
    toast(`Delete failed: ${error.message}`, 'error');
  }
});

// Initial load
loadConsultation();
