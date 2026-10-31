// Structured deliverables and contract terms for offers: what is being made,
// on which platform, how long, how many, and what rights come with it.
import { DELIVERABLES } from './pricing.js';

export const FORMAT_LABEL = {
  post: 'Feed post', reel: 'Reel', story: 'Story', carousel: 'Carousel', video: 'Video', live: 'Live stream',
  short: 'Short', integration: 'Sponsored segment', thread: 'Thread', segment: 'Live segment', ugc: 'UGC video (no posting)',
};
export const PLATFORM_LABEL = { instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube', x: 'X', twitch: 'Twitch', any: 'Any' };

// Allowed lengths in seconds. Stories are priced per 15s frame (quantity = frames).
export const DURATIONS = {
  reel: [15, 30, 45, 60, 90], video: [15, 30, 45, 60, 90, 180], short: [15, 30, 45, 60], ugc: [15, 30, 45, 60],
  integration: [30, 60, 90], story: [15], live: [900, 1800, 3600], segment: [300, 900],
};
const DURATION_MULT = { 15: 0.8, 30: 1, 45: 1.1, 60: 1.2, 90: 1.35, 180: 1.6, 300: 0.8, 900: 1, 1800: 1.4, 3600: 1.8 };

export const TERM_OPTIONS = {
  usage_rights: [
    { key: 'organic_90', label: 'Organic resharing for 90 days', pct: 0 },
    { key: 'organic_365', label: 'Organic resharing for 1 year', pct: 15 },
    { key: 'paid_30', label: 'Paid ads usage for 30 days', pct: 30 },
    { key: 'paid_90', label: 'Paid ads usage for 90 days', pct: 50 },
    { key: 'perpetual', label: 'Unlimited usage, forever', pct: 100 },
  ],
  exclusivity_days: [
    { key: 0, label: 'No exclusivity', pct: 0 }, { key: 30, label: '30-day category exclusivity', pct: 10 },
    { key: 60, label: '60-day category exclusivity', pct: 20 }, { key: 90, label: '90-day category exclusivity', pct: 30 },
  ],
  revisions: [{ key: 1, label: '1 revision round', pct: 0 }, { key: 2, label: '2 revision rounds', pct: 5 }, { key: 3, label: '3 revision rounds', pct: 10 }],
  stays_live_days: [
    { key: 30, label: 'Stays live 30 days', pct: 0 }, { key: 90, label: 'Stays live 90 days', pct: 5 },
    { key: 365, label: 'Stays live 1 year', pct: 10 }, { key: 0, label: 'Stays live permanently', pct: 15 },
  ],
  link_in_bio_days: [{ key: 0, label: 'No link in bio', pct: 0 }, { key: 7, label: 'Link in bio for 7 days', pct: 5 }, { key: 30, label: 'Link in bio for 30 days', pct: 12 }],
  raw_footage: [{ key: false, label: 'No raw footage', pct: 0 }, { key: true, label: 'Raw footage delivered', pct: 20 }],
  whitelisting: [{ key: false, label: 'No whitelisting', pct: 0 }, { key: true, label: 'Whitelisting (brand runs ads from the creator’s handle)', pct: 30 }],
};
export const DEFAULT_TERMS = { usage_rights: 'organic_90', exclusivity_days: 0, revisions: 1, stays_live_days: 30, link_in_bio_days: 0, raw_footage: false, whitelisting: false, custom: '' };

class InputError extends Error {}

export function normalizeTerms(t = {}) {
  const out = { ...DEFAULT_TERMS };
  for (const [k, opts] of Object.entries(TERM_OPTIONS)) {
    if (t[k] === undefined) continue;
    const v = typeof opts[0].key === 'number' ? Number(t[k]) : typeof opts[0].key === 'boolean' ? Boolean(t[k]) : String(t[k]);
    if (!opts.some((o) => o.key === v)) throw new InputError(`Invalid ${k}`);
    out[k] = v;
  }
  out.custom = String(t.custom || '').slice(0, 1000);
  return out;
}

export function normalizeItems(items) {
  if (!Array.isArray(items) || !items.length) throw new InputError('Add at least one deliverable');
  if (items.length > 10) throw new InputError('At most 10 deliverables per offer');
  return items.map((i) => {
    const format = String(i.format);
    const platform = format === 'ugc' ? 'any' : String(i.platform);
    if (!DELIVERABLES[platform]?.includes(format)) throw new InputError(`${FORMAT_LABEL[format] ?? format} isn't available on ${PLATFORM_LABEL[platform] ?? platform}`);
    const allowed = DURATIONS[format];
    const duration_s = allowed ? Number(i.duration_s ?? allowed[0]) : null;
    if (allowed && !allowed.includes(duration_s)) throw new InputError(`Pick a length for the ${FORMAT_LABEL[format]}`);
    const quantity = Math.round(Number(i.quantity ?? 1));
    if (!(quantity >= 1 && quantity <= 20)) throw new InputError('Quantity must be 1–20');
    const unit_price_cents = Math.round(Number(i.unit_price) * 100);
    if (!(unit_price_cents > 0)) throw new InputError('Each deliverable needs a price');
    return { platform, format, duration_s, quantity, unit_price_cents, notes: String(i.notes || '').slice(0, 300) };
  });
}

export const fmtDuration = (s) => (s >= 60 && s % 60 === 0 ? `${s / 60} min` : `${s}s`);

export function itemLabel(i) {
  const len = i.duration_s ? (i.format === 'story' ? ' (15s frames)' : ` (${fmtDuration(i.duration_s)})`) : '';
  const unit = i.format === 'story' ? (i.quantity === 1 ? 'frame' : 'frames') : '';
  return `${i.quantity}× ${i.platform === 'any' ? '' : `${PLATFORM_LABEL[i.platform]} `}${FORMAT_LABEL[i.format]}${unit ? ` ${unit}` : ''}${len}`;
}

export const deliverablesText = (items) => items.map((i) => itemLabel(i) + (i.notes ? `: ${i.notes}` : '')).join('; ');

// Suggested unit price from a base per-format rate, scaled by length.
export function suggestUnit(baseCents, durationS) {
  const v = (baseCents * (DURATION_MULT[durationS] ?? 1)) / 100;
  return Math.max(25, Math.round(v / 5) * 5) * 100;
}

export function termLabels(terms) {
  return Object.entries(TERM_OPTIONS).map(([k, opts]) => opts.find((o) => o.key === terms[k])).filter(Boolean);
}

// Line items + add-ons (as % of the subtotal) = the deal price.
export function quote(items, terms) {
  const lines = items.map((i) => ({ label: itemLabel(i), notes: i.notes, quantity: i.quantity, unit_cents: i.unit_price_cents, total_cents: i.unit_price_cents * i.quantity }));
  const subtotal = lines.reduce((a, l) => a + l.total_cents, 0);
  const addons = termLabels(terms).filter((o) => o.pct > 0).map((o) => ({ label: o.label, pct: o.pct, cents: Math.round((subtotal * o.pct) / 100) }));
  return { lines, subtotal_cents: subtotal, addons, total_cents: subtotal + addons.reduce((a, x) => a + x.cents, 0) };
}

export { InputError };
