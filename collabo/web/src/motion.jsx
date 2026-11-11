// Framer Motion, loaded lean: LazyMotion + domAnimation with m.* components.
// Use these helpers (and m.*) for all animation; see the frontend-design skill.
import React, { useEffect, useRef } from 'react';
import { LazyMotion, MotionConfig, m, animate, useInView } from 'framer-motion';

// The animation engine is fetched after first paint so it never delays the page.
const loadFeatures = () => import('./motion-features.js').then((r) => r.default);

export { m, AnimatePresence } from 'framer-motion';

export const EASE = [0.2, 0.7, 0.2, 1];

export function MotionProvider({ children }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion="user" transition={{ duration: 0.25, ease: EASE }}>{children}</MotionConfig>
    </LazyMotion>
  );
}

// Fade up into view once when scrolled to.
export function Reveal({ children, delay = 0, y = 24, as = 'div', className, ...rest }) {
  const C = m[as];
  return (
    <C className={className} initial={{ opacity: 0, y }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.45, ease: EASE, delay }} {...rest}>
      {children}
    </C>
  );
}

// Reveal children one after another (wrap each child in StaggerItem).
export function Stagger({ children, className, gap = 0.07, as = 'div', ...rest }) {
  const C = m[as];
  return (
    <C className={className} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-40px' }}
      variants={{ hidden: {}, show: { transition: { staggerChildren: gap } } }} {...rest}>
      {children}
    </C>
  );
}

export function StaggerItem({ children, className, as = 'div', ...rest }) {
  const C = m[as];
  return (
    <C className={className} variants={{ hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE } } }} {...rest}>
      {children}
    </C>
  );
}

// Count a number up when it scrolls into view.
export function CountUp({ to, prefix = '', suffix = '', duration = 1.2 }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });
  useEffect(() => {
    if (!inView || !ref.current) return undefined;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { ref.current.textContent = `${prefix}${to}${suffix}`; return undefined; }
    const controls = animate(0, to, { duration, ease: EASE, onUpdate: (v) => { if (ref.current) ref.current.textContent = `${prefix}${Math.round(v)}${suffix}`; } });
    return () => controls.stop();
  }, [inView, to, prefix, suffix, duration]);
  return <span ref={ref}>{prefix}{to}{suffix}</span>;
}
