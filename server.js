import "./env.js";

import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import session from 'express-session';
import BetterSqlite3StoreFactory from 'better-sqlite3-session-store';

import { db } from './src/services/db.js';
import './src/services/passportConfig.js'; // registers passport strategy (side effect)
import passport from 'passport';

import authRouter from './src/routes/auth.js';
import driveRouter from './src/routes/drive.js';
import calendarRouter from './src/routes/calendar.js';
import consultationsRouter from './src/routes/consultations.js';
import extractionsRouter from './src/routes/extractions.js';
import collectionsRouter from './src/routes/collections.js';
import caseStudiesRouter from './src/routes/caseStudies.js';
import capsuleRouter from './src/routes/capsule.js';
import { requireAuth } from './src/middleware/auth.js';
import { errorHandler } from './src/middleware/errorHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// --- Session store ---
const SqliteStore = BetterSqlite3StoreFactory(session);

app.use(express.json({ limit: '10mb' }));

app.use(session({
  store: new SqliteStore({ client: db }),
  secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
}));

app.use(passport.initialize());
app.use(passport.session());

// --- Public routes (no auth required) ---

// Auth flow
app.use('/auth', authRouter);

// Login page
app.get('/login', (req, res) => {
  if (req.isAuthenticated()) return res.redirect('/');
  res.sendFile(join(__dirname, 'public/login.html'));
});

// Public static assets (CSS + JS contain no sensitive data)
app.use('/css', express.static(join(__dirname, 'public/css')));
app.use('/js', express.static(join(__dirname, 'public/js')));

// --- Auth guard — everything below requires login ---
app.use(requireAuth);

// Protected HTML pages
app.use(express.static(join(__dirname, 'public')));

// Protected API routes
app.use('/api/drive', driveRouter);
app.use('/api/calendar', calendarRouter);
app.use('/api/consultations', consultationsRouter);
app.use('/api/extractions', extractionsRouter);
app.use('/api/collections', collectionsRouter);
app.use('/api/case-studies', caseStudiesRouter);
app.use('/api/capsule', capsuleRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '0.1.0' });
});

// Error handling
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`\n✓ Consultation Engine running on http://localhost:${PORT}`);
  console.log(`✓ Environment: ${process.env.NODE_ENV || 'development'}\n`);
});
