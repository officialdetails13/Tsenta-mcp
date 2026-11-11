import React, { Suspense, createContext, lazy, useContext, useEffect, useState } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { api, hasToken, setToken } from './api.js';
import { AnimatePresence, MotionProvider, m } from './motion.jsx';
import Landing from './pages/Landing.jsx';

// Every page except the landing page loads on demand.
const Auth = lazy(() => import('./pages/Auth.jsx'));
const Discover = lazy(() => import('./pages/Discover.jsx'));
const CreatorProfile = lazy(() => import('./pages/CreatorProfile.jsx'));
const Campaigns = lazy(() => import('./pages/Campaigns.jsx'));
const CampaignDetail = lazy(() => import('./pages/CampaignDetail.jsx'));
const Deals = lazy(() => import('./pages/Deals.jsx'));
const DealRoom = lazy(() => import('./pages/DealRoom.jsx'));
const Studio = lazy(() => import('./pages/Studio.jsx'));
const Growth = lazy(() => import('./pages/Growth.jsx'));
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const DealFlowTour = lazy(() => import('./pages/DealFlowTour.jsx'));
const Compare = lazy(() => import('./pages/Compare.jsx'));
const Account = lazy(() => import('./pages/Account.jsx'));
const Admin = lazy(() => import('./pages/Admin.jsx'));
const Privacy = lazy(() => import('./pages/Legal.jsx').then((mod) => ({ default: mod.Privacy })));
const Terms = lazy(() => import('./pages/Legal.jsx').then((mod) => ({ default: mod.Terms })));
const DataDeletion = lazy(() => import('./pages/Legal.jsx').then((mod) => ({ default: mod.DataDeletion })));

const LANDING_LINKS = [['#how', 'How it works'], ['#features', 'Why Collabo'], ['#pricing', 'Pricing'], ['#faq', 'FAQ']];

const Ctx = createContext(null);
export const useSession = () => useContext(Ctx);

export default function App() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(!hasToken());
  // The server embeds /api/meta in the page, so the first render doesn't wait on a request.
  const [meta, setMeta] = useState(() => window.__COLLABO_META__ ?? null);
  const [scrolled, setScrolled] = useState(false);
  const [unread, setUnread] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!meta) api('/meta').then(setMeta);
    if (hasToken()) api('/me').then(setUser).catch(() => setToken(null)).finally(() => setReady(true));
  }, []);

  const session = {
    user, meta, setUnread,
    signIn: ({ token, user }) => { setToken(token); setUser(user); navigate(user.role === 'creator' ? '/studio' : '/discover'); },
    signOut: () => { setToken(null); setUser(null); navigate('/'); },
    switchUser: ({ token, user }) => { setToken(token); setUser(user); },
    refreshUser: () => api('/me').then(setUser),
  };

  // Unread count for the bell: refreshed on every route change and every 60s while visible.
  useEffect(() => {
    if (!user) return undefined;
    const load = () => document.visibilityState === 'visible' && api('/notifications').then((n) => setUnread(n.unread)).catch(() => {});
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [user?.id, location.pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!ready || !meta) return <div className="center muted">Loading…</div>;

  const isCreator = user?.role === 'creator';
  const tabs = !user ? [] : isCreator
    ? [['/studio', 'Studio', '✦'], ['/campaigns', 'Briefs', '◎'], ['/deals', 'Deals', '⇄'], ['/growth', 'Level up', '▲']]
    : [['/discover', 'Discover', '⌕'], ['/campaigns', 'Campaigns', '◎'], ['/deals', 'Deals', '⇄'], ['/dashboard', 'Results', '▤']];

  const onLanding = !user && location.pathname === '/';
  return (
    <Ctx.Provider value={session}>
      <MotionProvider>
      <header className={`topbar ${scrolled ? 'scrolled' : ''}`}>
        <NavLink to={user ? tabs[0][0] : '/'} className="brand"><img src="/icon.svg" alt="" width="28" height="28" />Collabo</NavLink>
        <nav className="topnav" aria-label="Main">
          {tabs.map(([to, label]) => <NavLink key={to} to={to}>{label}</NavLink>)}
          {onLanding && LANDING_LINKS.map(([href, label]) => <a key={href} href={href}>{label}</a>)}
        </nav>
        <div className="topbar-right">
          {user ? (
            <>
              {user.is_admin && <NavLink to="/admin" className="hide-sm small">Admin</NavLink>}
              <Link to="/account" className="bell" aria-label={unread ? `Account and notifications, ${unread} unread` : 'Account and notifications'}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
                {unread > 0 && <span className="bell-count">{unread > 9 ? '9+' : unread}</span>}
              </Link>
              <Link to="/account" className="muted hide-sm">{isCreator ? `@${user.creator.handle}` : user.business.company}</Link>
              <button className="btn ghost sm" onClick={session.signOut}>Sign out</button>
            </>
          ) : (
            <>
              <NavLink to="/login" className="btn ghost sm">Sign in</NavLink>
              <NavLink to="/join/business" className="btn sm hide-sm">Get started</NavLink>
            </>
          )}
        </div>
      </header>

      <main>
        <AnimatePresence mode="wait" initial={false}>
          <m.div key={location.pathname} className="container" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: 0.12 } }} transition={{ duration: 0.2 }}>
            <Suspense fallback={<div className="center muted">Loading…</div>}>
        <Routes location={location}>
          <Route path="/" element={user ? <Navigate to={tabs[0][0]} replace /> : <Landing />} />
          <Route path="/login" element={<Auth mode="login" />} />
          <Route path="/join/:role" element={<Auth mode="register" />} />
          <Route path="/discover" element={<Discover />} />
          <Route path="/creators/:id" element={<CreatorProfile />} />
          <Route path="/compare" element={<Compare />} />
          <Route path="/campaigns" element={<Campaigns />} />
          <Route path="/campaigns/:id" element={<CampaignDetail />} />
          <Route path="/deal-flow" element={<DealFlowTour />} />
          <Route path="/deals" element={<Private><Deals /></Private>} />
          <Route path="/deals/:id" element={<Private><DealRoom /></Private>} />
          <Route path="/studio" element={<Private role="creator"><Studio /></Private>} />
          <Route path="/growth" element={<Private role="creator"><Growth /></Private>} />
          <Route path="/dashboard" element={<Private role="business"><Dashboard /></Private>} />
          <Route path="/account" element={<Private><Account /></Private>} />
          <Route path="/admin" element={<Private><Admin /></Private>} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/data-deletion" element={<DataDeletion />} />
          <Route path="*" element={<div className="center"><h2>Page not found</h2></div>} />
        </Routes>
            </Suspense>
          </m.div>
        </AnimatePresence>
      </main>

      {user && (
        <nav className="tabbar">
          {tabs.map(([to, label, icon]) => (
            <NavLink key={to} to={to}><span className="tab-icon">{icon}</span>{label}</NavLink>
          ))}
        </nav>
      )}
      </MotionProvider>
    </Ctx.Provider>
  );
}

function Private({ role, children }) {
  const { user } = useSession();
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to="/" replace />;
  return children;
}
