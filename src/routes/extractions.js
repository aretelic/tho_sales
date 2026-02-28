import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getAll, getOne, run } from '../services/db.js';

const router = express.Router();

// GET /api/extractions?consultation_id=X&category=Y&review_status=Z
router.get('/', (req, res, next) => {
  try {
    const { consultation_id, category, review_status } = req.query;

    let query = `
      SELECT e.*,
        (SELECT COUNT(*) FROM extraction_comments WHERE extraction_id = e.id) AS comment_count
      FROM extractions e
      WHERE 1=1
    `;
    const params = [];

    if (consultation_id) {
      query += ' AND e.consultation_id = ?';
      params.push(consultation_id);
    }
    if (category) {
      query += ' AND e.category = ?';
      params.push(category);
    }
    if (review_status) {
      query += " AND (e.review_status = ? OR (e.review_status IS NULL AND ? = 'pending'))";
      params.push(review_status, review_status);
    }

    query += ' ORDER BY e.created_at ASC';

    const extractions = getAll(query, params);
    res.json(extractions);
  } catch (error) {
    next(error);
  }
});

// PATCH /api/extractions/:id
router.patch('/:id', (req, res, next) => {
  try {
    const { id } = req.params;
    const { review_status, review_note, insight_edited, suggested_use_edited, destination_tags } = req.body;

    const validStatuses = ['pending', 'approved', 'rejected', 'parked'];
    if (review_status !== undefined && !validStatuses.includes(review_status)) {
      return res.status(400).json({ error: 'Invalid review_status' });
    }

    const sets = [];
    const params = [];

    if (review_status !== undefined)        { sets.push('review_status = ?');      params.push(review_status); }
    if (review_note !== undefined)          { sets.push('review_note = ?');        params.push(review_note); }
    if (insight_edited !== undefined)       { sets.push('insight_edited = ?');     params.push(insight_edited || null); }
    if (suggested_use_edited !== undefined) { sets.push('suggested_use_edited = ?'); params.push(suggested_use_edited || null); }
    if (destination_tags !== undefined)     { sets.push('destination_tags = ?');   params.push(JSON.stringify(destination_tags)); }

    if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });

    sets.push("updated_at = datetime('now')");
    params.push(id);

    run(`UPDATE extractions SET ${sets.join(', ')} WHERE id = ?`, params);

    const updated = getOne('SELECT * FROM extractions WHERE id = ?', [id]);
    if (!updated) return res.status(404).json({ error: 'Extraction not found' });

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

// GET /api/extractions/:id/comments
router.get('/:id/comments', (req, res, next) => {
  try {
    const comments = getAll(
      'SELECT * FROM extraction_comments WHERE extraction_id = ? ORDER BY created_at ASC',
      [req.params.id]
    );
    res.json(comments);
  } catch (error) {
    next(error);
  }
});

// POST /api/extractions/:id/comments
router.post('/:id/comments', (req, res, next) => {
  try {
    const { id } = req.params;
    const { comment_text } = req.body;

    if (!comment_text?.trim()) {
      return res.status(400).json({ error: 'comment_text is required' });
    }

    const commentId = uuidv4();
    run(
      'INSERT INTO extraction_comments (id, extraction_id, comment_text) VALUES (?, ?, ?)',
      [commentId, id, comment_text.trim()]
    );

    const comment = getOne('SELECT * FROM extraction_comments WHERE id = ?', [commentId]);
    res.status(201).json(comment);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/extractions/:extractionId/comments/:commentId
router.delete('/:extractionId/comments/:commentId', (req, res, next) => {
  try {
    const { commentId } = req.params;
    run('DELETE FROM extraction_comments WHERE id = ?', [commentId]);
    res.json({ deleted: true });
  } catch (error) {
    next(error);
  }
});

export default router;
