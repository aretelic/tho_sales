# Consultation Intelligence Engine — Project Specification v3

## Overview

A lightweight web application for reviewing B2C sales consultation transcripts using AI-powered analysis. The tool automatically imports transcripts from Google Drive, scores them against multiple sales frameworks, extracts categorised intelligence, and provides a review workflow for approving, editing, tagging, and commenting on findings.

The analysis is powered by Claude (via the Anthropic API), using a versioned, editable prompt. The frontend is plain HTML, CSS, and JavaScript — no frameworks, no build step.

## Core Principles

- **No frameworks.** Plain HTML, CSS, and vanilla JS on the frontend. Express.js on the backend. No React, no Next.js, no Tailwind, no build tools. The app should be understandable by reading the source files directly.
- **Auto-import from Google Drive.** Transcripts arrive automatically. The user reviews and analyses — they don't copy-paste.
- **The transcript is always readable.** Every analysis view includes access to the original transcript text, so you can learn from the raw conversation alongside the structured output.
- **The prompt is a first-class entity.** Versioned, commentable, and every analysis links to the prompt version that produced it.
- **Review before trust.** AI extractions are suggestions. Nothing goes into collections without human review.
- **Everything traces back to source.** Every extraction links to the client, date, and original Google Drive document.
- **Tag for destination.** Extractions are tagged with where they'll be used (landing pages, FAQ, scripts).

---

## Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Frontend | Plain HTML + CSS + vanilla JS | No build step. Serves static files. Lightweight, portable, fully transparent. |
| Backend | Node.js + Express.js | Minimal server. Handles API routes, serves static files, connects to Postgres and Anthropic. |
| Database | PostgreSQL (self-hosted) | Your own server. Direct connection via `pg` library. |
| Auth | Express sessions + bcrypt | Simple credential auth. Session stored server-side (pg-backed or in-memory). No OAuth complexity for v1. |
| AI | Anthropic API (Claude) | `@anthropic-ai/sdk` npm package. Server-side only. |
| Google Drive | Google Drive API v3 | Service account or OAuth. Watches a folder, pulls new transcript files. |
| Notifications | Webhook (n8n) | POST to a webhook URL when new transcripts arrive or analysis completes. n8n handles email/Slack/etc. |
| Deployment | Your server (Docker or PM2) | No Vercel dependency. Just `node server.js`. |

### Project Structure

```
consultation-engine/
├── server.js                    # Express app entry point
├── package.json
├── .env                         # DATABASE_URL, ANTHROPIC_API_KEY, GOOGLE_*, WEBHOOK_URL
├── db/
│   ├── schema.sql               # Full schema (run once)
│   ├── migrations/              # Incremental changes
│   └── seed.sql                 # Initial prompt version + destination tags
├── src/
│   ├── routes/
│   │   ├── auth.js              # Login/logout/session
│   │   ├── consultations.js     # CRUD + analysis trigger
│   │   ├── extractions.js       # Review, edit, comment, tag
│   │   ├── collections.js       # Filtered views, export
│   │   ├── prompts.js           # Version management, comments
│   │   ├── import.js            # Google Drive import endpoints
│   │   └── webhooks.js          # Outbound webhook notifications
│   ├── services/
│   │   ├── analyser.js          # Claude API call + JSON validation
│   │   ├── drive-watcher.js     # Google Drive polling / push notification handler
│   │   ├── extractor.js         # Flatten analysis JSON → extractions table
│   │   └── notifier.js          # Webhook dispatcher
│   └── middleware/
│       └── auth.js              # Session check middleware
├── public/
│   ├── index.html               # Dashboard
│   ├── consultation.html        # Detail view (scorecard, extractions, transcript)
│   ├── collections.html         # Approved extractions by category/destination
│   ├── prompt.html              # Prompt editor + versions + comments
│   ├── settings.html            # Tags, API config, webhook config
│   ├── login.html               # Login page
│   ├── css/
│   │   └── style.css            # Single stylesheet
│   └── js/
│       ├── app.js               # Shared utilities, API client, router helpers
│       ├── dashboard.js          # Dashboard page logic
│       ├── consultation.js       # Detail page logic (tabs, scorecard, extractions, transcript)
│       ├── collections.js        # Collections page logic
│       ├── prompt-editor.js      # Prompt management logic
│       └── settings.js           # Settings page logic
└── scripts/
    └── setup-drive-watch.js      # One-time script to register Drive push notification channel
```

### Frontend Approach

Pages are plain `.html` files. Each page includes `style.css` and `app.js` (shared), plus its own page-specific JS file. Navigation is standard links — no SPA routing.

Data is fetched from the Express API using `fetch()`. DOM manipulation uses `document.createElement()`, `innerHTML` (with escaping), and event delegation. No template engine — just JS building HTML strings or DOM nodes.

CSS is a single file with CSS custom properties for theming. Layout uses CSS Grid and Flexbox. No utility framework.

**Design direction:** Continue the POC aesthetic — clean, editorial, warm palette. DM Sans body, Fraunces display headings, JetBrains Mono for data/code. Loaded via Google Fonts `<link>` in each HTML page.

---

## Google Drive Auto-Import Pipeline

### How It Works

```
Google Drive                    Your Server                    n8n / Email
     |                               |                            |
     | New transcript file            |                            |
     | saved to watched folder        |                            |
     |                               |                            |
     |--- push notification -------->|                            |
     |    (or: server polls)         |                            |
     |                               |                            |
     |                               |-- fetch file metadata      |
     |                               |-- fetch file content       |
     |                               |-- create consultation      |
     |                               |   (status: 'imported')     |
     |                               |                            |
     |                               |-- POST webhook ----------->|
     |                               |   { event: 'new_transcript',|
     |                               |     client_name: '...',    |
     |                               |     filename: '...' }      |
     |                               |                            |
     |                               |                    n8n sends email:
     |                               |                    "New transcript: Jo Pyshorn
     |                               |                     Ready for review"
```

### Two Approaches (Choose One)

**Option A: Polling (simpler, recommended for v1)**

A background job runs every N minutes (e.g. every 15 mins via `setInterval` or a cron-triggered endpoint). It:

1. Lists files in the watched Google Drive folder, modified since last check
2. For each new/modified file:
   - Checks if already imported (by `source_gdrive_file_id`)
   - If new: fetches content, creates consultation record, fires webhook
3. Stores the last-checked timestamp in the database

```javascript
// src/services/drive-watcher.js (simplified)
async function pollDriveFolder() {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  const lastCheck = await db.getLastImportTimestamp();

  const files = await drive.files.list({
    q: `'${folderId}' in parents and modifiedTime > '${lastCheck}'`,
    fields: 'files(id, name, modifiedTime, mimeType)',
    orderBy: 'modifiedTime'
  });

  for (const file of files.data.files) {
    const exists = await db.consultationExistsByDriveId(file.id);
    if (exists) continue;

    // Fetch content (handles Google Docs export and plain text)
    const content = await fetchFileContent(file);

    // Parse client name and date from filename if possible
    // Expected format: "Client Name - YYYY-MM-DD.txt" or similar
    const { clientName, date } = parseFilename(file.name);

    // Create consultation in 'imported' status
    const consultation = await db.createConsultation({
      clientName: clientName || file.name,
      consultationDate: date || null,
      sourceGdriveUrl: `https://drive.google.com/file/d/${file.id}/view`,
      sourceGdriveFileId: file.id,
      sourceFilename: file.name,
      transcriptText: content,
      analysisStatus: 'imported'  // new status: imported but not yet analysed
    });

    // Fire webhook
    await notifier.send('new_transcript', {
      consultationId: consultation.id,
      clientName: consultation.clientName,
      filename: file.name,
      importedAt: new Date().toISOString()
    });
  }

  await db.setLastImportTimestamp(new Date());
}
```

**Option B: Push Notifications (more responsive, more setup)**

Register a Drive API push notification channel on the watched folder. Google sends a POST to your server when files change. The handler then fetches and imports as above. Requires a publicly accessible HTTPS endpoint and periodic channel renewal (max 24h expiry, must be re-registered).

**Recommendation:** Start with polling. It's simpler, doesn't need a public endpoint, and 15-minute delay is fine for this use case. Switch to push if the delay becomes a problem.

### Google Drive Auth Setup

Use a **service account** (simplest for a single-user, server-side app):

1. Create a service account in Google Cloud Console
2. Enable Google Drive API
3. Download the JSON key file
4. Share the watched Google Drive folder with the service account email
5. Store the key file path in `.env` as `GOOGLE_SERVICE_ACCOUNT_KEY_PATH`

```javascript
const { google } = require('googleapis');
const auth = new google.auth.GoogleAuth({
  keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH,
  scopes: ['https://www.googleapis.com/auth/drive.readonly']
});
const drive = google.drive({ version: 'v3', auth });
```

### File Content Handling

Transcripts might be in different formats:

| Source Format | How to Fetch Content |
|---------------|---------------------|
| Plain text (.txt) | `drive.files.get({ fileId, alt: 'media' })` — returns raw text |
| Google Doc | `drive.files.export({ fileId, mimeType: 'text/plain' })` — exports as text |
| Word doc (.docx) | Download binary, extract text with a library (e.g. `mammoth`) |
| PDF | Download binary, extract text (e.g. `pdf-parse`) — lower priority |

For v1, support `.txt` and Google Docs. Add others as needed.

### Filename Parsing

Attempt to extract client name and date from the filename. This is best-effort — the user can edit metadata after import.

```javascript
function parseFilename(filename) {
  // Try common patterns:
  // "Jo Pyshorn - 2026-02-24.txt"
  // "Jo Pyshorn and Laura Price @ The Home Organisation - 2026-02-24"
  // "2026-02-24 - Jo Pyshorn.txt"

  const withoutExt = filename.replace(/\.\w+$/, '').trim();

  // Try to find a date
  const dateMatch = withoutExt.match(/(\d{4}[-\/]\d{2}[-\/]\d{2})/);
  const date = dateMatch ? dateMatch[1].replace(/\//g, '-') : null;

  // Remove date and separators to get client name
  let clientName = withoutExt
    .replace(/\d{4}[-\/]\d{2}[-\/]\d{2}/, '')
    .replace(/[@|–—-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Remove company name patterns if present
  clientName = clientName.replace(/The Home Organisation/i, '').trim();

  return { clientName: clientName || null, date };
}
```

---

## Webhook Notifications

### Outbound Webhooks

The server POSTs to a configurable webhook URL when events occur. n8n (or Zapier, Make, etc.) receives these and routes notifications.

**Events:**

| Event | Payload | When |
|-------|---------|------|
| `new_transcript` | `{ consultationId, clientName, filename, importedAt }` | New file imported from Drive |
| `analysis_complete` | `{ consultationId, clientName, compositeScore, extractionCount }` | Analysis finished successfully |
| `analysis_failed` | `{ consultationId, clientName, error }` | Analysis failed |
| `batch_import` | `{ count, filenames }` | Multiple files imported in one poll cycle |

**Configuration:**

Stored in a `settings` table or `.env`:

```
WEBHOOK_URL=https://your-n8n-instance.com/webhook/consultation-engine
WEBHOOK_SECRET=your-shared-secret  # for HMAC signature verification
```

**Dispatcher:**

```javascript
// src/services/notifier.js
const crypto = require('crypto');

async function send(event, payload) {
  const webhookUrl = process.env.WEBHOOK_URL;
  if (!webhookUrl) return;  // webhooks disabled

  const body = JSON.stringify({ event, payload, timestamp: new Date().toISOString() });
  const signature = crypto.createHmac('sha256', process.env.WEBHOOK_SECRET || '')
    .update(body).digest('hex');

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-Event': event
      },
      body
    });
  } catch (err) {
    console.error(`Webhook failed for event ${event}:`, err.message);
    // Don't throw — webhook failure shouldn't block the import/analysis
  }
}
```

### n8n Workflow Example

In n8n, create a workflow:

1. **Webhook trigger** — receives POST from the consultation engine
2. **Switch node** — routes by `event` field
3. **For `new_transcript`:** Send email → "New consultation transcript imported: {{clientName}} ({{filename}}). Ready for analysis at https://your-app.com/consultations/{{consultationId}}"
4. **For `analysis_complete`:** Send email → "Analysis complete: {{clientName}} scored {{compositeScore}}%. {{extractionCount}} items to review."
5. **For `analysis_failed`:** Send email → "Analysis failed for {{clientName}}: {{error}}"

---

## Updated Consultation Status Flow

With auto-import, the status lifecycle expands:

```
imported → pending → analysing → complete
                  ↘              ↗
                   → failed (retry →)

complete → needs_rerun (prompt updated) → analysing → complete
```

| Status | Meaning |
|--------|---------|
| `imported` | Transcript pulled from Drive, not yet queued for analysis. User may need to review metadata (client name, consultant, date) before triggering analysis. |
| `pending` | Queued for analysis (user clicked "Analyse" or "Analyse All"). |
| `analysing` | API call in progress. |
| `complete` | Analysis done, extractions flattened, ready for review. |
| `failed` | Analysis errored. Error message stored. Retry available. |
| `needs_rerun` | A newer prompt version exists than the one used for this analysis. Optional re-run. |

### Dashboard Pipeline View

The dashboard now shows the full pipeline including imported transcripts awaiting review:

| Client | Date | Source | Status | Score | Reviewed | Actions |
|--------|------|--------|--------|-------|----------|---------|
| Jo Pyshorn | 24 Feb | 📄 Drive | ✅ Complete | 65% | 12/38 | Review |
| New Client | 20 Feb | 📄 Drive | 🟡 Imported | — | — | Edit → Analyse |
| Another | 15 Feb | 📄 Drive | ✅ Complete | 72% | 24/30 | Review |
| Failed One | 10 Feb | 📄 Drive | ❌ Failed | — | — | Retry |

**"Imported" row actions:**
- Edit metadata (client name, consultant, date — pre-filled from filename parsing)
- View transcript (read the raw text before deciding to analyse)
- "Analyse" button (moves to pending → analysing)
- "Skip" / delete if it's not a consultation (e.g. wrong file in the folder)

---

## Transcript Viewer

Every consultation detail page includes the full transcript, readable alongside the analysis.

### UI: Transcript Tab

On the consultation detail page, the transcript is its own tab (alongside Scorecard, Extractions, Case Study). It shows:

- The full transcript text, formatted for readability
- Speaker names highlighted/bolded
- Timestamps shown if present in the source
- Searchable (Ctrl+F or an in-page search box)
- Line numbers in the gutter (useful for referencing specific moments)

### UI: Split View on Extractions Tab

When reviewing extractions, the user should be able to reference the original conversation. Two options:

**Option A: Side-by-side split (recommended)**
- Extractions on the left (60%)
- Transcript on the right (40%), scrollable, with search
- Clicking a quote in an extraction card auto-scrolls the transcript to that quote (text search highlight)

**Option B: Expandable quote context**
- Each extraction card's quote block has a "Show in context" button
- Clicking it expands to show 5-10 lines of transcript surrounding the quote
- Less screen space needed, but requires finding the quote in the transcript text

**Recommendation:** Build Option B first (simpler), add Option A as a layout toggle later.

### Transcript Formatting

The raw transcript text is stored as-is. The viewer applies formatting on render:

```javascript
function formatTranscript(text) {
  const lines = text.split('\n');
  return lines.map((line, i) => {
    // Detect speaker lines: "Speaker Name: text" or "Speaker Name (timestamp): text"
    const speakerMatch = line.match(/^([A-Za-z\s]+?):\s*(.*)/);
    if (speakerMatch) {
      return `<div class="transcript-line" data-line="${i + 1}">
        <span class="line-number">${i + 1}</span>
        <span class="speaker">${escapeHtml(speakerMatch[1])}:</span>
        <span class="speech">${escapeHtml(speakerMatch[2])}</span>
      </div>`;
    }
    // Timestamp lines
    const timeMatch = line.match(/^\d{2}:\d{2}(:\d{2})?/);
    if (timeMatch) {
      return `<div class="transcript-line timestamp" data-line="${i + 1}">
        <span class="line-number">${i + 1}</span>
        <span class="time-marker">${escapeHtml(line)}</span>
      </div>`;
    }
    // Regular text
    if (line.trim()) {
      return `<div class="transcript-line" data-line="${i + 1}">
        <span class="line-number">${i + 1}</span>
        <span class="text">${escapeHtml(line)}</span>
      </div>`;
    }
    return '';
  }).join('\n');
}
```

### Quote-to-Transcript Linking

When the user clicks "Show in context" on an extraction quote:

1. Search the transcript text for the quote (fuzzy match, since quotes may be slightly cleaned up by the AI)
2. Highlight the matching text in the transcript
3. Scroll to it (or expand the surrounding context if using Option B)

```javascript
function findQuoteInTranscript(quote, transcriptText) {
  // Try exact match first
  const idx = transcriptText.indexOf(quote);
  if (idx !== -1) return idx;

  // Try first 40 characters (quotes may be truncated or slightly modified)
  const partial = quote.substring(0, 40);
  return transcriptText.indexOf(partial);
}
```

---

## Database Schema

### Schema Changes from v2

- Added `analysis_status: 'imported'` to the CHECK constraint
- Added `import_metadata` JSONB column for Drive file metadata
- Added `settings` table for webhook URL and polling config
- Auth tables simplified (no NextAuth — just users + sessions)

### Full Schema

```sql
-- Users
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  password_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sessions (server-side session store)
CREATE TABLE sessions (
  sid TEXT PRIMARY KEY,
  sess JSONB NOT NULL,
  expire TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_sessions_expire ON sessions(expire);

-- App settings (key-value)
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed settings
INSERT INTO settings (key, value) VALUES
  ('webhook_url', '"https://your-n8n.com/webhook/consultation-engine"'),
  ('webhook_secret', '"change-me"'),
  ('drive_folder_id', '"your-google-drive-folder-id"'),
  ('drive_poll_interval_minutes', '15'),
  ('drive_last_poll_at', 'null'),
  ('default_model', '"claude-sonnet-4-20250514"');

-- Prompt versions
CREATE TABLE prompt_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_number INTEGER NOT NULL,
  prompt_text TEXT NOT NULL,
  change_comment TEXT,
  change_summary TEXT,
  is_active BOOLEAN DEFAULT FALSE,
  model_preference TEXT DEFAULT 'claude-sonnet-4-20250514',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_active_prompt ON prompt_versions (is_active) WHERE is_active = TRUE;

-- Consultations
CREATE TABLE consultations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Client metadata
  client_name TEXT NOT NULL,
  consultant_name TEXT,
  consultation_date DATE,
  duration_minutes INTEGER,
  outcome TEXT CHECK (outcome IN ('closed', 'lost', 'follow_up_required', 'unknown')),
  deal_value TEXT,
  deal_summary TEXT,

  -- Source document
  source_gdrive_url TEXT,
  source_gdrive_file_id TEXT,
  source_filename TEXT,
  source_notes TEXT,
  import_metadata JSONB,              -- raw Drive file metadata for debugging

  -- Transcript
  transcript_text TEXT,

  -- Analysis
  analysis_json JSONB,
  analysis_status TEXT DEFAULT 'pending'
    CHECK (analysis_status IN ('imported', 'pending', 'analysing', 'complete', 'failed', 'needs_rerun')),
  analysis_error TEXT,
  analysis_completed_at TIMESTAMPTZ,
  prompt_version_id UUID REFERENCES prompt_versions(id),
  model_used TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,

  -- Denormalised scores
  score_bant INTEGER,
  score_spin INTEGER,
  score_neat INTEGER,
  score_challenger INTEGER,
  score_jtbd INTEGER,
  score_sandler INTEGER,
  score_composite INTEGER,
  score_composite_pct INTEGER,

  -- Housekeeping
  tags TEXT[] DEFAULT '{}',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_consultations_outcome ON consultations(outcome);
CREATE INDEX idx_consultations_date ON consultations(consultation_date);
CREATE INDEX idx_consultations_status ON consultations(analysis_status);
CREATE INDEX idx_consultations_drive_id ON consultations(source_gdrive_file_id);
CREATE INDEX idx_consultations_deleted ON consultations(deleted_at) WHERE deleted_at IS NULL;

-- Extractions
CREATE TABLE extractions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id UUID NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN (
    'catalysts', 'friction_points', 'objections_and_fears',
    'emotional_drivers', 'positioning_insights', 'case_study_moments',
    'discovery_questions', 'social_proof_opportunities',
    'upsell_signals', 'client_language'
  )),
  insight TEXT NOT NULL,
  insight_edited TEXT,
  quote TEXT,
  speaker TEXT,
  confidence TEXT CHECK (confidence IN ('high', 'medium', 'low')),
  suggested_use TEXT,
  suggested_use_edited TEXT,
  status TEXT,
  review_status TEXT DEFAULT 'pending'
    CHECK (review_status IN ('pending', 'approved', 'rejected', 'parked')),
  review_note TEXT,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES users(id),
  destination_tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_extractions_consultation ON extractions(consultation_id);
CREATE INDEX idx_extractions_category ON extractions(category);
CREATE INDEX idx_extractions_review ON extractions(review_status);
CREATE INDEX idx_extractions_category_review ON extractions(category, review_status);
CREATE INDEX idx_extractions_destination_tags ON extractions USING GIN (destination_tags);

-- Extraction comments
CREATE TABLE extraction_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  extraction_id UUID NOT NULL REFERENCES extractions(id) ON DELETE CASCADE,
  parent_comment_id UUID REFERENCES extraction_comments(id),
  comment_text TEXT NOT NULL,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_extraction_comments_extraction ON extraction_comments(extraction_id);

-- Destination tag definitions
CREATE TABLE destination_tag_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tag_slug TEXT UNIQUE NOT NULL,
  tag_label TEXT NOT NULL,
  tag_description TEXT,
  tag_colour TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO destination_tag_definitions (tag_slug, tag_label, tag_description, tag_colour, sort_order) VALUES
  ('homepage-hero', 'Homepage Hero', 'Headline copy, hero messaging, primary value proposition', '#2D5A27', 1),
  ('decluttering-landing-page', 'Decluttering Landing Page', 'Service page for general decluttering services', '#2B4C7E', 2),
  ('kitchens', 'Kitchen Organisation Page', 'Service page specific to kitchen projects', '#B8860B', 3),
  ('bereavement', 'Bereavement / Life Transition Page', 'Sensitive content for clients dealing with loss or major change', '#5B3A8C', 4),
  ('faq', 'FAQ Page', 'Objections, concerns, and common questions', '#92600F', 5),
  ('consultation-script', 'Consultation Script', 'Discovery questions, talk tracks, objection handling', '#2D5A27', 6),
  ('case-studies', 'Case Studies', 'Before/after stories, client quotes, outcome descriptions', '#2B4C7E', 7),
  ('social-media', 'Social Media Content', 'Relatable moments, client language, light-touch content', '#9B2C2C', 8),
  ('ads', 'Ad Copy', 'Catalyst triggers, friction points, emotional hooks for paid media', '#5B3A8C', 9),
  ('email-nurture', 'Email Nurture Sequences', 'Content for drip campaigns and follow-up sequences', '#92600F', 10),
  ('team-training', 'Team Training', 'Discovery questions, coaching points, framework gaps', '#2D5A27', 11),
  ('pre-retirement', 'Pre-Retirement Targeting', 'Content for clients approaching retirement', '#B8860B', 12),
  ('renovation-trigger', 'Renovation Trigger', 'Content targeting clients doing kitchen/bathroom refits', '#2B4C7E', 13);

-- Case study drafts
CREATE TABLE case_study_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id UUID NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
  headline TEXT,
  client_situation TEXT,
  catalyst TEXT,
  challenge TEXT,
  approach TEXT,
  key_quote TEXT,
  outcome TEXT,
  call_to_action TEXT,
  edit_status TEXT DEFAULT 'draft' CHECK (edit_status IN ('draft', 'reviewed', 'published')),
  editor_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Prompt comments
CREATE TABLE prompt_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_version_id UUID NOT NULL REFERENCES prompt_versions(id) ON DELETE CASCADE,
  section_ref TEXT,
  line_start INTEGER,
  line_end INTEGER,
  comment_text TEXT NOT NULL,
  comment_type TEXT DEFAULT 'note' CHECK (comment_type IN ('note', 'issue', 'idea', 'resolved')),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- Useful views
CREATE VIEW extractions_with_source AS
SELECT
  e.*,
  COALESCE(e.insight_edited, e.insight) AS display_insight,
  COALESCE(e.suggested_use_edited, e.suggested_use) AS display_suggested_use,
  c.client_name,
  c.consultant_name,
  c.consultation_date,
  c.source_gdrive_url,
  c.source_filename,
  c.outcome AS consultation_outcome,
  c.deal_value
FROM extractions e
JOIN consultations c ON e.consultation_id = c.id
WHERE c.deleted_at IS NULL;

CREATE VIEW extractions_by_destination AS
SELECT
  unnest(e.destination_tags) AS destination_tag,
  e.id,
  e.category,
  COALESCE(e.insight_edited, e.insight) AS display_insight,
  e.quote,
  e.speaker,
  e.confidence,
  COALESCE(e.suggested_use_edited, e.suggested_use) AS display_suggested_use,
  c.client_name,
  c.consultation_date,
  c.source_gdrive_url
FROM extractions e
JOIN consultations c ON e.consultation_id = c.id
WHERE e.review_status = 'approved'
  AND c.deleted_at IS NULL;

CREATE VIEW consultation_dashboard AS
SELECT
  c.id,
  c.client_name,
  c.consultant_name,
  c.consultation_date,
  c.outcome,
  c.deal_value,
  c.analysis_status,
  c.score_composite_pct,
  c.source_gdrive_url,
  c.source_filename,
  c.prompt_version_id,
  pv.version_number AS prompt_version_number,
  c.created_at,
  c.updated_at,
  (SELECT COUNT(*) FROM extractions e WHERE e.consultation_id = c.id) AS total_extractions,
  (SELECT COUNT(*) FROM extractions e WHERE e.consultation_id = c.id AND e.review_status = 'approved') AS approved_extractions,
  (SELECT COUNT(*) FROM extractions e WHERE e.consultation_id = c.id AND e.review_status = 'pending') AS pending_extractions
FROM consultations c
LEFT JOIN prompt_versions pv ON c.prompt_version_id = pv.id
WHERE c.deleted_at IS NULL
ORDER BY c.consultation_date DESC;
```

---

## API Routes

### Consultations

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/consultations` | List all (with dashboard view fields). Query params: `status`, `consultant`, `outcome`, `from`, `to` |
| GET | `/api/consultations/:id` | Full detail including analysis_json and transcript_text |
| POST | `/api/consultations` | Create manually (paste transcript) |
| PATCH | `/api/consultations/:id` | Update metadata (client name, consultant, date, outcome, tags) |
| DELETE | `/api/consultations/:id` | Soft delete |
| POST | `/api/consultations/:id/analyse` | Trigger analysis |
| POST | `/api/consultations/analyse-batch` | Trigger analysis for multiple (body: `{ ids: [...] }`) |

### Extractions

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/extractions` | All extractions. Query params: `consultation_id`, `category`, `review_status`, `destination_tag`, `confidence` |
| GET | `/api/extractions/by-destination/:tag` | Approved extractions for a destination tag |
| PATCH | `/api/extractions/:id` | Update: `review_status`, `review_note`, `insight_edited`, `suggested_use_edited`, `destination_tags` |
| PATCH | `/api/extractions/bulk` | Bulk update review status (body: `{ ids: [...], review_status: 'approved' }`) |
| GET | `/api/extractions/:id/comments` | List comments for an extraction |
| POST | `/api/extractions/:id/comments` | Add comment |
| PATCH | `/api/extraction-comments/:id` | Edit comment |
| DELETE | `/api/extraction-comments/:id` | Delete comment |

### Collections / Export

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/collections/export` | Export approved extractions. Query params for filters. Format: `json` or `csv` (via `Accept` header or query param) |
| GET | `/api/collections/stats` | Aggregate counts by category, destination, consultant |

### Prompts

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/prompts` | List all versions |
| GET | `/api/prompts/active` | Get active prompt |
| GET | `/api/prompts/:id` | Get specific version with comments |
| POST | `/api/prompts` | Create new version (body: `{ prompt_text, change_comment, change_summary, model_preference }`) |
| POST | `/api/prompts/:id/activate` | Set as active (deactivates others) |
| GET | `/api/prompts/:id/comments` | List comments for a version |
| POST | `/api/prompts/:id/comments` | Add comment |

### Import

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/import/poll` | Manually trigger a Drive poll |
| GET | `/api/import/status` | Last poll time, files found, etc. |

### Settings

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/settings` | All settings |
| PATCH | `/api/settings/:key` | Update a setting |
| GET | `/api/destination-tags` | List all tag definitions |
| POST | `/api/destination-tags` | Create tag |
| PATCH | `/api/destination-tags/:id` | Update tag |
| DELETE | `/api/destination-tags/:id` | Delete tag (reassign extractions first) |

---

## Phased Delivery

### Phase 1: Core + Import (MVP)

- Auth (credential login)
- Database schema + seed
- Consultation CRUD (manual create + list + detail)
- Google Drive polling import
- Webhook notification on import
- In-app analysis (Claude API)
- Dashboard pipeline view
- Scorecard + extractions review (approve/reject)
- Transcript viewer tab
- Prompt editor with versioning

### Phase 2: Edit, Comment, Tag, Learn

- Extraction inline editing
- Extraction comments
- Destination tagging with tag picker
- Collections by category and by destination
- "Show in context" quote linking to transcript
- Export (CSV, JSON)

### Phase 3: Aggregation + Outputs

- Aggregate dashboard stats
- Pattern detection across consultations
- Case study builder with editing
- Split-view transcript alongside extractions
- Copy generator (Claude API using tagged extractions)
- n8n workflow templates for common notifications

---

## Development Notes for Claude Code

- **No frameworks.** Express.js backend, plain HTML/CSS/JS frontend. No React, no build step.
- **Use `pg` library directly** for database access. No ORM. Write SQL. Use parameterised queries to prevent injection.
- **Static files served from `public/`.** Each HTML page is self-contained with its own JS file.
- **The Google Drive service account setup is a one-time manual step.** Document it clearly in a README.
- **The polling job** can run via `setInterval` in the Express process for v1. For production, consider a separate worker or cron job.
- **Webhook dispatch is fire-and-forget.** Never block the main flow on webhook delivery.
- **The transcript viewer formatting** is client-side. Store raw text, format on render.
- **Quote-to-transcript linking** uses simple string search. Start with exact match, fall back to partial.
- **CSS custom properties** for the colour system. Single `style.css` file. No utility classes.
- **Seed the initial prompt** from the prompt template we built earlier in this conversation.
