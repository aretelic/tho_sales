import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dbPath = join(__dirname, '../db/database.sqlite');
const schemaPath = join(__dirname, '../db/schema.sql');

console.log('Initializing database...');
console.log('Database path:', dbPath);

const db = new Database(dbPath);
const schema = readFileSync(schemaPath, 'utf-8');

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Run schema
db.exec(schema);

console.log('✓ Database initialized successfully!');
console.log('✓ Tables created: consultations, extractions');
console.log('✓ View created: consultation_dashboard');

db.close();
