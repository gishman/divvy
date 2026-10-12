/**
 * Address book management.
 */
import { Router } from 'express';
import {
  validateContact, contactKey, normalizeEmail, normalizePhone, identifierType, maskEmail, maskPhone,
} from '@divvy/shared';
import { query, tx } from '../db.js';
import { HttpError } from '../auth.js';
import { findOrCreateContact, linkContact, toContact } from '../repo.js';

const router = Router();

const LIST_SQL = `
  SELECT c.*, l.nickname,
         (SELECT count(*) FROM divvy_parties a JOIN divvy_parties b ON a.divvy_id = b.divvy_id
           WHERE a.contact_id = $1 AND b.contact_id = c.id)::int AS shared_divvys
    FROM contact_links l JOIN contacts c ON c.id = l.contact_id
   WHERE l.owner_id = $1`;

router.get('/', async (req, res) => {
  const { rows } = await query(`${LIST_SQL} ORDER BY lower(coalesce(l.nickname, c.name))`, [req.userId]);
  res.json({ contacts: rows.map((r) => ({ ...toContact(r), sharedDivvys: r.shared_divvys })) });
});

/** Exact-match lookup for existing contacts/members by email or phone (privacy: masked results). */
router.get('/lookup', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const type = identifierType(q);
  if (!type) return res.json({ matches: [] });
  const value = type === 'email' ? normalizeEmail(q) : normalizePhone(q);
  const { rows } = await query(
    `SELECT * FROM contacts WHERE ${type === 'email' ? 'email' : 'phone'} = $1 AND id <> $2
      ORDER BY verified_at IS NULL, name LIMIT 10`,
    [value, req.userId],
  );
  res.json({
    matches: rows.map((r) => ({
      id: r.id,
      name: r.name,
      isMember: !!r.verified_at,
      email: type === 'email' ? r.email : maskEmail(r.email),
      phone: type === 'phone' ? r.phone : maskPhone(r.phone),
    })),
  });
});

router.post('/', async (req, res) => {
  const { name, email, phone, contactId } = req.body || {};
  const contact = await tx(async (db) => {
    let row;
    if (contactId) {
      ({ rows: [row] } = await db.query('SELECT * FROM contacts WHERE id = $1', [contactId]));
      if (!row) throw new HttpError(404, 'Contact not found');
    } else {
      const errors = validateContact({ name, email, phone });
      if (Object.keys(errors).length) throw new HttpError(400, 'Please fix the highlighted fields', { fields: errors });
      ({ row } = await findOrCreateContact(db, { name, email, phone }, req.userId));
    }
    if (row.id === req.userId) throw new HttpError(400, "That's you!");
    await linkContact(db, req.userId, row.id, name?.trim() && name.trim() !== row.name ? name.trim() : null);
    const { rows } = await db.query(`${LIST_SQL} AND c.id = $2`, [req.userId, row.id]);
    return rows[0];
  });
  res.status(201).json({ contact: toContact(contact) });
});

router.put('/:id', async (req, res) => {
  const { name, email, phone } = req.body || {};
  const updated = await tx(async (db) => {
    const { rows: [row] } = await db.query(
      `SELECT c.* FROM contact_links l JOIN contacts c ON c.id = l.contact_id WHERE l.owner_id = $1 AND c.id = $2`,
      [req.userId, req.params.id],
    );
    if (!row) throw new HttpError(404, 'Contact not found');

    // Members own their own record; others may only rename them in their address book.
    const canEditRecord = !row.verified_at && row.created_by === req.userId;
    if (canEditRecord) {
      const errors = validateContact({ name, email, phone });
      if (Object.keys(errors).length) throw new HttpError(400, 'Please fix the highlighted fields', { fields: errors });
      const key = contactKey({ email, phone });
      const clash = await db.query('SELECT id FROM contacts WHERE contact_key = $1 AND id <> $2', [key, row.id]);
      if (clash.rows.length) throw new HttpError(409, 'Another contact already has this email + phone combination');
      await db.query(
        'UPDATE contacts SET name=$2, email=$3, phone=$4, contact_key=$5, updated_at=now() WHERE id=$1',
        [row.id, name.trim(), normalizeEmail(email) || null, normalizePhone(phone) || null, key],
      );
      await db.query('UPDATE contact_links SET nickname = NULL WHERE owner_id=$1 AND contact_id=$2', [req.userId, row.id]);
    } else if (name?.trim()) {
      await db.query('UPDATE contact_links SET nickname = $3 WHERE owner_id=$1 AND contact_id=$2',
        [req.userId, row.id, name.trim() === row.name ? null : name.trim()]);
    }
    const { rows } = await db.query(`${LIST_SQL} AND c.id = $2`, [req.userId, row.id]);
    return rows[0];
  });
  res.json({ contact: toContact(updated) });
});

router.delete('/:id', async (req, res) => {
  await query('DELETE FROM contact_links WHERE owner_id = $1 AND contact_id = $2', [req.userId, req.params.id]);
  res.status(204).end();
});

export default router;
