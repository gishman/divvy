/**
 * Registration & sign-in via one-time codes (email or SMS).
 *
 * Registration creates (or claims) a contact record — your contact record IS
 * your account. Sign-in sends a code to an email/phone already verified on a
 * member's contact record. Because several contacts may share one phone (or
 * email), a successful sign-in can return multiple profiles to choose from.
 */
import crypto from 'node:crypto';
import { Router } from 'express';
import {
  validateContact, contactKey, normalizeEmail, normalizePhone, identifierType, maskEmail, maskPhone,
} from '@divvy/shared';
import { query, tx } from '../db.js';
import { HttpError, requireAuth, signToken } from '../auth.js';
import { config } from '../config.js';
import { sendVerificationCode, isConsoleDelivery } from '../notify.js';
import { toContact, getContact } from '../repo.js';
import { codeRequestLimiter, codeVerifyLimiter } from '../rateLimit.js';

const router = Router();
const CODE_TTL_MIN = 10;
const MAX_ATTEMPTS = 5;
const RESEND_SECONDS = 20;

const hashCode = (destination, code) =>
  crypto.createHmac('sha256', config.jwtSecret).update(`${destination}:${code}`).digest('hex');

async function issueCode({ purpose, contactId, channel, destination }) {
  const recent = await query(
    `SELECT 1 FROM verifications WHERE destination = $1 AND created_at > now() - ($2 || ' seconds')::interval`,
    [destination, RESEND_SECONDS],
  );
  if (recent.rows.length) throw new HttpError(429, `Please wait ${RESEND_SECONDS} seconds before requesting another code`);

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const { rows } = await query(
    `INSERT INTO verifications (purpose, contact_id, channel, destination, code_hash, expires_at)
     VALUES ($1, $2, $3, $4, $5, now() + interval '${CODE_TTL_MIN} minutes') RETURNING id`,
    [purpose, contactId, channel, destination, hashCode(destination, code)],
  );
  await sendVerificationCode(channel, destination, code);
  return {
    verificationId: rows[0].id,
    channel,
    sentTo: channel === 'email' ? maskEmail(destination) : maskPhone(destination),
    // Convenience for local development only (console delivery, non-production).
    devCode: !config.isProd && isConsoleDelivery(channel) ? code : undefined,
  };
}

router.post('/register', codeRequestLimiter, async (req, res) => {
  const { name, email, phone } = req.body || {};
  const errors = validateContact({ name, email, phone });
  if (Object.keys(errors).length) throw new HttpError(400, 'Please fix the highlighted fields', { fields: errors });

  const e = normalizeEmail(email) || null;
  const p = normalizePhone(phone) || null;
  const channel = req.body.channel === 'sms' && p ? 'sms' : e ? 'email' : 'sms';
  const key = contactKey({ email: e, phone: p });

  const contact = await tx(async (db) => {
    const existing = await db.query('SELECT * FROM contacts WHERE contact_key = $1 FOR UPDATE', [key]);
    const row = existing.rows[0];
    if (row?.verified_at) {
      throw new HttpError(409, 'An account with this email/phone already exists — sign in instead', { code: 'EXISTS' });
    }
    if (row) {
      // Someone added this person as a contact earlier — they now claim the record.
      const { rows } = await db.query('UPDATE contacts SET name=$2, updated_at=now() WHERE id=$1 RETURNING *', [row.id, name.trim()]);
      return rows[0];
    }
    const { rows } = await db.query(
      'INSERT INTO contacts (name, email, phone, contact_key) VALUES ($1,$2,$3,$4) RETURNING *',
      [name.trim(), e, p, key],
    );
    return rows[0];
  });

  const result = await issueCode({
    purpose: 'register', contactId: contact.id, channel, destination: channel === 'sms' ? p : e,
  });
  res.json(result);
});

router.post('/login', codeRequestLimiter, async (req, res) => {
  const identifier = String(req.body?.identifier || '').trim();
  const type = identifierType(identifier);
  if (!type) throw new HttpError(400, 'Enter the email or phone number you registered with');
  const destination = type === 'email' ? normalizeEmail(identifier) : normalizePhone(identifier);
  const column = type === 'email' ? 'email' : 'phone';
  const { rows } = await query(`SELECT id FROM contacts WHERE ${column} = $1 AND verified_at IS NOT NULL`, [destination]);
  if (!rows.length) throw new HttpError(404, 'No divvy account found — create one instead', { code: 'NO_ACCOUNT' });
  res.json(await issueCode({ purpose: 'login', contactId: null, channel: type === 'email' ? 'email' : 'sms', destination }));
});

router.post('/verify', codeVerifyLimiter, async (req, res) => {
  const { verificationId, code, contactId } = req.body || {};
  const { rows } = await query('SELECT * FROM verifications WHERE id = $1', [verificationId]);
  const v = rows[0];
  if (!v || v.consumed_at) throw new HttpError(400, 'This code is no longer valid — request a new one');
  if (new Date(v.expires_at) < new Date()) throw new HttpError(400, 'This code has expired — request a new one');
  if (v.attempts >= MAX_ATTEMPTS) throw new HttpError(429, 'Too many attempts — request a new code');

  const ok = crypto.timingSafeEqual(Buffer.from(hashCode(v.destination, String(code || '').trim())), Buffer.from(v.code_hash));
  if (!ok) {
    await query('UPDATE verifications SET attempts = attempts + 1 WHERE id = $1', [v.id]);
    throw new HttpError(400, 'That code is not right — check and try again');
  }

  const verifiedCol = v.channel === 'email' ? 'email_verified' : 'phone_verified';
  let userId;
  if (v.purpose === 'register') {
    userId = v.contact_id;
  } else {
    const column = v.channel === 'email' ? 'email' : 'phone';
    const { rows: candidates } = await query(
      `SELECT * FROM contacts WHERE ${column} = $1 AND verified_at IS NOT NULL ORDER BY name`, [v.destination],
    );
    if (candidates.length > 1 && !candidates.some((c) => c.id === contactId)) {
      // Shared phone/email: let the user pick which profile is theirs (code stays valid).
      return res.json({ choices: candidates.map((c) => ({ id: c.id, name: c.name, email: maskEmail(c.email), phone: maskPhone(c.phone) })) });
    }
    userId = candidates.length > 1 ? contactId : candidates[0]?.id;
    if (!userId) throw new HttpError(404, 'No account found');
  }

  await query('UPDATE verifications SET consumed_at = now() WHERE id = $1', [v.id]);
  const { rows: users } = await query(
    `UPDATE contacts SET verified_at = COALESCE(verified_at, now()), ${verifiedCol} = true, updated_at = now()
      WHERE id = $1 RETURNING *`,
    [userId],
  );
  res.json({ token: signToken(userId), user: toContact(users[0]) });
});

router.get('/me', requireAuth, async (req, res) => {
  const row = await getContact(req.userId);
  if (!row || !row.verified_at) throw new HttpError(401, 'Please sign in');
  res.json({ user: toContact(row) });
});

router.patch('/me', requireAuth, async (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) throw new HttpError(400, 'Name is required');
  const { rows } = await query('UPDATE contacts SET name=$2, updated_at=now() WHERE id=$1 RETURNING *', [req.userId, name.slice(0, 80)]);
  res.json({ user: toContact(rows[0]) });
});

export default router;
