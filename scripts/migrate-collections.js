import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dbPath = join(__dirname, '../db/database.sqlite');

const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS extraction_comments (
    id TEXT PRIMARY KEY,
    extraction_id TEXT NOT NULL REFERENCES extractions(id) ON DELETE CASCADE,
    comment_text TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS case_study_drafts (
    id TEXT PRIMARY KEY,
    consultation_id TEXT NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
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
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT
  )
`);

db.exec('CREATE INDEX IF NOT EXISTS idx_comments_extraction ON extraction_comments(extraction_id)');
db.exec('CREATE INDEX IF NOT EXISTS idx_case_studies_consultation ON case_study_drafts(consultation_id)');

console.log('✓ extraction_comments table ready');
console.log('✓ case_study_drafts table ready');
db.close();
