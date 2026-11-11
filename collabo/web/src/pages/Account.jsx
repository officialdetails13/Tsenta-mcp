import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, Download, Trash2 } from 'lucide-react';
import { api, getToken } from '../api.js';
import { useSession } from '../App.jsx';
import { ErrorNote, Modal, ago, useAction, useLoad } from '../ui.jsx';

// Notifications, email preference, data export and account deletion.
export default function Account() {
  const { user, meta, refreshUser, signOut, setUnread } = useSession();
  const [notes, reload] = useLoad(() => api('/notifications'), []);
  const [confirm, setConfirm] = useState(false);
  const pref = useAction();
  const exp = useAction();
  const navigate = useNavigate();

  const markAll = async () => { const r = await api('/notifications/read', { method: 'POST', body: {} }); setUnread(r.unread); reload(); };
  const open = async (n) => {
    if (!n.read_at) { const r = await api('/notifications/read', { method: 'POST', body: { ids: [n.id] } }); setUnread(r.unread); }
    if (n.link) navigate(n.link); else reload();
  };
  const toggleEmail = (e) => pref.run(async () => { await api('/me/preferences', { method: 'PUT', body: { email_notifications: e.target.checked } }); await refreshUser(); });
  const download = () => exp.run(async () => {
    const res = await fetch('/api/me/export', { headers: { authorization: `Bearer ${getToken()}` } });
    if (!res.ok) throw new Error('Export failed. Try again.');
    const url = URL.createObjectURL(await res.blob());
    const a = Object.assign(document.createElement('a'), { href: url, download: `collabo-data-${new Date().toISOString().slice(0, 10)}.json` });
    a.click();
    URL.revokeObjectURL(url);
  });

  return (
    <>
      <div className="page-head">
        <h1>Account</h1>
        <p className="muted">{user.name} · {user.email}</p>
      </div>

      <section className="card stack" aria-labelledby="notif-h">
        <div className="row between wrap gap">
          <h2 id="notif-h" className="row gap-sm"><Bell size={18} aria-hidden />Notifications</h2>
          {notes?.unread > 0 && <button className="btn ghost sm" onClick={markAll}>Mark all read</button>}
        </div>
        {!notes ? <p className="muted">Loading…</p> : notes.items.length === 0 ? (
          <p className="muted">Nothing yet. You’ll hear about offers, payments, drafts and deadlines here.</p>
        ) : (
          <ul className="notif-list">
            {notes.items.map((n) => (
              <li key={n.id}>
                <button className={`notif ${n.read_at ? '' : 'unread'}`} onClick={() => open(n)}>
                  <span className="notif-dot" aria-hidden />
                  <span className="grow"><b>{n.title}</b>{n.body && <span className="muted small notif-body">{n.body}</span>}</span>
                  <span className="muted small nowrap">{ago(n.created_at)}{!n.read_at && <span className="sr-only"> (unread)</span>}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <label className="check-row">
          <input type="checkbox" checked={!!user.email_notifications} disabled={pref.busy || !meta.email_notifications} onChange={toggleEmail} />
          <span>Email me about my deals<span className="muted small" style={{ display: 'block' }}>
            {meta.email_notifications ? `Sent to ${user.email}. In-app notifications stay on either way.` : 'Email delivery isn’t set up on this server yet, so notifications are in-app only.'}
          </span></span>
        </label>
        <ErrorNote error={pref.error} />
      </section>

      <section className="card stack" aria-labelledby="data-h">
        <h2 id="data-h">Your data</h2>
        <p className="muted small">Download everything Collabo holds about you: profile, social accounts, Instagram data, deals, messages, payments and notifications. See the <Link to="/privacy">Privacy Policy</Link>.</p>
        <div><button className="btn secondary" onClick={download} disabled={exp.busy}><Download size={16} aria-hidden />{exp.busy ? 'Preparing…' : 'Download my data'}</button></div>
        <ErrorNote error={exp.error} />
      </section>

      <section className="card stack danger-zone" aria-labelledby="del-h">
        <h2 id="del-h">Delete account</h2>
        <p className="muted small">Removes your profile, social and Instagram data, and signs you out everywhere. Unpaid deals are cancelled. If a deal has money in escrow, finish or settle it first. <Link to="/data-deletion">What gets deleted</Link></p>
        <div><button className="btn ghost danger" onClick={() => setConfirm(true)}><Trash2 size={16} aria-hidden />Delete my account</button></div>
      </section>

      {confirm && <DeleteModal onClose={() => setConfirm(false)} onDeleted={signOut} />}
    </>
  );
}

function DeleteModal({ onClose, onDeleted }) {
  const [password, setPassword] = useState('');
  const { busy, error, run } = useAction();
  const submit = (e) => { e.preventDefault(); run(async () => { await api('/me', { method: 'DELETE', body: { password } }); onDeleted(); }); };
  return (
    <Modal title="Delete your account?" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <p className="small">This can’t be undone. Download your data first if you want a copy.</p>
        <label>Password<input type="password" required autoFocus value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></label>
        <ErrorNote error={error} />
        <div className="row gap"><button type="button" className="btn ghost" onClick={onClose}>Keep my account</button><button className="btn danger-solid" disabled={busy || !password}>{busy ? 'Deleting…' : 'Delete permanently'}</button></div>
      </form>
    </Modal>
  );
}
