// Utility to canonicalize and display bill types
export function canonicalizeBillType(input) {
  if (!input) return 'other';
  const s = String(input).toLowerCase().trim();
  if (s.includes('rent')) return 'rent';
  if (s.includes('water')) return 'water';
  if (s.includes('electric') || s === 'elec' || s === 'power' || s === 'elec.') return 'electricity';
  if (s.includes('maint')) return 'maintenance';
  return s;
}

export function displayBillType(input) {
  const c = canonicalizeBillType(input);
  switch (c) {
    case 'rent': return 'Rent';
    case 'water': return 'Water';
    case 'electricity': return 'Electricity';
    case 'maintenance': return 'Maintenance';
    default: return String(input || c || 'Other');
  }
}
