# CFO's note

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

# Unit economics: Collabo (US, brand side pays 5%, creator side pays 10%)

Every number below comes from the input file. Nothing is looked up or guessed.

## One completed deal

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

## The margin that matters

Fixed costs: $5,770 a month (Hosting, database, email/notifications (ESTIMATE) $170, Software and tools (ESTIMATE) $100, Part-time ops/community person, 25 h/wk (ESTIMATE) $2,500, Marketing to recruit brands and creators (ESTIMATE) $3,000, Founder salary (NOT STATED, set to 0) $0).

- **Break-even: 6 completed deals a day.** Below that you lose money every month.
- **Profit margin at your plan** (8 a day): **17%** of every sale, after every cost.

## Year 1, month by month

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

## What if

| scenario | margin at plan | break-even a day | year 1 profit |
| --- | ---: | ---: | ---: |
| Base plan | 17% | 6 | -$27,784 |
| Price -10% | 8% | 7 | -$35,074 |
| Volume -20% | 7% | 6 | -$36,075 |
| Unit costs +15% | 10% | 7 | -$32,501 |

## Red flags

- Year 1 loses money on operations (-$27,784).
- The startup spend is not earned back within year 1.
