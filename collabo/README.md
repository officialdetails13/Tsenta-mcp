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

**Demo accounts** (password `password123`): `brand@glowlab.co`, `brand@fuelbar.co`, `brand@stackly.app` (brands); `mayaglow@creator.demo`, `emmapaws@creator.demo`, or any `<handle>@creator.demo` (creators).

## What's in it

| Area | Brands | Creators |
|---|---|---|
| Discovery | Filter by niche, platform, size, budget, engagement; sort by ROI, rating, reach, price | Public storefront: socials, audience, packages, case studies, reviews |
| Pricing | See listed prices up front | Rate engine suggests a price per package and flags underpricing against the market median |
| Briefs | Post campaigns and review pitches | Browse open briefs and pitch a price |
| Deals | Offer → counter → accept → e-sign → fund escrow → approve / request revision | Same deal room; deliver a live link, chat |
| Results | Dashboard: spend, revenue, ROAS, top creators | Tracked promo code per deal builds a public track record |
| Growth | — | New → Rising → Pro → Elite tiers, checklist, rate check, Creator Academy |

Fees: brands pay 5% on top of the deal price; 10% is taken from the creator payout.

## Layout

```
server/
  app.js      REST API (auth, creators, packages, campaigns, deals, results, reviews)
  pricing.js  rate engine, market comparison, tier scoring
  db.js       SQLite schema
  seed.js     demo creators, brands, completed deals and briefs
web/src/
  pages/      Landing, Auth, Discover, CreatorProfile, Campaigns, CampaignDetail,
              Deals, DealRoom, Studio, Growth, Dashboard
  ui.jsx      shared components
test/         API tests (node:test)
```

See [PRODUCT.md](PRODUCT.md) for the product reasoning and roadmap.
