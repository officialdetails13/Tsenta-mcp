import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('creator','business')),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS creators (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  handle TEXT NOT NULL UNIQUE,
  bio TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  niches TEXT NOT NULL DEFAULT '[]',
  audience TEXT NOT NULL DEFAULT '{}',
  avatar_color TEXT NOT NULL DEFAULT '#7c3aed'
);

CREATE TABLE IF NOT EXISTS socials (
  id INTEGER PRIMARY KEY,
  creator_id INTEGER NOT NULL REFERENCES creators(user_id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  handle TEXT NOT NULL,
  followers INTEGER NOT NULL DEFAULT 0,
  engagement_rate REAL NOT NULL DEFAULT 0,
  avg_views INTEGER NOT NULL DEFAULT 0,
  UNIQUE (creator_id, platform)
);

CREATE TABLE IF NOT EXISTS packages (
  id INTEGER PRIMARY KEY,
  creator_id INTEGER NOT NULL REFERENCES creators(user_id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  platform TEXT NOT NULL,
  deliverable_type TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  price_cents INTEGER NOT NULL,
  turnaround_days INTEGER NOT NULL DEFAULT 7,
  description TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS businesses (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  company TEXT NOT NULL,
  industry TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  about TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS campaigns (
  id INTEGER PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES businesses(user_id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  brief TEXT NOT NULL,
  budget_cents INTEGER NOT NULL,
  niches TEXT NOT NULL DEFAULT '[]',
  platforms TEXT NOT NULL DEFAULT '[]',
  deadline TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- A deal moves: negotiating -> contract -> awaiting_funding -> in_progress
--   -> draft_submitted -> draft_approved -> delivered -> completed.
-- It can also end as declined, cancelled, refunded, or (after a dispute) resolved.
CREATE TABLE IF NOT EXISTS deals (
  id INTEGER PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES businesses(user_id),
  creator_id INTEGER NOT NULL REFERENCES creators(user_id),
  campaign_id INTEGER REFERENCES campaigns(id),
  package_id INTEGER REFERENCES packages(id),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'negotiating',
  price_cents INTEGER,
  deliverables TEXT,
  deadline TEXT,
  promo_code TEXT,
  contract_text TEXT,
  business_signed_at TEXT,
  creator_signed_at TEXT,
  funded_at TEXT,
  delivered_at TEXT,
  delivery_url TEXT,
  delivery_note TEXT,
  completed_at TEXT,
  draft_url TEXT,
  draft_note TEXT,
  draft_submitted_at TEXT,
  draft_approved_at TEXT,
  checklist TEXT,
  bonus_cents INTEGER NOT NULL DEFAULT 0,
  bonus_metric TEXT,
  bonus_target INTEGER,
  bonus_status TEXT NOT NULL DEFAULT 'none',
  dispute_by INTEGER,
  dispute_reason TEXT,
  dispute_creator_pct INTEGER,
  dispute_prev_status TEXT,
  disputed_at TEXT,
  resolved_at TEXT,
  refunded_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS offers (
  id INTEGER PRIMARY KEY,
  deal_id INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  from_user_id INTEGER NOT NULL REFERENCES users(id),
  price_cents INTEGER NOT NULL,
  deliverables TEXT NOT NULL,
  deadline TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  bonus_cents INTEGER NOT NULL DEFAULT 0,
  bonus_metric TEXT,
  bonus_target INTEGER,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','superseded')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  deal_id INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id),
  body TEXT NOT NULL,
  system INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS results (
  deal_id INTEGER PRIMARY KEY REFERENCES deals(id) ON DELETE CASCADE,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  conversions INTEGER NOT NULL DEFAULT 0,
  revenue_cents INTEGER NOT NULL DEFAULT 0,
  reported_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY,
  deal_id INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  reviewer_id INTEGER NOT NULL REFERENCES users(id),
  reviewee_id INTEGER NOT NULL REFERENCES users(id),
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (deal_id, reviewer_id)
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY,
  deal_id INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  -- escrow_fund / bonus_fund / buyer_fee: money in from the brand
  -- payout + seller_fee: released to the creator (gross = payout + fee)
  -- refund / fee_refund: returned to the brand
  type TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Posts creators log for content analytics (manual now, platform sync later).
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY,
  creator_id INTEGER NOT NULL REFERENCES creators(user_id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  format TEXT NOT NULL,
  posted_at TEXT NOT NULL,
  hook TEXT NOT NULL DEFAULT '',
  edit_style TEXT,
  duration_s INTEGER,
  views INTEGER NOT NULL DEFAULT 0,
  likes INTEGER NOT NULL DEFAULT 0,
  comments INTEGER NOT NULL DEFAULT 0,
  shares INTEGER NOT NULL DEFAULT 0,
  saves INTEGER NOT NULL DEFAULT 0,
  hold_3s_pct INTEGER,
  trend_id INTEGER REFERENCES trends(id) ON DELETE SET NULL,
  sponsored INTEGER NOT NULL DEFAULT 0,
  url TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS posts_by_creator ON posts (creator_id, posted_at);

CREATE TABLE IF NOT EXISTS trends (
  id INTEGER PRIMARY KEY,
  platform TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('sound','format','edit','topic')),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  how_to TEXT NOT NULL,
  niches TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

// Brings databases created by earlier versions up to the current schema.
function migrate(db) {
  const cols = (t) => db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
  const add = (table, defs) => {
    const have = cols(table);
    for (const [name, def] of defs) if (!have.includes(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${def}`);
  };
  add('deals', [['draft_url', 'TEXT'], ['draft_note', 'TEXT'], ['draft_submitted_at', 'TEXT'], ['draft_approved_at', 'TEXT'], ['checklist', 'TEXT'],
    ['bonus_cents', 'INTEGER NOT NULL DEFAULT 0'], ['bonus_metric', 'TEXT'], ['bonus_target', 'INTEGER'], ['bonus_status', "TEXT NOT NULL DEFAULT 'none'"],
    ['dispute_by', 'INTEGER'], ['dispute_reason', 'TEXT'], ['dispute_creator_pct', 'INTEGER'], ['dispute_prev_status', 'TEXT'],
    ['disputed_at', 'TEXT'], ['resolved_at', 'TEXT'], ['refunded_at', 'TEXT']]);
  add('offers', [['bonus_cents', 'INTEGER NOT NULL DEFAULT 0'], ['bonus_metric', 'TEXT'], ['bonus_target', 'INTEGER']]);
  // v0.1 restricted transaction types with a CHECK; SQLite can't drop it in place.
  const txSql = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'transactions'").get()?.sql ?? '';
  if (txSql.includes('CHECK')) {
    db.exec(`BEGIN;
      ALTER TABLE transactions RENAME TO transactions_v1;
      CREATE TABLE transactions (id INTEGER PRIMARY KEY, deal_id INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
        type TEXT NOT NULL, amount_cents INTEGER NOT NULL, note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')));
      INSERT INTO transactions (id, deal_id, type, amount_cents, created_at) SELECT id, deal_id, type, amount_cents, created_at FROM transactions_v1;
      DROP TABLE transactions_v1;
      COMMIT;`);
  }
}

export function openDb(file = process.env.DB_FILE || 'collabo.db') {
  const db = new DatabaseSync(file);
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

export function tx(db, fn) {
  db.exec('BEGIN');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
