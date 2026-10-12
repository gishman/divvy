import rateLimit from 'express-rate-limit';
import { config } from './config.js';

/**
 * Rate limiter for requesting verification codes (register & login).
 * Prevents SMS/email flooding and brute-force registration.
 */
export const codeRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: config.isProd ? 10 : 100, // 10 code requests per 15 mins in prod; generous in dev
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many verification requests from this IP. Please wait a few minutes before trying again.' },
});

/**
 * Rate limiter for code submissions (verify).
 * Protects against brute-forcing 6-digit OTP codes.
 */
export const codeVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: config.isProd ? 20 : 200, // 20 attempts per 15 mins in prod
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many verification attempts from this IP. Please wait a few minutes before trying again.' },
});

/**
 * General API limiter for sensitive write endpoints.
 */
export const generalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.isProd ? 300 : 3000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
});
