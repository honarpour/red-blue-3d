import express from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { makeAnaglyph, encode, MODES } from './anaglyph.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(__dirname, '..', 'client', 'dist');
const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

const num = (v, def, min, max) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};

app.post('/api/convert', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
    const b = req.body;
    const opts = {
      mode: MODES.includes(b.mode) ? b.mode : 'optimized',
      shift: num(b.shift, 0, -10, 10),
      depth: num(b.depth, 3, 0, 10),
      blur: num(b.blur, 8, 0.3, 50),
      swap: b.swap === 'true',
      maxSize: num(b.maxSize, 1600, 200, 8000),
    };
    const format = b.format === 'jpeg' ? 'jpeg' : 'png';
    const result = await makeAnaglyph(req.file.buffer, opts);
    const buf = await encode(result, format, num(b.quality, 92, 40, 100));
    res.type(format).send(buf);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (_, res) => res.sendFile(path.join(dist, 'index.html')));
}

const port = process.env.PORT || 5174;
app.listen(port, '127.0.0.1', () => console.log(`Red/Blue 3D running at http://localhost:${port}`));
