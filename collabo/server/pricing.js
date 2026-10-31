// Rate engine: turns a creator's reach and engagement into a suggested price,
// then checks it against what similar creators on the marketplace charge.

export const PLATFORMS = ['instagram', 'tiktok', 'youtube', 'x', 'twitch'];

export const DELIVERABLES = {
  instagram: ['post', 'reel', 'story', 'carousel'],
  tiktok: ['video', 'live'],
  youtube: ['video', 'short', 'integration'],
  x: ['post', 'thread'],
  twitch: ['live', 'segment'],
  any: ['ugc'],
};

export const NICHES = [
  'beauty', 'fashion', 'fitness', 'food', 'travel', 'tech', 'gaming',
  'finance', 'parenting', 'home', 'pets', 'music', 'comedy', 'lifestyle', 'education',
];

// Dollars per 1,000 followers for one standard deliverable.
const BASE_CPM = { instagram: 10, tiktok: 8, youtube: 20, x: 3, twitch: 12 };

// Typical engagement rate (%) per platform; beating it earns a premium.
export const BENCHMARK_ER = { instagram: 2.0, tiktok: 5.0, youtube: 4.0, x: 1.0, twitch: 3.0 };

const DELIVERABLE_MULT = {
  post: 1, reel: 1.25, story: 0.4, carousel: 1.1, video: 1, live: 1.4,
  short: 0.5, integration: 0.7, thread: 1.2, segment: 0.6,
};

const NICHE_MULT = { finance: 1.35, tech: 1.25, beauty: 1.1, fashion: 1.1, parenting: 1.1, education: 1.1, gaming: 0.9, comedy: 0.9 };

const UGC_FLAT = 175; // UGC is paid for the content, not the reach.

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const roundPrice = (dollars) => Math.max(25, Math.round(dollars / 5) * 5);

export function estimateRate({ platform, deliverable_type, followers = 0, engagement_rate = 0, niches = [] }) {
  const nicheMult = Math.max(1, ...niches.map((n) => NICHE_MULT[n] ?? 1)) * Math.min(1, ...niches.map((n) => NICHE_MULT[n] ?? 1));
  if (deliverable_type === 'ugc') {
    const suggested = roundPrice(UGC_FLAT * nicheMult);
    return {
      suggested_cents: suggested * 100,
      low_cents: roundPrice(suggested * 0.8) * 100,
      high_cents: roundPrice(suggested * 1.4) * 100,
      factors: [{ label: 'UGC flat rate (content only, no posting)', value: `$${UGC_FLAT}` }, { label: 'Niche multiplier', value: `${nicheMult.toFixed(2)}×` }],
    };
  }
  const cpm = BASE_CPM[platform] ?? 8;
  const bench = BENCHMARK_ER[platform] ?? 2;
  // Square root dampens extreme engagement numbers (often bots or tiny samples).
  const erMult = clamp(Math.sqrt((engagement_rate || bench) / bench), 0.6, 1.8);
  const delMult = DELIVERABLE_MULT[deliverable_type] ?? 1;
  const suggested = roundPrice((followers / 1000) * cpm * erMult * delMult * nicheMult);
  return {
    suggested_cents: suggested * 100,
    low_cents: roundPrice(suggested * 0.8) * 100,
    high_cents: roundPrice(suggested * 1.3) * 100,
    factors: [
      { label: `${platform} base rate`, value: `$${cpm} per 1K followers` },
      { label: `Engagement ${engagement_rate}% vs ${bench}% benchmark`, value: `${erMult.toFixed(2)}×` },
      { label: `${deliverable_type} format`, value: `${delMult.toFixed(2)}×` },
      { label: 'Niche demand', value: `${nicheMult.toFixed(2)}×` },
    ],
  };
}

// Median price-per-1K-followers among similar packages (same platform/format,
// 0.5×–2× the follower count), scaled to this creator's following.
export function marketRate(db, { platform, deliverable_type, followers, exclude_creator_id = 0 }) {
  if (deliverable_type === 'ugc') {
    const rows = db.prepare(`SELECT price_cents FROM packages WHERE deliverable_type = 'ugc' AND active = 1 AND creator_id != ?`).all(exclude_creator_id);
    const prices = rows.map((r) => r.price_cents / 100);
    return prices.length ? { median_cents: Math.round(median(prices)) * 100, sample_size: prices.length } : { median_cents: null, sample_size: 0 };
  }
  const rows = db.prepare(`
    SELECT p.price_cents, p.quantity, s.followers FROM packages p
    JOIN socials s ON s.creator_id = p.creator_id AND s.platform = p.platform
    WHERE p.platform = ? AND p.deliverable_type = ? AND p.active = 1 AND p.creator_id != ?
      AND s.followers BETWEEN ? AND ?`)
    .all(platform, deliverable_type, exclude_creator_id, Math.floor(followers * 0.5), Math.ceil(followers * 2));
  const perK = rows.filter((r) => r.followers > 0).map((r) => r.price_cents / 100 / r.quantity / (r.followers / 1000));
  if (!perK.length) return { median_cents: null, sample_size: 0 };
  return { median_cents: roundPrice(median(perK) * (followers / 1000)) * 100, sample_size: perK.length };
}

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Compares a listed package price to the suggestion and market.
export function priceVerdict(price_cents, quantity, suggestion, market) {
  const unit = price_cents / Math.max(1, quantity);
  const ref = market.median_cents && market.sample_size >= 3
    ? Math.round((suggestion.suggested_cents + market.median_cents) / 2)
    : suggestion.suggested_cents;
  const diff = (unit - ref) / ref;
  if (diff < -0.2) return { verdict: 'underpriced', diff_pct: Math.round(diff * 100), reference_cents: ref };
  if (diff > 0.35) return { verdict: 'premium', diff_pct: Math.round(diff * 100), reference_cents: ref };
  return { verdict: 'on_market', diff_pct: Math.round(diff * 100), reference_cents: ref };
}

// Tiers need both a score and a track record, so a polished profile alone
// can't reach the top.
export const TIERS = [
  { name: 'New', min: 0, deals: 0 },
  { name: 'Rising', min: 25, deals: 0 },
  { name: 'Pro', min: 50, deals: 2 },
  { name: 'Elite', min: 75, deals: 5 },
];

// Level-up score out of 100 plus the concrete actions that raise it.
export function creatorTier({ creator, socials, packages, stats }) {
  const checks = [
    { key: 'bio', label: 'Write a bio of at least 80 characters', done: (creator.bio || '').length >= 80, points: 5 },
    { key: 'niches', label: 'Pick at least 2 niches', done: JSON.parse(creator.niches || '[]').length >= 2, points: 5 },
    { key: 'audience', label: 'Add audience demographics', done: Object.keys(JSON.parse(creator.audience || '{}')).length >= 2, points: 5 },
    { key: 'socials', label: 'Connect 2 or more social accounts', done: socials.length >= 2, points: 5 },
    { key: 'packages', label: 'List 3 or more packages', done: packages.length >= 3, points: 10 },
  ];
  let score = checks.filter((c) => c.done).reduce((a, c) => a + c.points, 0);

  const dealPts = Math.min(30, stats.completed_deals * 5);
  score += dealPts;
  checks.push({ key: 'deals', label: `Complete 6 deals (${stats.completed_deals}/6)`, done: stats.completed_deals >= 6, points: 30, earned: dealPts });

  const ratingPts = stats.review_count ? Math.round(clamp((stats.avg_rating - 3) * 10, 0, 20)) : 0;
  score += ratingPts;
  checks.push({ key: 'rating', label: 'Hold a 5.0 average rating', done: ratingPts >= 20, points: 20, earned: ratingPts });

  const onTime = stats.delivered_deals >= 2 && stats.on_time_rate >= 0.9;
  if (onTime) score += 10;
  checks.push({ key: 'on_time', label: 'Deliver 90%+ on time (min. 2 deliveries)', done: onTime, points: 10 });

  const roi = stats.avg_roi != null && stats.avg_roi >= 2;
  if (roi) score += 10;
  checks.push({ key: 'roi', label: 'Drive 2× ROI for brands on average', done: roi, points: 10 });

  const done = stats.completed_deals;
  const tier = [...TIERS].reverse().find((t) => score >= t.min && done >= t.deals);
  const next = TIERS[TIERS.indexOf(tier) + 1] ?? null;
  return {
    score, tier: tier.name, next_tier: next?.name ?? null,
    points_to_next: next ? Math.max(0, next.min - score) : 0,
    deals_to_next: next ? Math.max(0, next.deals - done) : 0,
    checklist: checks,
  };
}
