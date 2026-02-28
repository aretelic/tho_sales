import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dbPath = join(__dirname, '../db/database.sqlite');

const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

// Add review workflow columns to extractions
const alterations = [
  "ALTER TABLE extractions ADD COLUMN review_status TEXT DEFAULT 'pending'",
  "ALTER TABLE extractions ADD COLUMN review_note TEXT",
  "ALTER TABLE extractions ADD COLUMN insight_edited TEXT",
  "ALTER TABLE extractions ADD COLUMN suggested_use_edited TEXT",
  "ALTER TABLE extractions ADD COLUMN destination_tags TEXT DEFAULT '[]'",
  "ALTER TABLE extractions ADD COLUMN updated_at TEXT"  // no expression default — SQLite restriction
];

let added = 0;
for (const stmt of alterations) {
  try {
    db.exec(stmt);
    added++;
  } catch {
    // Column already exists — safe to skip
  }
}

// Update dashboard view to include reviewed extraction counts
db.exec('DROP VIEW IF EXISTS consultation_dashboard');
db.exec(`
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
    c.created_at,
    (SELECT COUNT(*) FROM extractions e WHERE e.consultation_id = c.id) AS total_extractions,
    (SELECT COUNT(*) FROM extractions e WHERE e.consultation_id = c.id AND e.review_status = 'approved') AS approved_extractions,
    (SELECT COUNT(*) FROM extractions e WHERE e.consultation_id = c.id AND (e.review_status IS NULL OR e.review_status = 'pending')) AS pending_extractions
  FROM consultations c
  ORDER BY c.consultation_date DESC, c.created_at DESC
`);

console.log(`✓ Migration complete. ${added} column(s) added to extractions.`);
console.log('✓ consultation_dashboard view updated with review counts.');
db.close();
