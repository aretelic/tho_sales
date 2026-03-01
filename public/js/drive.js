import { api, toast, esc, formatDate } from './app.js';

let files = [];

async function loadFiles() {
  const content = document.getElementById('driveContent');
  const meta = document.getElementById('folderMeta');

  try {
    files = await api('/drive/files');

    const total = files.length;
    const imported = files.filter(f => f.alreadyImported).length;
    meta.textContent = `${total} file${total !== 1 ? 's' : ''} in folder · ${imported} already imported`;

    if (total === 0) {
      content.innerHTML = `
        <div class="empty-state">
          <h2>No files found</h2>
          <p>No files were found in the configured Google Drive folder.<br>
             Check that <strong>GOOGLE_DRIVE_FOLDER_ID</strong> is correct in .env</p>
        </div>
      `;
      return;
    }

    renderFiles();
  } catch (error) {
    meta.textContent = '';
    content.innerHTML = `
      <div class="empty-state">
        <h2>Could not load Drive files</h2>
        <p>${esc(error.message)}</p>
        <p>Make sure you have access to the configured folder and your Google account is connected.</p>
      </div>
    `;
  }
}

function renderFiles() {
  const content = document.getElementById('driveContent');

  let html = `
    <table class="consultations-table">
      <thead>
        <tr>
          <th>File name</th>
          <th>Modified</th>
          <th>Type</th>
          <th>Status</th>
          <th></th>
        </tr>
      </thead>
      <tbody id="filesBody">
  `;

  for (const file of files) {
    html += buildFileRow(file);
  }

  html += '</tbody></table>';
  content.innerHTML = html;
}

function buildFileRow(file) {
  const typeLabel = file.mimeType === 'application/vnd.google-apps.document'
    ? 'Google Doc' : 'Text file';

  if (file.alreadyImported) {
    return `
      <tr id="row-${file.id}">
        <td><strong>${esc(file.name)}</strong></td>
        <td>${formatDate(file.modifiedTime)}</td>
        <td style="color:var(--text-3)">${typeLabel}</td>
        <td><span class="status-badge status-complete">Imported</span></td>
        <td><a href="/consultation.html?id=${esc(file.consultationId)}" class="btn btn-sm">View</a></td>
      </tr>
    `;
  }

  // Derive suggested client name from filename (strip extension)
  const suggestedName = file.name.replace(/\.[^.]+$/, '');

  return `
    <tr id="row-${file.id}">
      <td><strong>${esc(file.name)}</strong></td>
      <td>${formatDate(file.modifiedTime)}</td>
      <td style="color:var(--text-3)">${typeLabel}</td>
      <td><span class="status-badge status-pending">Not imported</span></td>
      <td>
        <button class="btn btn-sm btn-primary" onclick="window.startImport('${esc(file.id)}')">
          Import
        </button>
      </td>
    </tr>
    <tr id="form-${file.id}" style="display:none">
      <td colspan="5">
        <div class="drive-import-form">
          <label>Client name</label>
          <input
            type="text"
            id="name-${esc(file.id)}"
            value="${esc(suggestedName)}"
            placeholder="Enter client name"
            class="drive-name-input"
          >
          <div class="drive-form-actions">
            <button class="btn btn-primary btn-sm" onclick="window.confirmImport('${esc(file.id)}', '${esc(file.name)}', '${esc(file.mimeType)}')">
              Confirm import
            </button>
            <button class="btn btn-ghost btn-sm" onclick="window.cancelImport('${esc(file.id)}')">
              Cancel
            </button>
          </div>
        </div>
      </td>
    </tr>
  `;
}

window.startImport = function(fileId) {
  document.getElementById(`form-${fileId}`).style.display = 'table-row';
  document.getElementById(`name-${fileId}`).focus();
  // Swap Import button to Cancel
  const row = document.getElementById(`row-${fileId}`);
  row.querySelector('button').style.display = 'none';
};

window.cancelImport = function(fileId) {
  document.getElementById(`form-${fileId}`).style.display = 'none';
  document.getElementById(`row-${fileId}`).querySelector('button').style.display = '';
};

window.confirmImport = async function(fileId, fileName, mimeType) {
  const clientName = document.getElementById(`name-${fileId}`)?.value.trim();
  const btn = document.querySelector(`#form-${fileId} .btn-primary`);

  btn.textContent = 'Importing…';
  btn.disabled = true;

  try {
    const consultation = await api('/drive/import', {
      method: 'POST',
      body: JSON.stringify({ fileId, fileName, mimeType, clientName }),
    });

    toast(`Imported: ${clientName || fileName}`, 'success');

    // Update the row in-place to show imported state
    const idx = files.findIndex(f => f.id === fileId);
    if (idx !== -1) {
      files[idx] = { ...files[idx], alreadyImported: true, consultationId: consultation.id };
    }

    // Replace the two rows with the imported row
    const row = document.getElementById(`row-${fileId}`);
    const formRow = document.getElementById(`form-${fileId}`);
    const newRow = document.createElement('tbody');
    newRow.innerHTML = buildFileRow(files[idx]);
    row.replaceWith(newRow.firstElementChild);
    formRow.remove();

    // Update meta count
    const imported = files.filter(f => f.alreadyImported).length;
    document.getElementById('folderMeta').textContent =
      `${files.length} file${files.length !== 1 ? 's' : ''} in folder · ${imported} already imported`;

  } catch (error) {
    toast(`Import failed: ${error.message}`, 'error');
    btn.textContent = 'Confirm import';
    btn.disabled = false;
  }
};

loadFiles();
