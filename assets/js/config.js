// CE Smart Evidence — default configuration.
// Every list here can be extended from Settings → Lists without touching code.

export const APP = {
  name: 'CE Smart Evidence',
  short: 'CE Evidence',
  version: '1.0.0',
  schema: 1,
};

export const MACHINE_TYPES = [
  { id: 'ATM', label: 'ATM', folder: 'ATM', icon: 'atm', color: '#22d3ee' },
  { id: 'CP', label: 'Card / Statement Printer', folder: 'Card Printer', icon: 'printer', color: '#a78bfa' },
];

export const DEFAULT_CALL_TYPES = [
  { id: 'PM', label: 'PM – Preventive Maintenance' },
  { id: 'INSTALL', label: 'Installation' },
  { id: 'FLM', label: 'FLM – First Line Maintenance' },
  { id: 'SLM', label: 'SLM – Second Line Maintenance' },
  { id: 'CHGF', label: 'CHGF' },
  { id: 'CHGC', label: 'CHGC' },
  { id: 'NORMAL', label: 'Normal Call' },
  { id: 'INSPECTION', label: 'Inspection' },
  { id: 'ESCALATION', label: 'Escalation' },
  { id: 'UPGRADE', label: 'Upgrade / Retrofit' },
  { id: 'DEINSTALL', label: 'De-installation / Relocation' },
  { id: 'OTHER', label: 'Other' },
];

export const DEFAULT_DOC_TYPES = [
  { id: '442', label: '442 Form' },
  { id: 'PM', label: 'PM Checklist' },
  { id: 'SR', label: 'Service Report' },
  { id: 'IR', label: 'Installation Report' },
  { id: 'DR', label: 'Delivery Receipt' },
  { id: 'ACK', label: 'Customer Acknowledgement' },
  { id: 'OTHER', label: 'Other Document' },
];

// Case folders: a visit lives in exactly one folder and can be moved freely.
export const DEFAULT_FOLDERS = [
  { id: 'REGULAR', label: 'Regular', color: '#38bdf8' },
  { id: 'INSPECTION', label: 'Inspection', color: '#facc15' },
  { id: 'ESCALATION', label: 'Escalation', color: '#f87171' },
  { id: 'FOLLOWUP', label: 'Follow-up', color: '#fb923c' },
  { id: 'REVIEW', label: 'For Review', color: '#c084fc' },
  { id: 'CLOSED', label: 'Closed', color: '#4ade80' },
];

export const PHOTO_TAGS = ['General', 'Before', 'After', 'Serial / Label', 'Error / Fault', 'Parts', 'Site', 'Cash / Cassette', 'Printer Output'];

export const REVIEW_STATES = [
  { id: 'PENDING', label: 'Pending review' },
  { id: 'APPROVED', label: 'Approved' },
  { id: 'REWORK', label: 'Needs rework' },
];

// Call type → default folder when a visit is created.
export const CALLTYPE_DEFAULT_FOLDER = { INSPECTION: 'INSPECTION', ESCALATION: 'ESCALATION' };

export const DEFAULT_SETTINGS = {
  engineerName: '',
  engineerId: '',
  region: '',
  managerEmails: '',
  maxDimension: 2048,
  jpegQuality: 0.85,
  watermark: true,
  minPhotos: 3,
  docEnhance: true,
  theme: 'dark',
  reviewMode: false,
  googleClientId: '',
  driveRootName: 'CE Smart Evidence',
  autoSync: true,
  callTypes: DEFAULT_CALL_TYPES,
  docTypes: DEFAULT_DOC_TYPES,
  folders: DEFAULT_FOLDERS,
};
