// Utility to format meter numbers for display in the UI only.
// - Returns empty string for null/undefined/empty inputs
// - Removes trailing ".000" or unnecessary zeros
// - Preserves meaningful decimal precision (e.g., 72.5, 100.125)
export function formatMeterNumber(v) {
  if (v === null || v === undefined || v === '') return '';
  // If already a number
  const num = Number(v);
  if (Number.isNaN(num)) return String(v);

  // Integer: show without decimals
  if (Number.isInteger(num)) return String(num);

  // For non-integers: produce a clean string without trailing zeros
  // Use the original string when possible to avoid floating point round-trips
  let s = typeof v === 'string' ? v.trim() : String(num);
  // Ensure decimal point representation (in case toString produced exponential form)
  if (!s.includes('.') && String(num).includes('.')) s = String(num);

  // Trim trailing zeros then trailing dot if any
  s = s.replace(/(\.\d*?[1-9])0+$/,'$1');
  s = s.replace(/\.0+$/,'');

  return s;
}

export default formatMeterNumber;
