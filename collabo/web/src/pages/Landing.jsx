import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money } from '../api.js';
import { useSession } from '../App.jsx';
import { PLATFORM_LABEL } from '../ui.jsx';

export default function Landing() {
  return (
    <>
      <section className="hero">
        <h1>Influencer marketing without the agency markup.</h1>
        <p className="lead">Brands shop vetted creators by niche, reach and <b>real sales results</b>. Creators list packages at market rates, negotiate, sign and get paid, all in one place.</p>
        <div className="row gap wrap">
          <Link to="/join/business" className="btn lg">I'm a brand: find creators</Link>
          <Link to="/join/creator" className="btn lg secondary">I'm a creator: start earning</Link>
        </div>
        <p className="muted small">Demo logins (password <code>password123</code>): <code>brand@glowlab.co</code> · <code>mayaglow@creator.demo</code></p>
      </section>

      <section className="grid3">
        <div className="card"><h3>For brands</h3><p>Filter by niche, platform, audience and engagement. See every creator's past ROI, sales driven and reviews before you spend a dollar.</p></div>
        <div className="card"><h3>For creators</h3><p>Our rate engine compares your reach and engagement to the market so you never undercharge. Level up from Rising to Elite as you deliver.</p></div>
        <div className="card"><h3>Safe deals</h3><p>Offer and counter-offer, an auto-generated contract, e-signatures, escrow, and a tracked promo code on every deal.</p></div>
      </section>

      <RateEstimator />

      <section className="card">
        <h2>How a deal works</h2>
        <ol className="steps">
          <li><b>Discover or post a brief.</b> Brands browse creators or post a campaign that creators pitch on.</li>
          <li><b>Negotiate.</b> Offers and counter-offers on price, deliverables and deadline.</li>
          <li><b>Sign.</b> A contract covering FTC disclosure, usage rights and the promo code is generated and signed by both sides.</li>
          <li><b>Escrow.</b> The brand funds the deal; the money is held until delivery is approved.</li>
          <li><b>Deliver and measure.</b> The creator posts; sales from the promo code build their track record.</li>
        </ol>
      </section>
    </>
  );
}

function RateEstimator() {
  const { meta } = useSession();
  const [f, setF] = useState({ platform: 'instagram', deliverable_type: 'reel', followers: 50000, engagement_rate: 3.5, niche: 'beauty' });
  const [out, setOut] = useState(null);
  useEffect(() => {
    const t = setTimeout(() => api('/rates/estimate', { method: 'POST', body: { ...f, niches: [f.niche] } }).then(setOut).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [f]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value, ...(k === 'platform' && { deliverable_type: meta.deliverables[e.target.value][0] }) });

  return (
    <section className="card estimator">
      <h2>What should you charge?</h2>
      <p className="muted">Free rate check for creators, based on platform rates and what similar creators on Collabo charge.</p>
      <div className="form-grid">
        <label>Platform<select value={f.platform} onChange={set('platform')}>{meta.platforms.map((p) => <option key={p} value={p}>{PLATFORM_LABEL[p]}</option>)}</select></label>
        <label>Format<select value={f.deliverable_type} onChange={set('deliverable_type')}>{meta.deliverables[f.platform].map((d) => <option key={d}>{d}</option>)}</select></label>
        <label>Followers<input type="number" min="0" value={f.followers} onChange={set('followers')} /></label>
        <label>Engagement %<input type="number" step="0.1" min="0" value={f.engagement_rate} onChange={set('engagement_rate')} /></label>
        <label>Niche<select value={f.niche} onChange={set('niche')}>{meta.niches.map((n) => <option key={n}>{n}</option>)}</select></label>
      </div>
      {out && (
        <div className="estimate">
          <div><div className="muted small">Suggested rate</div><div className="big">{money(out.suggestion.suggested_cents)}</div><div className="muted small">Range {money(out.suggestion.low_cents)}–{money(out.suggestion.high_cents)}</div></div>
          <div><div className="muted small">Market median</div><div className="big">{out.market.median_cents ? money(out.market.median_cents) : '—'}</div><div className="muted small">{out.market.sample_size ? `${out.market.sample_size} similar listings` : 'Not enough similar listings yet'}</div></div>
        </div>
      )}
    </section>
  );
}
