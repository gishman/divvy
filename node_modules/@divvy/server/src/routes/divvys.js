/**
 * Divvy API: receipts, parties, allocations, payment status, duplicate detection.
 * Every mutation recomputes status with the shared split engine and pushes the
 * fresh document to everyone viewing it (Socket.IO).
 */
import { Router } from 'express';
import {
  computeSplit, checkAllocations, computeReceiptTotals, validateContact,
  isValidEmail, isValidPhone, normalizeEmail, normalizePhone, contactKey, ALLOCATION_MODES,
} from '@divvy/shared';
import { query, tx } from '../db.js';
import { HttpError } from '../auth.js';
import {
  loadDivvys, loadDivvy, assertAccess, refreshDivvy, sanitizeReceipt, saveReceipt,
  findOrCreateContact, linkContact, addParty,
} from '../repo.js';
import { emitDivvyUpdated, emitDivvyDeleted, emitToUser } from '../realtime.js';

const router = Router();

function summarize(divvy, userId) {
  const split = computeSplit(divvy);
  const me = divvy.parties.find((p) => p.contactId === userId);
  return {
    id: divvy.id,
    ownerId: divvy.ownerId,
    title: divvy.title,
    merchant: divvy.merchant,
    receiptDate: divvy.receiptDate,
    status: divvy.status,
    totalCents: split.totalCents,
    unassignedCents: split.unassignedCents,
    myShareCents: me ? split.parties[me.id]?.totalCents || 0 : 0,
    myPaid: !!me?.paidAt,
    itemCount: divvy.items.length,
    parties: divvy.parties.map((p) => ({ id: p.id, contactId: p.contactId, name: p.name, color: p.color, paid: !!p.paidAt })),
    createdAt: divvy.createdAt,
    updatedAt: divvy.updatedAt,
  };
}

/** Run a mutation in a transaction (divvy row locked), then refresh + broadcast. */
async function mutate(req, res, fn, { reason, status = 200 } = {}) {
  const { id } = req.params;
  await assertAccess(id, req.userId);
  const divvy = await tx(async (db) => {
    await db.query('SELECT id FROM divvys WHERE id = $1 FOR UPDATE', [id]);
    await fn(db, id);
    return refreshDivvy(db, id);
  });
  const fresh = await loadDivvy(id);
  emitDivvyUpdated(fresh, { actorId: req.userId, reason });
  res.status(status).json({ divvy: fresh });
  return divvy;
}

// ------------------------------------------------------------------ list

router.get('/', async (req, res) => {
  const { rows } = await query(
    `SELECT d.id FROM divvys d JOIN divvy_parties p ON p.divvy_id = d.id
      WHERE p.contact_id = $1 ORDER BY d.updated_at DESC LIMIT 200`,
    [req.userId],
  );
  const divvys = await loadDivvys(rows.map((r) => r.id));
  res.json({ divvys: divvys.map((d) => summarize(d, req.userId)) });
});

// ------------------------------------------------------------------ create

/**
 * "One divvy per event": look for a divvy with the same total (and same date
 * when known) that is either shared with me or owned by someone I'm connected to.
 */
async function findDuplicates(userId, { totalCents, receiptDate }) {
  if (!totalCents) return [];
  const { rows } = await query(
    `SELECT DISTINCT d.id, d.title, d.merchant, d.receipt_date, d.total_cents, d.created_at, o.name AS owner_name,
            EXISTS (SELECT 1 FROM divvy_parties x WHERE x.divvy_id = d.id AND x.contact_id = $1) AS is_party
       FROM divvys d JOIN contacts o ON o.id = d.owner_id
      WHERE d.total_cents = $2
        AND (($3::date IS NOT NULL AND d.receipt_date = $3::date)
             OR d.created_at > now() - interval '36 hours')
        AND (
          EXISTS (SELECT 1 FROM divvy_parties x WHERE x.divvy_id = d.id AND x.contact_id = $1)
          OR EXISTS (SELECT 1 FROM contact_links l WHERE (l.owner_id = $1 AND l.contact_id = d.owner_id)
                                                     OR (l.owner_id = d.owner_id AND l.contact_id = $1))
        )
      ORDER BY d.created_at DESC LIMIT 5`,
    [userId, totalCents, receiptDate],
  );
  return rows.map((r) => ({
    id: r.id, title: r.title, merchant: r.merchant, receiptDate: r.receipt_date,
    totalCents: r.total_cents, ownerName: r.owner_name, isParty: r.is_party, createdAt: r.created_at,
  }));
}

router.post('/', async (req, res) => {
  const receipt = sanitizeReceipt(req.body || {});
  const { subtotalCents, totalCents } = computeReceiptTotals(receipt);
  if (!req.body?.force) {
    const duplicates = await findDuplicates(req.userId, { totalCents, receiptDate: receipt.receiptDate });
    if (duplicates.length) {
      throw new HttpError(409, 'Looks like this receipt is already being divvied', { code: 'DUPLICATE', duplicates });
    }
  }
  const title = receipt.title || receipt.merchant || 'New divvy';
  const id = await tx(async (db) => {
    const { rows } = await db.query(
      `INSERT INTO divvys (owner_id, title, merchant, receipt_date, subtotal_cents, total_cents, ocr_text)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [req.userId, title, receipt.merchant, receipt.receiptDate, subtotalCents, totalCents,
        typeof req.body.ocrText === 'string' ? req.body.ocrText.slice(0, 20000) : null],
    );
    const divvyId = rows[0].id;
    await saveReceipt(db, divvyId, receipt);
    await addParty(db, divvyId, req.userId, req.userId);
    const { row: secondContact } = await findOrCreateContact(db, { name: 'Party 2' }, req.userId);
    await addParty(db, divvyId, secondContact.id, req.userId);
    await refreshDivvy(db, divvyId);
    return divvyId;
  });
  res.status(201).json({ divvy: await loadDivvy(id) });
});

/** Join an existing divvy found by duplicate detection (must be connected to its owner). */
router.post('/:id/join', async (req, res) => {
  const { id } = req.params;
  const { rows } = await query(
    `SELECT d.id FROM divvys d WHERE d.id = $1 AND (
        EXISTS (SELECT 1 FROM divvy_parties x WHERE x.divvy_id = d.id AND x.contact_id = $2)
        OR EXISTS (SELECT 1 FROM contact_links l WHERE (l.owner_id = $2 AND l.contact_id = d.owner_id)
                                                   OR (l.owner_id = d.owner_id AND l.contact_id = $2)))`,
    [id, req.userId],
  );
  if (!rows.length) throw new HttpError(404, 'Divvy not found');
  await tx(async (db) => {
    await addParty(db, id, req.userId, req.userId);
    await refreshDivvy(db, id);
  });
  const fresh = await loadDivvy(id);
  emitDivvyUpdated(fresh, { actorId: req.userId, reason: 'party-joined' });
  res.json({ divvy: fresh });
});

// ------------------------------------------------------------------ read / update / delete

router.get('/:id', async (req, res) => {
  await assertAccess(req.params.id, req.userId);
  res.json({ divvy: await loadDivvy(req.params.id) });
});

router.put('/:id/receipt', (req, res) => mutate(req, res, async (db, id) => {
  const receipt = sanitizeReceipt(req.body || {});
  await db.query(
    'UPDATE divvys SET title = COALESCE(NULLIF($2, \'\'), title), merchant = $3, receipt_date = $4 WHERE id = $1',
    [id, receipt.title, receipt.merchant, receipt.receiptDate],
  );
  await saveReceipt(db, id, receipt);
}, { reason: 'receipt' }));

router.delete('/:id', async (req, res) => {
  const divvy = await loadDivvy(req.params.id).catch(() => null);
  if (!divvy || !divvy.parties.some((p) => p.contactId === req.userId)) throw new HttpError(404, 'Divvy not found');
  if (divvy.ownerId !== req.userId) throw new HttpError(403, 'Only the person who created this divvy can delete it');
  await query('DELETE FROM divvys WHERE id = $1', [divvy.id]);
  emitDivvyDeleted(divvy.id, divvy.parties.map((p) => p.contactId));
  res.status(204).end();
});

// ------------------------------------------------------------------ parties

router.post('/:id/parties', (req, res) => mutate(req, res, async (db, id) => {
  const { contactId, name, email, phone } = req.body || {};
  let contact;
  if (contactId) {
    ({ rows: [contact] } = await db.query('SELECT * FROM contacts WHERE id = $1', [contactId]));
    if (!contact) throw new HttpError(404, 'Contact not found');
  } else {
    const errors = {};
    if (!name || !String(name).trim()) errors.name = 'Name is required';
    const hasEmail = !!(email && String(email).trim());
    const hasPhone = !!(phone && String(phone).trim());
    if (hasEmail && !isValidEmail(email)) errors.email = 'Enter a valid email';
    if (hasPhone && !isValidPhone(phone)) errors.phone = 'Enter a valid phone number';
    if (Object.keys(errors).length) throw new HttpError(400, 'Please fix the highlighted fields', { fields: errors });
    ({ row: contact } = await findOrCreateContact(db, { name, email, phone }, req.userId));
  }
  const { created } = await addParty(db, id, contact.id, req.userId);
  if (!created) throw new HttpError(409, `${contact.name} is already on this divvy`);
  if (email || phone) await linkContact(db, req.userId, contact.id);
  // Members see the shared divvy immediately.
  if (contact.verified_at) emitToUser(contact.id, 'divvy:invited', { divvyId: id });
}, { reason: 'party-added', status: 201 }));

router.delete('/:id/parties/:partyId', (req, res) => mutate(req, res, async (db, id) => {
  const { rows: [party] } = await db.query('SELECT * FROM divvy_parties WHERE id = $1 AND divvy_id = $2', [req.params.partyId, id]);
  if (!party) throw new HttpError(404, 'Party not found');
  const { rows: [d] } = await db.query('SELECT owner_id FROM divvys WHERE id = $1', [id]);
  if (party.contact_id === d.owner_id) throw new HttpError(400, "The divvy's creator can't be removed");
  await db.query('DELETE FROM divvy_parties WHERE id = $1', [party.id]);
}, { reason: 'party-removed' }));

router.patch('/:id/parties/:partyId', (req, res) => mutate(req, res, async (db, id) => {
  const { rows: [party] } = await db.query('SELECT * FROM divvy_parties WHERE id = $1 AND divvy_id = $2', [req.params.partyId, id]);
  if (!party) throw new HttpError(404, 'Party not found');

  if (req.body?.paid !== undefined) {
    const paid = !!req.body.paid;
    await db.query(
      `UPDATE divvy_parties SET paid_at = ${paid ? 'now()' : 'NULL'} WHERE id = $1 AND divvy_id = $2`,
      [req.params.partyId, id],
    );
  }

  if (req.body?.name !== undefined || req.body?.email !== undefined || req.body?.phone !== undefined) {
    const { rows: [curContact] } = await db.query('SELECT * FROM contacts WHERE id = $1', [party.contact_id]);
    if (curContact) {
      const nextName = req.body.name !== undefined ? String(req.body.name || '').trim() || curContact.name : curContact.name;
      const curIsGuest = curContact.email && String(curContact.email).endsWith('@guest.divvy.local');
      const nextEmailRaw = req.body.email !== undefined ? req.body.email : (curIsGuest ? null : curContact.email);
      const nextPhoneRaw = req.body.phone !== undefined ? req.body.phone : curContact.phone;
      const e = normalizeEmail(nextEmailRaw) || null;
      const p = normalizePhone(nextPhoneRaw) || null;
      const finalEmail = e || (p ? null : (curIsGuest ? curContact.email : `guest-${party.contact_id}@guest.divvy.local`));
      const nextKey = contactKey({ email: finalEmail, phone: p });

      await db.query(
        `UPDATE contacts SET name = $2, email = $3, phone = $4, contact_key = $5, updated_at = now() WHERE id = $1`,
        [curContact.id, nextName, finalEmail, p, nextKey],
      );
    }
  }
}, { reason: 'party-updated' }));

// ------------------------------------------------------------------ allocations

/**
 * Add allocations. Each (party, item) pair — or (party, remaining pool) — holds
 * at most one allocation, so re-assigning replaces the previous one.
 * Also supports `replaceItemId` to atomically replace all allocations for an item.
 */
router.post('/:id/allocations', (req, res) => mutate(req, res, async (db, id) => {
  const incoming = Array.isArray(req.body?.allocations) ? req.body.allocations.slice(0, 200) : [];
  const replaceItemId = req.body?.replaceItemId || null;
  if (!incoming.length && !replaceItemId) throw new HttpError(400, 'Nothing to assign');
  const divvy = await loadDivvy(id, db);
  const partyIds = new Set(divvy.parties.map((p) => p.id));
  const itemIds = new Set(divvy.items.map((i) => i.id));

  const clean = incoming.map((a) => {
    if (!partyIds.has(a.partyId)) throw new HttpError(400, 'Unknown party');
    if (a.itemId && !itemIds.has(a.itemId)) throw new HttpError(400, 'Unknown item');
    if (!ALLOCATION_MODES.includes(a.mode)) throw new HttpError(400, 'Unknown split type');
    const value = a.mode === 'amount' ? Math.round(Number(a.value)) : Number(a.value);
    return { partyId: a.partyId, itemId: a.itemId || null, mode: a.mode, value };
  });

  if (replaceItemId) {
    await db.query('DELETE FROM allocations WHERE divvy_id = $1 AND item_id = $2', [id, replaceItemId]);
    for (const a of clean) {
      await db.query(
        'INSERT INTO allocations (divvy_id, party_id, item_id, mode, value, created_by) VALUES ($1,$2,$3,$4,$5,$6)',
        [id, a.partyId, a.itemId, a.mode, a.value, req.userId],
      );
    }
    return;
  }

  const replacedKey = (a) => `${a.partyId}:${a.itemId || 'pool'}`;
  const replacing = new Set(clean.map(replacedKey));
  const kept = divvy.allocations.filter((a) => !replacing.has(replacedKey(a)));
  const check = checkAllocations({ ...divvy, allocations: kept }, clean);
  if (!check.ok) throw new HttpError(400, check.errors[0]?.message || 'That would assign more than is left', { errors: check.errors });

  const toDelete = divvy.allocations.filter((a) => replacing.has(replacedKey(a))).map((a) => a.id);
  if (toDelete.length) await db.query('DELETE FROM allocations WHERE id = ANY($1)', [toDelete]);
  for (const a of clean) {
    await db.query(
      'INSERT INTO allocations (divvy_id, party_id, item_id, mode, value, created_by) VALUES ($1,$2,$3,$4,$5,$6)',
      [id, a.partyId, a.itemId, a.mode, a.value, req.userId],
    );
  }
}, { reason: 'allocation', status: 201 }));

router.delete('/:id/allocations/:allocationId', (req, res) => mutate(req, res, async (db, id) => {
  await db.query('DELETE FROM allocations WHERE id = $1 AND divvy_id = $2', [req.params.allocationId, id]);
}, { reason: 'allocation' }));

/** Bulk clear: by party, by item, or everything ({ all: true }). */
router.post('/:id/allocations/clear', (req, res) => mutate(req, res, async (db, id) => {
  const { partyId, itemId, all } = req.body || {};
  if (all) return db.query('DELETE FROM allocations WHERE divvy_id = $1', [id]);
  if (!partyId && !itemId) throw new HttpError(400, 'Specify what to clear');
  const conds = ['divvy_id = $1'];
  const params = [id];
  if (partyId) { params.push(partyId); conds.push(`party_id = $${params.length}`); }
  if (itemId) { params.push(itemId); conds.push(`item_id = $${params.length}`); }
  await db.query(`DELETE FROM allocations WHERE ${conds.join(' AND ')}`, params);
}, { reason: 'allocation' }));

export default router;
