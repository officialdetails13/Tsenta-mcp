import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, compact, money } from '../api.js';
import { useSession } from '../App.jsx';
import { ErrorNote, Modal, PLATFORM_LABEL, Platform, TierBadge, useAction, useLoad } from '../ui.jsx';

const TABS = [['path', 'My path'], ['analytics', 'Analytics'], ['hooks', 'Hook lab'], ['trends', 'Trends'], ['tier', 'Tier & rates']];

export function toNext(g) {
  const parts = [g.points_to_next && `${g.points_to_next} pts`, g.deals_to_next && `${g.deals_to_next} more completed deal${g.deals_to_next > 1 ? 's' : ''}`].filter(Boolean);
  return `${parts.join(' + ')} to ${g.next_tier}`;
}

export default function Growth() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(([k]) => k === params.get('tab')) ? params.get('tab') : 'path';
  const [insights, reload] = useLoad(() => api('/creator/insights'), []);
  return (
    <>
      <div className="page-head"><h1>Level up</h1><p className="muted">Your growth path, content analytics, hooks and trends in one place.</p></div>
      <div className="tabs" role="tablist">
        {TABS.map(([k, label]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setParams({ tab: k }, { replace: true })}>{label}</button>)}
      </div>
      {!insights && tab !== 'tier' ? <p className="muted">Loading…</p> : (
        <>
          {tab === 'path' && <PathTab i={insights} />}
          {tab === 'analytics' && <AnalyticsTab i={insights} reload={reload} />}
          {tab === 'hooks' && <HookLab />}
          {tab === 'trends' && <Trends />}
          {tab === 'tier' && <TierTab />}
        </>
      )}
    </>
  );
}

// ---------- My path ----------
const PLAYBOOK = {
  day1: [
    ['Hooks', 'Open with the payoff or a bold claim. No greetings. Keep it under 10 words and show it as on-screen text too.'],
    ['Frequency', '5 posts a week. Film several videos in one session and edit on a different day. At this stage, volume is how you learn.'],
    ['Editing', 'Try jump cuts, text on screen and voiceover + b-roll. Cut every pause longer than half a second.'],
    ['Trends', 'Use 1–2 trending sounds or formats a week and adapt them to your niche. Don’t copy them exactly.'],
    ['Earning', 'List a UGC package. Brands pay for the content, not your following, so you can earn from day one.'],
  ],
  day100: [
    ['Hooks', 'Watch your 3-second hold. When a post holds under 50%, rewrite the hook and post the idea again.'],
    ['Frequency', '4+ posts a week: two recurring series your audience expects, plus two experiments.'],
    ['Editing', 'Turn your best editing style into a recognizable template: the same fonts, captions and opening every time.'],
    ['Trends', 'Be early. Act on “rising” trends within 48 hours, while they still bring in new viewers.'],
    ['Earning', 'Pitch on open briefs, collect case studies, and raise your rate after every 2 completed deals.'],
  ],
  day1000: [
    ['Hooks', 'Test first lines with trial reels or test posts before they go to your main feed. Small improvements add up at your scale.'],
    ['Frequency', '3 strong posts a week, plus reposting your best work on your other platforms.'],
    ['Editing', 'Make your editing repeatable: templates, an editor, and written steps. Your time should go into ideas.'],
    ['Trends', 'Start trends instead of following them. Create formats others copy, and save trend posts for when you want a reach spike.'],
    ['Earning', 'Move repeat brands to monthly retainers or bundles. Charge separately for usage rights and add performance bonuses.'],
  ],
};

function PathTab({ i }) {
  const { meta } = useSession();
  const done = i.missions.filter((m) => m.done).length;
  return (
    <>
      <section className="card">
        <ol className="stage-track">
          {meta.stages.map((s, idx) => (
            <li key={s.key} className={idx < i.stage.index ? 'past' : idx === i.stage.index ? 'current' : ''}>
              <span className="stage-dot">{idx < i.stage.index ? '✓' : idx + 1}</span>
              <b>{s.label}</b><span className="small muted">{s.name} · {s.min ? `${compact(s.min)}+` : 'under 5K'}</span>
            </li>
          ))}
        </ol>
        <h2>You’re at {i.stage.label}: {i.stage.name}</h2>
        <p>{i.stage.focus}</p>
        {i.stage.next
          ? <p className="small muted">{compact(i.stage.next.followers_to_go)} more followers on your biggest platform to reach {i.stage.next.label}. Target: {i.stage.target_per_week} posts a week.</p>
          : <p className="small muted">You’re at the top stage. The goal now is to keep it going and grow it into a business.</p>}
      </section>

      <div className="two-col">
        <section className="card">
          <div className="row between"><h2>{i.stage.label} missions</h2><span className="muted small">{done}/{i.missions.length} done</span></div>
          <ul className="missions">
            {i.missions.map((m) => (
              <li key={m.key} className={m.done ? 'done' : ''}>
                <div className="row between gap"><b>{m.done ? '✓ ' : ''}{m.label}</b><span className="small muted nowrap">{m.current}</span></div>
                <div className="progress thin"><div style={{ width: `${m.progress * 100}%` }} /></div>
                <div className="small muted">{m.why}</div>
              </li>
            ))}
          </ul>
        </section>
        <section className="card">
          <h2>{i.stage.label} playbook</h2>
          <dl className="playbook">{PLAYBOOK[i.stage.key].map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>)}</dl>
          {meta.stages.filter((s) => s.key !== i.stage.key).map((s) => (
            <details key={s.key} className="lesson"><summary>{s.label}: {s.name} playbook</summary>
              <dl className="playbook">{PLAYBOOK[s.key].map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>)}</dl>
            </details>
          ))}
        </section>
      </div>
    </>
  );
}

// ---------- Analytics ----------
const AREA_ICON = { frequency: '📅', hooks: '🪝', editing: '✂️', format: '🎬', trends: '📈', timing: '🕒', length: '⏱', monetize: '💰', data: '📝' };

function AnalyticsTab({ i, reload }) {
  const [logging, setLogging] = useState(false);
  const [posts, reloadPosts] = useLoad(() => api('/creator/posts'), []);
  const s = i.summary;
  const refresh = () => { reload(); reloadPosts(); };
  return (
    <>
      <section className="card">
        <div className="row between wrap gap"><h2>What to do next</h2><button className="btn sm" onClick={() => setLogging(true)}>+ Log a post</button></div>
        {i.recommendations.length === 0 ? <p className="muted">Nothing urgent. Keep posting and logging.</p> : (
          <div className="recs">
            {i.recommendations.map((r, k) => (
              <div key={k} className={`rec impact-${r.impact}`}>
                <span className="rec-icon" aria-hidden>{AREA_ICON[r.area]}</span>
                <div><b>{r.title}</b><p className="small muted">{r.detail}</p></div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="stats-row">
        <div className="stat"><div className="stat-value">{s.last_7d}<span className="stat-of">/{i.stage.target_per_week}</span></div><div className="stat-label">Posts this week</div></div>
        <div className="stat"><div className="stat-value">{s.avg_er}%</div><div className="stat-label">Avg engagement (30d)</div></div>
        <div className="stat"><div className="stat-value">{s.avg_hold_3s != null ? `${s.avg_hold_3s}%` : '—'}</div><div className="stat-label">3-second hold</div></div>
        <div className="stat"><div className="stat-value">{s.avg_hook_score ?? '—'}</div><div className="stat-label">Avg hook score</div></div>
      </section>

      <section className="card">
        <h2>Posting frequency</h2>
        <p className="small muted">Posts per week over the last 8 weeks. The dashed line is your {i.stage.label} target of {i.stage.target_per_week}.</p>
        <WeeklyChart weeks={i.weekly} target={i.stage.target_per_week} />
      </section>

      <div className="two-col">
        <Breakdown title="Editing style" rows={i.breakdowns.edit_style} />
        <Breakdown title="Hook type" rows={i.breakdowns.hook_type} />
        <Breakdown title="Format" rows={i.breakdowns.format} />
        <Breakdown title="Trend vs original" rows={i.breakdowns.trend} />
        <Breakdown title="Day posted" rows={i.breakdowns.weekday} />
        <Breakdown title="Video length" rows={i.breakdowns.duration} />
      </div>

      <section className="card">
        <h2>Logged posts ({posts?.length ?? 0})</h2>
        {!posts ? <p className="muted">Loading…</p> : posts.length === 0 ? <p className="muted">No posts yet. Log your recent posts to unlock your analysis.</p> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Date</th><th>Post</th><th>Hook</th><th className="num">Views</th><th className="num">ER</th><th className="num">3s hold</th><th /></tr></thead>
              <tbody>{posts.slice(0, 30).map((p) => (
                <tr key={p.id}>
                  <td className="nowrap">{p.posted_at.slice(5)}</td>
                  <td className="nowrap"><Platform p={p.platform} /> {p.format}{p.trend_id ? ' 📈' : ''}{p.sponsored ? ' 💰' : ''}<div className="small muted">{p.edit_style}</div></td>
                  <td><span className={`score score-${p.hook_score >= 70 ? 'good' : p.hook_score >= 45 ? 'ok' : 'bad'}`}>{p.hook_score}</span> <span className="small">{p.hook}</span></td>
                  <td className="num">{compact(p.views)}</td><td className="num">{p.er}%</td><td className="num">{p.hold_3s_pct != null ? `${p.hold_3s_pct}%` : '—'}</td>
                  <td><button className="link danger" aria-label="Delete post" onClick={async () => { if (confirm('Delete this post?')) { await api(`/creator/posts/${p.id}`, { method: 'DELETE' }); refresh(); } }}>×</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
      {logging && <LogPostModal onClose={() => setLogging(false)} onSaved={() => { setLogging(false); refresh(); }} />}
    </>
  );
}

function WeeklyChart({ weeks, target }) {
  const max = Math.max(target + 1, ...weeks.map((w) => w.posts));
  return (
    <div className="wchart" role="img" aria-label={`Posts per week: ${weeks.map((w) => w.posts).join(', ')}. Target ${target}.`}>
      <div className="wchart-plot">
        <div className="wchart-target" style={{ bottom: `${(target / max) * 100}%` }}><span>target {target}</span></div>
        {weeks.map((w) => (
          <div key={w.week_start} className="wchart-col" title={`Week of ${w.week_start}: ${w.posts} post${w.posts === 1 ? '' : 's'}`}>
            <span className="wchart-val">{w.posts}</span>
            <div className={`wchart-bar ${w.posts >= target ? 'hit' : ''}`} style={{ height: `${(w.posts / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="wchart-axis">{weeks.map((w, k) => <span key={w.week_start}>{k === weeks.length - 1 ? 'This wk' : w.week_start.slice(5)}</span>)}</div>
    </div>
  );
}

function Breakdown({ title, rows }) {
  const max = Math.max(0.1, ...rows.map((r) => r.avg_er));
  return (
    <section className="card">
      <h2>{title}</h2>
      {rows.length === 0 ? <p className="muted small">Not enough data yet.</p> : (
        <div className="hbars">
          {rows.map((r, k) => (
            <div key={r.key} className="hbar" title={`${r.key}: ${r.avg_er}% avg engagement, ${r.avg_views.toLocaleString()} avg views, ${r.n} posts`}>
              <div className="hbar-label"><span>{r.key}</span><span className="muted small">{r.n} post{r.n === 1 ? '' : 's'}</span></div>
              <div className="hbar-track"><div className={`hbar-fill ${k === 0 && rows.length > 1 && r.n >= 2 ? 'best' : ''}`} style={{ width: `${(r.avg_er / max) * 100}%` }} /></div>
              <b className="hbar-val">{r.avg_er}%</b>
            </div>
          ))}
        </div>
      )}
      <p className="small muted">Average engagement rate per post. Groups with fewer than 3 posts are less reliable.</p>
    </section>
  );
}

function LogPostModal({ onClose, onSaved }) {
  const { meta } = useSession();
  const [trends] = useLoad(() => api('/trends'), []);
  const [f, setF] = useState({ platform: 'tiktok', format: 'video', posted_at: new Date().toISOString().slice(0, 10), hook: '', edit_style: 'jump cuts', duration_s: '', views: '', likes: '', comments: '', shares: '', saves: '', hold_3s_pct: '', trend_id: '', sponsored: false, url: '' });
  const { busy, error, run } = useAction();
  const hook = useHookScore(f.hook, f);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value, ...(k === 'platform' && { format: meta.post_formats[e.target.value][0], trend_id: '' }) });
  return (
    <Modal title="Log a post" onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); run(async () => { await api('/creator/posts', { method: 'POST', body: f }); onSaved(); }); }}>
        <div className="form-grid">
          <label>Platform<select value={f.platform} onChange={set('platform')}>{meta.platforms.map((p) => <option key={p} value={p}>{PLATFORM_LABEL[p]}</option>)}</select></label>
          <label>Format<select value={f.format} onChange={set('format')}>{meta.post_formats[f.platform].map((x) => <option key={x}>{x}</option>)}</select></label>
          <label>Posted on<input type="date" required value={f.posted_at} onChange={set('posted_at')} /></label>
        </div>
        <label>Hook (first line spoken or shown)<input value={f.hook} onChange={set('hook')} placeholder="e.g. Stop doing this with your skincare" />
          {hook && <span className={`hook-inline score-${hook.score >= 70 ? 'good' : hook.score >= 45 ? 'ok' : 'bad'}`}>Hook score {hook.score} · {hook.type}</span>}</label>
        <div className="form-grid">
          <label>Edit style<select value={f.edit_style} onChange={set('edit_style')}>{meta.edit_styles.map((x) => <option key={x}>{x}</option>)}</select></label>
          <label>Length (sec)<input type="number" min="0" value={f.duration_s} onChange={set('duration_s')} /></label>
          <label>Trend used<select value={f.trend_id} onChange={set('trend_id')}><option value="">None</option>{(trends ?? []).filter((t) => t.platform === f.platform).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        </div>
        <div className="form-grid">
          <label>Views<input type="number" min="0" required value={f.views} onChange={set('views')} /></label>
          <label>Likes<input type="number" min="0" value={f.likes} onChange={set('likes')} /></label>
          <label>Comments<input type="number" min="0" value={f.comments} onChange={set('comments')} /></label>
          <label>Shares<input type="number" min="0" value={f.shares} onChange={set('shares')} /></label>
          <label>Saves<input type="number" min="0" value={f.saves} onChange={set('saves')} /></label>
          <label>3s hold %<input type="number" min="0" max="100" value={f.hold_3s_pct} onChange={set('hold_3s_pct')} placeholder="from analytics" /></label>
        </div>
        <label className="check-row"><input type="checkbox" checked={f.sponsored} onChange={set('sponsored')} />Sponsored post</label>
        <ErrorNote error={error} />
        <button className="btn" disabled={busy}>Save post</button>
      </form>
    </Modal>
  );
}

// ---------- Hook lab ----------
function useHookScore(hook, extra = {}) {
  const [out, setOut] = useState(null);
  const key = JSON.stringify([hook, extra.format, extra.duration_s, extra.hold_3s_pct]);
  useEffect(() => {
    if (!hook?.trim()) { setOut(null); return; }
    const t = setTimeout(() => api('/hooks/analyze', { method: 'POST', body: { hook, format: extra.format, duration_s: extra.duration_s, hold_3s_pct: extra.hold_3s_pct } }).then(setOut).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return out;
}

function HookLab() {
  const [f, setF] = useState({ hook: 'Hey guys, so today I wanted to show you my morning skincare routine', format: 'reel', duration_s: '', hold_3s_pct: '' });
  const r = useHookScore(f.hook, f);
  const [posts] = useLoad(() => api('/creator/posts'), []);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  // One row per distinct hook, keeping its best-performing post.
  const byHook = new Map();
  for (const p of posts ?? []) if (p.hook && (!byHook.has(p.hook) || p.er > byHook.get(p.hook).er)) byHook.set(p.hook, p);
  const ranked = [...byHook.values()].sort((a, b) => b.hook_score - a.hook_score);
  return (
    <div className="two-col">
      <section className="card">
        <h2>Test a hook before you film</h2>
        <div className="stack">
          <label>Your hook<textarea rows={3} value={f.hook} onChange={set('hook')} /></label>
          <div className="form-grid">
            <label>Format<select value={f.format} onChange={set('format')}>{['reel', 'video', 'short', 'carousel', 'post'].map((x) => <option key={x}>{x}</option>)}</select></label>
            <label>Length (sec)<input type="number" min="0" value={f.duration_s} onChange={set('duration_s')} placeholder="optional" /></label>
            <label>3s hold %<input type="number" min="0" max="100" value={f.hold_3s_pct} onChange={set('hold_3s_pct')} placeholder="if posted" /></label>
          </div>
        </div>
        {r && (
          <div className="hook-result">
            <div className={`hook-score score-${r.score >= 70 ? 'good' : r.score >= 45 ? 'ok' : 'bad'}`}><b>{r.score}</b><span>{r.grade}</span></div>
            <div className="grow">
              <div className="small muted">Type: <b>{r.type}</b> · {r.word_count} words</div>
              {r.tips.length === 0 ? <p className="small">Strong hook. Make sure the first frame shows what it promises.</p> : (
                <ul className="tips">{r.tips.map((t) => <li key={t}>{t}</li>)}</ul>
              )}
            </div>
          </div>
        )}
        {r && (
          <>
            <h3 className="mt">Patterns to try</h3>
            <div className="stack">{r.patterns.map((p) => (
              <button key={p.pattern} className="pattern" onClick={() => setF({ ...f, hook: p.pattern })}>
                <b>{p.pattern}</b><span className="small muted">{p.type} · {p.why}</span>
              </button>
            ))}</div>
          </>
        )}
      </section>
      <section className="card">
        <h2>Your hooks, ranked</h2>
        {ranked.length === 0 ? <p className="muted small">Log posts to see which of your hooks work.</p> : (
          <>
            <h3 className="small muted">Best</h3>
            <ul className="hook-list">{ranked.slice(0, 4).map((p) => <li key={p.id}><span className="score score-good">{p.hook_score}</span><span>{p.hook}<span className="small muted"> · {p.er}% ER{p.hold_3s_pct != null && ` · ${p.hold_3s_pct}% hold`}</span></span></li>)}</ul>
            <h3 className="small muted">Needs work: tap one to fix it</h3>
            <ul className="hook-list">{ranked.slice(Math.max(4, ranked.length - 4)).reverse().map((p) => (
              <li key={p.id}><span className={`score score-${p.hook_score >= 45 ? 'ok' : 'bad'}`}>{p.hook_score}</span><button className="link" onClick={() => setF({ ...f, hook: p.hook, hold_3s_pct: p.hold_3s_pct ?? '' })}>{p.hook}</button></li>
            ))}</ul>
          </>
        )}
      </section>
    </div>
  );
}

// ---------- Trends ----------
const MOMENTUM = { rising: ['↗ Rising', 'green'], peaking: ['● Peaking', 'violet'], steady: ['→ Steady', 'gray'], fading: ['↘ Fading', 'amber'], new: ['✦ New', 'blue'] };

function Trends() {
  const { meta } = useSession();
  const [f, setF] = useState({ mine: '1', platform: '' });
  const [trends] = useLoad(() => api(`/trends?mine=${f.mine}${f.platform ? `&platform=${f.platform}` : ''}`), [f.mine, f.platform]);
  return (
    <>
      <p className="muted small">Measured from posts that creators on Collabo log: how many used each trend this week vs last week, and how much more engagement trend posts get than regular posts on the same platform.</p>
      <div className="filters">
        <div className="seg"><button className={f.mine === '1' ? 'on' : ''} onClick={() => setF({ ...f, mine: '1' })}>For you</button><button className={f.mine === '' ? 'on' : ''} onClick={() => setF({ ...f, mine: '' })}>All trends</button></div>
        <select value={f.platform} onChange={(e) => setF({ ...f, platform: e.target.value })}><option value="">All platforms</option>{meta.platforms.map((p) => <option key={p} value={p}>{PLATFORM_LABEL[p]}</option>)}</select>
      </div>
      {!trends ? <p className="muted">Loading…</p> : trends.length === 0 ? <p className="muted">No trends match your platforms and niches yet. Try “All trends”.</p> : (
        <div className="cards">
          {trends.map((t) => (
            <article key={t.id} className="card trend">
              <div className="row between"><span className="row gap"><Platform p={t.platform} /><span className="small muted">{t.kind}</span></span><span className={`pill pill-${MOMENTUM[t.momentum][1]}`}>{MOMENTUM[t.momentum][0]}</span></div>
              <h3>{t.name}</h3>
              <p className="small">{t.description}</p>
              <div className="trend-stats">
                <div><b>{t.uses_7d}</b><span>posts this week</span></div>
                <div><b>{t.uses_prev_7d}</b><span>last week</span></div>
                <div><b>{t.uplift_pct == null ? '—' : `${t.uplift_pct > 0 ? '+' : ''}${t.uplift_pct}%`}</b><span>engagement vs regular posts</span></div>
              </div>
              <p className="small"><b>How to do it well:</b> {t.how_to}</p>
              {t.my_uses > 0 && <p className="small muted">You’ve used it {t.my_uses}× · {t.my_avg_er}% avg ER</p>}
            </article>
          ))}
        </div>
      )}
    </>
  );
}

// ---------- Tier & rates ----------
const TIER_PERKS = {
  New: 'Listed in search',
  Rising: 'Shown in “Rising creators” and allowed to pitch on unlimited briefs',
  Pro: 'Pro badge, priority placement, and invites to brand-only briefs',
  Elite: 'Top of search, faster payouts, and a dedicated partner manager',
};

const LESSONS = [
  { title: 'Price on value, not followers', body: 'Brands buy outcomes. Once you have ROI on the board, quote it: “My last 3 skincare partners averaged 3.4× return.” That alone justifies charging 20–40% more.' },
  { title: 'Bundle to raise order size', body: 'Offer a “launch bundle” (1 Reel + 3 stories + link) at about 15% off the separate prices. Brands like the savings and you earn more per deal.' },
  { title: 'Negotiating counter-offers', body: 'Never just drop your price. Change the scope: fewer deliverables, shorter usage rights, or a longer deadline. Give something up for every discount.' },
  { title: 'Ask for a performance bonus', body: 'If a brand pushes back on price, offer a lower fee plus a bonus held in escrow for hitting a view or sales target. They take less risk and you can earn more.' },
  { title: 'Usage rights are a separate fee', body: 'The standard contract gives 90 days of organic reshares. Paid ads or whitelisting are worth an extra 30–100% of your fee, so put it in a separate agreement.' },
  { title: 'Always disclose', body: 'Use #ad or the platform\'s paid-partnership label. It protects your account and the brand, and audiences trust creators who are open about it.' },
];

function TierTab() {
  const [g] = useLoad(() => api('/creator/growth'), []);
  if (!g) return <p className="muted">Loading…</p>;
  const under = g.pricing.filter((p) => p.verdict === 'underpriced');
  return (
    <>
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
          <h2>Tier checklist</h2>
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
