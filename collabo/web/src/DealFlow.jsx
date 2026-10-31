import React, { useEffect, useRef, useState } from 'react';

// The eight stages of a deal. Shared by the deal room and the public tour.
export const STAGES = [
  {
    key: 'negotiating', label: 'Offer', actor: 'Either side', icon: '✉',
    title: 'Offer and negotiate',
    what: 'The brand builds an offer line by line: platform, format (Reel, Story, TikTok, Short…), length (15–90s), quantity and price, plus contract terms such as usage rights, exclusivity, revisions and how long it stays live. The other side accepts, counters with their own version, or declines.',
    money: 'Nothing is charged yet. Prices start from the creator’s suggested rates; add-ons like paid usage add a percentage.',
    screen: 'Offer cards with a line-item price table, the deliverables builder for counter-offers, and Accept / Counter / Decline.',
    at: (d) => d.created_at,
  },
  {
    key: 'contract', label: 'Sign', actor: 'Both sides', icon: '✍',
    title: 'Sign the contract',
    what: 'Accepting builds the contract from the agreed terms: a deliverables schedule, payment schedule, revisions, usage rights, exclusivity, disclosure, tracking and any custom terms. Both sides sign by typing their full name.',
    money: 'Nothing is charged yet. Either side can still cancel.',
    screen: 'The contract section by section, signature blocks, a typed-name signature with consent, and a download button.',
    at: (d) => d.business_signed_at && d.creator_signed_at && (d.business_signed_at > d.creator_signed_at ? d.business_signed_at : d.creator_signed_at),
  },
  {
    key: 'awaiting_funding', label: 'Fund', actor: 'Brand', icon: '🔒',
    title: 'Deposit into escrow',
    what: 'The brand deposits the fee, any performance bonus and the 5% service fee. From here the brand can’t cancel, and the creator knows the money is real.',
    money: 'Brand → escrow (fee + bonus + 5%). Neither side can withdraw it on their own.',
    screen: 'A full payment breakdown (line items, add-ons, bonus, service fee, total), card or bank transfer, and a release schedule showing what the creator nets at each milestone.',
    at: (d) => d.funded_at,
  },
  {
    key: 'in_progress', label: 'Draft', actor: 'Creator', icon: '🎬',
    title: 'Create and submit a draft',
    what: 'The creator makes the content and submits a draft link with the script, caption, hashtags and length. A live Collabo check scores it as they type.',
    money: 'Held in escrow. If the deadline passes by more than 3 days with nothing live, the brand can reclaim it.',
    screen: 'Draft form with live checks (disclosure, promo code, hook, call to action, length vs contract, risky claims) plus suggested hashtags, words and a caption.',
    at: (d) => d.draft_submitted_at,
  },
  {
    key: 'draft_submitted', label: 'Review', actor: 'Brand', icon: '👀',
    title: 'Review the draft',
    what: 'The brand reviews the draft with Collabo’s automated checks (and optional AI feedback), leaves feedback by category and timestamp, then approves or requests changes. Silence for 3 days counts as approval.',
    money: 'On approval, 30% of the fee is released to the creator (minus the 10% platform fee).',
    screen: 'Draft, script and caption, the review score and checks, AI feedback, a feedback thread kept per revision round, and Approve / Request changes.',
    at: (d) => d.draft_approved_at,
  },
  {
    key: 'draft_approved', label: 'Post', actor: 'Creator', icon: '📲',
    title: 'Post it live',
    what: 'The creator posts using the post kit: a suggested caption, hashtags to include, trending formats in their niche and their best day to post. They then submit the live link and confirm the contract checklist.',
    money: '70% of the fee is still held.',
    screen: 'Post kit with copy buttons, a caption check, the live URL and the checklist (submit stays disabled until every item is ticked).',
    at: (d) => d.delivered_at,
  },
  {
    key: 'delivered', label: 'Approve', actor: 'Brand', icon: '✅',
    title: 'Approve the live post',
    what: 'The brand opens the live post, ticks off each checklist item as verified, and approves it or requests a fix. Silence for 5 days counts as approval.',
    money: 'On approval, the remaining 70% is released to the creator.',
    screen: 'Live post and final caption, a verification checklist, Approve and release, Request fix, and results reporting.',
    at: (d) => d.completed_at,
  },
  {
    key: 'completed', label: 'Paid', actor: 'Both sides', icon: '★',
    title: 'Done: results and reviews',
    what: 'Both sides report results: the creator reports views, the brand reports promo-code sales. These build the creator’s public track record. Both sides leave a review.',
    money: 'The performance bonus is paid if the target is hit within 30 days; otherwise it goes back to the brand.',
    screen: 'Payout or cost statement, results and bonus progress, reviews, the escrow ledger, and “Rebook this creator”.',
    at: () => null,
  },
];

const OFF_PATH = {
  disputed: 'Disputed: escrow is frozen until both sides agree a split, or platform mediation decides.',
  refunded: 'Refunded: the deadline was missed, so the brand reclaimed the money still in escrow.',
  resolved: 'Resolved: a dispute was settled and the escrow was split.',
  cancelled: 'Cancelled before any money was deposited.',
  declined: 'Declined during negotiation.',
};

const fmt = (ts) => (ts ? new Date(`${ts.replace(' ', 'T')}${ts.includes('T') || ts.endsWith('Z') ? '' : 'Z'}`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : null);

// Big clickable progress bar. Without a deal it works as a self-guided tour.
export default function DealFlow({ deal, mySide }) {
  const status = deal ? (deal.status === 'disputed' ? deal.dispute_prev_status : deal.status) : null;
  const current = deal ? STAGES.findIndex((s) => s.key === status) : -1;
  const doneAll = deal?.status === 'completed';
  const [open, setOpen] = useState(current >= 0 ? current : 0);
  useEffect(() => { if (current >= 0) setOpen(current); }, [current]);
  // On narrow screens the track scrolls sideways; keep the selected step in view.
  const scroller = useRef(null);
  useEffect(() => {
    const box = scroller.current;
    const el = box?.querySelectorAll('.flow-step')[open];
    if (box && el && box.scrollWidth > box.clientWidth) box.scrollTo({ left: el.offsetLeft - box.clientWidth / 2 + el.clientWidth / 2, behavior: 'smooth' });
  }, [open]);

  const stateOf = (i) => (doneAll || (current >= 0 && i < current) ? 'done' : i === current ? 'now' : 'todo');
  const s = STAGES[open];
  const youAct = deal && mySide && (s.actor === 'Both sides' || s.actor === 'Either side' || s.actor.toLowerCase() === mySide);

  return (
    <section className="flow card" aria-label="Deal progress">
      <div className="flow-head">
        <h2>{deal ? 'Deal progress' : 'The 8 steps of every deal'}</h2>
        <span className="muted small">Tap a step to see what happens there</span>
      </div>
      {deal && OFF_PATH[deal.status] && <div className={`flow-offpath ${deal.status}`}>{OFF_PATH[deal.status]}</div>}
      <div className="flow-scroll" ref={scroller}>
        <ol className="flow-track" style={{ '--progress': `${doneAll ? 100 : current > 0 ? (current / (STAGES.length - 1)) * 100 : 0}%` }}>
          {STAGES.map((st, i) => (
            <li key={st.key} className={`flow-step ${stateOf(i)} ${open === i ? 'open' : ''}`}>
              <button type="button" onClick={() => setOpen(i)} aria-current={i === current ? 'step' : undefined} aria-expanded={open === i}>
                <span className="flow-dot">{stateOf(i) === 'done' ? '✓' : st.icon}</span>
                <span className="flow-label">{i + 1}. {st.label}</span>
                <span className="flow-sub">{deal && stateOf(i) === 'done' && st.at(deal) ? fmt(st.at(deal)) : st.actor}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>
      <div className="flow-detail">
        <div className="row between wrap gap">
          <h3>{open + 1}. {s.title}</h3>
          <span className={`pill pill-${stateOf(open) === 'done' ? 'green' : stateOf(open) === 'now' ? 'violet' : 'gray'}`}>
            {stateOf(open) === 'done' ? 'Done' : stateOf(open) === 'now' ? (youAct ? 'Now: your move' : 'Now: waiting on the other side') : deal ? 'Coming up' : `Acted on by: ${s.actor}`}
          </span>
        </div>
        <dl className="flow-facts">
          <dt>Who</dt><dd>{s.actor}</dd>
          <dt>What happens</dt><dd>{s.what}</dd>
          <dt>Money</dt><dd>{s.money}</dd>
          <dt>On screen</dt><dd>{s.screen}</dd>
        </dl>
        <div className="row gap">
          <button type="button" className="btn ghost sm" disabled={open === 0} onClick={() => setOpen(open - 1)}>← Previous step</button>
          <button type="button" className="btn ghost sm" disabled={open === STAGES.length - 1} onClick={() => setOpen(open + 1)}>Next step →</button>
        </div>
      </div>
    </section>
  );
}
