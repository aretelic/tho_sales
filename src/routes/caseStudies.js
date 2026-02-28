import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getAll, getOne, run } from '../services/db.js';

const router = express.Router();

const WITH_CLIENT = `
  SELECT cs.*, c.client_name, c.consultation_date
  FROM case_study_drafts cs
  JOIN consultations c ON cs.consultation_id = c.id
`;

// GET /api/case-studies?consultation_id=X
router.get('/', (req, res, next) => {
  try {
    const { consultation_id } = req.query;
    let query = WITH_CLIENT + ' WHERE 1=1';
    const params = [];

    if (consultation_id) {
      query += ' AND cs.consultation_id = ?';
      params.push(consultation_id);
    }

    query += ' ORDER BY cs.created_at DESC';
    res.json(getAll(query, params));
  } catch (error) {
    next(error);
  }
});

// GET /api/case-studies/:id
router.get('/:id', (req, res, next) => {
  try {
    const draft = getOne(WITH_CLIENT + ' WHERE cs.id = ?', [req.params.id]);
    if (!draft) return res.status(404).json({ error: 'Not found' });
    res.json(draft);
  } catch (error) {
    next(error);
  }
});

// POST /api/case-studies
router.post('/', (req, res, next) => {
  try {
    const { consultation_id, headline, client_situation, catalyst, challenge,
            approach, key_quote, outcome, call_to_action, editor_notes, edit_status } = req.body;

    if (!consultation_id) {
      return res.status(400).json({ error: 'consultation_id is required' });
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    run(`
      INSERT INTO case_study_drafts (
        id, consultation_id, headline, client_situation, catalyst, challenge,
        approach, key_quote, outcome, call_to_action, editor_notes, edit_status,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id, consultation_id,
      headline || null, client_situation || null, catalyst || null, challenge || null,
      approach || null, key_quote || null, outcome || null, call_to_action || null,
      editor_notes || null, edit_status || 'draft', now, now
    ]);

    const draft = getOne(WITH_CLIENT + ' WHERE cs.id = ?', [id]);
    res.status(201).json(draft);
  } catch (error) {
    next(error);
  }
});

// PATCH /api/case-studies/:id
router.patch('/:id', (req, res, next) => {
  try {
    const { id } = req.params;
    const fields = ['headline', 'client_situation', 'catalyst', 'challenge',
                    'approach', 'key_quote', 'outcome', 'call_to_action',
                    'editor_notes', 'edit_status'];

    const validStatuses = ['draft', 'reviewed', 'published'];
    if (req.body.edit_status && !validStatuses.includes(req.body.edit_status)) {
      return res.status(400).json({ error: 'Invalid edit_status' });
    }

    const sets = [];
    const params = [];

    for (const field of fields) {
      if (req.body[field] !== undefined) {
        sets.push(`${field} = ?`);
        params.push(req.body[field] || null);
      }
    }

    if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });

    sets.push("updated_at = datetime('now')");
    params.push(id);

    run(`UPDATE case_study_drafts SET ${sets.join(', ')} WHERE id = ?`, params);

    const draft = getOne(WITH_CLIENT + ' WHERE cs.id = ?', [id]);
    if (!draft) return res.status(404).json({ error: 'Not found' });
    res.json(draft);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/case-studies/:id
router.delete('/:id', (req, res, next) => {
  try {
    run('DELETE FROM case_study_drafts WHERE id = ?', [req.params.id]);
    res.json({ deleted: true });
  } catch (error) {
    next(error);
  }
});

export default router;
