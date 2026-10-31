import React, { useEffect, useState } from 'react';
import { compact, money } from './api.js';

export const PLATFORM_LABEL = { instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube', x: 'X', twitch: 'Twitch', any: 'Any channel' };
const PLATFORM_ABBR = { instagram: 'IG', tiktok: 'TT', youtube: 'YT', x: 'X', twitch: 'TW', any: 'UGC' };

export function Avatar({ name, color, size = 48, src }) {
  const [broken, setBroken] = useState(false);
  const initials = name.split(' ').map((p) => p[0]).slice(0, 2).join('');
  if (src && !broken) return <img className="avatar" src={src} alt="" width={size} height={size} style={{ width: size, height: size }} referrerPolicy="no-referrer" onError={() => setBroken(true)} />;
  return <div className="avatar" style={{ background: color, width: size, height: size, fontSize: size * 0.38 }}>{initials}</div>;
}

export const Platform = ({ p }) => <span className={`plat plat-${p}`} title={PLATFORM_LABEL[p]}>{PLATFORM_ABBR[p]}</span>;

export function SocialChip({ s }) {
  return <span className="chip"><Platform p={s.platform} /> {compact(s.followers)} · {s.engagement_rate}% ER</span>;
}

export const TierBadge = ({ tier }) => <span className={`tier tier-${tier.toLowerCase()}`}>{tier}</span>;

const STATUS = {
  negotiating: ['Negotiating', 'amber'], contract: ['Sign contract', 'blue'], awaiting_funding: ['Awaiting funding', 'blue'],
  in_progress: ['Funded: in progress', 'violet'], draft_submitted: ['Draft in review', 'violet'], draft_approved: ['Draft approved: post it', 'violet'],
  delivered: ['Live: final review', 'violet'], completed: ['Completed', 'green'], disputed: ['Disputed: funds frozen', 'red'],
  resolved: ['Resolved', 'gray'], refunded: ['Refunded', 'gray'], declined: ['Declined', 'gray'], cancelled: ['Cancelled', 'gray'],
};
export const StatusPill = ({ status }) => <span className={`pill pill-${STATUS[status]?.[1]}`}>{STATUS[status]?.[0] ?? status}</span>;

export const Stars = ({ value }) => value == null ? <span className="muted">No reviews yet</span> : <span className="stars">★ {value.toFixed(1)}</span>;

export function Stat({ label, value, sub }) {
  return <div className="stat"><div className="stat-value">{value}</div><div className="stat-label">{label}</div>{sub && <div className="stat-sub">{sub}</div>}</div>;
}

export function Modal({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="modal-head"><h3>{title}</h3><button className="icon-btn" onClick={onClose} aria-label="Close">×</button></div>
        {children}
      </div>
    </div>
  );
}

export function ErrorNote({ error }) {
  return error ? <div className="error">{error}</div> : null;
}

// Loads data for a page and exposes a reload; keeps page components short.
export function useLoad(fn, deps) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const reload = () => fn().then((d) => { setData(d); setError(null); }).catch((e) => setError(e.message));
  useEffect(() => { reload(); }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return [data, reload, setData, error];
}

// Wraps an async action with busy + error state for buttons and forms.
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const run = async (fn) => {
    setBusy(true); setError(null);
    try { return await fn(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  return { busy, error, run, setError };
}

export function NicheChips({ all, value, onChange }) {
  const toggle = (n) => onChange(value.includes(n) ? value.filter((x) => x !== n) : [...value, n]);
  return (
    <div className="chips">
      {all.map((n) => <button type="button" key={n} className={`chip selectable ${value.includes(n) ? 'on' : ''}`} onClick={() => toggle(n)}>{n}</button>)}
    </div>
  );
}

export function EscrowBadge({ cents }) {
  return cents > 0 ? <span className="escrow-badge" title="Held by the platform until the work is approved">🔒 {money(cents)} in escrow</span> : null;
}

// ---------- data provenance ----------
const SOURCE_META = {
  instagram_api: { label: 'Verified', icon: '✓', cls: 'src-verified', title: 'Fetched from Instagram’s official API with the account owner’s permission' },
  verified: { label: 'Verified via Instagram', icon: '✓', cls: 'src-verified', title: 'Connected through Instagram’s official API' },
  self_reported: { label: 'Self-reported', icon: '✎', cls: 'src-self', title: 'Entered by the creator, not verified' },
  demo: { label: 'Demo data', icon: '◇', cls: 'src-demo', title: 'A fictional creator used to show how Collabo works' },
  collabo_deals: { label: 'Collabo deals', icon: '◎', cls: 'src-collabo', title: 'From completed deals on Collabo' },
};

export function SourceBadge({ source, compact }) {
  const m = SOURCE_META[source] ?? SOURCE_META.self_reported;
  return <span className={`src-badge ${m.cls}`} title={m.title}>{m.icon}{compact ? '' : ` ${m.label}`}</span>;
}

export const ago = (ts) => {
  if (!ts) return null;
  const t = Date.parse(ts.includes('T') ? ts : `${ts.replace(' ', 'T')}Z`);
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  if (m < 48 * 60) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} days ago`;
};

// A metric value you can click to see where it came from.
export function MetricButton({ p, children, onOpen }) {
  if (!p) return children;
  return (
    <button type="button" className={`metric-btn ${SOURCE_META[p.source]?.cls ?? ''}`} onClick={() => onOpen(p)} title="Where does this number come from?">
      {children}<span className="metric-i" aria-hidden>ⓘ</span>
    </button>
  );
}

export function ProvenanceModal({ p, onClose }) {
  return (
    <Modal title="Where this number comes from" onClose={onClose}>
      <div className="prov">
        <div className="prov-head"><b>{p.metric}</b>{p.value != null && <span className="prov-value">{typeof p.value === 'number' ? p.value.toLocaleString() : p.value}</span>}</div>
        <SourceBadge source={p.source} />
        <p>{p.source_label}</p>
        <dl className="flow-facts">
          {p.handle && <><dt>Account</dt><dd>@{p.handle} on {p.platform}</dd></>}
          <dt>How it’s measured</dt><dd>{p.method}</dd>
          {p.fetched_at && <><dt>Last fetched</dt><dd>{ago(p.fetched_at)} ({p.fetched_at} UTC)</dd></>}
          {p.verified_at && <><dt>Verified since</dt><dd>{p.verified_at.slice(0, 10)}</dd></>}
        </dl>
        {p.source === 'instagram_api' && <p className="small muted">Collabo reads this through Instagram’s official API using a permission the creator granted. It isn’t typed in by anyone, and it refreshes automatically (at most every 6 hours, or when the creator taps Refresh).</p>}
        {p.source === 'self_reported' && <p className="small muted">Ask the creator to connect Instagram to verify it, or request a screenshot of their insights before booking.</p>}
      </div>
    </Modal>
  );
}
