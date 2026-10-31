// Content growth engine: creator stage, hook analysis, post analytics,
// stage missions, recommendations and crowd-sourced trend tracking.
import { BENCHMARK_ER } from './pricing.js';

export const EDIT_STYLES = ['talking head', 'jump cuts', 'voiceover + b-roll', 'text on screen', 'transitions', 'green screen'];
export const POST_FORMATS = { instagram: ['reel', 'carousel', 'story', 'post'], tiktok: ['video', 'live'], youtube: ['short', 'video'], x: ['post', 'thread'], twitch: ['live'] };

export const STAGES = [
  { key: 'day1', label: 'Day 1', name: 'Launch', min: 0, target_per_week: 5, focus: 'Find your voice and build the habit. Volume teaches you faster than perfection.' },
  { key: 'day100', label: 'Day 100', name: 'Momentum', min: 5000, target_per_week: 4, focus: 'Double down on what works. Turn one-off hits into repeatable formats.' },
  { key: 'day1000', label: 'Day 1000', name: 'Scale', min: 100000, target_per_week: 3, focus: 'Protect quality, expand platforms and turn reach into a business.' },
];

export function stageFor(maxFollowers) {
  return [...STAGES].reverse().find((s) => maxFollowers >= s.min);
}

const today = () => new Date().toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / 864e5);
const round1 = (n) => Math.round(n * 10) / 10;
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

// ---------- hooks ----------
const FILLER = /^(hey|hi|hello|so[, ]|ok(ay)?[, ]|welcome|today i|in this video|what'?s up|good morning)/i;
const HOOK_TYPES = [
  ['result-first', /\b(before|after|results?|i (made|lost|gained|saved|grew|tried|tested))\b|\$\d|\b\d+\s?(k|lbs|kg|days|weeks|%)\b/i, 14],
  ['list', /^\d+\s|\b\d+\s(ways|things|tips|reasons|mistakes|products|steps|hacks)\b/i, 10],
  ['warning', /\b(stop|don'?t|never|mistakes?|worst|avoid|wrong|quit)\b/i, 12],
  ['question', /\?\s*$|^(how|why|what|who|which|did|do|does|is|are|can|should|would)\b/i, 10],
  ['callout', /^(if you|you'?re|you are|for (anyone|everyone)|(girls|guys|people|moms|dads) who)\b/i, 12],
  ['curiosity', /\b(secret|nobody|no one|hidden|truth|actually|won'?t believe|here'?s why|the reason|finally)\b/i, 12],
  ['story', /^(story ?time|pov|i |my |when i)/i, 6],
];

export const HOOK_PATTERNS = [
  { type: 'result-first', pattern: 'I tried [thing] for 30 days. Here’s what happened', why: 'Opens with the payoff, so viewers stay to see how.' },
  { type: 'warning', pattern: 'Stop doing [common habit] if you want [result]', why: 'Fear of a mistake beats curiosity for stopping the scroll.' },
  { type: 'list', pattern: '3 [topic] mistakes you’re probably making', why: 'Viewers know the length and keep watching to finish the list.' },
  { type: 'callout', pattern: 'If you [have this problem], watch this', why: 'Viewers who match the description feel it’s made for them.' },
  { type: 'question', pattern: 'Why does nobody talk about [surprising fact]?', why: 'An open question the video has to answer.' },
  { type: 'curiosity', pattern: 'The [topic] secret nobody tells you', why: 'Promises something new without giving it away.' },
];

export function hookType(hook) {
  const text = String(hook || '').trim();
  return HOOK_TYPES.find(([, re]) => re.test(text))?.[0] ?? 'statement';
}

export function analyzeHook({ hook, duration_s, hold_3s_pct, format } = {}) {
  const text = String(hook || '').trim();
  const words = text.split(/\s+/).filter(Boolean);
  const type = hookType(text);
  const tips = [];
  let score = 45 + (HOOK_TYPES.find(([t]) => t === type)?.[2] ?? 0);

  if (FILLER.test(text)) {
    score -= 22;
    tips.push('Cut the greeting. “Hey guys” or “So today…” spends your first second on nothing; start with the most interesting line.');
  }
  if (words.length <= 10) score += 12;
  else if (words.length <= 15) { score += 4; tips.push(`Trim to 10 words or fewer (it’s ${words.length}). The hook should land within about 2 seconds.`); }
  else { score -= 12; tips.push(`At ${words.length} words this is a sentence, not a hook. Cut it to the single most interesting claim.`); }
  if (/\d/.test(text)) score += 6;
  else if (!['list', 'result-first'].includes(type)) tips.push('Add a specific number (a time, price, count or result). Specific claims feel credible.');
  if (/\byou(r|'re)?\b/i.test(text)) score += 6;
  else tips.push('Speak to the viewer. Using “you” makes the hook about them, not you.');
  if (type === 'statement' || type === 'story') tips.push('Try a stronger pattern: lead with the result, a warning, or a question the video answers (see patterns below).');

  if (hold_3s_pct != null && hold_3s_pct !== '') {
    const hold = Number(hold_3s_pct);
    if (hold >= 70) score += 15;
    else if (hold >= 55) score += 5;
    else if (hold < 45) { score -= 15; tips.push(`Only ${hold}% of viewers made it past 3 seconds. Show the payoff in the first frame and put the hook in on-screen text too.`); }
    else { score -= 5; tips.push(`3-second hold is ${hold}%. Aim for 60%+ by cutting the dead air before your first word.`); }
  }
  const shortForm = ['reel', 'video', 'short'].includes(format);
  if (shortForm && duration_s) {
    if (duration_s >= 7 && duration_s <= 35) score += 5;
    else if (duration_s > 60) { score -= 6; tips.push(`${duration_s}s is long for short-form. Test a tighter 20–35s cut of the same idea.`); }
  }
  score = Math.max(0, Math.min(100, Math.round(score)));
  const grade = score >= 80 ? 'Strong' : score >= 60 ? 'Good' : score >= 40 ? 'Weak' : 'Rework';
  return { score, grade, type, word_count: words.length, has_filler: FILLER.test(text), tips, patterns: HOOK_PATTERNS.filter((p) => p.type !== type).slice(0, 3) };
}

// ---------- post analytics ----------
export const postEr = (p) => (p.views ? ((p.likes + p.comments + p.shares + p.saves) / p.views) * 100 : 0);

const DURATION_BUCKETS = [[0, 15, 'Under 15s'], [15, 30, '15–30s'], [30, 60, '30–60s'], [60, Infinity, '60s+']];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function groupStats(posts, keyFn) {
  const groups = new Map();
  for (const p of posts) {
    const k = keyFn(p);
    if (k == null) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(p);
  }
  return [...groups].map(([key, ps]) => ({
    key, n: ps.length, avg_er: round1(avg(ps.map(postEr))), avg_views: Math.round(avg(ps.map((p) => p.views))),
  })).sort((a, b) => b.avg_er - a.avg_er);
}

export function weeklyCounts(posts, weeks = 8, end = today()) {
  const out = Array.from({ length: weeks }, (_, i) => ({ week_start: new Date(Date.parse(end) - (7 * (weeks - i) - 1) * 864e5).toISOString().slice(0, 10), posts: 0 }));
  for (const p of posts) {
    const ago = daysBetween(end, p.posted_at);
    if (ago < 0 || ago >= weeks * 7) continue;
    out[weeks - 1 - Math.floor(ago / 7)].posts += 1;
  }
  return out;
}

// Compare the best and worst groups that each have enough posts to trust.
function spread(groups, min = 3) {
  const ok = groups.filter((g) => g.n >= min);
  if (ok.length < 2) return null;
  const best = ok[0], worst = ok.at(-1);
  return worst.avg_er > 0 ? { best, worst, ratio: round1(best.avg_er / worst.avg_er) } : null;
}

export function analyzePosts(posts) {
  const enriched = posts.map((p) => ({ ...p, er: round1(postEr(p)), hook_type: hookType(p.hook), hook_score: analyzeHook(p).score }));
  const recent = enriched.filter((p) => daysBetween(today(), p.posted_at) < 30);
  const withHold = enriched.filter((p) => p.hold_3s_pct != null).slice(0, 10);
  return {
    posts: enriched,
    total: enriched.length,
    last_7d: enriched.filter((p) => daysBetween(today(), p.posted_at) < 7).length,
    avg_er: round1(avg(recent.map((p) => p.er)) ?? 0),
    avg_views: Math.round(avg(recent.map((p) => p.views)) ?? 0),
    avg_hold_3s: withHold.length ? Math.round(avg(withHold.map((p) => p.hold_3s_pct))) : null,
    avg_hook_score: enriched.length ? Math.round(avg(enriched.slice(0, 20).map((p) => p.hook_score))) : null,
    by_format: groupStats(enriched, (p) => `${p.platform} ${p.format}`),
    by_edit_style: groupStats(enriched, (p) => p.edit_style || null),
    by_hook_type: groupStats(enriched, (p) => p.hook_type),
    by_weekday: groupStats(enriched, (p) => WEEKDAYS[new Date(`${p.posted_at}T12:00:00Z`).getUTCDay()]),
    by_duration: groupStats(enriched, (p) => (p.duration_s ? DURATION_BUCKETS.find(([lo, hi]) => p.duration_s >= lo && p.duration_s < hi)[2] : null)),
    trend_vs_not: groupStats(enriched, (p) => (p.trend_id ? 'Using a trend' : 'Original')),
    sponsored_vs_organic: groupStats(enriched, (p) => (p.sponsored ? 'Sponsored' : 'Organic')),
    top_posts: [...enriched].sort((a, b) => b.er - a.er).slice(0, 3),
  };
}

// ---------- trends ----------
// Momentum is measured from posts every creator logs on the platform.
export function trendStats(trends, allPosts, myPosts = []) {
  const now = today();
  const nonTrendEr = {};
  for (const platform of new Set(trends.map((t) => t.platform))) {
    nonTrendEr[platform] = avg(allPosts.filter((p) => p.platform === platform && !p.trend_id && daysBetween(now, p.posted_at) < 30).map(postEr)) ?? 0;
  }
  return trends.map((t) => {
    const uses = allPosts.filter((p) => p.trend_id === t.id);
    const last7 = uses.filter((p) => daysBetween(now, p.posted_at) < 7).length;
    const prev7 = uses.filter((p) => { const d = daysBetween(now, p.posted_at); return d >= 7 && d < 14; }).length;
    const recentEr = avg(uses.filter((p) => daysBetween(now, p.posted_at) < 30).map(postEr));
    let momentum = 'steady';
    if (last7 >= 2 && last7 >= prev7 * 1.5) momentum = 'rising';
    else if (last7 >= 2 && last7 >= prev7 * 0.7) momentum = 'peaking';
    else if (prev7 > 0 && last7 < prev7 * 0.7) momentum = 'fading';
    else if (uses.length === 0) momentum = 'new';
    const mine = myPosts.filter((p) => p.trend_id === t.id);
    return {
      ...t, niches: JSON.parse(t.niches || '[]'), uses_7d: last7, uses_prev_7d: prev7, uses_total: uses.length, momentum,
      avg_er: recentEr == null ? null : round1(recentEr),
      uplift_pct: recentEr != null && nonTrendEr[t.platform] ? Math.round((recentEr / nonTrendEr[t.platform] - 1) * 100) : null,
      my_uses: mine.length, my_avg_er: mine.length ? round1(avg(mine.map(postEr))) : null,
    };
  }).sort((a, b) => ({ rising: 0, peaking: 1, new: 2, steady: 3, fading: 4 }[a.momentum] - { rising: 0, peaking: 1, new: 2, steady: 3, fading: 4 }[b.momentum]) || b.uses_7d - a.uses_7d);
}

// ---------- missions ----------
const m = (key, label, why, progress, current) => ({ key, label, why, progress: Math.max(0, Math.min(1, progress)), current, done: progress >= 1 });

export function missionsFor(stage, ctx) {
  const { a, socials, niches, packages, stats, pricing, trendsUsed30d, repeatBrands } = ctx;
  const maxF = Math.max(0, ...socials.map((s) => s.followers));
  const weeks = weeklyCounts(a.posts, 8);
  const hitWeeks = (n, target) => weeks.slice(-n).filter((w) => w.posts >= target).length;
  const main = [...socials].sort((x, y) => y.followers - x.followers)[0];
  const mainEr = main ? avg(a.posts.filter((p) => p.platform === main.platform).map(postEr)) : null;

  if (stage.key === 'day1') {
    const strongHooks = a.posts.filter((p) => p.hook_score >= 70).length;
    const styles = new Set(a.posts.map((p) => p.edit_style).filter(Boolean)).size;
    return [
      m('niche', 'Choose your niche', 'The algorithm and brands both need to know what you’re about.', niches.length ? 1 : 0, niches.length ? niches.join(', ') : 'None set'),
      m('log10', 'Log your first 10 posts', 'You can’t improve what you don’t measure.', a.total / 10, `${a.total}/10 posts`),
      m('habit', 'Post 5× a week for 4 weeks', 'Early growth comes from volume: more posts means more chances to find what works.', hitWeeks(4, 5) / 4, `${hitWeeks(4, 5)}/4 weeks`),
      m('styles', 'Test 3 editing styles', 'Find the style your audience responds to before settling on one.', styles / 3, `${styles}/3 styles`),
      m('hooks', 'Score 70+ on 5 hooks', 'The first 2 seconds decide whether anyone sees the rest.', strongHooks / 5, `${strongHooks}/5 hooks`),
      m('ugc', 'List a UGC package', 'Brands pay for content itself, so you can earn before you have an audience.', packages.some((p) => p.deliverable_type === 'ugc') ? 1 : 0, packages.some((p) => p.deliverable_type === 'ugc') ? 'Listed' : 'Not listed'),
      m('reach', 'Reach 5K followers', 'Unlocks Day 100: Momentum.', maxF / 5000, `${maxF.toLocaleString()}/5,000`),
    ];
  }
  if (stage.key === 'day100') {
    const winner = spread(a.by_edit_style) || spread(a.by_format);
    const bench = main ? BENCHMARK_ER[main.platform] : null;
    return [
      m('consistency', 'Post 4× a week for 8 weeks', 'Consistency is what algorithms reward at this stage.', hitWeeks(8, 4) / 8, `${hitWeeks(8, 4)}/8 weeks`),
      m('winner', 'Find your winning format', 'One format that beats your others by 30%+ is a series waiting to happen.', winner && winner.ratio >= 1.3 ? 1 : a.total / 15, winner && winner.ratio >= 1.3 ? `${winner.best.key}: ${winner.ratio}× your weakest` : `Need more data (${a.total}/15 posts)`),
      m('hold', 'Average 60%+ 3-second hold', 'Hold rate is the strongest signal for reach on short-form.', a.avg_hold_3s ? a.avg_hold_3s / 60 : 0, a.avg_hold_3s ? `${a.avg_hold_3s}% avg (last 10)` : 'Log 3s hold on your posts'),
      m('trends', 'Ride 3 trends in 30 days', 'Trends hand you distribution; your take on one earns the follow.', trendsUsed30d / 3, `${trendsUsed30d}/3 trends`),
      m('engagement', `Beat the ${main?.platform ?? ''} engagement benchmark`, 'Above-benchmark engagement raises your rate on every package.', mainEr && bench ? mainEr / bench : 0, mainEr ? `${round1(mainEr)}% vs ${bench}% benchmark` : 'Log posts to measure'),
      m('deals', 'Complete 2 paid deals', 'Your first case studies are what let you raise your price.', stats.completed_deals / 2, `${stats.completed_deals}/2 deals`),
      m('reach', 'Reach 100K followers', 'Unlocks Day 1000: Scale.', maxF / 100000, `${maxF.toLocaleString()}/100,000`),
    ];
  }
  const sp = a.sponsored_vs_organic;
  const spon = sp.find((g) => g.key === 'Sponsored'), org = sp.find((g) => g.key === 'Organic');
  const sponsoredOk = spon && org && spon.n >= 2 ? spon.avg_er / org.avg_er : 0;
  const second = socials.filter((s) => s.followers >= 10000).length;
  const fair = pricing.length ? pricing.filter((p) => p.verdict !== 'underpriced').length / pricing.length : 0;
  return [
    m('platforms', 'Build a second 10K+ platform', 'Spreading across platforms protects your income from algorithm changes.', second / 2, `${second}/2 platforms`),
    m('cadence', 'Hold 3 quality posts a week', 'At scale, consistency and quality matter more than raw volume.', hitWeeks(8, 3) / 8, `${hitWeeks(8, 3)}/8 weeks`),
    m('sponsored', 'Keep sponsored ER within 80% of organic', 'Ads that feel like your content keep your audience and your rates.', sponsoredOk / 0.8, spon && spon.n >= 2 ? `${Math.round(sponsoredOk * 100)}% of organic` : 'Log 2+ sponsored posts'),
    m('hooks', 'Average 75+ hook score', 'Small improvements to hooks add up across a large audience.', (a.avg_hook_score ?? 0) / 75, `${a.avg_hook_score ?? '—'} avg (last 20)`),
    m('repeat', 'Win 2 repeat brand partners', 'Brands that rebook are steady income and your best references.', repeatBrands / 2, `${repeatBrands}/2 brands`),
    m('roi', 'Drive 3× ROI for brands', 'Proven ROI is what justifies top-tier pricing.', (stats.avg_roi ?? 0) / 3, stats.avg_roi ? `${stats.avg_roi}× avg` : 'No results yet'),
    m('pricing', 'Price every package at market or above', 'At this stage, undercharging is the easiest money to recover.', fair, `${Math.round(fair * 100)}% of packages`),
  ];
}

// ---------- recommendations ----------
export function recommendations(stage, ctx) {
  const { a, packages, stats, risingUnused } = ctx;
  const recs = [];
  const add = (impact, area, title, detail) => recs.push({ impact, area, title, detail });

  if (a.total < 5) {
    add(3, 'data', 'Log at least 5 posts to unlock your analysis', 'Add your recent posts with the hook, format, edit style and stats. We’ll show you what’s working.');
  }
  const weeks = weeklyCounts(a.posts, 4);
  const avg4 = round1(avg(weeks.map((w) => w.posts)));
  if (a.last_7d < stage.target_per_week) {
    add(3, 'frequency', `Post ${stage.target_per_week - a.last_7d} more time${stage.target_per_week - a.last_7d > 1 ? 's' : ''} this week`,
      `You posted ${a.last_7d} in the last 7 days (4-week avg ${avg4}/week). ${stage.label} creators should aim for ${stage.target_per_week}/week. Film 3–4 videos in one session to keep up.`);
  }
  const fillers = a.posts.slice(0, 20).filter((p) => analyzeHook(p).has_filler).length;
  if (fillers >= 2) add(3, 'hooks', `Drop the greeting: ${fillers} of your last ${Math.min(20, a.total)} hooks open with filler`, 'Start on the most interesting line. Run your next hook through the Hook lab before you film.');
  if (a.avg_hold_3s != null && a.avg_hold_3s < 55) add(3, 'hooks', `Lift your 3-second hold from ${a.avg_hold_3s}%`, 'Show the result in the first frame, put the hook in on-screen text, and cut every pause before your first word.');
  const ht = spread(a.by_hook_type, 2);
  if (ht && ht.ratio >= 1.25) add(2, 'hooks', `“${ht.best.key}” hooks get ${ht.ratio}× the engagement of “${ht.worst.key}” hooks`, `Your ${ht.best.n} ${ht.best.key} hooks average ${ht.best.avg_er}% ER vs ${ht.worst.avg_er}%. Open your next 3 posts that way.`);
  const es = spread(a.by_edit_style);
  if (es && es.ratio >= 1.3) add(2, 'editing', `${cap(es.best.key)} beats ${es.worst.key} by ${es.ratio}×`, `${es.best.avg_er}% vs ${es.worst.avg_er}% ER across ${es.best.n + es.worst.n} posts. Make ${es.best.key} your default and save ${es.worst.key} for occasional variety.`);
  const fm = spread(a.by_format);
  if (fm && fm.ratio >= 1.3) add(2, 'format', `Your ${fm.best.key} posts outperform`, `${fm.best.avg_er}% ER and ${fm.best.avg_views.toLocaleString()} avg views. Turn your best one into a recurring series.`);
  const tv = a.trend_vs_not;
  const tr = tv.find((g) => g.key === 'Using a trend'), og = tv.find((g) => g.key === 'Original');
  if (tr && og && tr.n >= 2 && og.avg_er > 0 && tr.avg_er / og.avg_er >= 1.15) add(2, 'trends', `Trends give you +${Math.round((tr.avg_er / og.avg_er - 1) * 100)}% engagement`, 'Your trend posts consistently beat your originals. Aim for 1–2 trend posts a week.');
  if (risingUnused.length) add(2, 'trends', `Jump on ${risingUnused.length > 1 ? 'rising trends' : 'a rising trend'} in your niche`, `${risingUnused.slice(0, 2).map((t) => `“${t.name}” (${t.platform})`).join(' and ')}: usage is climbing across creators on the platform. Being early is when trends pay off most.`);
  const wd = a.by_weekday.filter((g) => g.n >= 3);
  if (wd.length >= 3 && a.avg_er && wd[0].avg_er / a.avg_er >= 1.25) add(1, 'timing', `${wd[0].key}s are your best day`, `Posts on ${wd[0].key} average ${wd[0].avg_er}% ER vs ${a.avg_er}% overall. Save your strongest idea for it.`);
  const du = spread(a.by_duration);
  if (du && du.ratio >= 1.3) add(1, 'length', `${du.best.key} videos work best for you`, `${du.best.avg_er}% ER vs ${du.worst.avg_er}% for ${du.worst.key}. Edit to that length first.`);

  if (stage.key === 'day1' && !packages.some((p) => p.deliverable_type === 'ugc')) add(2, 'monetize', 'Start earning with a UGC package', 'Brands buy product videos to run on their own channels, so your follower count doesn’t matter. List one in Studio.');
  if (stage.key === 'day100' && stats.completed_deals < 2) add(2, 'monetize', 'Pitch on open briefs', 'Your first 2 paid deals give you case studies, and those unlock higher rates and the Pro tier.');
  const sp = a.sponsored_vs_organic;
  const spon = sp.find((g) => g.key === 'Sponsored'), org = sp.find((g) => g.key === 'Organic');
  if (spon && org && spon.n >= 2 && spon.avg_er < org.avg_er * 0.8) add(stage.key === 'day1000' ? 3 : 2, 'monetize', `Sponsored posts get ${Math.round((1 - spon.avg_er / org.avg_er) * 100)}% less engagement`, 'Build sponsored posts in your best-performing format and edit style, and show the product in use instead of a scripted read.');

  return recs.sort((x, y) => y.impact - x.impact).slice(0, 6);
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
