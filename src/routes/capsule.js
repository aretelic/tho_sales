import express from 'express';
import { getOne } from '../services/db.js';
import { searchParties, logNote } from '../services/capsuleService.js';

const router = express.Router();

// GET /api/capsule/search?email= — find Capsule contacts by email
router.get('/search', async (req, res, next) => {
  try {
    const { email } = req.query;
    if (!email) {
      return res.status(400).json({ error: 'email query parameter is required' });
    }
    const parties = await searchParties(email);
    // Return a clean, minimal shape
    const result = parties.map(p => ({
      id: p.id,
      name: p.name,
      emailAddress: p.emailAddresses?.[0]?.address || null,
      opportunities: (p.opportunities || []).map(o => ({
        id: o.id,
        name: o.name,
        milestone: o.milestone?.name || null,
      })),
    }));
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// POST /api/capsule/log — log a note to Capsule for a consultation
router.post('/log', async (req, res, next) => {
  try {
    const { consultationId } = req.body;
    if (!consultationId) {
      return res.status(400).json({ error: 'consultationId is required' });
    }

    const consultation = getOne('SELECT * FROM consultations WHERE id = ?', [consultationId]);
    if (!consultation) {
      return res.status(404).json({ error: 'Consultation not found' });
    }
    if (!consultation.capsule_party_id) {
      return res.status(400).json({ error: 'No Capsule contact linked to this consultation' });
    }

    // Parse analysis JSON if needed
    let analysis = null;
    if (consultation.analysis_json) {
      try { analysis = JSON.parse(consultation.analysis_json); } catch { /* ignore */ }
    }

    const content = buildNoteContent(consultation, analysis);
    const result = await logNote(content, {
      partyId: consultation.capsule_party_id,
      opportunityId: consultation.capsule_opportunity_id || null,
    });

    res.json({ ok: true, entry: result });
  } catch (error) {
    next(error);
  }
});

function buildNoteContent(consultation, analysis) {
  const lines = [];

  lines.push(`Consultation: ${consultation.client_name}`);
  if (consultation.consultation_date) lines.push(`Date: ${consultation.consultation_date}`);
  if (consultation.consultant_name) lines.push(`Consultant: ${consultation.consultant_name}`);
  if (consultation.outcome) lines.push(`Outcome: ${consultation.outcome}`);
  if (consultation.deal_value) lines.push(`Deal value: ${consultation.deal_value}`);

  if (analysis?.executive_summary) {
    lines.push('');
    lines.push('Summary:');
    lines.push(analysis.executive_summary);
  }

  if (analysis?.top_3_improvements?.length) {
    lines.push('');
    lines.push('Top improvements identified:');
    for (const imp of analysis.top_3_improvements) {
      lines.push(`• ${imp.title}`);
    }
  }

  lines.push('');
  lines.push('— Logged by Consultation Intelligence Tool');

  return lines.join('\n');
}

export default router;
