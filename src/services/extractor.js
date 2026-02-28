import { v4 as uuidv4 } from 'uuid';
import { run, transaction } from './db.js';

/**
 * Extract items from analysis JSON and insert into extractions table
 * @param {string} consultationId - UUID of the consultation
 * @param {Object} extractions - Extractions object from analysis JSON
 */
export function extractItems(consultationId, extractions) {
  const insertExtraction = transaction((category, items) => {
    for (const item of items) {
      const id = uuidv4();
      run(`
        INSERT INTO extractions (
          id, consultation_id, category, insight, quote, speaker,
          confidence, suggested_use, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        id,
        consultationId,
        category,
        item.insight || '',
        item.quote || null,
        item.speaker || null,
        item.confidence || null,
        item.suggested_use || null,
        item.status || null,
        new Date().toISOString()
      ]);
    }
  });

  // Process each category
  for (const [category, items] of Object.entries(extractions)) {
    if (Array.isArray(items) && items.length > 0) {
      insertExtraction(category, items);
    }
  }
}
