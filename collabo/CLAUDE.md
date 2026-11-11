# Collabo: notes for Claude Code

- UI work follows the `frontend-design` skill (`.claude/skills/frontend-design/SKILL.md` at the repo root): tokens in `web/src/styles.css`, 8px grid, type scale, no generic AI aesthetic, no fake social proof.
- Use Framer Motion for all animations, through `web/src/motion.jsx` (`m.*`, `Reveal`, `Stagger`, `StaggerItem`, `CountUp`). Apply scroll-triggered fades, staggered reveals and smooth hover transitions on interactive elements. Reduced motion is respected app-wide.
- Pasted 21st.dev / shadcn components go in `web/src/components/`; Tailwind utilities map to Collabo tokens (`web/src/tailwind.css`), and `cn()` lives in `web/src/lib/cn.js`.
- Check UI at 390px and 1280px. After `npm run build && npm start`, run `npm run lighthouse` (mobile performance target 90+).
- `npm test` must pass before committing.
