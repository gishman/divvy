/**
 * Turn raw OCR text into a structured receipt:
 *   { merchant, receiptDate, items[], adjustments[], parsedSubtotalCents, parsedTotalCents, warnings[] }
 *
 * The parser is intentionally forgiving — OCR output is noisy, and every
 * field remains editable in the UI afterwards.
 */
import { toCents } from './money.js';

// A trailing money amount, optionally followed by a tax flag ("T", "F", "*").
const AMOUNT_AT_END = /^(.*?)[\s:.$]*(\(?-?\$?\s?\d{1,6}(?:,\d{3})*[.,]\s?\d{2}\)?-?)\s*(?:[A-Za-z]{1,2}|\*)?\s*$/;

const RE = {
  subtotal: /\bsub\s*-?\s*t[o0]ta[l1]\b|\bsubtota[l1]\b|\bsub\s*tot\b|\bfood\s*(?:&|and)?\s*bev/i,
  total: /\b(?:grand\s*)?t[o0]ta[l1]\b|\bamount\s*due\b|\bbalance\s*due\b|\btotal\s*due\b/i,
  totalExclusions: /\btotal\s*(?:tax|savings|saved|items?|discount|qty|quantity)\b|\bitems?\s*total\b/i,
  tax: /\b(?:sales\s*)?tax\b|\bvat\b|\bgst\b|\bhst\b|\bpst\b|\bqst\b/i,
  tip: /\btip\b|\bgratuity\b/i,
  fee: /\bservice\s*(?:charge|fee)\b|\bsurcharge\b|\bdelivery\b|\bfee\b|\bbag\b/i,
  discount: /\bdiscount\b|\bcoupon\b|\bpromo\b|\bsavings\b|\bcomp\b|\b\d{1,2}%\s*off\b/i,
  skip: /\bchange\b|\bcash\b|\btender(?:ed)?\b|\bvisa\b|\bmaster\s*card\b|\bamex\b|\bdiscover\b|\bcredit\b|\bdebit\b|\bcard\b|\bpayment\b|\bpaid\b|\bauth\b|\bapproved?\b|\bref(?:erence)?\b|\bacct\b|\baccount\b|\bchip\b|\bcontactless\b|\bbalance\b|\bpoints?\b|\breward/i,
  date: /\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})\b|\b(\d{4})-(\d{1,2})-(\d{1,2})\b/,
  time: /\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm)?\b/i,
  phoneish: /\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/,
};

function cleanDescription(s) {
  return s
    .replace(/[|_~`{}[\]<>]/g, ' ')
    .replace(/\.{2,}/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s\-*#.:]+|[\s\-*#.:$]+$/g, '')
    .trim();
}

function parseDate(line) {
  const m = line.match(RE.date);
  if (!m) return null;
  let y; let mo; let d;
  if (m[4]) { y = +m[4]; mo = +m[5]; d = +m[6]; } else {
    mo = +m[1]; d = +m[2]; y = +m[3];
    if (y < 100) y += 2000;
    if (mo > 12 && d <= 12) [mo, d] = [d, mo]; // dd/mm/yyyy
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function splitQuantity(desc) {
  let m = desc.match(/^(\d{1,3})\s*(?:[xX@*]\s*|\s+)(.{2,})$/);
  if (m && +m[1] > 0 && +m[1] < 100) return { quantity: +m[1], description: m[2] };
  m = desc.match(/^(.{2,}?)\s+[xX@]\s*(\d{1,3})$/);
  if (m && +m[2] > 0 && +m[2] < 100) return { quantity: +m[2], description: m[1] };
  return { quantity: 1, description: desc };
}

/**
 * @param {string} text raw OCR text
 */
export function parseReceiptText(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const items = [];
  const adjustments = [];
  const warnings = [];
  const unparsed = [];
  let merchant = '';
  let receiptDate = null;
  let parsedSubtotalCents = null;
  const totals = [];
  let stage = 'items'; // items → summary (after subtotal) → done (after total)

  lines.forEach((line, idx) => {
    if (!receiptDate) receiptDate = parseDate(line);

    const m = line.match(AMOUNT_AT_END);
    if (!m) {
      // Merchant: first meaningful text line near the top.
      if (!merchant && idx < 5 && /[A-Za-z]{3,}/.test(line) && !RE.date.test(line) && !RE.phoneish.test(line)) {
        merchant = cleanDescription(line).slice(0, 60);
      }
      return;
    }

    const rawLabel = m[1] || '';
    const label = cleanDescription(rawLabel);
    const cents = toCents(m[2].replace(/\s/g, ''));
    if (!label && !cents) return;
    // Lines that are really dates/times/phones with a trailing "amount".
    if (RE.date.test(rawLabel) && !/[A-Za-z]{3,}/.test(rawLabel.replace(RE.date, ''))) return;

    if (RE.subtotal.test(label)) {
      parsedSubtotalCents = cents;
      stage = 'summary';
      return;
    }
    if (RE.total.test(label) && !RE.totalExclusions.test(label)) {
      totals.push(cents);
      stage = 'done';
      return;
    }
    if (RE.tip.test(label)) { adjustments.push({ kind: 'tip', label: label || 'Tip', amountCents: Math.abs(cents) }); return; }
    if (RE.tax.test(label)) { adjustments.push({ kind: 'tax', label: label || 'Tax', amountCents: cents }); return; }
    if (RE.discount.test(label)) {
      adjustments.push({ kind: 'discount', label: label || 'Discount', amountCents: -Math.abs(cents) });
      return;
    }
    if (stage !== 'items' && RE.fee.test(label)) {
      adjustments.push({ kind: 'fee', label: label || 'Fee', amountCents: cents });
      return;
    }
    if (RE.skip.test(label) || stage === 'done') { unparsed.push(line); return; }

    if (stage === 'items') {
      if (!label || !/[A-Za-z]/.test(label) || cents === 0) { unparsed.push(line); return; }
      const { quantity, description } = splitQuantity(label);
      items.push({ description: cleanDescription(description).slice(0, 80), quantity, priceCents: cents });
    } else {
      // Unknown line between subtotal and total → most likely a fee/charge.
      adjustments.push({ kind: cents < 0 ? 'discount' : 'misc', label: label || 'Misc', amountCents: cents });
    }
  });

  const itemsSum = items.reduce((s, i) => s + i.priceCents, 0);
  const adjSum = adjustments.reduce((s, a) => s + a.amountCents, 0);
  const parsedTotalCents = totals.length ? Math.max(...totals) : null;

  if (parsedSubtotalCents !== null && parsedSubtotalCents !== itemsSum) {
    warnings.push(
      `Line items add up to $${(itemsSum / 100).toFixed(2)} but the receipt subtotal reads $${(parsedSubtotalCents / 100).toFixed(2)}. Please review the items.`,
    );
  }
  if (parsedTotalCents !== null && parsedTotalCents !== itemsSum + adjSum) {
    warnings.push(
      `Calculated total is $${((itemsSum + adjSum) / 100).toFixed(2)} but the receipt total reads $${(parsedTotalCents / 100).toFixed(2)}.`,
    );
  }
  if (!items.length) warnings.push('No line items were detected — add them manually.');

  return { merchant, receiptDate, items, adjustments, parsedSubtotalCents, parsedTotalCents, warnings, unparsed };
}
