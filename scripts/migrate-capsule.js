import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dbPath = join(__dirname, '../db/database.sqlite');

const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

try {
  db.exec('ALTER TABLE consultations ADD COLUMN capsule_party_id INTEGER');
  console.log('✓ capsule_party_id column added to consultations');
} catch {
  console.log('✓ capsule_party_id column already exists');
}

try {
  db.exec('ALTER TABLE consultations ADD COLUMN capsule_opportunity_id INTEGER');
  console.log('✓ capsule_opportunity_id column added to consultations');
} catch {
  console.log('✓ capsule_opportunity_id column already exists');
}

db.close();
