import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dbPath = join(__dirname, '../db/database.sqlite');

const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

try {
  db.exec('ALTER TABLE consultations ADD COLUMN drive_file_id TEXT');
  console.log('✓ drive_file_id column added to consultations');
} catch {
  console.log('✓ drive_file_id column already exists');
}

db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_consultations_drive_file ON consultations(drive_file_id) WHERE drive_file_id IS NOT NULL');
console.log('✓ unique index on drive_file_id ready');

db.close();
