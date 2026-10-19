import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeSplit, deriveStatus, checkAllocations } from '../src/split.js';
import { distribute, toCents } from '../src/money.js';
import { contactKey, validateContact } from '../src/contacts.js';
import { parseReceiptText } from '../src/receiptParser.js';

const parties = [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }, { id: 'p4' }];
const items = [
  { id: 'burger', description: 'Burger', priceCents: 1500 },
  { id: 'salad', description: 'Salad', priceCents: 1200 },
  { id: 'pizza', description: 'Pizza', priceCents: 2400 },
  { id: 'wine', description: 'Wine', priceCents: 2900 },
];
const adjustments = [
  { id: 't', kind: 'tax', amountCents: 640 },
  { id: 'tip', kind: 'tip', amountCents: 1600 },
];

test('distribute never loses pennies', () => {
  assert.deepEqual(distribute(100, [1, 1, 1]), [34, 33, 33]);
  assert.deepEqual(distribute(-100, [1, 1, 1]), [-34, -33, -33]);
  assert.equal(distribute(1001, [33.3, 33.3, 33.4]).reduce((a, b) => a + b), 1001);
  assert.deepEqual(distribute(50, [0, 0]), [0, 0]);
});

test('toCents handles receipt formats', () => {
  assert.equal(toCents('$1,234.56'), 123456);
  assert.equal(toCents('5.00-'), -500);
  assert.equal(toCents('(2.50)'), -250);
  assert.equal(toCents('12,99'), 1299);
  assert.equal(toCents(3.1), 310);
});

test('spec example: P1 & P4 pay items, P2 & P3 split remainder 50/50', () => {
  const allocations = [
    { id: 'a1', partyId: 'p1', itemId: 'burger', mode: 'share', value: 1 },
    { id: 'a2', partyId: 'p4', itemId: 'wine', mode: 'share', value: 1 },
    { id: 'a3', partyId: 'p2', itemId: null, mode: 'percent', value: 50 },
    { id: 'a4', partyId: 'p3', itemId: null, mode: 'percent', value: 50 },
  ];
  const s = computeSplit({ items, adjustments, parties, allocations });
  assert.equal(s.totalCents, 10240);
  assert.equal(s.unassignedCents, 0);
  assert.equal(s.isComplete, true);
  // Burger is 1500/8000 of subtotal → 18.75% of 2240 extras = 420
  assert.equal(s.parties.p1.itemsCents, 1500);
  assert.equal(s.parties.p1.extrasCents, 420);
  assert.equal(s.parties.p4.totalCents, 2900 + 812);
  const sum = Object.values(s.parties).reduce((a, p) => a + p.totalCents, 0);
  assert.equal(sum, s.totalCents);
  assert.equal(s.parties.p2.totalCents, s.parties.p3.totalCents);
});

test('item percent / amount / shared items', () => {
  const allocations = [
    { id: 'a1', partyId: 'p1', itemId: 'pizza', mode: 'amount', value: 400 },
    { id: 'a2', partyId: 'p2', itemId: 'pizza', mode: 'percent', value: 50 },
    { id: 'a3', partyId: 'p3', itemId: 'pizza', mode: 'share', value: 1 },
    { id: 'a4', partyId: 'p4', itemId: 'pizza', mode: 'share', value: 1 },
  ];
  const s = computeSplit({ items, adjustments: [], parties, allocations });
  assert.equal(s.items.pizza.unassignedCents, 0);
  assert.equal(s.parties.p1.itemsCents, 400);
  assert.equal(s.parties.p2.itemsCents, 1200);
  assert.equal(s.parties.p3.itemsCents, 400);
  assert.equal(s.parties.p4.itemsCents, 400);
});

test('pool: fixed amount first, then percent of what remains', () => {
  const allocations = [
    { id: 'a1', partyId: 'p1', itemId: null, mode: 'amount', value: 2240 },
    { id: 'a2', partyId: 'p2', itemId: null, mode: 'percent', value: 25 },
  ];
  const s = computeSplit({ items, adjustments, parties, allocations });
  assert.equal(s.parties.p1.totalCents, 2240);
  assert.equal(s.parties.p2.totalCents, 2000);
  assert.equal(s.unassignedCents, 6000);
  assert.equal(s.isComplete, false);
});

test('checkAllocations rejects over-allocation', () => {
  const divvy = { items, adjustments, parties, allocations: [] };
  assert.equal(checkAllocations(divvy, [{ partyId: 'p1', itemId: null, mode: 'amount', value: 999999 }]).ok, false);
  assert.equal(checkAllocations(divvy, [{ partyId: 'p1', itemId: 'burger', mode: 'percent', value: 60 }]).ok, true);
  const d2 = { ...divvy, allocations: [{ id: 'x', partyId: 'p1', itemId: 'burger', mode: 'percent', value: 60 }] };
  assert.equal(checkAllocations(d2, [{ partyId: 'p2', itemId: 'burger', mode: 'percent', value: 50 }]).ok, false);
});

test('status transitions open → complete → closed', () => {
  const ps = [{ id: 'p1' }, { id: 'p2' }];
  const allocations = [
    { id: 'a', partyId: 'p1', itemId: null, mode: 'share', value: 1 },
    { id: 'b', partyId: 'p2', itemId: null, mode: 'share', value: 1 },
  ];
  const s0 = computeSplit({ items, adjustments, parties: ps, allocations: [] });
  assert.equal(deriveStatus(s0, ps), 'open');
  const s = computeSplit({ items, adjustments, parties: ps, allocations });
  assert.equal(deriveStatus(s, ps), 'complete');
  const paid = ps.map((p) => ({ ...p, paidAt: new Date() }));
  assert.equal(deriveStatus(s, paid), 'closed');
});

test('contact key = phone + email; validation', () => {
  assert.equal(contactKey({ phone: '(555) 123-4567', email: ' Ana@Mail.com ' }), '+15551234567|ana@mail.com');
  assert.notEqual(contactKey({ phone: '5551234567', email: 'a@x.com' }), contactKey({ phone: '5551234567', email: 'b@x.com' }));
  assert.deepEqual(validateContact({ name: 'Ana', email: 'ana@mail.com' }), {});
  assert.ok(validateContact({ name: 'Ana' }).email);
  assert.ok(validateContact({ email: 'ana@mail.com' }).name);
});

test('parser extracts items, adjustments and totals', () => {
  const text = `THE PIZZA BARN
123 Main St
10/09/2026 7:42 PM
2 Margherita Pizza 32.00
Caesar Salad 11.50
Garlic Knots 6.25
IPA Draft x2 14.00
Subtotal 63.75
Sales Tax 5.26
Service Charge 3.00
Total 72.01
VISA ****1234 72.01`;
  const r = parseReceiptText(text);
  assert.equal(r.merchant, 'THE PIZZA BARN');
  assert.equal(r.receiptDate, '2026-10-09');
  assert.equal(r.items.length, 4);
  assert.equal(r.items[0].quantity, 2);
  assert.equal(r.items[0].description, 'Margherita Pizza');
  assert.equal(r.items[3].quantity, 2);
  assert.equal(r.parsedSubtotalCents, 6375);
  assert.equal(r.parsedTotalCents, 7201);
  assert.deepEqual(r.adjustments.map((a) => a.kind), ['tax', 'fee']);
  assert.deepEqual(r.warnings, []);
});

test('sample scenario: party of 3 with bill of $128.00 and 6 items', () => {
  const threeParties = [
    { id: 'p1', name: 'Alex Rivera' },
    { id: 'p2', name: 'Jack and Jill' },
    { id: 'p3', name: 'Sam Taylor' },
  ];

  const sixItems = [
    { id: 'item_1', description: 'Calamari Fritti', priceCents: 1200 }, // $12.00
    { id: 'item_2', description: 'Truffle Tagliatelle', priceCents: 2400 }, // $24.00
    { id: 'item_3', description: 'Ribeye Steak', priceCents: 2000 }, // $20.00
    { id: 'item_4', description: 'Pan-Roasted Salmon', priceCents: 1800 }, // $18.00
    { id: 'item_5', description: 'Margherita Pizza', priceCents: 1600 }, // $16.00
    { id: 'item_6', description: 'Tiramisu', priceCents: 1000 }, // $10.00
  ];

  // Subtotal: 12 + 24 + 20 + 18 + 16 + 10 = $100.00 (10,000 cents)
  // Tax: $8.00 (800 cents), Tip / Misc: $20.00 (2000 cents)
  // Grand Total = $100 + $8 + $20 = $128.00 (12,800 cents)
  const adjustments = [
    { id: 'adj_tax', kind: 'tax', label: 'Tax', amountCents: 800 },
    { id: 'adj_tip', kind: 'tip', label: 'Tip / Misc', amountCents: 2000 },
  ];

  // Allocations following Simple View drag-to-split behavior:
  // Item 1 (Calamari $12): Split 3 ways (Alex, Jack and Jill, Sam) -> $4.00 each
  // Item 2 (Pasta $24): Alex (100% -> $24.00)
  // Item 3 (Steak $20): Jack and Jill (100% -> $20.00)
  // Item 4 (Salmon $18): Sam (100% -> $18.00)
  // Item 5 (Pizza $16): Split 2 ways (Alex & Jack and Jill) -> $8.00 each
  // Item 6 (Tiramisu $10): Split 2 ways (Jack and Jill & Sam) -> $5.00 each
  const allocations = [
    { id: 'a1_1', partyId: 'p1', itemId: 'item_1', mode: 'share', value: 1 },
    { id: 'a1_2', partyId: 'p2', itemId: 'item_1', mode: 'share', value: 1 },
    { id: 'a1_3', partyId: 'p3', itemId: 'item_1', mode: 'share', value: 1 },

    { id: 'a2_1', partyId: 'p1', itemId: 'item_2', mode: 'share', value: 1 },

    { id: 'a3_1', partyId: 'p2', itemId: 'item_3', mode: 'share', value: 1 },

    { id: 'a4_1', partyId: 'p3', itemId: 'item_4', mode: 'share', value: 1 },

    { id: 'a5_1', partyId: 'p1', itemId: 'item_5', mode: 'share', value: 1 },
    { id: 'a5_2', partyId: 'p2', itemId: 'item_5', mode: 'share', value: 1 },

    { id: 'a6_1', partyId: 'p2', itemId: 'item_6', mode: 'share', value: 1 },
    { id: 'a6_2', partyId: 'p3', itemId: 'item_6', mode: 'share', value: 1 },
  ];

  const split = computeSplit({
    items: sixItems,
    adjustments,
    parties: threeParties,
    allocations,
  });

  // Check 6 items & $128.00 grand total
  assert.equal(sixItems.length, 6);
  assert.equal(threeParties.length, 3);
  assert.equal(split.totalCents, 12800); // Exactly $128.00
  assert.equal(split.subtotalCents, 10000); // $100.00
  assert.equal(split.unassignedCents, 0); // All items assigned
  assert.equal(split.isComplete, true);

  // Check individual item splits:
  // Alex: $4 + $24 + $8 = $36.00 items
  assert.equal(split.parties.p1.itemsCents, 3600);
  // Proportional tax ($8.00) & tip ($20.00) = $28.00 total extras. Alex = 36% of 2800 = 1008 ($10.08)
  assert.equal(split.parties.p1.extrasCents, 1008);
  assert.equal(split.parties.p1.totalCents, 4608); // $46.08

  // Jack and Jill: $4 + $20 + $8 + $5 = $37.00 items
  assert.equal(split.parties.p2.itemsCents, 3700);
  // 37% of 2800 = 1036 ($10.36)
  assert.equal(split.parties.p2.extrasCents, 1036);
  assert.equal(split.parties.p2.totalCents, 4736); // $47.36

  // Sam: $4 + $18 + $5 = $27.00 items
  assert.equal(split.parties.p3.itemsCents, 2700);
  // 27% of 2800 = 756 ($7.56)
  assert.equal(split.parties.p3.extrasCents, 756);
  assert.equal(split.parties.p3.totalCents, 3456); // $34.56

  // Verify penny-perfect conservation: 4608 + 4736 + 3456 = 12800 ($128.00)
  const sumParties = Object.values(split.parties).reduce((sum, p) => sum + p.totalCents, 0);
  assert.equal(sumParties, 12800);

  // Status transitions
  assert.equal(deriveStatus(split, threeParties), 'complete');
  const allPaid = threeParties.map((p) => ({ ...p, paidAt: new Date().toISOString() }));
  assert.equal(deriveStatus(split, allPaid), 'closed');
});

