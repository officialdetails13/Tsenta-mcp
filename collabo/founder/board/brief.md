# Board brief: Collabo

This brief is self-contained. It describes the idea as the founder pitched it plus what has been built and researched so far.

## The idea (founder's words, condensed)
"Today if I as a business need influencer marketing I have to go on Instagram or TikTok or reach out to digital marketing companies for a large spend. Instead, a marketplace that serves both sides would let owners shop around for influencers and see their sales, data and socials, and influencers would have going rates so they can adjust their services to get top dollar. The marketplace would also help influencers level up their content creation, and businesses can have contracts and negotiations through it." Later: "Implement an escrow feature where the brand deposits the creator's money for the platform to hold while the creator delivers, since both sides need to know money is on the table and that the content is guaranteed."

## What exists today (working MVP)
- Two account types: business and creator. Web app that installs on phones (PWA).
- **Discovery**: brands filter creators by niche, platform, follower size, budget, engagement; sort by ROI, rating, reach, price.
- **Creator storefront**: socials (self-reported followers, engagement, average views), audience demographics, priced packages, reviews, and "proven results" (sales driven, ROI) from past deals on the platform.
- **Rate engine**: suggests a price per package from platform rate per 1K followers × engagement vs benchmark × format × niche, compares it with the median price of similar creators on the marketplace, and flags underpriced packages.
- **Campaign briefs**: brands post a brief and budget; creators pitch a price.
- **Deal room**: offer / counter-offer, auto-generated contract (FTC disclosure, 90-day organic usage rights, promo code), e-signatures, chat.
- **Escrow**: brand deposits the full fee (+ optional performance bonus) before work starts. Creator submits a draft; approving it releases 30%. Creator posts and confirms a contract checklist; approval releases the remaining 70%. Auto-release if the brand doesn't respond (3 days for a draft, 5 for the live post). Brand can reclaim held funds 3 days after a missed deadline. Disputes freeze funds until a split is agreed or mediated. Performance bonus paid if a target is hit within 30 days (creator reports views; brand reports sales), otherwise refunded.
- **Results**: every deal gets a promo code; brands report conversions/revenue, which feed the creator's public ROI track record. Brand dashboard shows spend, revenue driven, ROAS, money held in escrow.
- **Creator growth tools**: creators are placed at Day 1 (<5K followers), Day 100 (5K–100K) or Day 1000 (100K+), each with missions, a playbook and a weekly posting target. A content log gives analytics by hook type, edit style, format, weekday, length and trend use, turned into ranked recommendations. A "Hook lab" scores a video's opening line. Trend tracking measures which trends are rising based on posts creators log. Tiers (New/Rising/Pro/Elite) gated on completed deals.
- **Not built yet**: real payments (simulated ledger; Stripe Connect planned), verified social stats (self-reported today; platform APIs planned), automatic sales attribution (manual today), notifications, file uploads, native app-store apps.

## Business model
5% fee to the brand on top of the deal + 10% from the creator's payout (~15% of deal value). No subscription. Later ideas: featured placement, brand subscriptions, managed campaigns, paid usage-rights add-ons.

## Market research done so far (public sources)
- Global influencer marketing spend: about $32.5B in 2025; 2026 forecasts $34–41B. US ~ $12B in 2026, growing ~16%/yr.
- **Direct competitor, US: Collabstr**: creators list packages with public prices, brands book or post briefs, payment held in escrow until the brand approves, full refund if the creator doesn't deliver. Free plan charges brands a 10% hiring fee; paid plans ~$249–$333/month lower it.
- Other self-serve marketplaces: Insense (brief-based, ~$400–500/mo + 10–20% fee), Elev8or, JoinBrands, Billo (UGC). Enterprise tools: GRIN, Aspire, CreatorIQ (~$2,350+/mo), Upfluence (~$478+/mo).
- Platform-native: TikTok Creator Marketplace and TikTok Shop affiliate; Instagram added native affiliate tags in Reels in March 2026, reportedly taking 0% commission.
- Creator-side tools: Beacons (media kit, rate card, pricing calculator; $10–30/mo), Passionfroot (bookable storefront).
- Pain points reported in surveys: 48–87% of creators report late payment or payment problems; about half of brands say they have mispriced creator deals; mid-tier creators say offers have been flat for two years; 67% of creators earn under $10K a year (CreatorIQ, 5,000+ creators).
- India: market ~₹3,375 crore (~$400M) by 2026 per EY. Competitors include Kofluence (~$4M raised, FY25 revenue ~₹52.5 crore, self-serve + managed), Good Creator Co. (Plixxo, Winkl, MissMalini), InfluencerMetric (self-serve with escrow). TikTok is banned in India; tax withholding (TDS) and GST on creator deals are a known pain point.

## Open questions nobody has answered yet
- Budget, runway, and whether the founder works full-time.
- Average deal size small businesses will actually spend, and how often they buy.
- Cost to acquire a brand and a creator.
- Which side, niche or city to start with.
