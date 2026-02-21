export const STAGES = [
  'New Lead',
  'Contacted',
  'Demo Scheduled',
  'Demo Completed',
  'Proposal Sent',
  'Negotiating',
  'Closed Won',
  'Closed Lost',
];

export const STAGE_COLORS = {
  'New Lead': '#6c757d',
  'Contacted': '#0d6efd',
  'Demo Scheduled': '#6f42c1',
  'Demo Completed': '#d63384',
  'Proposal Sent': '#e65100',
  'Negotiating': '#ffc107',
  'Closed Won': '#198754',
  'Closed Lost': '#dc3545',
};

export const STAGE_BG_COLORS = {
  'New Lead': '#e9ecef',
  'Contacted': '#cfe2ff',
  'Demo Scheduled': '#e2d9f3',
  'Demo Completed': '#f7d6e6',
  'Proposal Sent': '#fff3e0',
  'Negotiating': '#fff9c4',
  'Closed Won': '#d1e7dd',
  'Closed Lost': '#f8d7da',
};

// Lead score helpers
export const getScoreColor = (score) => {
  if (score >= 70) return '#198754';
  if (score >= 40) return '#e65100';
  return '#6c757d';
};

export const getScoreBg = (score) => {
  if (score >= 70) return '#d1e7dd';
  if (score >= 40) return '#fff3e0';
  return '#e9ecef';
};

export const getScoreLabel = (score) => {
  if (score >= 70) return 'Hot';
  if (score >= 40) return 'Warm';
  return 'Cold';
};

// Cadence/Sequence steps
export const CADENCE_STEPS = [
  { step: 0, label: 'Not started' },
  { step: 1, label: 'Intro sent' },
  { step: 2, label: 'Follow-up 1' },
  { step: 3, label: 'Follow-up 2' },
  { step: 4, label: 'Follow-up 3' },
  { step: 5, label: 'Break-up email' },
];

export const getCadenceLabel = (step) => {
  const entry = CADENCE_STEPS.find(s => s.step === step);
  return entry ? entry.label : `Step ${step}`;
};

// Win/Loss reason presets
export const CLOSED_WON_REASONS = [
  'Price',
  'Features',
  'Referral',
  'Support',
  'Demo impressed',
];

export const CLOSED_LOST_REASONS = [
  'Chose competitor',
  'Too expensive',
  'Not ready',
  'No budget',
  'Went dark',
  'Bad timing',
];
