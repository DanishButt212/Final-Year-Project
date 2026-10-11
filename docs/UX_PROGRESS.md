# UX Upgrade: progress

Eleven UX features in eight phases. Each phase ends with build, lint, tests, a commit and a push to `main`.
Decisions and deviations are logged in `docs/CHANGES.md`, section "UX Upgrade".

Baseline (before the upgrade, 11-10-2026): frontend main chunk `index-*.js` 521.29 kB (160.61 kB gzip);
frontend tests 115/115; backend e2e 207/207.

## Phases
- [x] A. Brand (seal, wordmark, favicon), seal intro, public landing page, public case status
- [x] B. Urdu / English (react-i18next, RTL, Nastaliq) and font size control
- [x] C. Case progress stepper, next-hearing reminders, add to calendar, reminder job
- [x] D. Global search (command palette)
- [x] E. PDF preview, skeleton loading, feedback and micro-interactions
- [ ] F. Dashboard charts
- [ ] G. Guided tour and legal glossary
- [ ] H. Final verification and docs

## Notes and open items
- Phase A (11-10-2026): done. New endpoint `GET /api/public/cases/status`; 8 new e2e tests. Main chunk 533.11 kB
  (162.74 kB gzip) after adding i18next; the intro is a separate 2.7 kB chunk. Visual check at 375 and 1280 px in
  English and Urdu (125 % text at 375 px), intro frames checked. `scripts/shots.mjs` takes screenshots into the
  git-ignored `e2e/artifacts/shots/`.
- Phase B (11-10-2026): done. 2,200 translation keys, Urdu complete (`npm run i18n:check`), untranslated-string lint at
  zero (`npm run i18n:lint`). New User fields preferredLanguage and fontScale, Notification titleKey/bodyKey/params.
  Visual check of landing, login, filing form and dashboards in Urdu at 375 px (125 %) and 1280 px. Open for Phase H:
  confirm breadcrumb chevron direction at higher zoom; charts need LTR-internal axes (Phase F).
- Phase C (11-10-2026): done. New endpoint `POST /api/admin/reminders/run`, new table HearingReminder, `progress` on
  all case responses. Backend e2e 215/215, frontend 115/115. Checked the stepper (LTR and RTL, horizontal and
  vertical), the next-hearing card and the .ics output (10:30 PKT = 05:30Z).
- Phase D (11-10-2026): done. New endpoint `GET /api/search`, 8 new e2e tests (backend e2e 223/223). Palette checked
  at 1280 px (English) and 375 px (Urdu). Main chunk 555.4 kB (171.1 kB gzip); the palette is its own chunk.
- Phase E (11-10-2026): done. No new endpoints or database fields. Viewer checked at 1280 px (challan PDF, summons
  photo lightbox over the detail dialog) and 375 px in English and Urdu. Frontend 115/115, backend unit 34/34 (two
  stale Phase 5C auth tests fixed). Main chunk 560.2 kB (172.6 kB gzip); the viewer and the pdf.js worker are lazy.
