# Collabo · Business plan

**Verdict: Not yet**

- ✓ Each completed deal earns $34.12 before fixed costs (57% contribution).
- ✗ Year 1 operating LOSS: $27,784.
- ✗ 1 of 20 simulated buyers buy (5%, the bar is 25%).

| key number | |
| --- | ---: |
| Price | $60.00 a completed deal |
| Profit margin at plan | 17% per completed deal |
| Break-even | 6 completed deals a day |
| Year 1 operating profit | $-27,784 |
| Startup spend | $5,500 |
| Cash needed before it pays for itself | $36,241 |
| Startup money earned back | not in year 1 |
| Buyer panel | 1 buy · 19 pass |

## The idea

- What it is: a two-sided influencer-marketing marketplace (web app + installable phone app) where small businesses hire creators directly, like Fiverr for influencer marketing.
- Who it is for: (1) small and mid-sized businesses that want influencer marketing but today either cold-DM creators on Instagram/TikTok or pay a digital-marketing agency; (2) creators of every size, from "Day 1" (under 5K followers) to "Day 1000" (100K+), who want brand deals, fair rates and help growing.
- What it sells, at what price: a marketplace transaction. Creators list fixed-price packages (e.g. "1 TikTok + story, $650"); brands buy them or post briefs creators pitch on. Take rate: 5% service fee charged to the brand on top of the deal price, plus 10% deducted from the creator's payout (about 15% of deal value in total). No subscription today.
- Where and how: online, US first; India considered as a second market. Built and working as an MVP (React web app / PWA, Node API, SQLite), deployable on Render. Payments are simulated today; Stripe Connect is planned.
- Budget and constraints: not stated by the founder. Solo founder working with an AI coding assistant; no paid staff mentioned; payments, verified social stats and automatic sales attribution are not built yet.

## Summary

**Verdict: Not yet** (computed by `compile.py`). Two checks fail: year 1 loses $27,784 on operations, and only 1 of 20 simulated brands would buy (5%, the bar is 25%). Each deal does earn money ($34.12 contribution), so the model works per deal. **What has to change is trust and focus, not price.**

Collabo is a marketplace where small businesses hire creators directly, with staged escrow, a rate engine and growth tools for creators. It is built and working as a demo.

**The numbers:** 57% contribution per $400 deal · break-even 6 deals a day · year 1 -$27,784 · ~$36K cash needed (estimates; founder salary not included).

**Where the panels and the board agree:**
- **Unverified stats are the deal-breaker.** 11 of 19 brand "no"s were about trust, and almost every brand said verified Instagram/TikTok numbers would flip them. All three board members raised it.
- **Collabstr already does the core.** 6 brands passed out of habit ("Collabstr already does this").
- **Empty marketplace.** Creators' #1 flip condition was proof that brands book creators their size.

**Where they disagree:**
- The board would freeze the creator growth tools. The creator panel suggests otherwise: 35% of creators would join, and the hook scorer and analytics were a reason for some of them (P003, P018). The tools look like a cheap way to recruit creators, not a brand-side selling point.
- The board worried about price against Collabstr's 10%. Both panels put today's fees inside their acceptable range; only 1 of 40 cited price.

**Biggest risk:** launching a broad, unverified marketplace into Collabstr's territory. **Response:** verify creators and launch in one niche and city first.

**What the founder needs:** roughly $20K (lean niche launch, from the CFO what-if) plus their own time, and a real-world test before anything else.

**The one thing to do this week:** talk to 10 local business owners in one niche (e.g. cafés and gyms in your city) and offer to hand-run one verified-creator deal for each, with money in escrow. Measure how many say yes and the deal size they choose.

Simulated buyers aren't customers, and every number here is a projection. Not financial, legal or tax advice.

## What the board said

**Vote: 2 fund if, 1 pass. Average score 3.7 / 10.**
(Offers 4 FUND IF · Monopoly 3 PASS · Product 4 FUND IF)

### Risks more than one member raised
1. **Same model as Collabstr, at a higher take.** All three: packages + briefs + escrow + refunds already exist at a 10% brand fee; Collabo takes ~15% with no proof yet. Instagram's affiliate tags reportedly take 0%.
2. **The numbers aren't trustworthy yet.** Offers + Product (and Monopoly on the moat): followers, views and sales are self-reported, payments simulated. The "proven results" pitch isn't true until stats and attribution are verified.
3. **No beachhead or distribution plan.** Offers + Monopoly + Product: "small businesses" and "creators" are not reachable markets; no niche/city, no cost to acquire either side, empty-room cold start.
4. **Unfocused product.** Offers + Product: creator growth tools (missions, Hook lab, trends) are a second product for the side that pays less.
5. **Deals leave the platform after the first one** (Monopoly). Nothing yet keeps repeat brand–creator pairs on Collabo.

### Where the members disagreed
- **Monopoly** sees the creator growth tools and ROI history as possible moat material *only if verified*; **Product** and **Offers** would freeze the growth tools in the brand-facing product.
- **Offers** thinks a stronger guarantee could make the offer a clear yes; **Monopoly** doubts any feature beats network density, and would pass until a beachhead is shown.

### Conditions checklist (for the rest of the pack)
- [ ] Name one beachhead niche + geography; confirm buyers have budget there (/founder-consumer)
- [ ] Measure realistic deal size and purchase frequency (/founder-consumer, /founder-pricing)
- [ ] Show unit economics that work at that deal size, including payment costs and acquisition (/founder-cfo)
- [ ] Justify or cut the ~15% take against Collabstr's 10% (/founder-pricing)
- [ ] An outcome guarantee competitors don't match, costed (/founder-offer, /founder-cfo)
- [ ] Verified social stats via platform APIs; label unverified numbers until then (build)
- [ ] Attribution that doesn't depend on one side's word (promo code / store integration) (build)
- [ ] Live payments (Stripe Connect) and notifications before auto-release goes live (build)
- [ ] A one-sentence answer to "why not Collabstr?" with no "and"
- [ ] Cold-start plan: seed verified creators so a brand's first search isn't empty
- [ ] A reason the second deal stays on-platform
- [ ] Decide what happens to the creator growth tools (separate product, retention lever, or freeze)

### The strongest version the board can see
Not quite what was pitched. **"Creator deals where the money is guaranteed and the results are verified" — for one niche in one place first.** For example, local restaurants, cafés and gyms hiring local food and fitness creators in one city, where the platform hand-runs the first deals, verifies creator stats from the platforms, and attributes sales through promo codes. Charge the brand for a guarantee competitors don't offer (a replacement creator or partial refund if verified results miss an agreed floor). Keep the creator growth tools only as the way to recruit and keep creators in that niche, not as a headline feature. Prove density in one niche, then expand.

## The competition

Public sources only, linked. Prices are third-party unless the link is the vendor's own page; check live pricing before relying on any figure.

### The table (most direct first)

| Competitor | Type | Price for the comparable thing | What it sells |
|---|---|---|---|
| [Collabstr](https://collabstr.com/pricing) | Direct | 10% fee added to the brand's booking (free plan); Premium ~$333/mo lowers fees | Priced creator packages, briefs, [escrow released on approval, full refund on non-delivery](https://collabstr.com/features/approve-and-pay/) |
| [Insense](https://insense.pro/blog/influencer-marketing-tools) | Direct | ~$400–500/mo + 10–20% fee | Brief-based UGC for paid social |
| [Elev8or](https://www.elev8or.io/help/brands/wallet-and-escrow) | Direct | Free start | Marketplace with wallet + escrow |
| JoinBrands, Billo | Direct (UGC) | not verified | UGC creators on demand |
| [Kofluence](https://inc42.com/company/kofluence/) (India) | Direct | not public | Self-serve + managed; FY25 revenue ~₹52.5 crore |
| [InfluencerMetric](https://limurse.ai/best-influencer-marketing-platforms-india) (India) | Direct | Free; Pro ₹999/mo | Self-serve with escrow |
| [Upfluence](https://www.g2.com/products/upfluence/pricing) | Indirect | from ~$478/mo | Search + campaign software |
| [CreatorIQ](https://toolradar.com/tools/creatoriq/pricing) | Indirect | from ~$2,350/mo | Enterprise |
| [Beacons](https://help.beacons.ai/en/articles/4695681) | Indirect (creator side) | Free–$30/mo | Media kit, rate card, pricing calculator |
| [Passionfroot](https://www.passionfroot.me/creators) | Indirect (creator side) | not verified | Bookable creator storefront |
| [TikTok Shop / Creator Marketplace](https://mikebegg.me/blog/tiktok-shop-creator-programs-2026) | Substitute | brand-set commission | Native sponsorship + affiliate |
| [Instagram affiliate tags](https://www.netinfluencer.com/instagram-re-enters-creator-affiliate-commerce-years-after-rivals-built-lead/) | Substitute | reportedly 0% commission | Native affiliate (since March 2026) |
| Cold DMs | Substitute | free + time | DIY |
| Agencies | Substitute | high minimums | Managed campaigns |

### Price range for the comparable item (marketplace take on a booking)
- Lowest: 0% (Instagram affiliate tags, cold DMs).
- Typical: ~10% (Collabstr free plan, charged to the brand).
- Highest: 10–20% + a $400–500/mo subscription (Insense).
- Collabo today: 5% (brand) + 10% (creator) ≈ 15% of deal value, no subscription.

### Positioning map (text)
Axes that matter to a small-business buyer: **cost to start** (free → subscription) and **how much risk the platform takes off them** (none → escrow + proof of results).
- Low cost, low protection: cold DMs, Instagram/TikTok native tools.
- Low cost, medium protection: Collabstr free plan, Elev8or, InfluencerMetric (escrow, approve-to-pay).
- High cost, medium protection: Insense, Upfluence (software and subscriptions).
- High cost, high protection: agencies, CreatorIQ.
- Where Collabo aims: low cost, high protection (staged escrow, draft approval, deadline refunds, disputes, performance bonuses, sales track record).

### What their customers complain about
- **Payments to creators / brands slow to approve.** Insense G2 excerpts: some brands are slow to review content or pay; brands change scripts after hiring ([G2](https://www.g2.com/products/insense/reviews)). Complaint site alleging creators not paid ([PissedConsumer](https://www.pissedconsumer.com/insense/RT-F.html), unverified).
- **Billing and auto-renewal.** Insense Trustpilot 1-star reviews cluster on quarterly auto-renewal charges and refunds ([FindClout analysis](https://findclout.com/blog/is-insense-legit)).
- **Support when a deal goes wrong.** A Collabstr Trustpilot reviewer said the platform "abandoned me when I needed them most" ([Trustpilot](https://www.trustpilot.com/review/collabstr.com?page=2)).
- **Fake or low-quality creator profiles; contract and cancellation terms; glitches.** Recurring in summaries ([rfp.wiki](https://www.rfp.wiki/vendors/collabstr), AI-generated summary, so thin).
- Industry-wide: 48–87% of creators report late payment ([Gigapay](https://www.gigapay.com/blog/why-creators-put-fast-paying-brands-first)); about half of brands say they mispriced creator deals ([Net Influencer](https://www.netinfluencer.com/nearly-half-of-brands-have-mispriced-creator-deals-survey-finds/)).

Collabstr is rated well overall (4.5 on 420 Trustpilot reviews), so the complaints are minority themes. Most themes here are **thin** (fewer than three verified reviews each).

### The gap
1. **Creator-side protection and speed of payment.** Incumbents' escrow protects the brand; the main creator complaint is slow approval and payment. Auto-release, staged release and deadline rules protect both sides.
2. **Verified creators.** Fake or low-quality profiles are a recurring complaint; nobody in the self-serve tier is clearly known for verified stats. Collabo doesn't verify either yet.
3. **Creators under 5K followers.** Marketplaces are built for brands; 67% of creators earn under $10K a year ([CreatorIQ](https://www.creatoriq.com/whitepaper/state-of-creators)). Nobody combines growth coaching with deal flow.
4. **India: tax-compliant deals** (TDS/GST handled automatically). Not seen in the competitors found.

**Honest note:** the core marketplace (packages + briefs + escrow + approve-to-pay) is not a gap; Collabstr already does it at a lower take rate.

### The threat
Collabstr could add auto-release and staged payments quickly. Instagram and TikTok could extend their free native tools into sponsorships. Beacons already has creators and a pricing calculator, and could add bookings.

## The buyer panel

**1 buy · 19 pass** (5% buy) out of 20 simulated buyers. Seed 7, so the same cards can be dealt again.

These are simulated buyers, not customers. Use this to find objections and weak spots, then confirm the big ones with real people before you spend.

### By segment

| group | buyers | buy rate |
| --- | ---: | ---: |
| Local business owner (cafe, restaurant, gym, salon) | 7 | 14%  (thin) |
| Marketing manager at a 10-50 person company | 4 | 0%  (thin) |
| Founder of a small online (DTC) brand | 7 | 0%  (thin) |
| Solo seller or side-hustle shop | 2 | 0%  (thin) |

### By buying behaviour

| group | buyers | buy rate |
| --- | ---: | ---: |
| Agency-curious | 2 | 50%  (thin) |
| Burned before | 3 | 0%  (thin) |
| Bargain hunter | 2 | 0%  (thin) |
| Uses another platform | 2 | 0%  (thin) |
| Numbers first | 3 | 0%  (thin) |
| Never tried influencers | 4 | 0%  (thin) |
| DIY on Instagram | 4 | 0%  (thin) |

### By income

| group | buyers | buy rate |
| --- | ---: | ---: |
| $74,000 to $91,000 | 7 | 14%  (thin) |
| $91,000 and up | 7 | 0%  (thin) |
| under $74,000 | 6 | 0%  (thin) |

### Why they pass

| reason | buyers | in their words |
| --- | ---: | --- |
| trust | 11 | "I already book creators on a marketplace I know, and this one says right on the page that follower counts and results aren't verified. The escrow and promo codes are nice, but a lower fee doesn't make me switch when the thing I worry about most isn't solved." (P003) · "Dropping $525 on one Reel from a creator whose follower counts and past results nobody has verified is a gamble I can't make on my budget, when I can put that same money into Meta ads and see ROAS within days. The promo code is nice, but it only tells me after the fact whether I wasted the money." (P004) |
| habit | 6 | "Collabstr already does this for me, and I'd have to start over with a brand-new marketplace that has no track record. The escrow and draft approval are nice, but they don't give me a reason to switch this week." (P001) · "I already find creators by DMing them and I mostly pay in free product, not $500 cash. A marketplace built around paid cash packages doesn't match how I do this, and I'm not paying a fee on top for something I can do myself." (P002) |
| convenience | 2 | "The escrow and promo code are smart, but this still leaves me picking creators, briefing them and approving drafts myself, which is exactly the work I don't have time for. And I'd be guessing whether a $500 Reel is a fair price, since the follower counts and results aren't verified." (P018) · "My problem isn't finding or paying creators, I already DM them and Venmo them for nothing. My problem is I don't have time to manage them and approve drafts, and this still puts me in the middle of every draft and every live post." (P020) |

### Why they buy

| reason | buyers | in their words |
| --- | ---: | --- |
| trust | 1 | "Twenty-five bucks to have my money held until I've seen the draft and the live post is cheaper than getting burned once by a creator I DM'd who ghosts me. I'd pull one $500 test out of my Meta budget and see if the promo code actually moves covers." (P019) |

### What would flip a no

- Follower counts and past results verified straight from Instagram/TikTok, so I know the creator's numbers and track record are real before I put money in.
- If I could post product-for-content (gifting) deals on it and still get the escrow and promo-code tracking, with verified follower counts.
- Follower counts and audience stats pulled directly from Instagram/TikTok and verified, so I can see real reach and engagement before I pay.
- Verified follower and sales data from past Collabo deals, like real promo-code redemptions per creator, plus cheaper starter packages around $100-150 so I can test one creator without risking a month of ad spend.
- Follower counts and past results verified straight from Instagram/TikTok, plus a named, regulated escrow or payment provider holding the money, so I know I'd get it back even if Collabo disappeared.
- Verified audience location and stats from Instagram, plus real promo-code redemption numbers from other local businesses like mine, so I could run one cheap test with a local creator and compare it to my Meta cost per customer.
- Follower counts and past results verified by Instagram or TikTok, plus a small seller I recognize in my niche saying they got sales from it.
- Verified follower counts plus real promo-code redemption numbers from other local cafes or salons in my city, ideally with a cheaper local creator under $200 so I can test it once.
- Follower counts and past results verified straight from Instagram/TikTok, so I know the creator's numbers are real before my money goes into escrow.
- A verified local creator with a cheaper starter package, say under $200, plus results from another small business in my city showing actual promo code redemptions.
- Follower and engagement numbers pulled directly from Instagram/TikTok with a fake-follower check, so I can trust a creator without doing my own audit.
- Verified audience data showing how many of a creator's followers are in my city, plus real promo-code redemption numbers from past deals with businesses like mine.

Buyers say they would buy **1.0 times** in the first month on average.

20 buyers gave all four price answers. Run founder-pricing's van_westendorp.py on the answers folder.

## Pricing

Collabo's "price" is its take on each deal. Both panels answered in dollars on a $500 deal. These are simulated buyers, so use them to decide what to test, not as proof.

### What buyers said
| side | today | acceptable range (Van Westendorp) | least-resistance price | median "getting expensive" |
|---|---|---|---|---|
| Brands (fee added on top) | $25 (5%) | **$5–$50** | $5 | $50 |
| Creators (cut from payout) | $50 (10%) | **$10–$75** | $10 | $75 |

Both current fees are **inside** the acceptable range. Price was the stated reason in only 1 of 40 answers. **Price isn't what stops people: trust and empty supply are** (`panel/results.md`, `creators/panel/results.md`). 7 of 20 answers per panel were dropped as incomplete, mostly "too cheap = $0".

### Against competitors
Collabstr's free plan charges brands 10%, all on the brand side ([pricing](https://collabstr.com/pricing)). Collabo charges 5% to the brand and 10% to the creator. The brand side is cheaper, but the total take is higher. Instagram affiliate tags reportedly charge 0%.

### Against the margin (from the CFO)
Cutting to a 10% total take raises break-even from 6 to 15 deals a day. **Keep ~15%.**

### Recommendation
1. **Keep 5% + 10%.** Price isn't the objection, and the margin needs it.
2. **Don't charge creators on deals they bring in themselves.** Charge a smaller fee (e.g. 3%) for escrow-only use of the platform. This came up in 4 creator "flip" answers and keeps their existing deals on Collabo.
3. **Ladder for brands:**
   - **Starter:** a verified local creator, <$200, 5% fee. Lowers the risk of a first try.
   - **Standard:** current pricing.
   - **Done-for-you:** Collabo shortlists 3 vetted creators and handles briefing, for +10% or a flat $99. Two panel buyers passed because they "don't have time to manage creators" (P018, P020).
4. **Opening offer:** waive the brand fee on a business's first deal, ending at a fixed launch date. Don't use a "was" price.
5. **Test with real buyers:** a done-for-you add-on at $49 vs $99, and the creator fee at 10% vs 8%.

### Top price objections, in their words
- "I'm not paying a fee on top for something I can do myself." (brand P002)
- "Handing over $50 on every $500 deal to a new platform with barely any brands doesn't add anything for me." (creator P001)
- "A new app with only a few small brands isn't worth adding another 10% cut on top of what my manager takes." (creator P013)

## The numbers

**The margin.** Each completed $400 deal earns Collabo $60 and leaves **$34.12 (57%)** after card fees, payouts, support and a dispute reserve. At the plan of 8 deals a day the profit margin is **17%**, but the business needs **6 deals a day (~180 a month) to break even**, and on this ramp year 1 loses **$27,784** on operations.

**The line to watch: average deal size.** Everything else is secondary. At an $800 average deal (same 15% take), break-even drops from 6 to **3 deals a day** and year 1 turns into a **$24,364** profit (what-if run with deal size $800, card and payout fees recalculated). The brand panel pulls the other way: several buyers wanted starter packages under $200, which would make the economics worse.

**Cash.** You need about **$36,241** before it pays for itself, at the estimated $3,000/month of marketing and a $2,500 part-time ops person, with founder salary at $0. Founder salary hasn't been stated, so the real number is higher.

**Three ways to improve the margin (each one run, not guessed):**
1. **Raise the average deal to ~$800** (bundles, multi-post packages, monthly retainers): break-even 6 → 3/day, year 1 -$27,784 → **+$24,364**.
2. **Launch in one niche/city with $1,000/month of marketing instead of $3,000** (hand-run deals, organic creator recruiting): break-even 6 → 4/day, year 1 → **-$3,784**, cash needed → **$20,119**. Combined with an $800 deal: year 1 **+$48,364**, cash needed **$12,722**.
3. **Don't cut the fee to match Collabstr.** At a 10% take, break-even jumps to **15/day**, year 1 to **-$52,910** and cash needed to **$58,410**. Charge for what's different (guarantee, verified stats) instead.

**Board money conditions:** "show unit economics that work at the real deal size and acquisition cost": **not met yet**. The real deal size and the cost to acquire a brand are unknown. Card fees alone take 21% of Collabo's revenue per deal, so small deals are expensive to process.

Revenue here is before tax. Every estimate is labelled in `numbers.json` and `cfo-sources.md`. This is not financial, tax or legal advice: have an accountant check the structure, payroll and tax, and a lawyer check the escrow setup, before any money moves.

---

## Unit economics: Collabo (US, brand side pays 5%, creator side pays 10%)

Every number below comes from the input file. Nothing is looked up or guessed.

### One completed deal

| line | per completed deal |
| --- | ---: |
| Price | $60.00 |
| Card processing on brand charge ($420 at 2.9% + $0.30) | -$12.48 |
| Stripe Connect payouts (2 per deal: 0.25% of $360 + 2 x $0.25) | -$1.40 |
| Stripe Connect active account ($2/mo, ~1 deal per creator-month) | -$2.00 |
| Refunds/disputes write-off reserve (ESTIMATE 1% of deal) | -$4.00 |
| Support and dispute handling, ~15 min at $20/h (ESTIMATE) | -$5.00 |
| Social stats verification API per deal (ESTIMATE) | -$1.00 |
| **Contribution** (what each completed deal leaves to pay the fixed costs) | **$34.12** (57%) |

### The margin that matters

Fixed costs: $5,770 a month (Hosting, database, email/notifications (ESTIMATE) $170, Software and tools (ESTIMATE) $100, Part-time ops/community person, 25 h/wk (ESTIMATE) $2,500, Marketing to recruit brands and creators (ESTIMATE) $3,000, Founder salary (NOT STATED, set to 0) $0).

- **Break-even: 6 completed deals a day.** Below that you lose money every month.
- **Profit margin at your plan** (8 a day): **17%** of every sale, after every cost.

### Year 1, month by month

| month | completed deals a day | revenue | profit | cumulative (after $5,500 startup) |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 0 | $540 | -$5,463 | -$10,963 |
| 2 | 1 | $1,080 | -$5,156 | -$16,119 |
| 3 | 1 | $1,800 | -$4,746 | -$20,865 |
| 4 | 2 | $2,700 | -$4,235 | -$25,100 |
| 5 | 2 | $3,600 | -$3,723 | -$28,823 |
| 6 | 3 | $4,860 | -$3,006 | -$31,829 |
| 7 | 3 | $6,120 | -$2,290 | -$34,119 |
| 8 | 4 | $7,560 | -$1,471 | -$35,589 |
| 9 | 5 | $9,000 | -$652 | -$36,241 |
| 10 | 6 | $10,440 | $167 | -$36,075 |
| 11 | 7 | $11,880 | $986 | -$35,089 |
| 12 | 7 | $13,320 | $1,805 | -$33,284 |

- **Year 1 operating profit: -$27,784** on $72,900 of revenue.
- After the $5,500 startup spend: -$33,284.
- Startup money earned back: not within year 1.
- Cash you need before it pays for itself: **$36,241**.

### What if

| scenario | margin at plan | break-even a day | year 1 profit |
| --- | ---: | ---: | ---: |
| Base plan | 17% | 6 | -$27,784 |
| Price -10% | 8% | 7 | -$35,074 |
| Volume -20% | 7% | 6 | -$36,075 |
| Unit costs +15% | 10% | 7 | -$32,501 |

### Red flags

- Year 1 loses money on operations (-$27,784).
- The startup spend is not earned back within year 1.

## Not done yet

- The offer: run /founder-offer
- Marketing: run /founder-marketing
- Brand: run /founder-brand
- Operations: run /founder-ops
- Launch plan: run /founder-launch

_The panel is simulated buyers and the numbers are projections from your inputs. Confirm demand with real customers and costs with real quotes before you spend. Not financial, legal or tax advice._
