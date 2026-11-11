import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useSession } from '../App.jsx';
import { ErrorNote, useAction } from '../ui.jsx';

export default function Auth({ mode }) {
  const { role = 'business' } = useParams();
  const { signIn } = useSession();
  const [f, setF] = useState({ email: '', password: '', name: '', company: '', handle: '', accept_terms: false });
  const { busy, error, run } = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = (e) => {
    e.preventDefault();
    run(async () => signIn(mode === 'login'
      ? await api('/auth/login', { method: 'POST', body: f })
      : await api('/auth/register', { method: 'POST', body: { ...f, role } })));
  };
  const demo = (email) => run(async () => signIn(await api('/auth/login', { method: 'POST', body: { email, password: 'password123' } })));

  return (
    <div className="auth card">
      <h2>{mode === 'login' ? 'Welcome back' : role === 'creator' ? 'Join as a creator' : 'Join as a brand'}</h2>
      <form onSubmit={submit} className="stack">
        {mode === 'register' && <label>Your name<input required value={f.name} onChange={set('name')} /></label>}
        {mode === 'register' && role === 'business' && <label>Company<input required value={f.company} onChange={set('company')} /></label>}
        {mode === 'register' && role === 'creator' && <label>Handle<input placeholder="yourhandle" value={f.handle} onChange={set('handle')} /></label>}
        <label>Email<input type="email" required value={f.email} onChange={set('email')} /></label>
        <label>Password<input type="password" required minLength={mode === 'register' ? 8 : 1} value={f.password} onChange={set('password')} /></label>
        {mode === 'register' && (
          <label className="check-row">
            <input type="checkbox" required checked={f.accept_terms} onChange={(e) => setF({ ...f, accept_terms: e.target.checked })} />
            <span>I’m 18 or older and agree to the <Link to="/terms" target="_blank">Terms of Service</Link> and <Link to="/privacy" target="_blank">Privacy Policy</Link>.</span>
          </label>
        )}
        <ErrorNote error={error} />
        <button className="btn" disabled={busy}>{mode === 'login' ? 'Sign in' : 'Create account'}</button>
      </form>
      {mode === 'login' ? (
        <>
          <p className="muted small">New here? <Link to="/join/business">Join as a brand</Link> or <Link to="/join/creator">join as a creator</Link>.</p>
          <div className="demo">
            <span className="muted small">Try a demo account:</span>
            <button className="btn ghost sm" onClick={() => demo('brand@glowlab.co')}>GlowLab (brand)</button>
            <button className="btn ghost sm" onClick={() => demo('mayaglow@creator.demo')}>Maya (creator)</button>
          </div>
        </>
      ) : <p className="muted small">Already have an account? <Link to="/login">Sign in</Link></p>}
    </div>
  );
}
