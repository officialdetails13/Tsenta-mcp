import express from 'express';
import compression from 'compression';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { createApp } from './app.js';
import { seed, seedTrends } from './seed.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const db = openDb();
if (!db.prepare('SELECT 1 FROM users LIMIT 1').get()) {
  seed(db);
  console.log('Seeded demo data');
} else if (!db.prepare('SELECT 1 FROM trends LIMIT 1').get()) {
  seedTrends(db); // databases from before trend tracking
}

const api = createApp(db);
const app = express();
app.use(compression()); // gzip HTML, JS, CSS and API responses
app.use(api);
app.locals.meta = () => api.locals.meta();
const dist = path.join(root, 'dist');
if (fs.existsSync(dist)) {
  // Hashed assets are immutable; the HTML is not cached so deploys show up at once.
  app.use('/assets', express.static(path.join(dist, 'assets'), { immutable: true, maxAge: '1y' }));
  app.use(express.static(dist, { index: false }));
  const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  // Embed /api/meta so the first render doesn't wait for a request. `<` is escaped so it can't close the script tag.
  // Missing files (anything with an extension) are real 404s, not the app shell.
  app.get(/\.[a-z0-9]+$/i, (_req, res) => res.status(404).type('text').send('Not found'));
  app.get(/^(?!\/api).*/, (_req, res) => {
    const meta = JSON.stringify(app.locals.meta()).replace(/</g, '\\u003c');
    res.set('Cache-Control', 'no-cache').type('html').send(html.replace('</head>', `<script>window.__COLLABO_META__=${meta}</script></head>`));
  });
}

const port = Number(process.env.PORT || 3001);
app.listen(port, () => console.log(`Collabo running on http://localhost:${port}`));
