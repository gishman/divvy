/**
 * Data access for contacts and divvys.
 */
import {
  contactKey, normalizeEmail, normalizePhone, computeSplit, deriveStatus, receiptFingerprint,
  PARTY_COLORS, normalizeAdjustmentAmount, ADJUSTMENT_KINDS,
} from '@divvy/shared';
import { query, pool } from './db.js';
import { HttpError } from './auth.js';

// ---------------------------------------------------------------- contacts

export function toContact(row, { nickname } = {}) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    nickname: nickname ?? row.nickname ?? null,
    email: row.email,
    phone: row.phone,
    isMember: !!row.verified_at,
    emailVerified: row.email_verified,
    phoneVerified: row.phone_verified,
    createdAt: row.created_at,
  };
}

export async function getContact(id, db = pool) {
  const { rows } = await db.query('SELECT * FROM contacts WHERE id = $1', [id]);
  return rows[0] || null;
}

/** Find a contact by its unique (phone|email) key, or create a non-member contact. */
export async function findOrCreateContact(db, { name, email, phone }, createdBy = null) {
  const e = normalizeEmail(email) || null;
  const p = normalizePhone(phone) || null;
  const key = contactKey({ email: e, phone: p });
  const existing = await db.query('SELECT * FROM contacts WHERE contact_key = $1', [key]);
  if (existing.rows[0]) return { row: existing.rows[0], created: false };
  const { rows } = await db.query(
    `INSERT INTO contacts (name, email, phone, contact_key, created_by)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (contact_key) DO UPDATE SET contact_key = EXCLUDED.contact_key
     RETURNING *`,
    [String(name).trim(), e, p, key, createdBy],
  );
  return { row: rows[0], created: true };
}

export async function linkContact(db, ownerId, contactId, nickname = null) {
  if (ownerId === contactId) return;
  await db.query(
    `INSERT INTO contact_links (owner_id, contact_id, nickname) VALUES ($1, $2, $3)
     ON CONFLICT (owner_id, contact_id) DO NOTHING`,
    [ownerId, contactId, nickname],
  );
}

// ---------------------------------------------------------------- divvys

function mapDivvy(row) {
  return {
    id: row.id,
    ownerId: row.owner_id,
    title: row.title,
    merchant: row.merchant,
    receiptDate: row.receipt_date,
    status: row.status,
    subtotalCents: row.subtotal_cents,
    totalCents: row.total_cents,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items: [],
    adjustments: [],
    parties: [],
    allocations: [],
  };
}

/** Load full divvy documents (receipt + parties + allocations) for the given ids. */
export async function loadDivvys(ids, db = pool) {
  if (!ids.length) return [];
  const [d, items, adj, parties, allocs] = await Promise.all([
    db.query('SELECT * FROM divvys WHERE id = ANY($1)', [ids]),
    db.query('SELECT * FROM receipt_items WHERE divvy_id = ANY($1) ORDER BY position, id', [ids]),
    db.query('SELECT * FROM receipt_adjustments WHERE divvy_id = ANY($1) ORDER BY position, id', [ids]),
    db.query(
      `SELECT dp.*, c.name, c.email, c.phone, c.verified_at
         FROM divvy_parties dp JOIN contacts c ON c.id = dp.contact_id
        WHERE dp.divvy_id = ANY($1) ORDER BY dp.created_at, dp.id`,
      [ids],
    ),
    db.query('SELECT * FROM allocations WHERE divvy_id = ANY($1) ORDER BY created_at, id', [ids]),
  ]);
  const byId = new Map(d.rows.map((r) => [r.id, mapDivvy(r)]));
  for (const r of items.rows) {
    byId.get(r.divvy_id)?.items.push({
      id: r.id, description: r.description, quantity: r.quantity, priceCents: r.price_cents,
    });
  }
  for (const r of adj.rows) {
    byId.get(r.divvy_id)?.adjustments.push({ id: r.id, kind: r.kind, label: r.label, amountCents: r.amount_cents });
  }
  for (const r of parties.rows) {
    byId.get(r.divvy_id)?.parties.push({
      id: r.id,
      contactId: r.contact_id,
      name: r.name,
      email: r.email,
      phone: r.phone,
      isMember: !!r.verified_at,
      color: r.color,
      paidAt: r.paid_at,
      addedBy: r.added_by,
    });
  }
  for (const r of allocs.rows) {
    byId.get(r.divvy_id)?.allocations.push({
      id: r.id, partyId: r.party_id, itemId: r.item_id, mode: r.mode, value: r.value, createdBy: r.created_by,
    });
  }
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

export async function loadDivvy(id, db = pool) {
  const [divvy] = await loadDivvys([id], db);
  if (!divvy) throw new HttpError(404, 'Divvy not found');
  return divvy;
}

/** Throws unless `userId` is a party on the divvy. */
export async function assertAccess(divvyId, userId, db = pool) {
  const { rows } = await db.query(
    'SELECT 1 FROM divvy_parties WHERE divvy_id = $1 AND contact_id = $2',
    [divvyId, userId],
  );
  if (!rows.length) throw new HttpError(404, 'Divvy not found');
}

/** Recompute totals + status after any change and bump updated_at. */
export async function refreshDivvy(db, divvyId) {
  const divvy = await loadDivvy(divvyId, db);
  const split = computeSplit(divvy);
  const status = deriveStatus(split, divvy.parties);
  await db.query(
    `UPDATE divvys SET status = $2, subtotal_cents = $3, total_cents = $4, fingerprint = $5, updated_at = now()
      WHERE id = $1`,
    [divvyId, status, split.subtotalCents, split.totalCents,
      receiptFingerprint({ totalCents: split.totalCents, receiptDate: divvy.receiptDate, merchant: divvy.merchant })],
  );
  return { ...divvy, status };
}

export function nextPartyColor(parties) {
  const used = new Set(parties.map((p) => p.color));
  return PARTY_COLORS.find((c) => !used.has(c)) || PARTY_COLORS[parties.length % PARTY_COLORS.length];
}

export async function addParty(db, divvyId, contactId, addedBy) {
  const { rows: existing } = await db.query(
    'SELECT * FROM divvy_parties WHERE divvy_id = $1', [divvyId],
  );
  const found = existing.find((p) => p.contact_id === contactId);
  if (found) return { row: found, created: false };
  const color = nextPartyColor(existing);
  const { rows } = await db.query(
    `INSERT INTO divvy_parties (divvy_id, contact_id, color, added_by) VALUES ($1, $2, $3, $4) RETURNING *`,
    [divvyId, contactId, color, addedBy],
  );
  return { row: rows[0], created: true };
}

// ---------------------------------------------------------------- receipt

const KINDS = new Set(ADJUSTMENT_KINDS.map((k) => k.kind));
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function sanitizeReceipt(body) {
  const items = (Array.isArray(body.items) ? body.items : []).slice(0, 300).map((i) => ({
    id: UUID_RE.test(i.id || '') ? i.id : null,
    description: String(i.description ?? '').slice(0, 120),
    quantity: Math.max(0, Math.min(9999, Number(i.quantity) || 1)),
    priceCents: Math.round(Number(i.priceCents) || 0),
  }));
  const adjustments = (Array.isArray(body.adjustments) ? body.adjustments : []).slice(0, 50).map((a) => {
    const kind = KINDS.has(a.kind) ? a.kind : 'misc';
    return {
      id: UUID_RE.test(a.id || '') ? a.id : null,
      kind,
      label: String(a.label ?? '').slice(0, 60),
      amountCents: normalizeAdjustmentAmount(kind, Number(a.amountCents) || 0),
    };
  });
  const receiptDate = /^\d{4}-\d{2}-\d{2}$/.test(body.receiptDate || '') ? body.receiptDate : null;
  return {
    title: String(body.title || '').trim().slice(0, 80),
    merchant: String(body.merchant || '').trim().slice(0, 80) || null,
    receiptDate,
    items,
    adjustments,
  };
}

/** Upsert items/adjustments by id; anything missing is deleted (allocations cascade). */
export async function saveReceipt(db, divvyId, receipt) {
  const { rows: curItems } = await db.query('SELECT id FROM receipt_items WHERE divvy_id = $1', [divvyId]);
  const keepItems = new Set();
  const existingItems = new Set(curItems.map((r) => r.id));
  for (const [position, item] of receipt.items.entries()) {
    if (item.id && existingItems.has(item.id)) {
      await db.query(
        'UPDATE receipt_items SET position=$2, description=$3, quantity=$4, price_cents=$5 WHERE id=$1',
        [item.id, position, item.description, item.quantity, item.priceCents],
      );
      keepItems.add(item.id);
    } else {
      const { rows } = await db.query(
        `INSERT INTO receipt_items (divvy_id, position, description, quantity, price_cents)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [divvyId, position, item.description, item.quantity, item.priceCents],
      );
      keepItems.add(rows[0].id);
    }
  }
  await db.query('DELETE FROM receipt_items WHERE divvy_id = $1 AND NOT (id = ANY($2))', [divvyId, [...keepItems]]);

  // Adjustments have no dependents, so simply replace them.
  await db.query('DELETE FROM receipt_adjustments WHERE divvy_id = $1', [divvyId]);
  for (const [position, a] of receipt.adjustments.entries()) {
    await db.query(
      `INSERT INTO receipt_adjustments (divvy_id, position, kind, label, amount_cents) VALUES ($1,$2,$3,$4,$5)`,
      [divvyId, position, a.kind, a.label, a.amountCents],
    );
  }
}

export { query };
