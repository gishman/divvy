/**
 * Receipt model.
 *
 * A receipt has three sections:
 *   1. items        — editable line items ({ description, quantity, priceCents })
 *   2. adjustments  — editable taxes / tip / fees / discounts / misc
 *   3. total        — always calculated: subtotal (sum of items) + adjustments
 *
 * `priceCents` is the LINE total as printed on the receipt (quantity is informational).
 */

export const ADJUSTMENT_KINDS = [
  { kind: 'tax', label: 'Tax' },
  { kind: 'tip', label: 'Tip' },
  { kind: 'fee', label: 'Fee' },
  { kind: 'discount', label: 'Discount' },
  { kind: 'misc', label: 'Misc' },
];

export function adjustmentLabel(kind) {
  return ADJUSTMENT_KINDS.find((k) => k.kind === kind)?.label || 'Misc';
}

/** Discounts are always stored negative; everything else as entered. */
export function normalizeAdjustmentAmount(kind, cents) {
  const c = Math.round(cents || 0);
  return kind === 'discount' ? -Math.abs(c) : c;
}

export function computeReceiptTotals({ items = [], adjustments = [] }) {
  const subtotalCents = items.reduce((sum, i) => sum + Math.round(i.priceCents || 0), 0);
  const adjustmentsCents = adjustments.reduce((sum, a) => sum + Math.round(a.amountCents || 0), 0);
  const byKind = {};
  for (const a of adjustments) byKind[a.kind] = (byKind[a.kind] || 0) + Math.round(a.amountCents || 0);
  return { subtotalCents, adjustmentsCents, totalCents: subtotalCents + adjustmentsCents, byKind };
}

/** Tip helper: percentage of subtotal, rounded to the cent. */
export function tipFromPercent(subtotalCents, percent) {
  return Math.round((subtotalCents * percent) / 100);
}

/**
 * A fingerprint used to detect the "same event" being scanned twice.
 * Total is the strongest signal; date and merchant refine it.
 */
export function receiptFingerprint({ totalCents, receiptDate, merchant }) {
  const m = String(merchant || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24);
  return `${totalCents}|${receiptDate || ''}|${m}`;
}
