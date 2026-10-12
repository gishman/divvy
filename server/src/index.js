import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { migrate } from './migrate.js';
import { requireAuth, HttpError } from './auth.js';
import { initRealtime } from './realtime.js';
import { generalApiLimiter } from './rateLimit.js';
import authRoutes from './routes/auth.js';
import contactRoutes from './routes/contacts.js';
import divvyRoutes from './routes/divvys.js';
import ocrRoutes from './routes/ocr.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(cors({ origin: config.clientOrigins, credentials: true }));
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api', generalApiLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/contacts', requireAuth, contactRoutes);
app.use('/api/divvys', requireAuth, divvyRoutes);
app.use('/api/ocr', requireAuth, ocrRoutes);
app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found')));

// Serve the built client in production (npm run build → client/dist).
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.use((req, res, next) => (req.method === 'GET' ? res.sendFile(path.join(dist, 'index.html')) : next()));
}

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  const status = err.status || (err.type === 'entity.parse.failed' ? 400 : 500);
  if (status >= 500) console.error('[error]', err);
  res.status(status).json({ error: status >= 500 ? 'Something went wrong' : err.message, ...(err.extra || {}) });
});

const server = http.createServer(app);
initRealtime(server, config.clientOrigins);

try {
  await migrate();
} catch (err) {
  console.error(`\n[db] Could not connect/migrate using DATABASE_URL.\n     ${err.message}\n` +
    '     Check server/.env (see .env.example) and that PostgreSQL is running.\n');
  process.exit(1);
}

server.listen(config.port, () => {
  console.log(`[divvy] API + realtime listening on http://localhost:${config.port}`);
});
