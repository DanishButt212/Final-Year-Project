# UX Upgrade: progress

Eleven UX features in eight phases. Each phase ends with build, lint, tests, a commit and a push to `main`.
Decisions and deviations are logged in `docs/CHANGES.md`, section "UX Upgrade".

Baseline (before the upgrade, 11-10-2026): frontend main chunk `index-*.js` 521.29 kB (160.61 kB gzip);
frontend tests 115/115; backend e2e 207/207.

## Phases
- [x] A. Brand (seal, wordmark, favicon), seal intro, public landing page, public case status
- [ ] B. Urdu / English (react-i18next, RTL, Nastaliq) and font size control
- [ ] C. Case progress stepper, next-hearing reminders, add to calendar, reminder job
- [ ] D. Global search (command palette)
- [ ] E. PDF preview, skeleton loading, feedback and micro-interactions
- [ ] F. Dashboard charts
- [ ] G. Guided tour and legal glossary
- [ ] H. Final verification and docs

## Notes and open items
- Phase A (11-10-2026): done. New endpoint `GET /api/public/cases/status`; 8 new e2e tests. Main chunk 533.11 kB
  (162.74 kB gzip) after adding i18next; the intro is a separate 2.7 kB chunk. Visual check at 375 and 1280 px in
  English and Urdu (125 % text at 375 px), intro frames checked. `scripts/shots.mjs` takes screenshots into the
  git-ignored `e2e/artifacts/shots/`.
