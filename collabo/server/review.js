// Collabo content review: checks a draft or final caption against the deal
// (disclosure, promo code, brand, hook, CTA, length, hashtags, risky claims)
// and suggests hashtags and wording. Optionally asks Claude for written feedback.
import Anthropic from '@anthropic-ai/sdk';
import { analyzeHook } from './content.js';

const NICHE_TAGS = {
  beauty: ['skincare', 'skincareroutine', 'beautytips', 'glowyskin', 'cleanbeauty'],
  fashion: ['ootd', 'styleinspo', 'outfitideas', 'fashiontok', 'whatiwore'],
  fitness: ['fitnessmotivation', 'gymtok', 'workoutroutine', 'proteinsnack', 'fitlife'],
  food: ['foodtok', 'easyrecipes', 'foodie', 'whatieatinaday', 'mealprep'],
  travel: ['traveltok', 'travelgram', 'wanderlust', 'packingtips', 'weekendtrip'],
  tech: ['techtok', 'desksetup', 'productivity', 'gadgets', 'techreview'],
  gaming: ['gamingsetup', 'gamer', 'twitchstreamer', 'gamingcommunity', 'setupwars'],
  finance: ['personalfinance', 'moneytips', 'investing101', 'budgeting', 'financetok'],
  parenting: ['momlife', 'parentinghacks', 'toddlermom', 'momtok', 'familytime'],
  home: ['homedecor', 'homeinspo', 'cozyhome', 'apartmentliving', 'homemakeover'],
  pets: ['dogsoftiktok', 'petsofinstagram', 'dogmom', 'huskiesofinstagram', 'petcare'],
  music: ['producer', 'beatmaker', 'musicproducer', 'studiolife', 'flstudio'],
  comedy: ['comedy', 'skit', 'funnyvideos', 'relatable', 'comedytok'],
  lifestyle: ['dayinmylife', 'lifestyle', 'thatgirl', 'morningroutine', 'selfcare'],
  education: ['learnontiktok', 'studytok', 'studytips', 'didyouknow', 'edutok'],
};
const NICHE_WORDS = {
  beauty: ['glow', 'gentle', 'hydrated', 'non-greasy', 'ritual'], fashion: ['effortless', 'versatile', 'styled 3 ways', 'staple', 'fit check'],
  fitness: ['fuel', 'recovery', 'protein-packed', 'gym bag essential', 'pre-workout'], food: ['crispy', 'in 15 minutes', 'one-pan', 'meal prep', 'craveable'],
  travel: ['carry-on', 'hidden gem', 'weekend-ready', 'packs flat', 'itinerary'], tech: ['setup upgrade', 'saves me hours', 'seamless', 'workflow', 'game-changer'],
  gaming: ['setup', 'latency', 'clutch', 'ranked-ready', 'battle-tested'], finance: ['automate', 'first $100', 'compound', 'no-fee', 'side income'],
  parenting: ['mom-tested', 'lifesaver', 'mess-free', 'nap-time', 'toddler-approved'], home: ['cozy', 'renter-friendly', 'under $50', 'before and after', 'refresh'],
  pets: ['vet-approved', 'tail wags', 'picky eater', 'zoomies', 'husky-tested'], music: ['workflow', 'sound design', 'in the mix', 'one-shot', 'sample pack'],
  comedy: ['POV', 'plot twist', 'tag a friend', 'the way I', 'not me'], lifestyle: ['ritual', 'reset', 'little luxury', 'routine', 'everyday'],
  education: ['in 60 seconds', 'cheat sheet', 'save this', 'step by step', 'explained'],
};
const LOW_VALUE_TAGS = ['fyp', 'foryou', 'foryoupage', 'viral', 'explore', 'trending', 'xyzbca'];
const RISKY = [/\bcures?\b/i, /\bheals?\b/i, /\btreats? (acne|eczema|anxiety|depression)\b/i, /clinically proven/i, /guaranteed (results|to)/i, /\bmiracle\b/i, /FDA[- ]approved/i, /lose \d+\s?(lbs|pounds|kg)/i, /risk[- ]free/i, /get rich/i];
const DISCLOSURE = /#ad\b|#sponsored\b|#partner\b|paid partnership/i;
const CTA = /link in (my )?bio|use (my )?code|shop (now|it)|tap (the|to)|swipe up|order (now|yours)|book (now|yours)|get yours|try it|grab yours|check out/i;
const HASHTAG_RANGE = { instagram: [3, 8], tiktok: [3, 6], youtube: [2, 5], x: [1, 3], twitch: [0, 3], any: [0, 8] };

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
export const parseTags = (...texts) => [...new Set(texts.join(' ').match(/#[\p{L}\p{N}_]+/gu) ?? [])].map((t) => t.slice(1).toLowerCase());

export function suggestHashtags({ company, niches = [], trends = [], platform }) {
  const out = ['ad', slug(company).slice(0, 24)];
  for (const n of niches.slice(0, 2)) out.push(...(NICHE_TAGS[n] ?? []).slice(0, n === niches[0] ? 3 : 2));
  for (const t of trends.slice(0, 1)) out.push(slug(t.name).slice(0, 28));
  const [, max] = HASHTAG_RANGE[platform] ?? HASHTAG_RANGE.any;
  return [...new Set(out.filter(Boolean))].slice(0, Math.max(max, 4)).map((t) => `#${t}`);
}

// The main deliverable decides platform and length expectations.
function mainItem(items) {
  const list = items ?? [];
  return list.find((i) => i.duration_s && i.format !== 'story') ?? list[0] ?? null;
}

export function reviewContent({ caption = '', hashtags = '', script = '', duration_s = null, deal, company, niches = [], trends = [] }) {
  const text = `${caption}\n${script}`;
  const tags = parseTags(caption, hashtags);
  const item = mainItem(deal.items);
  const platform = item?.platform ?? 'instagram';
  const checks = [];
  const add = (key, label, status, detail) => checks.push({ key, label, status, detail });

  add('disclosure', 'Sponsorship disclosed', DISCLOSURE.test(`${caption} ${hashtags}`) ? 'pass' : 'fail',
    DISCLOSURE.test(`${caption} ${hashtags}`) ? 'Disclosure found.' : 'Add #ad (or turn on the paid-partnership label). FTC rules require it, and so does your contract.');
  const promo = deal.promo_code && new RegExp(deal.promo_code, 'i').test(text);
  add('promo', `Promo code ${deal.promo_code ?? ''}`.trim(), promo ? 'pass' : 'fail', promo ? 'Promo code included.' : `Say or show “${deal.promo_code}”, and put it in the caption, so sales are credited to you.`);
  const brandWord = String(company).split(/\s+/)[0];
  const brand = brandWord && new RegExp(`\\b${brandWord.replace(/[^\w]/g, '')}`, 'i').test(text);
  add('brand', `Mentions ${company}`, brand ? 'pass' : 'warn', brand ? 'Brand is named.' : `Name ${company} in the caption so viewers know where to buy.`);

  const hookLine = (script || caption).split(/\n|[.!?](\s|$)/)[0]?.trim() ?? '';
  const hook = hookLine ? analyzeHook({ hook: hookLine, duration_s, format: item?.format }) : null;
  add('hook', 'Opening hook', !hook ? 'warn' : hook.score >= 70 ? 'pass' : hook.score >= 50 ? 'warn' : 'fail',
    !hook ? 'Add the opening line (the first thing said or shown) to get it scored.' : `Hook score ${hook.score}/100 (${hook.type}).${hook.tips[0] ? ` ${hook.tips[0]}` : ''}`);
  add('cta', 'Call to action', CTA.test(text) ? 'pass' : 'warn', CTA.test(text) ? 'Clear next step for the viewer.' : 'Tell viewers what to do next: “Use code … at checkout” or “Link in bio”.');

  if (item?.duration_s && item.format !== 'story' && item.format !== 'live') {
    const target = item.duration_s;
    if (!duration_s) add('length', `Length (contract: ${target}s)`, 'warn', 'Enter the video length to check it against the contract.');
    else {
      const off = Math.abs(duration_s - target) / target;
      add('length', `Length (contract: ${target}s)`, off <= 0.2 ? 'pass' : 'warn', off <= 0.2 ? `${duration_s}s matches the ${target}s in the contract.` : `${duration_s}s is ${duration_s > target ? 'longer' : 'shorter'} than the ${target}s in the contract. Trim it or agree the change with the brand.`);
    }
  }
  const [min, max] = HASHTAG_RANGE[platform] ?? HASHTAG_RANGE.any;
  const lowValue = tags.filter((t) => LOW_VALUE_TAGS.includes(t));
  add('hashtags', `Hashtags (${min}–${max} works best on ${platform === 'any' ? 'most platforms' : platform})`,
    tags.length >= min && tags.length <= max && !lowValue.length ? 'pass' : 'warn',
    `${tags.length} hashtag${tags.length === 1 ? '' : 's'}.${tags.length < min ? ' Add a few niche tags (see suggestions).' : ''}${tags.length > max ? ' Cut to the most specific ones.' : ''}${lowValue.length ? ` Drop ${lowValue.map((t) => `#${t}`).join(', ')}: they add reach to everyone, so they don't help you get found.` : ''}`);
  const risky = RISKY.map((re) => text.match(re)?.[0]).filter(Boolean);
  add('claims', 'No risky claims', risky.length ? 'fail' : 'pass', risky.length ? `Remove or soften: ${risky.map((w) => `“${w}”`).join(', ')}. Health, money and guarantee claims need proof and can break FTC rules.` : 'No health, money or guarantee claims found.');
  if (caption.length > 2200) add('caption_length', 'Caption length', 'fail', `${caption.length} characters; Instagram and TikTok cut captions at about 2,200.`);

  const pts = { pass: 1, warn: 0.5, fail: 0 };
  const checkScore = checks.reduce((a, c) => a + pts[c.status], 0) / checks.length;
  const score = Math.round(checkScore * 70 + (hook ? hook.score : 50) * 0.3);

  const suggested_hashtags = suggestHashtags({ company, niches, trends, platform });
  const words = [...new Set(niches.flatMap((n) => NICHE_WORDS[n] ?? []))].slice(0, 6);
  const ctas = [`Use code ${deal.promo_code} at checkout`, 'Link in bio', 'Save this for later', 'Tag someone who needs this'];
  const keepTags = [...new Set([...tags.filter((t) => !LOW_VALUE_TAGS.includes(t)).map((t) => `#${t}`), ...suggested_hashtags])].slice(0, max || 6);
  const opener = suggestOpener(hookLine, company);
  const suggested_caption = [
    opener,
    `${company} is part of my routine now. Use code ${deal.promo_code} at checkout (link in bio).`,
    [...new Set(['#ad', ...keepTags])].join(' '),
  ].filter(Boolean).join('\n\n');

  const feedback = checks.filter((c) => c.status !== 'pass').map((c) => c.detail);
  if (hook) for (const t of hook.tips.slice(1, 3)) if (!feedback.includes(t)) feedback.push(t);

  return { score, checks, hook: hook && { score: hook.score, type: hook.type, grade: hook.grade, line: hookLine }, suggested_hashtags, suggested_words: words, suggested_ctas: ctas, suggested_caption, feedback };
}

// A ready-to-post first line: the creator's own opener without filler, or a
// plain brand line when it's empty or makes a risky claim. Never a template.
function suggestOpener(line, company) {
  const cleaned = String(line)
    .replace(/^(hey|hi|hello)( guys| everyone| y'?all| friends)?[,!.]?\s*/i, '')
    .replace(/^(so|ok|okay|alright)[,]?\s*/i, '')
    .replace(/^(today )?i (just )?(wanted to|want to|am going to|'m going to|'m gonna) (show|tell) you( about)?\s*/i, '')
    .trim();
  if (cleaned.split(/\s+/).length < 3 || RISKY.some((re) => re.test(cleaned))) return `Here’s why ${company} made it into my routine.`;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

// ---------- optional Claude review ----------
export const aiEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY);
let client = null;

const AI_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'strengths', 'improvements', 'suggested_hashtags', 'suggested_caption'],
  properties: {
    summary: { type: 'string' },
    strengths: { type: 'array', items: { type: 'string' } },
    improvements: { type: 'array', items: { type: 'string' } },
    suggested_hashtags: { type: 'array', items: { type: 'string' } },
    suggested_caption: { type: 'string' },
  },
};

const SYSTEM = `You review sponsored social media content for a creator marketplace, before the brand sees it.
Give specific, practical feedback a creator can act on in minutes: the opening hook, clarity of the product benefit, call to action, caption wording, hashtags, and compliance (FTC disclosure, no unproven health, money or guarantee claims).
Base everything on the draft and contract provided. Do not invent facts about the product. Keep each point to one or two sentences. Hashtags include the # and suit the platform.`;

// Returns null (never throws) when AI is off or the call fails, so the
// rule-based review always stands on its own.
export async function aiReview({ deal, company, niches, caption, hashtags, script, duration_s, ruleReview }) {
  if (!aiEnabled()) return null;
  client ??= new Anthropic();
  const brief = {
    brand: company, creator_niches: niches, deliverables: deal.deliverables, contracted_items: deal.items, terms: deal.terms,
    promo_code: deal.promo_code, draft: { caption, hashtags, script, duration_s }, automated_checks: ruleReview.checks.map((c) => `${c.status}: ${c.label}: ${c.detail}`),
  };
  try {
    const response = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: AI_SCHEMA } },
      system: SYSTEM,
      messages: [{ role: 'user', content: `Review this draft against its contract. Data:\n${JSON.stringify(brief, null, 2)}` }],
    });
    if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens') return null;
    const text = response.content.find((b) => b.type === 'text')?.text;
    if (!text) return null;
    return { ...JSON.parse(text), model: response.model, generated_at: new Date().toISOString() };
  } catch (err) {
    if (err instanceof Anthropic.APIError) console.error(`AI review failed (${err.status}): ${err.message}`);
    else console.error('AI review failed:', err.message);
    return null;
  }
}
