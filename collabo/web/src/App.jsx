import React, { Suspense, createContext, lazy, useContext, useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
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

const LANDING_LINKS = [['#how', 'How it works'], ['#features', 'Why Collabo'], ['#pricing', 'Pricing'], ['#faq', 'FAQ']];

const Ctx = createContext(null);
export const useSession = () => useContext(Ctx);

export default function App() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(!hasToken());
  // The server embeds /api/meta in the page, so the first render doesn't wait on a request.
  const [meta, setMeta] = useState(() => window.__COLLABO_META__ ?? null);
  const [scrolled, setScrolled] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!meta) api('/meta').then(setMeta);
    if (hasToken()) api('/me').then(setUser).catch(() => setToken(null)).finally(() => setReady(true));
  }, []);

  const session = {
    user, meta,
    signIn: ({ token, user }) => { setToken(token); setUser(user); navigate(user.role === 'creator' ? '/studio' : '/discover'); },
    signOut: () => { setToken(null); setUser(null); navigate('/'); },
    switchUser: ({ token, user }) => { setToken(token); setUser(user); },
    refreshUser: () => api('/me').then(setUser),
  };

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
              <span className="muted hide-sm">{isCreator ? `@${user.creator.handle}` : user.business.company}</span>
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
