import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dbPath = join(__dirname, '../../db/database.sqlite');

export const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Helper for transactions
export function transaction(fn) {
  return db.transaction(fn);
}

// Helper to get one row or null
export function getOne(query, params = []) {
  return db.prepare(query).get(params);
}

// Helper to get all rows
export function getAll(query, params = []) {
  return db.prepare(query).all(params);
}

// Helper for inserts/updates/deletes
export function run(query, params = []) {
  return db.prepare(query).run(params);
}
