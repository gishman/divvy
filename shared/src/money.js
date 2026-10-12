/**
 * Money helpers. All money in divvy is handled as integer cents to avoid
 * floating point drift; conversion happens only at the edges (input/display).
 */

/**
 * Convert a user/OCR supplied value into integer cents.
 * Accepts numbers (dollars), "$1,234.56", "(5.00)", "5.00-", "12,99" (decimal comma).
 * @param {string|number|null|undefined} value
 * @returns {number}
 */
export function toCents(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value * 100) : 0;

  let str = String(value).trim().replace(/[$\s]/g, '');
  let negative = false;
  if (/^\(.*\)$/.test(str)) { negative = true; str = str.slice(1, -1); }
  if (str.startsWith('-')) { negative = !negative; str = str.slice(1); }
  if (str.endsWith('-')) { negative = !negative; str = str.slice(0, -1); }

  // Decimal comma ("12,99") vs thousands separator ("1,234.56")
  if (/^\d+,\d{2}$/.test(str)) str = str.replace(',', '.');
  else str = str.replace(/,/g, '');

  const n = Number(str);
  if (!Number.isFinite(n)) return 0;
  const cents = Math.round(n * 100);
  return negative ? -cents : cents;
}

/** Cents → "12.34" (for input fields). */
export function centsToInput(cents) {
  return ((cents || 0) / 100).toFixed(2);
}

const formatters = new Map();
/**
 * Cents → localized currency string, e.g. "$12.34".
 * @param {number} cents
 * @param {{currency?: string, signed?: boolean}} [opts]
 */
export function formatCents(cents, { currency = 'USD', signed = false } = {}) {
  if (!formatters.has(currency)) {
    formatters.set(currency, new Intl.NumberFormat('en-US', { style: 'currency', currency }));
  }
  const value = (cents || 0) / 100;
  const s = formatters.get(currency).format(Math.abs(value));
  if (value < 0) return `-${s}`;
  return signed && value > 0 ? `+${s}` : s;
}

/**
 * Split an integer amount across weights using the largest-remainder method,
 * guaranteeing the parts sum exactly to `total` (no lost or invented pennies).
 * @param {number} total integer (may be negative)
 * @param {number[]} weights non-negative weights
 * @returns {number[]}
 */
export function distribute(total, weights) {
  if (!weights.length) return [];
  const w = weights.map((x) => (Number.isFinite(x) && x > 0 ? x : 0));
  const sum = w.reduce((a, b) => a + b, 0);
  if (sum <= 0 || total === 0) return w.map(() => 0);

  const sign = total < 0 ? -1 : 1;
  const abs = Math.abs(Math.round(total));
  const raw = w.map((x) => (x * abs) / sum);
  const parts = raw.map((r) => Math.floor(r + 1e-9));
  let remainder = abs - parts.reduce((a, b) => a + b, 0);

  const order = raw
    .map((r, i) => ({ i, frac: r - parts[i] }))
    .filter(({ i }) => w[i] > 0)
    .sort((a, b) => b.frac - a.frac || a.i - b.i);

  let k = 0;
  while (remainder > 0 && order.length) {
    parts[order[k % order.length].i] += 1;
    remainder -= 1;
    k += 1;
  }
  while (remainder < 0 && order.length) {
    // Only reachable through float error; take pennies back from the smallest fractions.
    const idx = order[order.length - 1 - (k % order.length)].i;
    if (parts[idx] > 0) { parts[idx] -= 1; remainder += 1; }
    k += 1;
  }
  return parts.map((p) => p * sign);
}

/** Clamp helper. */
export const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
