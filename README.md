# Consultation Intelligence Engine v0.1

A sales consultation transcript analysis and intelligence extraction tool powered by Claude AI.

## Overview

This tool analyzes B2C sales consultation transcripts using AI to:
- Score consultations against 6 sales frameworks (BANT, SPIN, NEAT, Challenger Sale, JTBD, Sandler Pain Funnel)
- Extract actionable intelligence across 10 categories (catalysts, friction points, emotional drivers, etc.)
- Provide coaching insights and improvement recommendations
- Build a searchable knowledge base of sales intelligence

## Tech Stack

- **Backend**: Node.js + Express
- **Database**: SQLite (better-sqlite3)
- **AI**: Anthropic Claude API (Sonnet 4.5)
- **Frontend**: Plain HTML/CSS/JavaScript (no frameworks, no build step)

## Prerequisites

- Node.js 18+
- Anthropic API key ([get one here](https://console.anthropic.com/))

## Installation

1. **Clone or navigate to this directory**

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up your API key**

   Edit `.env` and add your Anthropic API key:
   ```
   ANTHROPIC_API_KEY=sk-ant-your-key-here
   ```

4. **Initialize the database**
   ```bash
   npm run setup
   ```

5. **Start the server**
   ```bash
   npm start
   ```

6. **Open the app**

   Navigate to http://localhost:3000 in your browser

## Usage

### 1. Create a Consultation

- Click "New Consultation" on the dashboard
- Fill in client details and paste the transcript
- Click "Create Consultation"

### 2. Analyse the Transcript

- From the dashboard, click "Analyse" next to a pending consultation
- Or from the consultation detail page, click "Analyse Now"
- Wait 30-60 seconds for Claude to complete the analysis

### 3. Review Results

Once analysis is complete, you'll see three tabs:

- **Scorecard**: Framework scores, composite percentage, executive summary
- **Extractions**: Categorized intelligence items with quotes and suggested uses
- **Transcript**: Line-numbered view of the original consultation

## API Endpoints

### Consultations
- `GET /api/consultations` - List all consultations
- `POST /api/consultations` - Create a new consultation
- `GET /api/consultations/:id` - Get consultation detail
- `POST /api/consultations/:id/analyse` - Trigger Claude analysis

### Extractions
- `GET /api/extractions?consultation_id=X` - Get extractions for a consultation

### Health
- `GET /api/health` - Server status

## Database Schema

### consultations table
Stores consultation metadata, transcript, analysis results, and denormalized scores.

### extractions table
Flattened intelligence items extracted from analysis, grouped by category.

### consultation_dashboard view
Optimized view for the dashboard with extraction counts.

## What's Not in v0.1

This is a minimal working version. The following features are planned for future releases:
- Authentication (multi-user support)
- Google Drive auto-import
- Webhook notifications
- Prompt version management UI
- Extraction review workflow (approve/reject/edit)
- Commenting on extractions
- Destination tagging
- CSV/JSON export

## Framework Explanations

The tool scores consultations against 6 proven sales frameworks:

1. **BANT** - Budget, Authority, Need, Timeline (classic qualification)
2. **SPIN** - Situation, Problem, Implication, Need-Payoff (Neil Rackham)
3. **NEAT** - Need, Economic Impact, Access to Authority, Timeline (modern BANT)
4. **Challenger Sale** - Teach, Tailor, Take Control
5. **Jobs To Be Done** - Functional, Emotional, Social jobs the service fulfills
6. **Sandler Pain Funnel** - Surface Pain → Emotional Weight progression

## Extraction Categories

Intelligence is extracted into 10 categories:

- **Catalysts** - Life events that triggered the consultation
- **Friction Points** - Current pain and dysfunction
- **Objections & Fears** - Concerns about the process/outcome
- **Emotional Drivers** - Deeper motivations behind the purchase
- **Positioning Insights** - How to differentiate the service
- **Case Study Moments** - Before/after contrasts for marketing
- **Discovery Questions** - Effective questions asked (or missed)
- **Social Proof Opportunities** - Referral potential signals
- **Upsell Signals** - Additional service opportunities
- **Client Language** - Authentic phrases for marketing copy

## Development

### Scripts
- `npm start` - Start the server
- `npm run dev` - Start with auto-reload (Node 18+)
- `npm run setup` - Initialize/reset the database

### File Structure
```
consultation-engine/
├── server.js                 # Express server
├── db/
│   ├── schema.sql            # Database schema
│   └── database.sqlite       # SQLite database
├── src/
│   ├── routes/              # API route handlers
│   ├── services/            # Business logic (analyser, extractor, db)
│   └── middleware/          # Error handling
├── public/
│   ├── *.html               # Plain HTML pages
│   ├── css/style.css        # Single stylesheet
│   └── js/*.js              # Page-specific JavaScript modules
└── scripts/
    └── setup-db.js          # Database initialization
```

## Troubleshooting

### "Failed to parse Claude API response"
- Check your API key is valid and has credits
- Verify the transcript isn't too large (>100K tokens)
- Check the console for the raw Claude response

### "Database locked" errors
- SQLite doesn't support concurrent writes well
- For production, migrate to PostgreSQL (schema compatible)

### Analysis takes too long
- Large transcripts (>10,000 words) can take 60-90 seconds
- This is normal for Claude Sonnet 4.5
- Future: add progress indicators

## License

Proprietary - The Home Organisation

## Support

For issues or questions, contact the development team.
