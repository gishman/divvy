/**
 * Contact identity rules.
 *
 * A contact's unique key is its normalized phone and email concatenated.
 * That means many contacts may share a phone number as long as their emails
 * differ (and vice-versa) — e.g. a family sharing one phone.
 */

export function normalizeEmail(email) {
  if (!email) return '';
  return String(email).trim().toLowerCase();
}

/**
 * Normalize to E.164-ish "+<digits>". 10-digit numbers are assumed to be US/CA.
 */
export function normalizePhone(phone) {
  if (!phone) return '';
  const raw = String(phone).trim();
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (raw.startsWith('+')) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+${digits}`;
}

/** The unique key: phone + "|" + email (either side may be empty, never both). */
export function contactKey({ email, phone }) {
  return `${normalizePhone(phone)}|${normalizeEmail(email)}`;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(email) {
  return EMAIL_RE.test(normalizeEmail(email));
}

export function isValidPhone(phone) {
  const n = normalizePhone(phone);
  return n.length >= 9 && n.length <= 16;
}

/**
 * Validate a contact record: requires a name and at least one of email/phone.
 * @returns {Record<string,string>} field → message (empty object when valid)
 */
export function validateContact({ name, email, phone }) {
  const errors = {};
  if (!name || !String(name).trim()) errors.name = 'Name is required';
  const hasEmail = !!(email && String(email).trim());
  const hasPhone = !!(phone && String(phone).trim());
  if (!hasEmail && !hasPhone) {
    errors.email = 'Provide an email or a phone number';
    errors.phone = 'Provide an email or a phone number';
  }
  if (hasEmail && !isValidEmail(email)) errors.email = 'Enter a valid email';
  if (hasPhone && !isValidPhone(phone)) errors.phone = 'Enter a valid phone number';
  return errors;
}

/** Looks like an email? Used for single "email or phone" sign-in field. */
export function identifierType(value) {
  const v = String(value || '').trim();
  if (v.includes('@')) return 'email';
  if (/\d{7,}/.test(v.replace(/\D/g, ''))) return 'phone';
  return null;
}

export function maskEmail(email) {
  const e = normalizeEmail(email);
  if (!e) return '';
  const [user, domain] = e.split('@');
  return `${user.slice(0, 2)}${'•'.repeat(Math.max(1, user.length - 2))}@${domain}`;
}

export function maskPhone(phone) {
  const p = normalizePhone(phone);
  if (!p) return '';
  return `•••• ${p.slice(-4)}`;
}

/** Pretty-print a normalized phone (US format when possible). */
export function formatPhone(phone) {
  const p = normalizePhone(phone);
  const m = p.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : p;
}

export function initials(name) {
  return String(name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() || '')
    .join('') || '?';
}
