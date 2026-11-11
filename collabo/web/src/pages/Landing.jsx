import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, BadgeCheck, Check, ChevronDown, ClipboardCheck, FileSignature, Lock, MessageSquareText, Minus, Search, ShieldCheck, Sparkles, Wallet, X,
} from 'lucide-react';
import { api, money } from '../api.js';
import { useSession } from '../App.jsx';
import { AnimatePresence, CountUp, Reveal, Stagger, StaggerItem, m } from '../motion.jsx';
import { PLATFORM_LABEL } from '../ui.jsx';

const icon = { size: 20, strokeWidth: 2, 'aria-hidden': true };

export default function Landing() {
  return (
    <div className="landing">
      <Hero />
      <TrustBar />
      <Features />
      <HowItWorks />
      <Proof />
      <Pricing />
      <RateEstimator />
      <Faq />
      <FinalCta />
      <Footer />
    </div>
  );
}

// ---------- hero ----------
function Hero() {
  return (
    <section className="lp-hero">
      <div className="lp-hero-copy">
        <Reveal y={12}><span className="eyebrow"><Sparkles size={14} aria-hidden /> Influencer marketing for small businesses</span></Reveal>
        <Reveal delay={0.05}><h1 className="display">Hire creators. <span className="grad">Pay only for approved work.</span></h1></Reveal>
        <Reveal delay={0.1}>
          <p className="lead">Browse creators with follower and engagement data verified through Instagram. Agree a contract, deposit into escrow, approve the draft, then the live post. Creators get paid on time, every time.</p>
        </Reveal>
        <Reveal delay={0.15} className="row gap wrap">
          <m.span whileTap={{ scale: 0.98 }}><Link to="/join/business" className="btn lg">Find creators <ArrowRight size={18} aria-hidden /></Link></m.span>
          <m.span whileTap={{ scale: 0.98 }}><Link to="/join/creator" className="btn lg secondary">I’m a creator</Link></m.span>
        </Reveal>
        <Reveal delay={0.2}><p className="muted small">No subscription. Brands pay 5% per deal; creators keep 90%. <Link to="/deal-flow">See how a deal works →</Link></p></Reveal>
      </div>
      <Reveal delay={0.1} y={32} className="lp-hero-visual"><LiveDeal /></Reveal>
    </section>
  );
}

const DEAL_STEPS = ['Offer', 'Sign', 'Fund', 'Draft', 'Review', 'Post', 'Approve', 'Paid'];

// A real-looking deal moving through Collabo's steps. Illustrative example, labelled as such.
function LiveDeal() {
  const [step, setStep] = useState(3);
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
    const t = setInterval(() => setStep((s) => (s + 1) % DEAL_STEPS.length), 1800);
    return () => clearInterval(t);
  }, []);
  const released = step >= 7 ? 100 : step >= 5 ? 30 : 0;
  const funded = step >= 3;
  return (
    <div className="deal-mock" aria-label="Example deal on Collabo">
      <div className="row between">
        <span className="small muted">Example deal</span>
        <AnimatePresence mode="wait">
          <m.span key={funded ? 'f' : 'n'} className={`escrow-badge ${funded ? '' : 'off'}`} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Lock size={12} aria-hidden /> {funded ? '$805 in escrow' : 'Not funded yet'}
          </m.span>
        </AnimatePresence>
      </div>
      <div className="dm-parties">
        <span className="dm-avatar" style={{ background: '#334155' }}>GL</span>
        <div className="grow"><b>Glow skincare × @maya</b><div className="small muted">1 Reel (30s) + 3 Story frames · paid usage 30 days</div></div>
      </div>
      <div className="dm-verified"><BadgeCheck size={16} aria-hidden /> 184K followers · 3.8% engagement <span className="muted">· verified via Instagram</span></div>
      <ol className="dm-steps" aria-label="Deal progress">
        {DEAL_STEPS.map((s, i) => (
          <li key={s} className={i < step ? 'done' : i === step ? 'now' : ''}>
            <m.span className="dm-dot" animate={{ scale: i === step ? 1.15 : 1 }}>{i < step ? <Check size={12} aria-hidden /> : null}</m.span>
            <span className="dm-label">{s}</span>
          </li>
        ))}
      </ol>
      <div className="dm-escrow">
        <div className="row between small"><span>Released to creator</span><b>{released}%</b></div>
        <div className="dm-bar"><m.div className="dm-bar-fill" animate={{ scaleX: released / 100 }} initial={false} transition={{ duration: 0.6 }} /></div>
      </div>
      <AnimatePresence mode="wait">
        <m.div key={step} className="dm-event small" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
          {[
            'Glow sent an offer: $767 for a Reel and 3 Stories.',
            'Both sides signed the contract.',
            'Glow deposited $805 (fee + 5%) into escrow.',
            'Maya submitted a draft. Collabo check: 91/100.',
            'Glow approved the draft. 30% released to Maya.',
            'Maya posted it with code MAYA44 and #ad.',
            'Glow approved the live post. Remaining 70% released.',
            'Done. 61 sales tracked on MAYA44.',
          ][step]}
        </m.div>
      </AnimatePresence>
    </div>
  );
}

function TrustBar() {
  const items = [
    [ShieldCheck, 'Escrow on every deal'], [BadgeCheck, 'Stats verified via Instagram’s official API'],
    [FileSignature, 'FTC-ready contracts'], [ClipboardCheck, 'Drafts checked before they go live'],
  ];
  return (
    <Stagger className="trust-bar" as="ul">
      {items.map(([I, t]) => <StaggerItem as="li" key={t}><I {...icon} size={18} /> {t}</StaggerItem>)}
    </Stagger>
  );
}

// ---------- features (bento) ----------
function Features() {
  return (
    <section id="features" className="lp-section">
      <Reveal className="lp-head">
        <h2 className="h-section">Built around the three things that go wrong</h2>
        <p className="lead">Fake reach, late payments and off-brand content. Each one has a fix built into every deal.</p>
      </Reveal>
      <Stagger className="bento">
        <StaggerItem className="bento-card bento-wide">
          <m.div className="bento-inner" whileHover={{ y: -2 }}>
            <span className="feat-icon"><Search {...icon} /></span>
            <h3>Numbers you can check</h3>
            <p>Creators connect Instagram through its official login, so followers, views, reach and audience come straight from Instagram. Tap any number to see where it came from and when.</p>
            <div className="prov-demo">
              <span className="src-badge src-verified"><BadgeCheck size={12} aria-hidden /> Verified</span>
              <span className="small"><b>184,000 followers</b> · fetched 2 h ago via <code>/me?fields=followers_count</code></span>
            </div>
          </m.div>
        </StaggerItem>
        <StaggerItem className="bento-card">
          <m.div className="bento-inner" whileHover={{ y: -2 }}>
            <span className="feat-icon"><Wallet {...icon} /></span>
            <h3>Money on the table</h3>
            <p>The brand deposits before work starts. 30% releases on draft approval, 70% on the live post. Silence auto-approves; missed deadlines refund.</p>
            <EscrowDemo />
          </m.div>
        </StaggerItem>
        <StaggerItem className="bento-card">
          <m.div className="bento-inner" whileHover={{ y: -2 }}>
            <span className="feat-icon"><MessageSquareText {...icon} /></span>
            <h3>Content checked before it’s live</h3>
            <p>Every draft is scored for disclosure, promo code, hook, length and risky claims, with timestamped feedback from the brand.</p>
            <ChecksDemo />
          </m.div>
        </StaggerItem>
      </Stagger>
    </section>
  );
}

function EscrowDemo() {
  return (
    <div className="mini-escrow" aria-hidden>
      <m.div className="mini-seg released" initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.3 }} style={{ width: '30%' }} />
      <m.div className="mini-seg held" initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.6 }} style={{ width: '70%' }} />
    </div>
  );
}

function ChecksDemo() {
  const rows = ['#ad disclosure', 'Promo code MAYA44', 'Hook score 82/100', 'No risky claims'];
  return (
    <Stagger as="ul" className="mini-checks" gap={0.12}>
      {rows.map((r) => <StaggerItem as="li" key={r}><span className="check-ico-sm"><Check size={11} aria-hidden /></span>{r}</StaggerItem>)}
    </Stagger>
  );
}

// ---------- how it works ----------
function HowItWorks() {
  const steps = [
    ['Offer', 'Pick deliverables, lengths and usage rights. Prices start from the creator’s rates.'],
    ['Sign', 'A contract builds itself from the offer. Both sides sign by typing their name.'],
    ['Escrow', 'The brand deposits the fee. The creator knows the money is real.'],
    ['Review & post', 'Draft first, feedback, then the live post with the promo code.'],
    ['Paid', 'Approval releases the money. Sales on the code build the creator’s track record.'],
  ];
  return (
    <section id="how" className="lp-section">
      <Reveal className="lp-head">
        <h2 className="h-section">How a deal works</h2>
        <p className="lead">Five steps, one deal room, no chasing anyone over DMs.</p>
      </Reveal>
      <Stagger as="ol" className="how-steps">
        {steps.map(([t, d], i) => (
          <StaggerItem as="li" key={t}>
            <span className="how-n">{i + 1}</span>
            <div><b>{t}</b><p className="small muted">{d}</p></div>
          </StaggerItem>
        ))}
      </Stagger>
      <Reveal><Link to="/deal-flow" className="btn ghost">Explore all 8 steps or try a demo deal <ArrowRight size={16} aria-hidden /></Link></Reveal>
    </section>
  );
}

// ---------- social proof (sourced facts, honest comparison) ----------
function Proof() {
  const facts = [
    { n: <CountUp to={56} suffix="%" />, t: 'of creators report being paid late', src: 'Tipalti survey, via Gigapay', href: 'https://www.gigapay.com/blog/why-creators-put-fast-paying-brands-first' },
    { n: '1 in 2', t: 'brands say they’ve mispriced a creator deal', src: 'Companion survey, July 2026, via Net Influencer', href: 'https://www.netinfluencer.com/nearly-half-of-brands-have-mispriced-creator-deals-survey-finds/' },
    { n: <CountUp to={67} suffix="%" />, t: 'of creators earn under $10K a year', src: 'CreatorIQ State of Creators 2026', href: 'https://www.creatoriq.com/whitepaper/state-of-creators' },
  ];
  const Y = <span className="cmp-yes"><Check size={16} aria-label="Yes" /></span>;
  const N = <span className="cmp-no"><X size={16} aria-label="No" /></span>;
  const P = <span className="cmp-part"><Minus size={16} aria-label="Partly" /></span>;
  const rows = [
    ['Follower data you can verify', N, P, Y],
    ['Money protected until you approve', N, Y, Y],
    ['Contract with disclosure and usage rights', N, Y, Y],
    ['Draft review with structured feedback', P, Y, Y],
    ['Creator paid on a schedule', N, P, Y],
    ['Cost', 'Free + your time', 'Retainers and minimums', '5% per deal'],
  ];
  return (
    <section className="lp-section">
      <Reveal className="lp-head">
        <h2 className="h-section">Why this needed fixing</h2>
        <p className="lead">The problems are measured, and they cost both sides.</p>
      </Reveal>
      <Stagger className="facts">
        {facts.map((f) => (
          <StaggerItem key={f.t} className="fact">
            <div className="fact-n">{f.n}</div>
            <p>{f.t}</p>
            <a className="small" href={f.href} target="_blank" rel="noreferrer">Source: {f.src} ↗</a>
          </StaggerItem>
        ))}
      </Stagger>
      <Reveal className="card cmp-card">
        <div className="table-wrap">
          <table className="table cmp">
            <thead><tr><th /><th>DMs + spreadsheet</th><th>Agency</th><th className="cmp-us">Collabo</th></tr></thead>
            <tbody>{rows.map(([label, ...cells]) => (
              <tr key={label}><th scope="row">{label}</th>{cells.map((c, i) => <td key={i} className={i === 2 ? 'cmp-us' : ''}>{c}</td>)}</tr>
            ))}</tbody>
          </table>
        </div>
      </Reveal>
    </section>
  );
}

// ---------- pricing ----------
function Pricing() {
  const [deal, setDeal] = useState(500);
  const brandPays = Math.round(deal * 1.05 * 100);
  const creatorGets = Math.round(deal * 0.9 * 100);
  return (
    <section id="pricing" className="lp-section">
      <Reveal className="lp-head">
        <h2 className="h-section">Simple pricing, charged per deal</h2>
        <p className="lead">No subscriptions and no minimums. You only pay when a deal happens.</p>
      </Reveal>
      <Stagger className="price-grid">
        <StaggerItem className="price-card">
          <span className="eyebrow">For brands</span>
          <div className="price-big">5%<span> per deal</span></div>
          <p className="muted small">Added on top of the creator’s fee, paid into escrow with it.</p>
          <ul className="price-list">
            {['Verified creator search and compare', 'Offer builder with usage rights and bonuses', 'Contract, escrow and draft approval', 'Promo-code results and ROI tracking'].map((x) => <li key={x}><Check size={16} aria-hidden /> {x}</li>)}
          </ul>
          <Link to="/join/business" className="btn">Find creators</Link>
        </StaggerItem>
        <StaggerItem className="price-card featured">
          <span className="eyebrow">For creators</span>
          <div className="price-big">Free<span> to join</span></div>
          <p className="muted small">Collabo keeps 10% of what you earn, only when you’re paid.</p>
          <ul className="price-list">
            {['Payment secured before you start', 'Auto-release if a brand goes quiet', 'Rate tool that flags underpricing', 'Growth path, hook lab and trend tracking'].map((x) => <li key={x}><Check size={16} aria-hidden /> {x}</li>)}
          </ul>
          <Link to="/join/creator" className="btn">Join as a creator</Link>
        </StaggerItem>
      </Stagger>
      <Reveal className="card fee-calc">
        <label htmlFor="deal-size"><b>Try a deal size</b> <span className="fee-deal">{money(deal * 100)}</span></label>
        <input id="deal-size" type="range" min="100" max="5000" step="50" value={deal} onChange={(e) => setDeal(Number(e.target.value))} />
        <div className="fee-out">
          <div><span className="small muted">Brand deposits</span><b>{money(brandPays, { exact: true })}</b></div>
          <div><span className="small muted">Creator receives</span><b>{money(creatorGets, { exact: true })}</b></div>
          <div><span className="small muted">Collabo keeps</span><b>{money(brandPays - creatorGets, { exact: true })}</b></div>
        </div>
      </Reveal>
    </section>
  );
}

// ---------- rate estimator (live, uses the real rate engine) ----------
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
    <section className="lp-section">
      <Reveal className="card estimator">
        <h2 className="h-sub">Creators: what should you charge?</h2>
        <p className="muted">A free rate check based on platform rates and what similar creators on Collabo charge.</p>
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
      </Reveal>
    </section>
  );
}

// ---------- FAQ ----------
const FAQS = [
  ['How does escrow work?', 'When both sides sign, the brand deposits the fee (plus any performance bonus) with Collabo. 30% is released to the creator when the brand approves the draft and 70% when it approves the live post. Neither side can withdraw it on their own.'],
  ['What if the creator doesn’t deliver?', 'If nothing is live 3 days after the agreed deadline, the brand can reclaim everything still held in escrow with one click.'],
  ['What if the brand never responds?', 'Silence counts as approval: 3 days after a draft is submitted, or 5 days after the live post, the money is released to the creator automatically.'],
  ['Are follower counts real?', 'Creators who connect Instagram get a “Verified” badge, and their numbers come from Instagram’s official API. Anything typed in by hand is labelled “Self-reported”. Tap any number to see its source.'],
  ['What does it cost?', 'Brands pay 5% on top of each deal. Creators join free and Collabo keeps 10% of what they earn. No subscriptions.'],
  ['Who owns the content, and can we run it as ads?', 'The creator keeps ownership. The contract lists the usage rights you agreed, from 90 days of organic resharing up to paid ads or whitelisting, each priced in the offer.'],
  ['Is sponsored content disclosed?', 'Yes. Every contract requires #ad or the platform’s paid-partnership label, and drafts are checked for it before they go live.'],
  ['What happens if we disagree?', 'Either side can open a dispute, which freezes the escrow until you agree a split or Collabo mediation decides.'],
];

function Faq() {
  const [open, setOpen] = useState(0);
  return (
    <section id="faq" className="lp-section lp-faq">
      <Reveal className="lp-head"><h2 className="h-section">Questions, answered</h2></Reveal>
      <div className="faq">
        {FAQS.map(([q, a], i) => (
          <div key={q} className={`faq-item ${open === i ? 'open' : ''}`}>
            <h3>
              <button type="button" aria-expanded={open === i} aria-controls={`faq-${i}`} onClick={() => setOpen(open === i ? -1 : i)}>
                {q}<ChevronDown size={18} aria-hidden className="faq-chev" />
              </button>
            </h3>
            <AnimatePresence initial={false}>
              {open === i && (
                <m.div id={`faq-${i}`} key="a" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="faq-a">
                  <p>{a}</p>
                </m.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <Reveal as="section" className="final-cta">
      <h2 className="h-section">Your first deal, protected end to end.</h2>
      <p className="lead">Set up in minutes. You only pay when a deal happens.</p>
      <div className="row gap wrap center-row">
        <m.span whileTap={{ scale: 0.98 }}><Link to="/join/business" className="btn lg on-dark">Find creators <ArrowRight size={18} aria-hidden /></Link></m.span>
        <m.span whileTap={{ scale: 0.98 }}><Link to="/join/creator" className="btn lg ghost-dark">Join as a creator</Link></m.span>
      </div>
    </Reveal>
  );
}

function Footer() {
  return (
    <footer className="lp-footer">
      <div className="lp-footer-brand"><img src="/icon.svg" alt="" width="24" height="24" /><b>Collabo</b><p className="small muted">The influencer marketplace with escrow on every deal.</p></div>
      <nav aria-label="Product"><b className="small">Product</b><Link to="/deal-flow">How a deal works</Link><Link to="/discover">Find creators</Link><Link to="/campaigns">Open briefs</Link></nav>
      <nav aria-label="Get started"><b className="small">Get started</b><Link to="/join/business">Join as a brand</Link><Link to="/join/creator">Join as a creator</Link><Link to="/login">Sign in</Link></nav>
      <nav aria-label="Legal"><b className="small">Legal</b><Link to="/privacy">Privacy Policy</Link><Link to="/terms">Terms of Service</Link><Link to="/data-deletion">Data deletion</Link></nav>
      <p className="small muted lp-copy">© {new Date().getFullYear()} Collabo</p>
    </footer>
  );
}
