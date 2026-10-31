# Product reasoning

## The problem
A business that wants influencer marketing today has two bad options:
1. **DIY on Instagram/TikTok.** Scroll for creators, cold-DM them, guess whether a follower count is real, negotiate over DMs, pay up front and hope.
2. **An agency.** Vetted and managed, but with retainers and minimums that rule out most small businesses.

Creators have the mirror image: inconsistent inbound, no idea what to charge (most undercharge), payment risk, and no portable proof of the results they drive.

## The bet
A marketplace that serves both sides, on the Fiverr model:
- **Productized offers.** Creators sell packages ("1 TikTok + story, $650, 5 days") so brands can buy without a sales call.
- **Proof, not just reach.** Every deal gets a promo code. The sales it drives become part of the creator's public track record: revenue driven, ROI, on-time rate, reviews. No DM or follower count can show this, and it's what keeps both sides on the platform.
- **Price transparency.** The rate engine (platform rates per thousand followers × engagement vs. benchmark × format × niche demand), blended with the market median from comparable listings, tells creators what they're worth. Brands see prices up front.
- **Trust rails.** Structured offers and counter-offers, an auto-generated contract (FTC disclosure, usage rights, revisions), e-signatures, escrow, and approval before payout.
- **Leveling up.** Tiers need both a score and completed deals, so a polished profile alone can't reach the top. The Academy and rate check show creators how to earn more.

## Business model
5% buyer fee + 10% seller fee (Fiverr takes ~20% from sellers). Later:
- Featured placement for creators
- Brand subscription for advanced search and audience analytics
- Managed campaigns (an in-house agency tier) for larger spends
- Paid-usage and whitelisting add-ons for ads rights

## Keeping deals on the platform
The main risk for any marketplace is the two sides meeting and then dealing directly. Countermeasures: escrow protection, the results track record (only earned through on-platform deals), tier perks, and keeping the fees low.

## What's built (MVP)
Everything in the README table: both roles, discovery, profiles, packages, the rate engine, campaign briefs, the full deal lifecycle, simulated escrow ledger, results, reviews, tiers, Academy, brand dashboard, and an installable PWA.

## Roadmap to production
1. **Verified socials.** OAuth with the Instagram Graph API, TikTok and YouTube Data APIs to pull real follower, engagement and audience data and flag fake followers. Today's numbers are self-reported.
2. **Real payments.** Stripe Connect (escrow via separate charges and transfers, creator KYC, 1099s). The `transactions` table already models the ledger.
3. **Sales attribution.** Shopify/WooCommerce apps and UTM links so promo-code sales are reported automatically instead of typed in.
4. **Infrastructure.** Move SQLite to Postgres, add search indexing for discovery, file uploads for portfolios and deliverables, email and push notifications, and a dispute/mediation flow.
5. **Native apps.** Wrap the PWA with Capacitor for App Store and Play Store listings, adding native push and camera upload.
6. **AI assist.** Brief-to-creator matching, contract Q&A, and creative feedback on draft content.
