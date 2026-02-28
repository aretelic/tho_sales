import express from 'express';
import { getAll } from '../services/db.js';

const router = express.Router();

const APPROVED_QUERY = `
  SELECT
    e.id, e.category,
    COALESCE(e.insight_edited, e.insight) AS display_insight,
    e.quote, e.speaker, e.confidence,
    COALESCE(e.suggested_use_edited, e.suggested_use) AS display_suggested_use,
    e.destination_tags, e.review_note,
    c.id AS consultation_id,
    c.client_name, c.consultant_name, c.consultation_date, c.outcome
  FROM extractions e
  JOIN consultations c ON e.consultation_id = c.id
  WHERE e.review_status = 'approved'
`;

// GET /api/collections?category=X
router.get('/', (req, res, next) => {
  try {
    const { category } = req.query;
    let query = APPROVED_QUERY;
    const params = [];

    if (category) {
      query += ' AND e.category = ?';
      params.push(category);
    }

    query += ' ORDER BY e.category, c.consultation_date DESC';
    res.json(getAll(query, params));
  } catch (error) {
    next(error);
  }
});

// GET /api/collections/stats
router.get('/stats', (req, res, next) => {
  try {
    const total = getAll("SELECT COUNT(*) AS n FROM extractions WHERE review_status = 'approved'")[0]?.n || 0;
    const byCategory = getAll(`
      SELECT category, COUNT(*) AS n
      FROM extractions WHERE review_status = 'approved'
      GROUP BY category ORDER BY n DESC
    `);
    const consultationCount = getAll(`
      SELECT COUNT(DISTINCT c.id) AS n
      FROM extractions e JOIN consultations c ON e.consultation_id = c.id
      WHERE e.review_status = 'approved'
    `)[0]?.n || 0;

    res.json({ total, byCategory, consultationCount });
  } catch (error) {
    next(error);
  }
});

// GET /api/collections/export?format=csv|json
router.get('/export', (req, res, next) => {
  try {
    const format = req.query.format === 'csv' ? 'csv' : 'json';
    const rows = getAll(APPROVED_QUERY + ' ORDER BY e.category, c.consultation_date DESC');

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename="collections-export.json"');
      return res.json({
        exported_at: new Date().toISOString(),
        total: rows.length,
        extractions: rows.map(r => ({
          ...r,
          destination_tags: (() => { try { return JSON.parse(r.destination_tags || '[]'); } catch { return []; } })()
        }))
      });
    }

    // CSV with BOM for Excel compatibility
    const headers = ['category', 'insight', 'quote', 'speaker', 'confidence', 'suggested_use', 'destination_tags', 'client_name', 'consultation_date', 'outcome'];
    const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`;

    const lines = [
      headers.join(','),
      ...rows.map(r => {
        const tags = (() => { try { return JSON.parse(r.destination_tags || '[]').join('; '); } catch { return ''; } })();
        return [
          r.category, r.display_insight, r.quote, r.speaker, r.confidence,
          r.display_suggested_use, tags, r.client_name, r.consultation_date, r.outcome
        ].map(escape).join(',');
      })
    ];

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="collections-export.csv"');
    res.send('\uFEFF' + lines.join('\n'));
  } catch (error) {
    next(error);
  }
});

export default router;
