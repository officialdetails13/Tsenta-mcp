import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useSession } from '../App.jsx';
import { ErrorNote, useAction } from '../ui.jsx';
import DealFlow from '../DealFlow.jsx';

export default function DealFlowTour() {
  const { switchUser } = useSession();
  const navigate = useNavigate();
  const { busy, error, run } = useAction();
  const start = () => run(async () => {
    const r = await api('/demo/start', { method: 'POST' });
    switchUser(r);
    navigate(`/deals/${r.deal_id}`);
  });

  return (
    <>
      <div className="page-head">
        <h1>How a deal works</h1>
        <p className="muted">Every deal on Collabo follows the same 8 steps, with the money held in escrow from step 3 until the work is approved.</p>
      </div>
      <DealFlow />
      <section className="card demo-start">
        <div>
          <h2>Try it yourself</h2>
          <p className="muted">Starts a fresh demo deal between GlowLab Skincare (brand) and @emmapaws (creator), with a $100 performance bonus. You begin as the brand; use <b>Switch to the creator</b> on the deal page to play both sides through all 8 steps.</p>
        </div>
        <ErrorNote error={error} />
        <div className="row gap wrap">
          <button className="btn lg" disabled={busy} onClick={start}>Start a demo deal →</button>
          <Link to="/deals" className="btn ghost lg">My deals</Link>
        </div>
      </section>
    </>
  );
}
