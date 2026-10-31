import { fileURLToPath } from 'node:url';
import { hashPassword } from './auth.js';
import { openDb } from './db.js';
import { analyzeHook } from './content.js';

export const DEMO_PASSWORD = 'password123';

const CREATORS = [
  { name: 'Maya Chen', handle: 'mayaglow', loc: 'Los Angeles, CA', color: '#db2777', niches: ['beauty', 'lifestyle'],
    bio: 'Clean-beauty routines and honest product reviews for women in their 20s. My audience buys what I recommend, and my skincare launches have sold out twice.',
    audience: { age: '18-24', female_pct: 82, top_country: 'US' },
    socials: [['instagram', 'mayaglow', 184000, 3.8, 41000], ['tiktok', 'mayaglow', 412000, 7.2, 96000]],
    packages: [['Skincare Reel feature', 'instagram', 'reel', 1, 2200, 7], ['TikTok GRWM with product', 'tiktok', 'video', 1, 2600, 5], ['Story set (3 frames + link)', 'instagram', 'story', 3, 1200, 3], ['UGC product video (no posting)', 'any', 'ugc', 1, 250, 5]] },
  { name: 'Jordan Ellis', handle: 'liftwithjordan', loc: 'Austin, TX', color: '#059669', niches: ['fitness', 'food'],
    bio: 'Strength coach sharing no-nonsense training and high-protein recipes. My community is 70% men aged 25–34 who spend on supplements and gear.',
    audience: { age: '25-34', female_pct: 30, top_country: 'US' },
    socials: [['youtube', 'LiftWithJordan', 96000, 5.1, 38000], ['instagram', 'liftwithjordan', 58000, 4.4, 15000]],
    packages: [['60s YouTube integration', 'youtube', 'integration', 1, 1400, 10], ['Dedicated review video', 'youtube', 'video', 1, 2400, 14], ['Workout Reel with product', 'instagram', 'reel', 1, 700, 5]] },
  { name: 'Priya Raman', handle: 'priyacodes', loc: 'Seattle, WA', color: '#2563eb', niches: ['tech', 'education'],
    bio: 'Software engineer explaining dev tools, gadgets and productivity apps. Strong B2B reach: my audience is developers and engineering managers.',
    audience: { age: '25-34', female_pct: 38, top_country: 'US' },
    socials: [['youtube', 'PriyaCodes', 142000, 4.6, 52000], ['x', 'priyacodes', 61000, 1.8, 9000], ['tiktok', 'priyacodes', 88000, 6.0, 30000]],
    packages: [['YouTube sponsored segment', 'youtube', 'integration', 1, 2900, 14], ['Launch-day thread', 'x', 'thread', 1, 450, 3], ['TikTok tool demo', 'tiktok', 'video', 1, 900, 5]] },
  { name: 'Marcus Bell', handle: 'marcusmoney', loc: 'Atlanta, GA', color: '#ca8a04', niches: ['finance', 'education'],
    bio: 'Making money simple for first-time investors and side hustlers. Finance audiences convert: my fintech partners average 3×+ ROI.',
    audience: { age: '25-34', female_pct: 45, top_country: 'US' },
    socials: [['tiktok', 'marcusmoney', 265000, 6.4, 70000], ['instagram', 'marcusmoney', 74000, 3.1, 12000]],
    packages: [['TikTok explainer with app walkthrough', 'tiktok', 'video', 1, 2700, 7], ['Carousel breakdown', 'instagram', 'carousel', 1, 1000, 5], ['3-video TikTok series', 'tiktok', 'video', 3, 7200, 21]] },
  { name: 'Sofia Alvarez', handle: 'sofiaeats', loc: 'Miami, FL', color: '#ea580c', niches: ['food', 'travel'],
    bio: 'Restaurant finds and 15-minute recipes across Miami and Latin America. Local restaurants see walk-ins the same weekend.',
    audience: { age: '25-34', female_pct: 64, top_country: 'US' },
    socials: [['instagram', 'sofiaeats', 128000, 4.9, 33000], ['tiktok', 'sofiaeats', 205000, 8.1, 61000]],
    packages: [['Restaurant visit Reel', 'instagram', 'reel', 1, 1600, 7], ['Recipe TikTok with product', 'tiktok', 'video', 1, 1500, 5], ['Story takeover (5 frames)', 'instagram', 'story', 5, 1100, 2]] },
  { name: 'Theo Park', handle: 'theoplays', loc: 'Toronto, ON', color: '#7c3aed', niches: ['gaming', 'tech'],
    bio: 'Variety streamer and gaming-setup nerd. Live reads and setup tours for peripherals, energy drinks and indie games.',
    audience: { age: '18-24', female_pct: 18, top_country: 'US' },
    socials: [['twitch', 'theoplays', 72000, 3.4, 4200], ['youtube', 'TheoPlays', 54000, 3.9, 16000]],
    packages: [['Live sponsored segment (15 min)', 'twitch', 'segment', 1, 500, 7], ['Full sponsored stream', 'twitch', 'live', 1, 1300, 10], ['Setup tour integration', 'youtube', 'integration', 1, 700, 14]] },
  { name: 'Hannah Brooks', handle: 'hannahathome', loc: 'Nashville, TN', color: '#0d9488', niches: ['home', 'parenting'],
    bio: 'Mom of three, cozy home makeovers on a budget. My audience is homeowners 28–40 who trust me for home, kids and kitchen buys.',
    audience: { age: '25-34', female_pct: 91, top_country: 'US' },
    socials: [['instagram', 'hannahathome', 96000, 4.2, 22000], ['tiktok', 'hannahathome', 51000, 5.5, 14000]],
    packages: [['Home makeover Reel', 'instagram', 'reel', 1, 1300, 10], ['Carousel product roundup', 'instagram', 'carousel', 1, 1000, 7], ['UGC lifestyle photos (10)', 'any', 'ugc', 1, 300, 7]] },
  { name: 'Leo Martins', handle: 'leowanders', loc: 'Denver, CO', color: '#0891b2', niches: ['travel', 'lifestyle'],
    bio: 'Outdoor adventures and van-life gear. Cinematic content brands reuse in their own ads.',
    audience: { age: '25-34', female_pct: 47, top_country: 'US' },
    socials: [['instagram', 'leowanders', 41000, 5.6, 14000], ['youtube', 'LeoWanders', 23000, 6.2, 9000]],
    packages: [['Cinematic Reel', 'instagram', 'reel', 1, 650, 10], ['UGC b-roll package', 'any', 'ugc', 1, 400, 10]] },
  { name: 'Aaliyah Grant', handle: 'aaliyahstyle', loc: 'New York, NY', color: '#be185d', niches: ['fashion', 'beauty'],
    bio: 'Affordable streetwear and plus-size styling. My try-on hauls regularly drive four-figure sales days for small brands.',
    audience: { age: '18-24', female_pct: 88, top_country: 'US' },
    socials: [['tiktok', 'aaliyahstyle', 330000, 7.8, 85000], ['instagram', 'aaliyahstyle', 112000, 3.5, 25000]],
    packages: [['Try-on haul TikTok', 'tiktok', 'video', 1, 2900, 7], ['Outfit Reel', 'instagram', 'reel', 1, 1500, 7], ['Haul + story bundle', 'instagram', 'story', 4, 1300, 5]] },
  { name: 'Ben Okafor', handle: 'benlaughs', loc: 'Chicago, IL', color: '#4f46e5', niches: ['comedy', 'lifestyle'],
    bio: 'Sketch comedy with recurring characters. Brands get integrated, shareable skits, not ad reads.',
    audience: { age: '18-24', female_pct: 52, top_country: 'US' },
    socials: [['tiktok', 'benlaughs', 520000, 9.4, 140000], ['instagram', 'benlaughs', 88000, 4.0, 30000]],
    packages: [['Branded sketch TikTok', 'tiktok', 'video', 1, 3100, 10], ['Reel cross-post', 'instagram', 'reel', 1, 900, 3]] },
  { name: 'Emma Novak', handle: 'emmapaws', loc: 'Portland, OR', color: '#65a30d', niches: ['pets', 'lifestyle'],
    bio: 'Two rescue huskies, a lot of opinions. Pet food, toys and gear reviews from a highly engaged dog-parent community.',
    audience: { age: '25-34', female_pct: 76, top_country: 'US' },
    socials: [['instagram', 'emmapaws', 22000, 6.8, 8000], ['tiktok', 'emmapaws', 64000, 9.0, 22000]],
    packages: [['Husky review TikTok', 'tiktok', 'video', 1, 600, 5], ['Product Reel', 'instagram', 'reel', 1, 350, 5], ['UGC pet content (5 clips)', 'any', 'ugc', 1, 200, 7]] },
  { name: 'Nia Okoye', handle: 'niacooks', loc: 'Houston, TX', color: '#c2410c', niches: ['food'],
    bio: 'Student cooking cheap, fast dinners. Just getting started!',
    audience: {},
    socials: [['tiktok', 'niacooks', 1800, 6.5, 900], ['instagram', 'niacooks', 420, 4.0, 150]],
    packages: [], day1: true },
  { name: 'Ravi Shah', handle: 'ravibeats', loc: 'Brooklyn, NY', color: '#dc2626', niches: ['music', 'tech'],
    bio: 'Producer breaking down beats and studio gear. Great fit for audio, music software and creator tools.',
    audience: { age: '18-24', female_pct: 22, top_country: 'US' },
    socials: [['youtube', 'RaviBeats', 37000, 5.4, 12000], ['instagram', 'ravibeats', 15000, 4.1, 5000]],
    packages: [['Gear integration', 'youtube', 'integration', 1, 450, 10]] },
];

const BUSINESSES = [
  { name: 'Dana Whitfield', email: 'brand@glowlab.co', company: 'GlowLab Skincare', industry: 'Beauty & personal care', website: 'https://glowlab.example', location: 'San Diego, CA',
    about: 'DTC clean skincare brand, ~$2M/yr revenue, growing with creators instead of paid social.' },
  { name: 'Carlos Rivera', email: 'brand@fuelbar.co', company: 'FuelBar Nutrition', industry: 'Food & supplements', website: 'https://fuelbar.example', location: 'Austin, TX',
    about: 'High-protein snack bars sold online and in 400 stores.' },
  { name: 'Mia Thompson', email: 'brand@stackly.app', company: 'Stackly', industry: 'Fintech app', website: 'https://stackly.example', location: 'New York, NY',
    about: 'Micro-investing app for first-time investors. Pays per install and per funded account.' },
];

// [business idx, creator handle, package title, price $, revenue $, conversions, impressions, rating, review, days ago]
const PAST_DEALS = [
  [0, 'mayaglow', 'Skincare Reel feature', 2200, 9800, 245, 210000, 5, 'Maya sold through our serum restock in four days. Easy to work with.', 60],
  [0, 'aaliyahstyle', 'Haul + story bundle', 1300, 3900, 97, 88000, 5, 'Great storytelling and on time.', 45],
  [0, 'mayaglow', 'TikTok GRWM with product', 2600, 7100, 178, 390000, 4, 'Strong results; the first cut needed a revision.', 30],
  [0, 'emmapaws', 'Product Reel', 350, 400, 10, 19000, 4, 'Cute content, good engagement.', 20],
  [1, 'liftwithjordan', '60s YouTube integration', 1400, 5200, 260, 61000, 5, 'Best ROI channel we have tried this year.', 50],
  [1, 'sofiaeats', 'Recipe TikTok with product', 1500, 2700, 135, 240000, 5, 'Creative recipe; viewers loved it.', 35],
  [1, 'liftwithjordan', 'Workout Reel with product', 700, 1900, 95, 22000, 5, 'Reliable and authentic.', 12],
  [2, 'marcusmoney', 'TikTok explainer with app walkthrough', 2700, 11400, 380, 410000, 5, 'Our cheapest cost per funded account, by a lot.', 55],
  [2, 'priyacodes', 'Launch-day thread', 450, 600, 24, 52000, 4, 'Solid reach with a technical crowd.', 25],
  [2, 'marcusmoney', 'Carousel breakdown', 1000, 2600, 87, 46000, 5, 'Clear, compliant and on time.', 15],
  [1, 'benlaughs', 'Branded sketch TikTok', 3100, 3600, 120, 880000, 4, 'Huge reach; the sketch went semi-viral.', 40],
  [0, 'hannahathome', 'Carousel product roundup', 1000, 1800, 45, 41000, 5, 'Her audience trusts her.', 18],
];

const TRENDS = [
  // [platform, kind, name, description, how_to, niches, peak (days ago; negative = still climbing)]
  ['tiktok', 'sound', 'Sped-up throwback audio', 'Sped-up versions of 2000s hits used under quick before/after reveals.', 'Cut to the beat drop at about 2s, then show the reveal on the drop.', [], -3],
  ['tiktok', 'format', 'Day-in-the-life with timestamps', 'Clips stamped with the time of day, ending on a payoff moment.', 'Use 6–8 clips of 2–3s each with large timestamps, and end on the most satisfying shot.', ['food', 'fitness', 'lifestyle', 'parenting'], 4],
  ['instagram', 'edit', 'Match-cut outfit transitions', 'Hand-over-lens or spin transitions between looks, cut on the beat.', 'Film each look from the same tripod spot and cut on the motion, not after it.', ['fashion', 'beauty'], 5],
  ['instagram', 'format', 'Photo-dump carousel', 'Casual 10-slide carousels with one standout first image.', 'Lead with your best image; slide 2 should make people keep swiping.', [], 30],
  ['youtube', 'format', '“I tested it for 30 days”', 'Long-term test videos with a clear verdict at the end.', 'Show the final result in the first 10 seconds, then tell the story of how you got there.', [], 9],
  ['tiktok', 'topic', 'Underconsumption core', 'Showing what you didn’t buy, with frugal swaps and use-it-up content.', 'Open with what people expect to see you buy, then show the cheaper or free alternative.', ['finance', 'lifestyle', 'home', 'food'], -2],
  ['instagram', 'sound', 'Lo-fi voiceover storytelling', 'Calm voiceover over slow b-roll, told like a mini story.', 'Write the voiceover first, then cut b-roll to every sentence break.', ['travel', 'lifestyle', 'food', 'home'], 7],
  ['tiktok', 'edit', 'Green-screen reply to comments', 'Answering a viewer comment with it shown on screen behind you.', 'Pick comments that let you teach something; give the answer in the first sentence.', [], 28],
  ['youtube', 'format', '60-second speed-run tutorial', 'A full how-to in under a minute, with a timer on screen.', 'Show the finished result first, then race the clock to rebuild it.', ['tech', 'education', 'gaming', 'music'], 1],
  ['instagram', 'format', 'GRWM + story time', 'Get-ready-with-me filmed while telling a personal story.', 'Start with the most dramatic line of the story, not the first step of the routine.', ['beauty', 'fashion', 'lifestyle'], 14],
];

const TOPIC = { beauty: 'skincare', fashion: 'outfit', fitness: 'workout', food: 'dinner', travel: 'packing', tech: 'desk setup', gaming: 'gaming setup',
  finance: 'budget', parenting: 'toddler', home: 'living room', pets: 'dog', music: 'beat', comedy: 'roommate', lifestyle: 'morning routine', education: 'study' };
const STRONG_HOOKS = ['Stop doing this with your {t}', 'I tried a new {t} for 30 days. Here’s what happened', '3 {t} mistakes you’re probably making',
  'Why does nobody talk about this {t} trick?', 'If you hate your {t}, watch this', 'The {t} secret nobody tells you', 'I spent $20 on my {t}. Worth it?',
  'You’re doing your {t} wrong', '5 {t} hacks that actually work'];
const WEAK_HOOKS = ['Hey guys, so today I wanted to show you my {t}', 'So this is my {t}', 'My {t} update', 'Hi everyone! Welcome back to my channel, today it’s all about {t}',
  'Just a quick little {t} video for you all today, hope you enjoy it', 'Here is my {t}'];
const EDIT_MULT = { 'jump cuts': 1.3, 'voiceover + b-roll': 1.15, 'text on screen': 1.1, transitions: 1.05, 'green screen': 1.0, 'talking head': 0.78 };
const REACH = { tiktok: 0.32, instagram: 0.2, youtube: 0.35, x: 0.12, twitch: 0.06 };
const FORMAT = { tiktok: ['video'], instagram: ['reel', 'reel', 'reel', 'carousel'], youtube: ['short', 'short', 'video'], x: ['post', 'thread'], twitch: ['live'] };

// Small deterministic PRNG so the demo data is the same on every seed.
function rng(seed) {
  let a = seed;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function seedPosts(ins, creatorId, c, trendIds, index) {
  const r = rng(1000 + index);
  const pick = (xs) => xs[Math.floor(r() * xs.length)];
  const topic = TOPIC[c.niches[0]] ?? 'content';
  const maxF = Math.max(...c.socials.map((s) => s.followers));
  const weakShare = c.day1 ? 0.7 : maxF < 100000 ? 0.4 : 0.2;
  // Day-1 creators post irregularly; established creators keep a rhythm.
  const perWeek = c.day1 ? [1, 3, 2, 4, 1, 2, 3, 2, 1] : maxF < 100000 ? [3, 4, 5, 4, 3, 4, 5, 4, 2] : [3, 4, 3, 4, 3, 4, 3, 3, 3];
  const styles = c.day1 ? ['talking head', 'talking head', 'talking head', 'text on screen'] : Object.keys(EDIT_MULT);
  for (let w = 0; w < 9; w++) {
    for (let k = 0; k < perWeek[w]; k++) {
      const daysAgo = w * 7 + Math.floor(r() * 7);
      const social = r() < 0.65 ? c.socials[0] : pick(c.socials);
      const platform = social.platform;
      const hook = pick(r() < weakShare ? WEAK_HOOKS : STRONG_HOOKS).replace('{t}', topic);
      const style = pick(styles);
      const format = pick(FORMAT[platform]);
      const duration = format === 'video' && platform === 'youtube' ? 420 + Math.floor(r() * 600) : format === 'live' ? 7200 : 12 + Math.floor(r() * 50);
      // Trends are picked in proportion to how hot they were on the post date.
      let trendId = null, trendMult = 1;
      const candidates = TRENDS.map((t, i) => ({ t, id: trendIds[i] })).filter(({ t }) => t[0] === platform && (!t[5].length || t[5].some((n) => c.niches.includes(n))));
      if (candidates.length && r() < 0.55) {
        const weights = candidates.map(({ t }) => Math.exp(-((daysAgo - t[6]) ** 2) / (2 * 6 ** 2)));
        let x = r() * weights.reduce((a, b) => a + b, 0);
        const chosen = candidates.find((_, i) => (x -= weights[i]) <= 0);
        if (chosen && weights[candidates.indexOf(chosen)] > 0.05) { trendId = chosen.id; trendMult = 1.35; }
      }
      const score = analyzeHook({ hook }).score;
      const hold = Math.round(Math.min(92, Math.max(18, 22 + score * 0.55 + (r() - 0.5) * 16)));
      const quality = (score / 65) ** 1.4 * EDIT_MULT[style] * trendMult * (0.65 + r() * 0.7) * (daysAgo % 7 === 2 ? 1.25 : 1);
      const views = Math.max(40, Math.round(social.followers * REACH[platform] * quality));
      const er = social.engagement_rate * Math.sqrt(EDIT_MULT[style] * trendMult) * (0.8 + r() * 0.4);
      const eng = views * er / 100;
      ins(`INSERT INTO posts (creator_id, platform, format, posted_at, hook, edit_style, duration_s, views, likes, comments, shares, saves, hold_3s_pct, trend_id, sponsored, url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        creatorId, platform, format, new Date(Date.now() - daysAgo * 864e5).toISOString().slice(0, 10), hook, style, duration, views,
        Math.round(eng * 0.75), Math.round(eng * 0.08), Math.round(eng * 0.09), Math.round(eng * 0.08), r() < 0.85 ? hold : null, trendId,
        !c.day1 && r() < 0.1 ? 1 : 0, '');
    }
  }
}

// Demo creators get a content grid built from their seeded post log, marked as demo data.
const KIND = { reel: 'reel', carousel: 'post', post: 'post', story: 'story', video: 'video', short: 'short', thread: 'post', live: null };
function seedDemoMedia(db, creatorId) {
  const posts = db.prepare('SELECT * FROM posts WHERE creator_id = ? ORDER BY posted_at DESC LIMIT 30').all(creatorId);
  const ins = db.prepare(`INSERT INTO media (creator_id, platform, external_id, kind, media_type, caption, posted_at, likes, comments, views, reach, saves, shares, source, fetched_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'demo', datetime('now'))`);
  for (const p of posts) {
    const kind = KIND[p.format];
    if (!kind) continue;
    ins.run(creatorId, p.platform, `demo-${p.id}`, kind, kind === 'post' ? 'CAROUSEL_ALBUM' : 'VIDEO', p.hook, `${p.posted_at} 18:00:00`, p.likes, p.comments, p.views, Math.round(p.views * 0.82), p.saves, p.shares);
  }
  // Two stories from the last 24 hours on Instagram creators.
  const ig = db.prepare("SELECT followers FROM socials WHERE creator_id = ? AND platform = 'instagram'").get(creatorId);
  if (ig) {
    for (const [i, h] of [[1, 'Behind the scenes'], [2, 'Poll: what should I film next?']]) {
      const views = Math.round(ig.followers * (0.06 + 0.02 * i));
      ins.run(creatorId, 'instagram', `demo-story-${creatorId}-${i}`, 'story', 'IMAGE', h, new Date(Date.now() - i * 5 * 36e5).toISOString().slice(0, 19).replace('T', ' '),
        null, null, views, Math.round(views * 0.9), null, Math.round(views * 0.004));
    }
  }
}

const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 19).replace('T', ' ');
const dateIn = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

export const DEMO_BRAND_EMAILS = BUSINESSES.map((b) => b.email);
export const isDemoEmail = (email) => /@creator\.demo$/.test(email) || DEMO_BRAND_EMAILS.includes(email);

export function seedTrends(db) {
  return TRENDS.map(([platform, kind, name, description, how_to, niches]) => Number(db.prepare('INSERT INTO trends (platform, kind, name, description, how_to, niches) VALUES (?, ?, ?, ?, ?, ?)')
    .run(platform, kind, name, description, how_to, JSON.stringify(niches)).lastInsertRowid));
}

export function seed(db) {
  const pw = hashPassword(DEMO_PASSWORD);
  const ins = (sql, ...args) => Number(db.prepare(sql).run(...args).lastInsertRowid);
  db.exec('BEGIN');
  try {
    const trendIds = seedTrends(db);
    const creatorIds = {};
    const pkgIds = {};
    for (const c of CREATORS) {
      const id = ins('INSERT INTO users (role, email, password_hash, name) VALUES (?, ?, ?, ?)', 'creator', `${c.handle}@creator.demo`, pw, c.name);
      creatorIds[c.handle] = id;
      ins('INSERT INTO creators (user_id, handle, bio, location, niches, audience, avatar_color, is_demo) VALUES (?, ?, ?, ?, ?, ?, ?, 1)',
        id, c.handle, c.bio, c.loc, JSON.stringify(c.niches), JSON.stringify(c.audience), c.color);
      for (const [platform, handle, followers, er, views] of c.socials) {
        ins("INSERT INTO socials (creator_id, platform, handle, followers, engagement_rate, avg_views, source, fetched_at) VALUES (?, ?, ?, ?, ?, ?, 'demo', datetime('now'))", id, platform, handle, followers, er, views);
      }
      seedPosts(ins, id, { ...c, socials: c.socials.map(([platform, , followers, engagement_rate]) => ({ platform, followers, engagement_rate })) }, trendIds, CREATORS.indexOf(c));
      seedDemoMedia(db, id);
      for (const [title, platform, type, qty, price, days] of c.packages) {
        pkgIds[`${c.handle}|${title}`] = ins(`INSERT INTO packages (creator_id, title, platform, deliverable_type, quantity, price_cents, turnaround_days, description)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, id, title, platform, type, qty, price * 100, days, `${qty}× ${type} on ${platform === 'any' ? 'your channels' : platform}. Includes one round of revisions and the promo code in the caption.`);
      }
    }
    const bizIds = BUSINESSES.map((b) => {
      const id = ins('INSERT INTO users (role, email, password_hash, name) VALUES (?, ?, ?, ?)', 'business', b.email, pw, b.name);
      ins('INSERT INTO businesses (user_id, company, industry, website, about, location) VALUES (?, ?, ?, ?, ?, ?)', id, b.company, b.industry, b.website, b.about, b.location);
      return id;
    });

    for (const [bi, handle, pkgTitle, price, rev, conv, impr, rating, review, ago] of PAST_DEALS) {
      const bid = bizIds[bi];
      const cid = creatorIds[handle];
      const promo = `${handle.slice(0, 8).toUpperCase()}${10 + (ago % 89)}`;
      const deadline = new Date(Date.now() - (ago - 10) * 864e5).toISOString().slice(0, 10);
      const dealId = ins(`INSERT INTO deals (business_id, creator_id, package_id, title, status, price_cents, deliverables, deadline, promo_code, contract_text,
          business_signed_at, creator_signed_at, funded_at, delivered_at, delivery_url, completed_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        bid, cid, pkgIds[`${handle}|${pkgTitle}`], pkgTitle, price * 100, pkgTitle, deadline, promo, `INFLUENCER SERVICES AGREEMENT (seeded): ${pkgTitle}`,
        daysAgo(ago), daysAgo(ago), daysAgo(ago - 1), daysAgo(ago - 8), `https://example.com/post/${handle}`, daysAgo(ago - 9), daysAgo(ago + 2), daysAgo(ago - 9));
      ins('INSERT INTO offers (deal_id, from_user_id, price_cents, deliverables, deadline, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', dealId, bid, price * 100, pkgTitle, deadline, 'accepted', daysAgo(ago + 2));
      ins('INSERT INTO transactions (deal_id, type, amount_cents, created_at) VALUES (?, ?, ?, ?)', dealId, 'escrow_fund', price * 100, daysAgo(ago - 1));
      ins('INSERT INTO transactions (deal_id, type, amount_cents, created_at) VALUES (?, ?, ?, ?)', dealId, 'buyer_fee', price * 5, daysAgo(ago - 1));
      ins('INSERT INTO transactions (deal_id, type, amount_cents, created_at) VALUES (?, ?, ?, ?)', dealId, 'seller_fee', price * 10, daysAgo(ago - 9));
      ins('INSERT INTO transactions (deal_id, type, amount_cents, created_at) VALUES (?, ?, ?, ?)', dealId, 'payout', price * 90, daysAgo(ago - 9));
      ins('INSERT INTO results (deal_id, impressions, clicks, conversions, revenue_cents) VALUES (?, ?, ?, ?, ?)', dealId, impr, Math.round(conv * 4.5), conv, rev * 100);
      ins('INSERT INTO reviews (deal_id, reviewer_id, reviewee_id, rating, body, created_at) VALUES (?, ?, ?, ?, ?, ?)', dealId, bid, cid, rating, review, daysAgo(ago - 10));
      ins('INSERT INTO reviews (deal_id, reviewer_id, reviewee_id, rating, body, created_at) VALUES (?, ?, ?, ?, ?, ?)', dealId, cid, bid, 5, 'Clear brief, paid promptly.', daysAgo(ago - 10));
    }

    // A live negotiation so the deal room has something to show.
    const live = ins(`INSERT INTO deals (business_id, creator_id, package_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
      bizIds[0], creatorIds.aaliyahstyle, pkgIds['aaliyahstyle|Try-on haul TikTok'], 'Try-on haul TikTok', daysAgo(2), daysAgo(1));
    ins('INSERT INTO offers (deal_id, from_user_id, price_cents, deliverables, deadline, note, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      live, bizIds[0], 220000, '1× TikTok try-on featuring the GlowLab body line', dateIn(14), 'Love your hauls. Could you do $2,200 since we would like to work together monthly?', 'superseded', daysAgo(2));
    ins('INSERT INTO offers (deal_id, from_user_id, price_cents, deliverables, deadline, note, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      live, creatorIds.aaliyahstyle, 260000, '1× TikTok try-on + 1 story with link sticker', dateIn(14), "I can do $2,600 and add a story with a link sticker. Happy to discount a 3-month package.", 'pending', daysAgo(1));

    // A funded deal with a performance bonus, waiting on the brand to review the draft.
    const escrowDeal = ins(`INSERT INTO deals (business_id, creator_id, package_id, title, status, price_cents, deliverables, deadline, promo_code, contract_text, checklist,
        bonus_cents, bonus_metric, bonus_target, bonus_status, business_signed_at, creator_signed_at, funded_at, draft_url, draft_note, draft_submitted_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'draft_submitted', 220000, ?, ?, 'MAYAGLOW42', ?, ?, 30000, 'views', 150000, 'held', ?, ?, ?, ?, ?, ?, ?, ?)`,
      bizIds[0], creatorIds.mayaglow, pkgIds['mayaglow|Skincare Reel feature'], 'Night serum launch Reel', '1× Instagram Reel featuring the GlowLab night serum', dateIn(9),
      'INFLUENCER SERVICES AGREEMENT (seeded): includes escrow, draft approval and a $300 bonus at 150,000 views.',
      JSON.stringify(['Deliverables match the contract: 1× Instagram Reel featuring the GlowLab night serum', 'Promo code MAYAGLOW42 appears in the caption or on screen',
        'Sponsorship is disclosed (#ad or the platform’s paid-partnership label)', `Content went live on or before ${dateIn(9)}`, 'Content stays live for at least 30 days'].map((text) => ({ text, confirmed: false }))),
      daysAgo(6), daysAgo(6), daysAgo(5), 'https://drive.example.com/maya-serum-draft.mp4', 'Draft cut. Happy to swap the opening shot if you prefer the bottle close-up.', daysAgo(1), daysAgo(7), daysAgo(1));
    ins('INSERT INTO offers (deal_id, from_user_id, price_cents, deliverables, deadline, bonus_cents, bonus_metric, bonus_target, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      escrowDeal, bizIds[0], 220000, '1× Instagram Reel featuring the GlowLab night serum', dateIn(9), 30000, 'views', 150000, 'accepted', daysAgo(7));
    ins('INSERT INTO transactions (deal_id, type, amount_cents, note, created_at) VALUES (?, ?, ?, ?, ?)', escrowDeal, 'escrow_fund', 220000, '', daysAgo(5));
    ins('INSERT INTO transactions (deal_id, type, amount_cents, note, created_at) VALUES (?, ?, ?, ?, ?)', escrowDeal, 'bonus_fund', 30000, 'bonus', daysAgo(5));
    ins('INSERT INTO transactions (deal_id, type, amount_cents, note, created_at) VALUES (?, ?, ?, ?, ?)', escrowDeal, 'buyer_fee', 12500, '', daysAgo(5));
    for (const [body, ago] of [['Escrow funded: $2,500.00 is secured (including a $300.00 performance bonus). The creator can start.', 5], ['Maya Chen submitted a draft for review. The brand has 3 days to respond.', 1]]) {
      ins('INSERT INTO messages (deal_id, body, system, created_at) VALUES (?, ?, 1, ?)', escrowDeal, body, daysAgo(ago));
    }

    const campaigns = [
      [0, 'Summer SPF launch: 10 creators', 'We are launching a mineral SPF in June. We want honest first-impression videos showing texture and no white cast. Include code for 20% off.', 15000, ['beauty', 'lifestyle'], ['tiktok', 'instagram'], 30],
      [1, 'Gym-bag snack challenge', 'Show FuelBar as your pre- or post-workout snack in a real training session. Bonus for recipes using crumbled bars.', 6000, ['fitness', 'food'], ['youtube', 'instagram', 'tiktok'], 21],
      [2, 'First $100 invested', 'Walk your audience through investing their first $100 with Stackly. Must follow FINRA-friendly disclosure language (we provide it).', 20000, ['finance', 'education'], ['tiktok', 'youtube'], 28],
    ];
    for (const [bi, title, brief, budget, niches, platforms, days] of campaigns) {
      ins('INSERT INTO campaigns (business_id, title, brief, budget_cents, niches, platforms, deadline) VALUES (?, ?, ?, ?, ?, ?, ?)',
        bizIds[bi], title, brief, budget * 100, JSON.stringify(niches), JSON.stringify(platforms), dateIn(days));
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const db = openDb();
  for (const t of ['transactions', 'reviews', 'results', 'messages', 'feedback', 'offers', 'deals', 'campaigns', 'media', 'metric_snapshots', 'ig_connections', 'deletion_requests', 'posts', 'trends', 'packages', 'socials', 'creators', 'businesses', 'users']) db.exec(`DELETE FROM ${t}`);
  seed(db);
  console.log(`Seeded. Log in as brand@glowlab.co or mayaglow@creator.demo with password "${DEMO_PASSWORD}".`);
}
