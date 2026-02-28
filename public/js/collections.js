import { api, toast, esc, formatDate, formatKey, CATEGORY_META, DESTINATION_TAGS } from './app.js';

let allExtractions = [];
let currentView = 'category';
let currentFilter = '';

async function load() {
  try {
    allExtractions = await api('/collections');
    renderStats();
    populateFilter();
    renderCollections();
  } catch {
    toast('Failed to load collections', 'error');
  }
}

function renderStats() {
  const total = allExtractions.length;
  const byCat = {};
  for (const e of allExtractions) {
    byCat[e.category] = (byCat[e.category] || 0) + 1;
  }

  let html = `<div class="stats-row"><div class="stat-pill"><strong>${total}</strong> approved</div>`;
  for (const [cat, cnt] of Object.entries(byCat)) {
    html += `<div class="stat-pill">${esc(CATEGORY_META[cat]?.label || formatKey(cat))}: <strong>${cnt}</strong></div>`;
  }
  html += '</div>';

  document.getElementById('statsBar').innerHTML = html;
}

function parseTags(str) {
  try { return JSON.parse(str || '[]'); } catch { return []; }
}

function populateFilter() {
  const select = document.getElementById('filterSelect');
  let options;

  if (currentView === 'category') {
    const cats = [...new Set(allExtractions.map(e => e.category))].sort();
    options = cats.map(c =>
      `<option value="${esc(c)}">${esc(CATEGORY_META[c]?.label || formatKey(c))}</option>`
    );
  } else {
    const tags = [...new Set(allExtractions.flatMap(e => parseTags(e.destination_tags)))].sort();
    options = tags.map(t => {
      const tag = DESTINATION_TAGS.find(d => d.slug === t);
      return `<option value="${esc(t)}">${esc(tag?.label || t)}</option>`;
    });
  }

  select.innerHTML = '<option value="">All</option>' + options.join('');
  select.value = currentFilter;
}

function getFiltered() {
  if (!currentFilter) return allExtractions;
  if (currentView === 'category') {
    return allExtractions.filter(e => e.category === currentFilter);
  }
  return allExtractions.filter(e => parseTags(e.destination_tags).includes(currentFilter));
}

function renderCollections() {
  const filtered = getFiltered();

  if (filtered.length === 0) {
    document.getElementById('collectionsContent').innerHTML = `
      <div class="empty-state">
        <h2>Nothing here yet</h2>
        <p>Approve extractions from consultations to populate collections.</p>
        <a href="/" class="btn btn-primary">Go to Dashboard</a>
      </div>
    `;
    return;
  }

  const groups = {};
  for (const e of filtered) {
    const keys = currentView === 'category'
      ? [e.category]
      : (parseTags(e.destination_tags).length ? parseTags(e.destination_tags) : ['_untagged']);
    for (const key of keys) {
      if (!groups[key]) groups[key] = [];
      groups[key].push(e);
    }
  }

  let html = '';
  for (const [group, items] of Object.entries(groups)) {
    const label = currentView === 'category'
      ? (CATEGORY_META[group]?.label || formatKey(group))
      : (DESTINATION_TAGS.find(t => t.slug === group)?.label || group);
    const color = currentView === 'category'
      ? (CATEGORY_META[group]?.color || 'var(--text)')
      : 'var(--text)';

    html += `
      <div class="collection-group">
        <div class="collection-group-header">
          <h3 style="color:${color}">${esc(label)}</h3>
          <span class="category-count">${items.length}</span>
        </div>
        <div class="collection-cards">
          ${items.map(buildCollectionCard).join('')}
        </div>
      </div>
    `;
  }

  document.getElementById('collectionsContent').innerHTML = html;
}

function buildCollectionCard(item) {
  const tags = parseTags(item.destination_tags);
  return `
    <div class="collection-card">
      <div class="insight">${esc(item.display_insight)}</div>
      ${item.quote ? `<div class="quote"><em>${esc(item.speaker || 'Client')}:</em> "${esc(item.quote)}"</div>` : ''}
      ${item.display_suggested_use ? `<div class="suggested-use"><strong>Use:</strong> ${esc(item.display_suggested_use)}</div>` : ''}
      <div class="collection-card-footer">
        <a href="/consultation.html?id=${item.consultation_id}" class="collection-source">
          ${esc(item.client_name)}${item.consultation_date ? ` · ${formatDate(item.consultation_date)}` : ''}
        </a>
        ${tags.length ? `<div class="dest-tags">${tags.map(t => {
          const tag = DESTINATION_TAGS.find(d => d.slug === t);
          return `<span class="dest-chip active">${esc(tag?.label || t)}</span>`;
        }).join('')}</div>` : ''}
      </div>
    </div>
  `;
}

window.setView = function(view) {
  currentView = view;
  currentFilter = '';
  document.getElementById('viewByCat').classList.toggle('active', view === 'category');
  document.getElementById('viewByDest').classList.toggle('active', view === 'destination');
  populateFilter();
  renderCollections();
};

window.applyFilter = function() {
  currentFilter = document.getElementById('filterSelect').value;
  renderCollections();
};

load();
