import express from 'express';
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

const app = createApp(db);
const dist = path.join(root, 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

const port = Number(process.env.PORT || 3001);
app.listen(port, () => console.log(`Collabo running on http://localhost:${port}`));
