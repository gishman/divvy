/**
 * Server-side OCR fallback for browsers without Web Worker / WebAssembly support
 * (or when local OCR fails). Uses the same tesseract.js engine + shared parser.
 */
import { Router } from 'express';
import multer from 'multer';
import { createWorker } from 'tesseract.js';
import { parseReceiptText } from '@divvy/shared';
import { HttpError } from '../auth.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, /^image\//.test(file.mimetype)),
});

let workerPromise;
let queue = Promise.resolve();

function getWorker() {
  if (!workerPromise) {
    workerPromise = createWorker('eng').catch((err) => {
      workerPromise = null;
      throw err;
    });
  }
  return workerPromise;
}

const router = Router();

router.post('/', upload.single('image'), async (req, res) => {
  if (!req.file) throw new HttpError(400, 'Upload a receipt image (JPG/PNG)');
  // Serialize jobs through the single worker.
  const job = queue.then(async () => {
    const worker = await getWorker();
    const { data } = await worker.recognize(req.file.buffer);
    return data.text;
  });
  queue = job.catch(() => {});
  const text = await job;
  res.json({ text, parsed: parseReceiptText(text), engine: 'server' });
});

export default router;
