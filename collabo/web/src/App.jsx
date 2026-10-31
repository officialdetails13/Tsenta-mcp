import React, { createContext, useContext, useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { api, hasToken, setToken } from './api.js';
import Landing from './pages/Landing.jsx';
import Auth from './pages/Auth.jsx';
import Discover from './pages/Discover.jsx';
import CreatorProfile from './pages/CreatorProfile.jsx';
import Campaigns from './pages/Campaigns.jsx';
import CampaignDetail from './pages/CampaignDetail.jsx';
import Deals from './pages/Deals.jsx';
import DealRoom from './pages/DealRoom.jsx';
import Studio from './pages/Studio.jsx';
import Growth from './pages/Growth.jsx';
import Dashboard from './pages/Dashboard.jsx';

const Ctx = createContext(null);
export const useSession = () => useContext(Ctx);

export default function App() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(!hasToken());
  const [meta, setMeta] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    api('/meta').then(setMeta);
    if (hasToken()) api('/me').then(setUser).catch(() => setToken(null)).finally(() => setReady(true));
  }, []);

  const session = {
    user, meta,
    signIn: ({ token, user }) => { setToken(token); setUser(user); navigate(user.role === 'creator' ? '/studio' : '/discover'); },
    signOut: () => { setToken(null); setUser(null); navigate('/'); },
    refreshUser: () => api('/me').then(setUser),
  };

  if (!ready || !meta) return <div className="center muted">Loading…</div>;

  const isCreator = user?.role === 'creator';
  const tabs = !user ? [] : isCreator
    ? [['/studio', 'Studio', '✦'], ['/campaigns', 'Briefs', '◎'], ['/deals', 'Deals', '⇄'], ['/growth', 'Level up', '▲']]
    : [['/discover', 'Discover', '⌕'], ['/campaigns', 'Campaigns', '◎'], ['/deals', 'Deals', '⇄'], ['/dashboard', 'Results', '▤']];

  return (
    <Ctx.Provider value={session}>
      <header className="topbar">
        <NavLink to={user ? tabs[0][0] : '/'} className="brand"><img src="/icon.svg" alt="" />Collabo</NavLink>
        <nav className="topnav">
          {tabs.map(([to, label]) => <NavLink key={to} to={to}>{label}</NavLink>)}
        </nav>
        <div className="topbar-right">
          {user ? (
            <>
              <span className="muted hide-sm">{isCreator ? `@${user.creator.handle}` : user.business.company}</span>
              <button className="btn ghost sm" onClick={session.signOut}>Sign out</button>
            </>
          ) : (
            <>
              <NavLink to="/discover" className="btn ghost sm hide-sm">Browse creators</NavLink>
              <NavLink to="/login" className="btn sm">Sign in</NavLink>
            </>
          )}
        </div>
      </header>

      <main className="container">
        <Routes>
          <Route path="/" element={user ? <Navigate to={tabs[0][0]} replace /> : <Landing />} />
          <Route path="/login" element={<Auth mode="login" />} />
          <Route path="/join/:role" element={<Auth mode="register" />} />
          <Route path="/discover" element={<Discover />} />
          <Route path="/creators/:id" element={<CreatorProfile />} />
          <Route path="/campaigns" element={<Campaigns />} />
          <Route path="/campaigns/:id" element={<CampaignDetail />} />
          <Route path="/deals" element={<Private><Deals /></Private>} />
          <Route path="/deals/:id" element={<Private><DealRoom /></Private>} />
          <Route path="/studio" element={<Private role="creator"><Studio /></Private>} />
          <Route path="/growth" element={<Private role="creator"><Growth /></Private>} />
          <Route path="/dashboard" element={<Private role="business"><Dashboard /></Private>} />
          <Route path="*" element={<div className="center"><h2>Page not found</h2></div>} />
        </Routes>
      </main>

      {user && (
        <nav className="tabbar">
          {tabs.map(([to, label, icon]) => (
            <NavLink key={to} to={to}><span className="tab-icon">{icon}</span>{label}</NavLink>
          ))}
        </nav>
      )}
    </Ctx.Provider>
  );
}

function Private({ role, children }) {
  const { user } = useSession();
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to="/" replace />;
  return children;
}
