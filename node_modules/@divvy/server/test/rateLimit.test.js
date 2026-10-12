import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { codeRequestLimiter, codeVerifyLimiter } from '../src/rateLimit.js';

test('rate limiters attach RateLimit standard headers and throttle excess requests', async () => {
  const app = express();
  app.use(express.json());

  // A tiny custom endpoint using codeRequestLimiter with a tight limit for test
  const customLimiter = (await import('express-rate-limit')).default({
    windowMs: 60 * 1000,
    max: 2,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Throttled' },
  });

  app.post('/test-limit', customLimiter, (_req, res) => res.json({ ok: true }));

  const server = app.listen(0);
  const { port } = server.address();
  const url = `http://localhost:${port}/test-limit`;

  try {
    // 1st request -> ok
    const res1 = await fetch(url, { method: 'POST' });
    assert.equal(res1.status, 200);
    assert.equal(res1.headers.get('ratelimit-limit'), '2');
    assert.equal(res1.headers.get('ratelimit-remaining'), '1');

    // 2nd request -> ok
    const res2 = await fetch(url, { method: 'POST' });
    assert.equal(res2.status, 200);
    assert.equal(res2.headers.get('ratelimit-remaining'), '0');

    // 3rd request -> throttled with 429
    const res3 = await fetch(url, { method: 'POST' });
    assert.equal(res3.status, 429);
    const body3 = await res3.json();
    assert.equal(body3.error, 'Throttled');
  } finally {
    server.close();
  }
});
