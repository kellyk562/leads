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
