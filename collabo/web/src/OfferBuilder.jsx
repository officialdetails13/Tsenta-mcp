import React, { useEffect, useState } from 'react';
import { api, money, inDays } from './api.js';
import { useSession } from './App.jsx';
import { ErrorNote, PLATFORM_LABEL } from './ui.jsx';

const fmtLen = (s) => (s >= 60 && s % 60 === 0 ? `${s / 60} min` : `${s}s`);
const TERM_TITLES = {
  usage_rights: 'Usage rights', exclusivity_days: 'Exclusivity', revisions: 'Revisions', stays_live_days: 'How long it stays live',
  link_in_bio_days: 'Link in bio', raw_footage: 'Raw footage', whitelisting: 'Whitelisting',
};

export function newItem(meta, platform = 'instagram', format) {
  const f = format ?? meta.deliverables[platform][0];
  return { platform: f === 'ugc' ? 'any' : platform, format: f, duration_s: meta.offer.durations[f]?.[0] ?? null, quantity: 1, unit_price: '', notes: '' };
}

// Turn a creator package into a starting line item.
export function itemFromPackage(meta, p) {
  const durations = meta.offer.durations[p.deliverable_type];
  return { platform: p.platform, format: p.deliverable_type, duration_s: durations?.includes(30) ? 30 : durations?.[0] ?? null, quantity: p.quantity, unit_price: p.price_cents / p.quantity / 100, notes: '' };
}

export const itemsFromDeal = (items) => (items ?? []).map((i) => ({ ...i, unit_price: i.unit_price_cents / 100 }));

// Build an offer line by line: platform, format, length, quantity, price, plus contract terms.
export default function OfferBuilder({ creatorId, initial = {}, submitLabel = 'Send offer', onSubmit, onCancel, busy, error, showTitle }) {
  const { meta } = useSession();
  const [items, setItems] = useState(initial.items?.length ? initial.items : [newItem(meta)]);
  const [terms, setTerms] = useState({ ...meta.offer.default_terms, ...(initial.terms ?? {}) });
  const [f, setF] = useState({
    title: initial.title ?? '', deadline: initial.deadline ?? inDays(14), note: initial.note ?? '',
    bonus: initial.bonus ?? '', bonus_metric: initial.bonus_metric ?? 'views', bonus_target: initial.bonus_target ?? '',
  });
  const [quote, setQuote] = useState(null);
  const [quoteErr, setQuoteErr] = useState(null);

  // Live quote: suggested prices per line and the computed total.
  useEffect(() => {
    const t = setTimeout(() => {
      api('/quote', { method: 'POST', body: { creator_id: creatorId, items: items.map((i) => ({ ...i, unit_price: i.unit_price === '' ? undefined : i.unit_price })), terms } })
        .then((q) => {
          setQuote(q); setQuoteErr(null);
          // Fill empty prices with the suggestion once.
          if (items.some((i) => i.unit_price === '')) setItems((cur) => cur.map((i, k) => (i.unit_price === '' ? { ...i, unit_price: q.items[k].suggested_unit_cents / 100 } : i)));
        })
        .catch((e) => setQuoteErr(e.message));
    }, 250);
    return () => clearTimeout(t);
  }, [JSON.stringify(items), JSON.stringify(terms), creatorId]); // eslint-disable-line react-hooks/exhaustive-deps

  const setItem = (k, patch) => setItems(items.map((it, j) => (j === k ? { ...it, ...patch } : it)));
  const changePlatform = (k, platform) => setItem(k, newItem(meta, platform));
  const changeFormat = (k, format) => setItem(k, { format, platform: format === 'ugc' ? 'any' : items[k].platform === 'any' ? 'instagram' : items[k].platform, duration_s: meta.offer.durations[format]?.[0] ?? null, unit_price: '' });
  const setF_ = (key) => (e) => setF({ ...f, [key]: e.target.value });

  const submit = (e) => {
    e.preventDefault();
    onSubmit({ ...f, items: items.map((i) => ({ ...i, unit_price: Number(i.unit_price) })), terms });
  };

  return (
    <form className="stack builder" onSubmit={submit}>
      {showTitle && <label>Deal title<input required value={f.title} onChange={setF_('title')} placeholder="e.g. Spring launch content" /></label>}

      <fieldset className="builder-box">
        <legend>Deliverables</legend>
        {items.map((it, k) => {
          const formats = it.platform === 'any' ? ['ugc'] : [...meta.deliverables[it.platform], 'ugc'];
          const durations = meta.offer.durations[it.format];
          const sugg = quote?.items[k]?.suggested_unit_cents;
          return (
            <div key={k} className="item-row">
              <div className="item-head">
                <b>#{k + 1}</b>
                {items.length > 1 && <button type="button" className="link danger" onClick={() => setItems(items.filter((_, j) => j !== k))}>Remove</button>}
              </div>
              <div className="form-grid">
                <label>Platform
                  <select value={it.platform === 'any' ? 'instagram' : it.platform} disabled={it.format === 'ugc'} onChange={(e) => changePlatform(k, e.target.value)}>
                    {meta.platforms.map((p) => <option key={p} value={p}>{PLATFORM_LABEL[p]}</option>)}
                  </select>
                </label>
                <label>Format
                  <select value={it.format} onChange={(e) => changeFormat(k, e.target.value)}>
                    {formats.map((fm) => <option key={fm} value={fm}>{meta.offer.format_labels[fm]}</option>)}
                  </select>
                </label>
                <label>{it.format === 'story' ? 'Frames' : 'Quantity'}
                  <input type="number" min="1" max="20" value={it.quantity} onChange={(e) => setItem(k, { quantity: e.target.value })} />
                </label>
                <label>Price each (USD)
                  <input type="number" min="1" step="1" required value={it.unit_price} onChange={(e) => setItem(k, { unit_price: e.target.value })} />
                  {sugg ? <button type="button" className="hint-btn" onClick={() => setItem(k, { unit_price: sugg / 100 })}>Suggested {money(sugg)}</button> : null}
                </label>
              </div>
              {durations && durations.length > 1 && (
                <div className="len-chips" role="group" aria-label="Length">
                  <span className="label">Length</span>
                  {durations.map((s) => (
                    <button type="button" key={s} className={`chip selectable ${it.duration_s === s ? 'on' : ''}`} onClick={() => setItem(k, { duration_s: s, unit_price: '' })}>{fmtLen(s)}</button>
                  ))}
                </div>
              )}
              {it.format === 'story' && <p className="small muted">Stories are priced per 15-second frame.</p>}
              <input value={it.notes} onChange={(e) => setItem(k, { notes: e.target.value })} placeholder="Notes for this deliverable (angle, product, must-say)" />
            </div>
          );
        })}
        {items.length < 10 && <button type="button" className="btn ghost sm self-start" onClick={() => setItems([...items, newItem(meta, items.at(-1)?.platform === 'any' ? 'instagram' : items.at(-1)?.platform)])}>+ Add deliverable</button>}
      </fieldset>

      <fieldset className="builder-box">
        <legend>Contract terms</legend>
        <div className="form-grid">
          {Object.entries(meta.offer.term_options).map(([key, opts]) => (
            <label key={key}>{TERM_TITLES[key]}
              <select value={String(terms[key])} onChange={(e) => setTerms({ ...terms, [key]: typeof opts[0].key === 'number' ? Number(e.target.value) : typeof opts[0].key === 'boolean' ? e.target.value === 'true' : e.target.value })}>
                {opts.map((o) => <option key={String(o.key)} value={String(o.key)}>{o.label}{o.pct ? ` (+${o.pct}%)` : ''}</option>)}
              </select>
            </label>
          ))}
        </div>
        <label>Additional terms (optional)<textarea rows={2} value={terms.custom} onChange={(e) => setTerms({ ...terms, custom: e.target.value })} placeholder="e.g. Show the product in the first 3 seconds; no competitor logos in frame" /></label>
      </fieldset>

      <QuoteTable quote={quote?.breakdown} />
      {quoteErr && <ErrorNote error={quoteErr} />}

      <div className="form-grid">
        <label>Go-live deadline<input type="date" required value={f.deadline} onChange={setF_('deadline')} /></label>
      </div>
      <BonusFields f={f} set={setF_} />
      <label>Message<textarea rows={2} value={f.note} onChange={setF_('note')} placeholder="Context, goals, anything they should know" /></label>
      <ErrorNote error={error} />
      <div className="row gap wrap">
        <button className="btn" disabled={busy || !quote}>{submitLabel}{quote ? ` · ${money(quote.breakdown.total_cents)}` : ''}</button>
        {onCancel && <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}

export function QuoteTable({ quote, compact }) {
  if (!quote) return null;
  return (
    <table className={`table quote ${compact ? 'compact' : ''}`}>
      <tbody>
        {quote.lines.map((l, i) => (
          <tr key={i}><td>{l.label}{l.notes ? <div className="small muted">{l.notes}</div> : null}</td><td className="num">{l.quantity > 1 ? `${l.quantity} × ${money(l.unit_cents)}` : ''}</td><td className="num">{money(l.total_cents)}</td></tr>
        ))}
        {quote.addons.length > 0 && <tr className="sub"><td>Subtotal</td><td /><td className="num">{money(quote.subtotal_cents)}</td></tr>}
        {quote.addons.map((a) => <tr key={a.label}><td>+ {a.label} ({a.pct}%)</td><td /><td className="num">{money(a.cents)}</td></tr>)}
        <tr className="total"><td>Creator fee</td><td /><td className="num">{money(quote.total_cents)}</td></tr>
      </tbody>
    </table>
  );
}

export function BonusFields({ f, set }) {
  const [open, setOpen] = useState(Number(f.bonus) > 0);
  if (!open) return <button type="button" className="link self-start" onClick={() => setOpen(true)}>+ Add a performance bonus (held in escrow)</button>;
  return (
    <fieldset className="builder-box">
      <legend>Performance bonus</legend>
      <p className="small muted">Extra money held in escrow and paid only if the content hits the target within 30 days. Views are reported by the creator; conversions and revenue by the brand.</p>
      <div className="form-grid">
        <label>Bonus (USD)<input type="number" min="0" value={f.bonus} onChange={set('bonus')} /></label>
        <label>Paid when<select value={f.bonus_metric} onChange={set('bonus_metric')}><option value="views">Views reach</option><option value="conversions">Conversions reach</option><option value="revenue">Revenue (USD) reaches</option></select></label>
        <label>Target<input type="number" min="1" value={f.bonus_target} onChange={set('bonus_target')} /></label>
      </div>
    </fieldset>
  );
}
