import jwt from 'jsonwebtoken';
import { config } from './config.js';

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export function signToken(contactId) {
  return jwt.sign({ sub: contactId }, config.jwtSecret, { expiresIn: '60d' });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, config.jwtSecret).sub;
  } catch {
    return null;
  }
}

/** Express middleware: requires `Authorization: Bearer <token>`; sets req.userId. */
export function requireAuth(req, _res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const id = token && verifyToken(token);
  if (!id) return next(new HttpError(401, 'Please sign in'));
  req.userId = id;
  next();
}
