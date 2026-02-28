-- Consultations table
CREATE TABLE consultations (
  id TEXT PRIMARY KEY,

  -- Client metadata
  client_name TEXT NOT NULL,
  consultant_name TEXT,
  consultation_date TEXT,
  duration_minutes INTEGER,
  outcome TEXT CHECK (outcome IN ('closed', 'lost', 'follow_up_required', 'unknown')),
  deal_value TEXT,
  deal_summary TEXT,

  -- Transcript
  transcript_text TEXT NOT NULL,

  -- Analysis
  analysis_json TEXT,
  analysis_status TEXT DEFAULT 'pending'
    CHECK (analysis_status IN ('pending', 'analysing', 'complete', 'failed')),
  analysis_error TEXT,
  analysis_completed_at TEXT,

  -- Denormalised scores
  score_bant INTEGER,
  score_spin INTEGER,
  score_neat INTEGER,
  score_challenger INTEGER,
  score_jtbd INTEGER,
  score_sandler INTEGER,
  score_composite INTEGER,
  score_composite_pct INTEGER,

  -- Housekeeping
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_consultations_status ON consultations(analysis_status);
CREATE INDEX idx_consultations_date ON consultations(consultation_date);

-- Extractions table
CREATE TABLE extractions (
  id TEXT PRIMARY KEY,
  consultation_id TEXT NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN (
    'catalysts', 'friction_points', 'objections_and_fears',
    'emotional_drivers', 'positioning_insights', 'case_study_moments',
    'discovery_questions', 'social_proof_opportunities',
    'upsell_signals', 'client_language'
  )),

  -- Extracted data
  insight TEXT NOT NULL,
  quote TEXT,
  speaker TEXT,
  confidence TEXT CHECK (confidence IN ('high', 'medium', 'low')),
  suggested_use TEXT,
  status TEXT,

  -- Review workflow
  review_status TEXT DEFAULT 'pending' CHECK (review_status IN ('pending', 'approved', 'rejected', 'parked')),
  review_note TEXT,
  insight_edited TEXT,
  suggested_use_edited TEXT,
  destination_tags TEXT DEFAULT '[]',

  -- Housekeeping
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT
);

CREATE INDEX idx_extractions_consultation ON extractions(consultation_id);
CREATE INDEX idx_extractions_category ON extractions(category);

-- Extraction comments
CREATE TABLE extraction_comments (
  id TEXT PRIMARY KEY,
  extraction_id TEXT NOT NULL REFERENCES extractions(id) ON DELETE CASCADE,
  comment_text TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_comments_extraction ON extraction_comments(extraction_id);

-- Case study drafts
CREATE TABLE case_study_drafts (
  id TEXT PRIMARY KEY,
  consultation_id TEXT NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
  headline TEXT,
  client_situation TEXT,
  catalyst TEXT,
  challenge TEXT,
  approach TEXT,
  key_quote TEXT,
  outcome TEXT,
  call_to_action TEXT,
  edit_status TEXT DEFAULT 'draft' CHECK (edit_status IN ('draft', 'reviewed', 'published')),
  editor_notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT
);
CREATE INDEX idx_case_studies_consultation ON case_study_drafts(consultation_id);

-- Dashboard view
CREATE VIEW consultation_dashboard AS
SELECT
  c.id,
  c.client_name,
  c.consultant_name,
  c.consultation_date,
  c.outcome,
  c.deal_value,
  c.analysis_status,
  c.score_composite_pct,
  c.created_at,
  (SELECT COUNT(*) FROM extractions e WHERE e.consultation_id = c.id) AS total_extractions,
  (SELECT COUNT(*) FROM extractions e WHERE e.consultation_id = c.id AND e.review_status = 'approved') AS approved_extractions,
  (SELECT COUNT(*) FROM extractions e WHERE e.consultation_id = c.id AND (e.review_status IS NULL OR e.review_status = 'pending')) AS pending_extractions
FROM consultations c
ORDER BY c.consultation_date DESC, c.created_at DESC;
