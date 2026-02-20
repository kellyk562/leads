// CRM field definitions with aliases for smart column detection
const FIELD_ALIASES = {
  dispensary_name: ['dispensary name', 'dispensary', 'company', 'company name', 'business', 'business name', 'store', 'store name', 'shop', 'name'],
  contact_name: ['contact name', 'contact', 'primary contact', 'person'],
  contact_email: ['contact email', 'email', 'email address', 'e-mail'],
  contact_number: ['contact number', 'contact phone', 'phone number', 'phone', 'mobile', 'cell', 'telephone'],
  contact_position: ['contact position', 'position', 'title', 'job title', 'role'],
  dispensary_number: ['dispensary number', 'dispensary phone', 'business phone', 'office phone', 'main phone'],
  address: ['address', 'street', 'street address', 'location'],
  city: ['city', 'town'],
  state: ['state', 'province', 'region'],
  zip_code: ['zip code', 'zip', 'postal code', 'postal', 'zipcode'],
  manager_name: ['manager name', 'manager', 'recommended contact'],
  owner_name: ['owner name', 'owner', 'recommended position'],
  website: ['website', 'web', 'url', 'site'],
  current_pos_system: ['current pos system', 'pos system', 'pos', 'current pos', 'current system'],
  notes: ['notes', 'comments', 'description', 'details', 'memo'],
  priority: ['priority', 'importance', 'urgency'],
  stage: ['stage', 'status', 'pipeline stage', 'sales stage'],
  source: ['source', 'lead source', 'origin', 'referral'],
  deal_value: ['deal value', 'deal', 'value', 'revenue', 'amount', 'price'],
  contact_date: ['contact date', 'date', 'first contact', 'date added'],
  license_number: ['license number', 'license', 'licence'],
};

// Normalize a header string for matching
function normalize(str) {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Auto-map CSV/pasted headers to CRM fields.
 * Returns an object: { csvHeader: crmField | null }
 */
export function autoMapColumns(csvHeaders) {
  const mapping = {};
  const usedFields = new Set();

  const normalizedHeaders = csvHeaders.map(normalize);

  // Pass 1: exact match
  for (let i = 0; i < csvHeaders.length; i++) {
    const norm = normalizedHeaders[i];
    for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
      if (usedFields.has(field)) continue;
      if (aliases.includes(norm) || norm === field.replace(/_/g, ' ')) {
        mapping[csvHeaders[i]] = field;
        usedFields.add(field);
        break;
      }
    }
  }

  // Pass 2: starts-with match
  for (let i = 0; i < csvHeaders.length; i++) {
    if (mapping[csvHeaders[i]]) continue;
    const norm = normalizedHeaders[i];
    for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
      if (usedFields.has(field)) continue;
      const match = aliases.some(a => norm.startsWith(a) || a.startsWith(norm));
      if (match) {
        mapping[csvHeaders[i]] = field;
        usedFields.add(field);
        break;
      }
    }
  }

  // Pass 3: contains match
  for (let i = 0; i < csvHeaders.length; i++) {
    if (mapping[csvHeaders[i]]) continue;
    const norm = normalizedHeaders[i];
    for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
      if (usedFields.has(field)) continue;
      const match = aliases.some(a => norm.includes(a) || a.includes(norm));
      if (match) {
        mapping[csvHeaders[i]] = field;
        usedFields.add(field);
        break;
      }
    }
  }

  // Set unmapped headers to null
  for (const header of csvHeaders) {
    if (!mapping[header]) {
      mapping[header] = null;
    }
  }

  return mapping;
}

// All available CRM fields for dropdown
export const CRM_FIELDS = [
  { value: 'dispensary_name', label: 'Dispensary Name' },
  { value: 'contact_name', label: 'Primary Contact' },
  { value: 'contact_email', label: 'Contact Email' },
  { value: 'contact_number', label: 'Contact Phone' },
  { value: 'contact_position', label: 'Contact Position' },
  { value: 'dispensary_number', label: 'Dispensary Phone' },
  { value: 'address', label: 'Address' },
  { value: 'city', label: 'City' },
  { value: 'state', label: 'State' },
  { value: 'zip_code', label: 'Zip Code' },
  { value: 'manager_name', label: 'Recommended Contact' },
  { value: 'owner_name', label: 'Recommended Position' },
  { value: 'website', label: 'Website' },
  { value: 'current_pos_system', label: 'Current POS System' },
  { value: 'notes', label: 'Notes' },
  { value: 'priority', label: 'Priority' },
  { value: 'stage', label: 'Stage' },
  { value: 'source', label: 'Source' },
  { value: 'deal_value', label: 'Deal Value' },
  { value: 'contact_date', label: 'Contact Date' },
  { value: 'license_number', label: 'License Number' },
];
