// API base URL
const API_BASE = '/api';

// Fetch wrapper with error handling
export async function api(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    ...options
  };

  try {
    const response = await fetch(url, config);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

// Toast notifications
export function toast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toastEl = document.createElement('div');
  toastEl.className = `toast toast-${type}`;
  toastEl.textContent = message;

  container.appendChild(toastEl);

  setTimeout(() => {
    toastEl.remove();
  }, 3000);
}

// HTML escaping
export function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Date formatting
export function formatDate(dateString) {
  if (!dateString) return '—';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

// Format key (snake_case to Title Case)
export function formatKey(key) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// Get score class (for color coding)
export function getScoreClass(percentage) {
  if (percentage >= 70) return 'score-high';
  if (percentage >= 50) return 'score-mid';
  return 'score-low';
}

// Get status badge HTML
export function getStatusBadge(status) {
  const statusMap = {
    pending: { label: 'Pending', class: 'status-pending' },
    analysing: { label: 'Analysing...', class: 'status-analysing' },
    complete: { label: 'Complete', class: 'status-complete' },
    failed: { label: 'Failed', class: 'status-failed' }
  };

  const statusInfo = statusMap[status] || { label: status, class: '' };
  return `<span class="status-badge ${statusInfo.class}">${statusInfo.label}</span>`;
}

// Destination tags (hardcoded for v1 — will move to settings table later)
export const DESTINATION_TAGS = [
  { slug: 'homepage-hero',            label: 'Homepage Hero' },
  { slug: 'decluttering-landing-page', label: 'Decluttering' },
  { slug: 'kitchens',                 label: 'Kitchens' },
  { slug: 'bereavement',              label: 'Bereavement' },
  { slug: 'faq',                      label: 'FAQ' },
  { slug: 'consultation-script',      label: 'Consult Script' },
  { slug: 'case-studies',             label: 'Case Studies' },
  { slug: 'social-media',             label: 'Social Media' },
  { slug: 'ads',                      label: 'Ads' },
  { slug: 'email-nurture',            label: 'Email Nurture' },
  { slug: 'team-training',            label: 'Team Training' },
  { slug: 'pre-retirement',           label: 'Pre-Retirement' },
  { slug: 'renovation-trigger',       label: 'Renovation' },
];

// Category metadata
export const CATEGORY_META = {
  catalysts: {
    label: "Catalysts & Triggers",
    color: "var(--accent-2)",
    desc: "Life events that prompted the client to seek help. Use in marketing targeting and ad copy."
  },
  friction_points: {
    label: "Friction Points",
    color: "var(--red)",
    desc: "Current pain, frustration, or dysfunction. Use in website copy, landing pages, and consultation scripts."
  },
  objections_and_fears: {
    label: "Objections & Fears",
    color: "var(--amber)",
    desc: "Concerns about the process, cost, or outcome. Address these on the website FAQ and during consultations."
  },
  emotional_drivers: {
    label: "Emotional Drivers",
    color: "var(--purple)",
    desc: "Deeper emotional motivations behind the purchase. Use in positioning and brand messaging."
  },
  positioning_insights: {
    label: "Positioning Insights",
    color: "var(--blue)",
    desc: "How the service should be differentiated and described, often revealed by how clients describe failed alternatives."
  },
  case_study_moments: {
    label: "Case Study Moments",
    color: "var(--accent)",
    desc: "Before/after contrasts and vivid scenarios that work in testimonials and case studies."
  },
  discovery_questions: {
    label: "Discovery Questions",
    color: "var(--blue)",
    desc: "Effective questions asked, or opportunities missed. Build into the consultation template."
  },
  social_proof_opportunities: {
    label: "Social Proof Opportunities",
    color: "var(--accent-2)",
    desc: "Moments revealing referral potential or social proof angles."
  },
  upsell_signals: {
    label: "Upsell Signals",
    color: "var(--purple)",
    desc: "Needs beyond the immediate scope that could lead to additional engagements."
  },
  client_language: {
    label: "Client Language",
    color: "var(--text-2)",
    desc: "Specific phrases and metaphors the client used — mirror these in marketing copy."
  }
};
