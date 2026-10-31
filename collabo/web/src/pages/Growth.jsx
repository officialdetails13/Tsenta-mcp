import React from 'react';
import { Link } from 'react-router-dom';
import { api, money } from '../api.js';
import { TierBadge, useLoad } from '../ui.jsx';

const TIER_PERKS = {
  New: 'Listed in search',
  Rising: 'Shown in “Rising creators” and allowed to pitch on unlimited briefs',
  Pro: 'Pro badge, priority placement, and invites to brand-only briefs',
  Elite: 'Top of search, faster payouts, and a dedicated partner manager',
};

const LESSONS = [
  { title: 'Price on value, not followers', body: 'Brands buy outcomes. Once you have ROI on the board, quote it: “My last 3 skincare partners averaged 3.4× return.” That alone justifies charging 20–40% more.' },
  { title: 'Bundle to raise order size', body: 'Offer a “launch bundle” (1 Reel + 3 stories + link) at about 15% off the separate prices. Brands like the savings and you earn more per deal.' },
  { title: 'Hooks that hold', body: 'Show the product or the payoff in the first 1.5 seconds. Lead with the problem, not the brand name. Keep sponsored videos under 45 seconds unless the brief asks for more.' },
  { title: 'Negotiating counter-offers', body: 'Never just drop your price. Change the scope: fewer deliverables, shorter usage rights, or a longer deadline. Give something up for every discount.' },
  { title: 'Usage rights are a separate fee', body: 'The standard contract gives 90 days of organic reshares. Paid ads or whitelisting are worth an extra 30–100% of your fee, so put it in a separate agreement.' },
  { title: 'Always disclose', body: 'Use #ad or the platform\'s paid-partnership label. It protects your account and the brand, and audiences trust creators who are open about it.' },
];

export function toNext(g) {
  const parts = [g.points_to_next && `${g.points_to_next} pts`, g.deals_to_next && `${g.deals_to_next} more completed deal${g.deals_to_next > 1 ? 's' : ''}`].filter(Boolean);
  return `${parts.join(' + ')} to ${g.next_tier}`;
}

export default function Growth() {
  const [g] = useLoad(() => api('/creator/growth'), []);
  if (!g) return <p className="muted">Loading…</p>;
  const under = g.pricing.filter((p) => p.verdict === 'underpriced');

  return (
    <>
      <div className="page-head"><h1>Level up</h1><p className="muted">Grow your tier, your rates and your craft.</p></div>

      <section className="card tier-card">
        <div className="row between wrap">
          <div className="row gap"><TierBadge tier={g.tier} /><b>{g.score}/100 creator score</b></div>
          <span className="muted small">{g.next_tier ? toNext(g) : 'You’re at the top tier'}</span>
        </div>
        <div className="progress"><div style={{ width: `${g.score}%` }} /></div>
        <div className="tier-scale"><span>New</span><span>Rising 25</span><span>Pro 50 + 2 deals</span><span>Elite 75 + 5 deals</span></div>
        <p className="small"><b>{g.tier} perks:</b> {TIER_PERKS[g.tier]}{g.next_tier && <> · <b>Next:</b> {TIER_PERKS[g.next_tier]}</>}</p>
      </section>

      <div className="two-col">
        <section className="card">
          <h2>Your checklist</h2>
          <ul className="checklist">
            {g.checklist.map((c) => (
              <li key={c.key} className={c.done ? 'done' : ''}>
                <span className="check">{c.done ? '✓' : ''}</span>
                <span className="grow">{c.label}</span>
                <span className="muted small">{c.earned != null && !c.done ? `${c.earned}/` : ''}{c.points} pts</span>
              </li>
            ))}
          </ul>
          {!g.checklist.find((c) => c.key === 'packages').done && <Link to="/studio" className="btn sm secondary">Add packages in Studio</Link>}
        </section>

        <section className="card">
          <h2>Rate check</h2>
          {g.pricing.length === 0 ? <p className="muted">List packages to see how your pricing compares.</p> : (
            <>
              {under.length > 0
                ? <div className="hint warn">You could be earning about <b>{money(under.reduce((a, p) => a + (p.reference_cents * p.quantity - p.price_cents), 0))}</b> more per round of these packages.</div>
                : <div className="hint ok">All your packages are at or above market.</div>}
              <table className="table">
                <thead><tr><th>Package</th><th>You</th><th>Market</th><th></th></tr></thead>
                <tbody>{g.pricing.map((p) => (
                  <tr key={p.package_id}><td>{p.title}</td><td>{money(p.price_cents)}</td><td>{money(p.reference_cents * p.quantity)}</td>
                    <td><span className={`pill pill-${p.verdict === 'underpriced' ? 'amber' : p.verdict === 'premium' ? 'violet' : 'green'}`}>{p.verdict.replace('_', ' ')}</span></td></tr>
                ))}</tbody>
              </table>
            </>
          )}
        </section>
      </div>

      <section className="card">
        <h2>Creator Academy</h2>
        <div className="lessons">
          {LESSONS.map((l) => <details key={l.title} className="lesson"><summary>{l.title}</summary><p>{l.body}</p></details>)}
        </div>
      </section>
    </>
  );
}
