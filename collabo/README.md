# Collabo: influencer marketing marketplace

A two-sided marketplace, like Fiverr for influencer marketing. Brands shop creators by niche, reach, engagement and **proven sales results**. Creators list priced packages, use a rate engine to charge market rates, and level up through tiers. Negotiation, contracts, escrow, delivery and results tracking all happen on the platform.

Runs as a website and as an **installable phone app** (PWA: open it on a phone and choose "Add to Home Screen").

## Run it

Requires Node 22.13+ (uses the built-in `node:sqlite`, so there are no native dependencies).

```bash
npm install
npm run build        # builds the web app into dist/
npm start            # API + app on http://localhost:3001 (seeds demo data on first run)
```

Development with hot reload: run `npm run dev:server` and `npm run dev:web` in two terminals, then open http://localhost:5173.

`npm test` runs the API tests. `npm run seed` resets the database to demo data.

**Demo accounts** (password `password123`): `brand@glowlab.co`, `brand@fuelbar.co`, `brand@stackly.app` (brands); `niacooks@creator.demo` (Day 1), `emmapaws@creator.demo` (Day 100), `mayaglow@creator.demo` (Day 1000), or any `<handle>@creator.demo` (creators). GlowLab has a funded deal with Maya waiting on draft review.

## Deploy to Render

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/officialdetails13/tsenta-mcp/tree/claude/festive-pascal-v686gy)

The repo-root `render.yaml` defines a free web service (Node 22, built from `collabo/`, with a generated `AUTH_SECRET`). Free-tier storage is temporary, so the database resets to the demo data on each restart or redeploy. Attach a Render disk and set `DB_FILE` to a path on it to keep data.

## Design system and front-end stack

- **Design rules** live in the `frontend-design` skill (`.claude/skills/frontend-design/SKILL.md` at the repo root): type scale, 8px spacing grid, color tokens, component patterns, motion rules and what to avoid. The tokens themselves are in `web/src/styles.css`.
- **Motion:** Framer Motion through `web/src/motion.jsx` (`Reveal`, `Stagger`, `CountUp`, `m.*`). The animation engine loads after first paint, and `prefers-reduced-motion` is respected.
- **Drop-in components** (21st.dev, shadcn style): Tailwind v4 utilities without its global reset, mapped to Collabo's tokens (`web/src/tailwind.css`), plus `cn()` in `web/src/lib/cn.js` and `lucide-react` icons. Paste a component into `web/src/components/` and follow the skill's integration steps.
- **Performance:** pages are code-split, responses are gzip-compressed, `/api/meta` is embedded in the HTML, and hashed assets are cached for a year. Check with `npm run build && npm start`, then `npm run lighthouse` in another terminal (it writes `lighthouse.html`).

## Verified Instagram data

Creators connect their Instagram **Creator or Business** account through Instagram's official login (Business Login for Instagram). Collabo then reads, with their permission:

- profile: followers, media count, profile photo (`GET /me`)
- Reels, posts and Stories with likes and comments (`/me/media`, `/me/stories`) and insights: views, reach, saves, shares, replies, average watch time (`/{media-id}/insights`)
- audience demographics: age, gender, country (`/me/insights?metric=follower_demographics`)

Every metric records its source (`instagram_api`, `self_reported` or `demo`) and when it was fetched. Brands can click any number to see where it came from. Verified numbers refresh in the background (at most every 6 hours) and can't be edited by hand. Access tokens are encrypted at rest (AES-256-GCM) and refreshed before they expire. Nothing is scraped, and no creator appears on Collabo unless they signed up.

### Setting it up

1. Create an app at developers.facebook.com, add the **Instagram** product, and choose **API setup with Instagram login**.
2. Add the redirect URI `https://<your-domain>/api/connect/instagram/callback`.
3. Set the **Deauthorize** callback to `https://<your-domain>/api/instagram/deauthorize` and **Data deletion request** to `https://<your-domain>/api/instagram/data-deletion`.
4. Request the permissions `instagram_business_basic` and `instagram_business_manage_insights`. Until Meta's App Review approves them, only Instagram accounts added as testers on the app can connect.
5. Set these environment variables (on Render: Environment):

| Variable | Value |
|---|---|
| `IG_APP_ID` / `IG_APP_SECRET` | Instagram app ID and secret (from the app's Instagram login settings) |
| `IG_REDIRECT_URI` | Exactly the redirect URI from step 2 |
| `TOKEN_KEY` | A long random string used to encrypt tokens |
| `PUBLIC_URL` | e.g. `https://collabo-51m1.onrender.com` (used in deletion-status links) |
| `IG_API_VERSION` | Optional, e.g. `v24.0`; blank uses the app's default |

Tokens and synced data live in the database, so production needs a persistent disk (Render's free tier resets it on every deploy).

`test/instagram.test.js` runs the whole flow against a local fake of the Instagram API.

## What's in it

| Area | Brands | Creators |
|---|---|---|
| Discovery | Filter by niche, platform, size, budget, engagement; sort by ROI, rating, reach, price | Public storefront: socials, audience, packages, case studies, reviews |
| Pricing | See listed prices up front | Rate engine suggests a price per package and flags underpricing against the market median |
| Briefs | Post campaigns and review pitches | Browse open briefs and pitch a price |
| Deals | Offer → counter → accept → e-sign → deposit into escrow → approve the draft → approve the live post | Same deal room; submit a draft, post, confirm the delivery checklist, chat |
| Escrow | Funds held before work starts; refund if the deadline is missed; dispute to freeze funds | Money is secured before you start; auto-release if the brand goes silent |
| Results | Dashboard: spend, money held in escrow, revenue, ROAS, top creators | Tracked promo code per deal builds a public track record |
| Growth | See creators' posting cadence, engagement and 3s hold | Day 1 / Day 100 / Day 1000 path with missions and playbooks, content analytics, Hook lab, trend tracking, tiers, rate check |

### Escrow rules

| Step | What happens to the money |
|---|---|
| Brand deposits | Fee + any performance bonus + 5% service fee go into escrow before work starts. The brand can't cancel after this. |
| Draft approved | 30% of the fee is released to the creator (minus the 10% platform fee). Auto-approves after **3 days** without a response. |
| Live post approved | The rest of the fee is released. The creator has to confirm the contract checklist first. Auto-approves after **5 days**. |
| Performance bonus | Paid when the target is hit. Creators report views; brands report conversions and revenue. Refunded to the brand if the target isn't hit within **30 days** of completion. |
| Missed deadline | **3 days** after the deadline, the brand can reclaim everything still held. |
| Dispute | Either side can freeze the funds and propose a split; the other side accepts or counters. Platform mediation: `POST /api/admin/deals/:id/resolve` with header `x-admin-token: $ADMIN_TOKEN` (disabled unless `ADMIN_TOKEN` is set). |

Deadlines are enforced whenever deals are read, so no background job is needed.

### Creator growth stages

| Stage | Followers on biggest platform | Posting target | Focus |
|---|---|---|---|
| Day 1: Launch | under 5K | 5 a week | Build the habit, fix hooks, test editing styles, earn with UGC |
| Day 100: Momentum | 5K–100K | 4 a week | Consistency, finding a winning format, 3s hold, getting in early on trends, first paid deals |
| Day 1000: Scale | 100K+ | 3 a week | Second platform, sponsored posts that perform like organic ones, repeat brands, pricing |

Recommendations come from the creator's logged posts: frequency against the stage target, filler openers, 3s hold, and the best vs. worst hook type, editing style, format, weekday and length. Trend momentum is measured from posts that all creators log (uses this week vs. last week, and engagement compared with non-trend posts).

Fees: brands pay 5% on top of the deal price; 10% is taken from the creator payout.

## Layout

```
server/
  app.js      REST API (auth, creators, packages, campaigns, deals, results, reviews)
  pricing.js  rate engine, market comparison, tier scoring
  content.js  growth stages, hook analyzer, post analytics, missions, recommendations, trend momentum
  db.js       SQLite schema
  seed.js     demo creators, brands, completed deals and briefs
web/src/
  pages/      Landing, Auth, Discover, CreatorProfile, Campaigns, CampaignDetail,
              Deals, DealRoom, Studio, Growth, Dashboard
  ui.jsx      shared components
test/         API tests (node:test)
```

See [PRODUCT.md](PRODUCT.md) for the product reasoning and roadmap.
