import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getAll, getOne, run } from '../services/db.js';
import { analyseConsultation } from '../services/analyser.js';
import { extractItems } from '../services/extractor.js';

const router = express.Router();

// GET /api/consultations - List all consultations
router.get('/', (req, res, next) => {
  try {
    const consultations = getAll('SELECT * FROM consultation_dashboard');
    res.json(consultations);
  } catch (error) {
    next(error);
  }
});

// GET /api/consultations/:id - Get consultation detail
router.get('/:id', (req, res, next) => {
  try {
    const { id } = req.params;
    const consultation = getOne('SELECT * FROM consultations WHERE id = ?', [id]);

    if (!consultation) {
      return res.status(404).json({ error: 'Consultation not found' });
    }

    // Parse analysis_json if present
    if (consultation.analysis_json) {
      try {
        consultation.analysis_json = JSON.parse(consultation.analysis_json);
      } catch (error) {
        console.error('Failed to parse analysis_json:', error);
      }
    }

    res.json(consultation);
  } catch (error) {
    next(error);
  }
});

// POST /api/consultations - Create consultation
router.post('/', (req, res, next) => {
  try {
    const {
      client_name,
      consultant_name,
      consultation_date,
      duration_minutes,
      transcript_text
    } = req.body;

    if (!client_name || !transcript_text) {
      return res.status(400).json({ error: 'client_name and transcript_text are required' });
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    run(`
      INSERT INTO consultations (
        id, client_name, consultant_name, consultation_date,
        duration_minutes, transcript_text, analysis_status,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    `, [
      id, client_name, consultant_name || null, consultation_date || null,
      duration_minutes || null, transcript_text, now, now
    ]);

    const consultation = getOne('SELECT * FROM consultations WHERE id = ?', [id]);
    res.status(201).json(consultation);
  } catch (error) {
    next(error);
  }
});

// PATCH /api/consultations/:id - Update outcome / deal value / Capsule link
router.patch('/:id', (req, res, next) => {
  try {
    const { id } = req.params;
    const consultation = getOne('SELECT * FROM consultations WHERE id = ?', [id]);
    if (!consultation) {
      return res.status(404).json({ error: 'Consultation not found' });
    }

    // Only update fields explicitly present in the request body (supports null to clear)
    const allowed = ['outcome', 'deal_value', 'capsule_party_id', 'capsule_opportunity_id'];
    const sets = [];
    const vals = [];
    for (const field of allowed) {
      if (field in req.body) {
        sets.push(`${field} = ?`);
        vals.push(req.body[field] ?? null);
      }
    }
    if (sets.length === 0) return res.json(consultation);

    sets.push('updated_at = ?');
    vals.push(new Date().toISOString());
    vals.push(id);

    run(`UPDATE consultations SET ${sets.join(', ')} WHERE id = ?`, vals);

    const updated = getOne('SELECT * FROM consultations WHERE id = ?', [id]);
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

// POST /api/consultations/:id/analyse - Trigger analysis
router.post('/:id/analyse', async (req, res, next) => {
  try {
    const { id } = req.params;
    const consultation = getOne('SELECT * FROM consultations WHERE id = ?', [id]);

    if (!consultation) {
      return res.status(404).json({ error: 'Consultation not found' });
    }

    if (!consultation.transcript_text) {
      return res.status(400).json({ error: 'No transcript text to analyse' });
    }

    // Update status to analysing
    run('UPDATE consultations SET analysis_status = ?, updated_at = ? WHERE id = ?',
      ['analysing', new Date().toISOString(), id]);

    // Perform analysis
    try {
      const analysisResult = await analyseConsultation(consultation.transcript_text);

      // Extract denormalised scores
      const scores = analysisResult.framework_scores;
      const score_bant = scores.bant?.total || 0;
      const score_spin = scores.spin?.total || 0;
      const score_neat = scores.neat?.total || 0;
      const score_challenger = scores.challenger?.total || 0;
      const score_jtbd = scores.jtbd?.total || 0;
      const score_sandler = scores.sandler_pain?.total || 0;
      const score_composite = scores.composite?.total || 0;
      const score_composite_pct = scores.composite?.percentage || 0;

      const now = new Date().toISOString();

      // Update consultation with analysis
      run(`
        UPDATE consultations SET
          analysis_json = ?,
          analysis_status = 'complete',
          analysis_completed_at = ?,
          score_bant = ?,
          score_spin = ?,
          score_neat = ?,
          score_challenger = ?,
          score_jtbd = ?,
          score_sandler = ?,
          score_composite = ?,
          score_composite_pct = ?,
          updated_at = ?
        WHERE id = ?
      `, [
        JSON.stringify(analysisResult),
        now,
        score_bant, score_spin, score_neat, score_challenger,
        score_jtbd, score_sandler, score_composite, score_composite_pct,
        now,
        id
      ]);

      // Extract items to extractions table
      extractItems(id, analysisResult.extractions);

      res.json({ status: 'complete', consultation_id: id });

    } catch (analysisError) {
      // Update status to failed
      run(`
        UPDATE consultations SET
          analysis_status = 'failed',
          analysis_error = ?,
          updated_at = ?
        WHERE id = ?
      `, [analysisError.message, new Date().toISOString(), id]);

      throw analysisError;
    }

  } catch (error) {
    next(error);
  }
});

// DELETE /api/consultations/:id - Delete consultation and all related data
router.delete('/:id', (req, res, next) => {
  try {
    const { id } = req.params;
    const consultation = getOne('SELECT id FROM consultations WHERE id = ?', [id]);
    if (!consultation) return res.status(404).json({ error: 'Consultation not found' });
    run('DELETE FROM consultations WHERE id = ?', [id]);
    res.status(204).end();
  } catch (error) { next(error); }
});

export default router;
