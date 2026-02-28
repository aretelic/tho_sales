import "./env.js";

// import dotenv from 'dotenv';
// dotenv.config();

import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import consultationsRouter from './src/routes/consultations.js';
import extractionsRouter from './src/routes/extractions.js';
import collectionsRouter from './src/routes/collections.js';
import caseStudiesRouter from './src/routes/caseStudies.js';
import { errorHandler } from './src/middleware/errorHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json({ limit: '10mb' })); // Large transcripts
app.use(express.static(join(__dirname, 'public')));

// API Routes
app.use('/api/consultations', consultationsRouter);
app.use('/api/extractions', extractionsRouter);
app.use('/api/collections', collectionsRouter);
app.use('/api/case-studies', caseStudiesRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '0.1.0' });
});

// Error handling
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`\n✓ Consultation Engine running on http://localhost:${PORT}`);
  console.log(`✓ Environment: ${process.env.NODE_ENV || 'development'}\n`);
  console.log("API KEY:", process.env.ANTHROPIC_API_KEY);
});
