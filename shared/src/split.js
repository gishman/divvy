/**
 * divvy split engine.
 *
 * Every allocation assigns money to a party, either against a specific line
 * item (itemId set) or against the "remaining" pool (itemId null).
 *
 * Modes:
 *   amount  — fixed dollar amount, `value` in cents
 *   percent — percentage, `value` in 0..100
 *   share   — equal-weight share of whatever is left, `value` = weight (usually 1)
 *             ("whole item" for one party, "split evenly" for several)
 *
 * Rules are applied in order:
 *   1. Item buckets (pre-tax, per line item):
 *        amount & percent are measured against the line item price,
 *        then shares split whatever is left of that item.
 *   2. Taxes / tip / fees / discounts are spread proportionally to each party's
 *      item subtotal. Anything not covered by item assignments flows to the pool.
 *   3. Remaining pool (post-tax, real dollars):
 *        fixed amounts come off first, percentages are of what remains after
 *        that, then shares split the rest evenly.
 *
 * Anything still left after step 3 is "unassigned". A divvy is complete when
 * unassigned is exactly $0.00 and nothing is over-allocated.
 */
import { distribute } from './money.js';
import { computeReceiptTotals } from './receipt.js';

export const ALLOCATION_MODES = ['amount', 'percent', 'share'];

/**
 * Allocate a single bucket of cents.
 * @param {number} bucketCents
 * @param {Array} allocs allocations for this bucket
 * @param {'bucket'|'afterFixed'} percentBase what percentages are measured against
 */
function allocateBucket(bucketCents, allocs, percentBase) {
  const cents = new Map();
  const fixed = allocs.filter((a) => a.mode === 'amount');
  const percents = allocs.filter((a) => a.mode === 'percent');
  const shares = allocs.filter((a) => a.mode === 'share');

  let fixedSum = 0;
  for (const a of fixed) {
    const v = Math.max(0, Math.round(Number(a.value) || 0));
    cents.set(a.id, v);
    fixedSum += v;
  }

  const base = percentBase === 'bucket' ? bucketCents : bucketCents - fixedSum;
  const pctValues = percents.map((a) => Math.max(0, Number(a.value) || 0));
  const pctSum = pctValues.reduce((x, y) => x + y, 0);
  let percentSum = 0;
  if (percents.length) {
    const parts = distribute(Math.max(0, base), [...pctValues, Math.max(0, 100 - pctSum)]);
    // If percentages exceed 100 the leftover weight is 0 and the base is spread
    // over the percents proportionally; flag it below as over-allocation.
    const scaled = pctSum > 100
      ? pctValues.map((p) => Math.round((Math.max(0, base) * p) / 100))
      : parts.slice(0, -1);
    percents.forEach((a, i) => { cents.set(a.id, scaled[i]); percentSum += scaled[i]; });
  }

  let left = bucketCents - fixedSum - percentSum;
  if (shares.length && left > 0) {
    const parts = distribute(left, shares.map((a) => Math.max(0, Number(a.value) || 0)));
    shares.forEach((a, i) => cents.set(a.id, parts[i]));
    left -= parts.reduce((x, y) => x + y, 0);
  } else {
    shares.forEach((a) => cents.set(a.id, 0));
  }

  return {
    cents,
    unassigned: Math.max(0, left),
    over: Math.max(0, -left),
    pctOver: pctSum > 100,
  };
}

/**
 * Compute the full split for a divvy.
 * @param {{items:Array, adjustments:Array, parties:Array, allocations:Array}} divvy
 */
export function computeSplit({ items = [], adjustments = [], parties = [], allocations = [] }) {
  const { subtotalCents, adjustmentsCents, totalCents } = computeReceiptTotals({ items, adjustments });
  const errors = [];
  const partyIds = new Set(parties.map((p) => p.id));
  const valid = allocations.filter((a) => partyIds.has(a.partyId) && ALLOCATION_MODES.includes(a.mode));

  const partyResults = {};
  for (const p of parties) {
    partyResults[p.id] = {
      partyId: p.id,
      itemsCents: 0, // pre-tax share of line items
      extrasCents: 0, // proportional share of tax/tip/fees
      poolCents: 0, // share of the remaining pool
      totalCents: 0,
      items: [], // [{ itemId, cents }]
      allocationIds: [],
    };
  }

  const allocationCents = {};
  const itemResults = {};
  const itemIds = new Set(items.map((i) => i.id));
  let unassignedItemsCents = 0;

  // 1. Item buckets
  for (const item of items) {
    const allocs = valid.filter((a) => a.itemId === item.id);
    const price = Math.round(item.priceCents || 0);
    const r = allocateBucket(price, allocs, 'bucket');
    const perParty = {};
    for (const a of allocs) {
      const c = r.cents.get(a.id) || 0;
      allocationCents[a.id] = c;
      perParty[a.partyId] = (perParty[a.partyId] || 0) + c;
      partyResults[a.partyId].allocationIds.push(a.id);
    }
    for (const [pid, c] of Object.entries(perParty)) {
      partyResults[pid].itemsCents += c;
      partyResults[pid].items.push({ itemId: item.id, cents: c });
    }
    if (r.over > 0 || r.pctOver) {
      errors.push({
        type: 'item-over',
        itemId: item.id,
        overCents: r.over,
        message: `"${item.description || 'Item'}" is over-assigned${r.over ? ` by ${(r.over / 100).toFixed(2)}` : ''}`,
      });
    }
    itemResults[item.id] = {
      itemId: item.id,
      priceCents: price,
      assignedCents: price - r.unassigned,
      unassignedCents: r.unassigned,
      overCents: r.over,
      perParty,
      allocations: allocs.map((a) => ({ ...a, cents: r.cents.get(a.id) || 0 })),
    };
    unassignedItemsCents += r.unassigned;
  }

  // Allocations pointing at deleted items are ignored (and reported).
  for (const a of valid) {
    if (a.itemId && !itemIds.has(a.itemId)) {
      errors.push({ type: 'orphan', allocationId: a.id, message: 'Allocation references a removed item' });
    }
  }

  // 2. Spread adjustments (tax/tip/fees) proportionally to item shares.
  const pids = parties.map((p) => p.id);
  const itemShares = pids.map((pid) => Math.max(0, partyResults[pid].itemsCents));
  let extrasToPool = adjustmentsCents;
  if (subtotalCents > 0 && adjustmentsCents !== 0) {
    const parts = distribute(adjustmentsCents, [...itemShares, Math.max(0, unassignedItemsCents)]);
    pids.forEach((pid, i) => { partyResults[pid].extrasCents = parts[i]; });
    extrasToPool = parts[parts.length - 1];
  }

  // 3. Remaining pool
  const poolCents = unassignedItemsCents + extrasToPool;
  const poolAllocs = valid.filter((a) => !a.itemId);
  const pool = allocateBucket(poolCents, poolAllocs, 'afterFixed');
  const poolAllocations = [];
  for (const a of poolAllocs) {
    const c = pool.cents.get(a.id) || 0;
    allocationCents[a.id] = c;
    partyResults[a.partyId].poolCents += c;
    partyResults[a.partyId].allocationIds.push(a.id);
    poolAllocations.push({ ...a, cents: c });
  }
  if (pool.over > 0 || pool.pctOver) {
    errors.push({
      type: 'pool-over',
      overCents: pool.over,
      message: `Remaining amount is over-assigned${pool.over ? ` by ${(pool.over / 100).toFixed(2)}` : ''}`,
    });
  }

  let assignedCents = 0;
  for (const pid of pids) {
    const pr = partyResults[pid];
    pr.totalCents = pr.itemsCents + pr.extrasCents + pr.poolCents;
    assignedCents += pr.totalCents;
  }

  const unassignedCents = pool.unassigned;
  const isComplete = totalCents > 0 && unassignedCents === 0 && errors.filter((e) => e.type !== 'orphan').length === 0;

  return {
    subtotalCents,
    adjustmentsCents,
    totalCents,
    assignedCents,
    unassignedCents,
    poolCents,
    unassignedItemsCents,
    isComplete,
    errors,
    parties: partyResults,
    items: itemResults,
    poolAllocations,
    allocationCents,
  };
}

/**
 * Status rules: complete once every cent is accounted for; closed once every
 * party that owes something has been marked paid.
 */
export function deriveStatus(split, parties) {
  if (!split.isComplete) return 'open';
  const owing = parties.filter((p) => (split.parties[p.id]?.totalCents || 0) > 0);
  if (owing.length && owing.every((p) => !!p.paidAt)) return 'closed';
  return 'complete';
}

/**
 * Check whether adding `newAllocations` would over-allocate anything.
 * @returns {{ok: boolean, errors: Array, split: object}}
 */
export function checkAllocations(divvy, newAllocations) {
  const before = computeSplit(divvy);
  const beforeKeys = new Set(before.errors.map((e) => `${e.type}:${e.itemId || ''}`));
  const temp = newAllocations.map((a, i) => ({ id: a.id || `__new_${i}`, ...a }));
  for (const a of temp) {
    if (!ALLOCATION_MODES.includes(a.mode)) return { ok: false, errors: [{ message: `Unknown mode "${a.mode}"` }] };
    const v = Number(a.value);
    if (!Number.isFinite(v) || v <= 0) return { ok: false, errors: [{ message: 'Amount must be greater than zero' }] };
    if (a.mode === 'percent' && v > 100) return { ok: false, errors: [{ message: 'Percent cannot exceed 100%' }] };
  }
  const after = computeSplit({ ...divvy, allocations: [...(divvy.allocations || []), ...temp] });
  const newErrors = after.errors.filter((e) => e.type !== 'orphan' && !beforeKeys.has(`${e.type}:${e.itemId || ''}`));
  return { ok: newErrors.length === 0, errors: newErrors, split: after };
}

/** Human readable description of an allocation. */
export function describeAllocation(a, { itemName } = {}) {
  const target = a.itemId ? (itemName ? `of ${itemName}` : 'of item') : 'of remaining';
  if (a.mode === 'amount') return `$${(Number(a.value) / 100).toFixed(2)} ${target}`;
  if (a.mode === 'percent') return `${+Number(a.value).toFixed(2)}% ${target}`;
  return a.itemId ? `Even share ${target}` : 'Even share of remaining';
}
