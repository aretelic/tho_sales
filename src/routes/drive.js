import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { listDriveFiles, getDriveFileContent } from '../services/driveService.js';
import { getOne, run } from '../services/db.js';

const router = express.Router();

// GET /api/drive/files — list files in the configured Drive folder
router.get('/files', async (req, res, next) => {
  try {
    const files = await listDriveFiles(req.user.id);

    // Flag files that have already been imported
    const result = files.map(file => {
      const existing = getOne(
        'SELECT id FROM consultations WHERE drive_file_id = ?',
        [file.id],
      );
      return { ...file, alreadyImported: !!existing, consultationId: existing?.id || null };
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

// POST /api/drive/import — download a file and create a consultation
router.post('/import', async (req, res, next) => {
  try {
    const { fileId, fileName, mimeType, clientName } = req.body;

    if (!fileId) return res.status(400).json({ error: 'fileId is required' });

    // Prevent duplicate imports
    const existing = getOne(
      'SELECT id FROM consultations WHERE drive_file_id = ?',
      [fileId],
    );
    if (existing) {
      return res.status(409).json({
        error: 'Already imported',
        consultationId: existing.id,
      });
    }

    const content = await getDriveFileContent(req.user.id, fileId, mimeType);

    if (!content?.trim()) {
      return res.status(400).json({ error: 'File is empty or could not be read' });
    }

    // Derive client name: use provided name, fall back to filename without extension
    const resolvedName = (clientName?.trim()) ||
      (fileName ? fileName.replace(/\.[^.]+$/, '') : 'Imported Consultation');

    const id = uuidv4();
    const now = new Date().toISOString();

    run(`
      INSERT INTO consultations (
        id, client_name, transcript_text, analysis_status,
        drive_file_id, created_at, updated_at
      ) VALUES (?, ?, ?, 'pending', ?, ?, ?)
    `, [id, resolvedName, content.trim(), fileId, now, now]);

    res.status(201).json(getOne('SELECT * FROM consultations WHERE id = ?', [id]));
  } catch (error) {
    next(error);
  }
});

export default router;
