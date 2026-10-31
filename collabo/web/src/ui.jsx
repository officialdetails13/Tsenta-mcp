import React, { useEffect, useState } from 'react';
import { compact } from './api.js';

export const PLATFORM_LABEL = { instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube', x: 'X', twitch: 'Twitch', any: 'Any channel' };
const PLATFORM_ABBR = { instagram: 'IG', tiktok: 'TT', youtube: 'YT', x: 'X', twitch: 'TW', any: 'UGC' };

export function Avatar({ name, color, size = 48 }) {
  const initials = name.split(' ').map((p) => p[0]).slice(0, 2).join('');
  return <div className="avatar" style={{ background: color, width: size, height: size, fontSize: size * 0.38 }}>{initials}</div>;
}

export const Platform = ({ p }) => <span className={`plat plat-${p}`} title={PLATFORM_LABEL[p]}>{PLATFORM_ABBR[p]}</span>;

export function SocialChip({ s }) {
  return <span className="chip"><Platform p={s.platform} /> {compact(s.followers)} · {s.engagement_rate}% ER</span>;
}

export const TierBadge = ({ tier }) => <span className={`tier tier-${tier.toLowerCase()}`}>{tier}</span>;

const STATUS = {
  negotiating: ['Negotiating', 'amber'], contract: ['Sign contract', 'blue'], awaiting_funding: ['Awaiting funding', 'blue'],
  in_progress: ['In progress', 'violet'], delivered: ['Delivered: review', 'violet'], completed: ['Completed', 'green'],
  declined: ['Declined', 'gray'], cancelled: ['Cancelled', 'gray'],
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
