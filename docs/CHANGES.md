# Change Log

Running log of decisions and deviations from the project report. Maintained for the teammate who owns the report. Add newest entries at the bottom.

| # | Date | Area | Change |
|---|---|---|---|
| 1 | 03-10-2026 | Backend | ORM = Prisma (with PostgreSQL). |
| 2 | 03-10-2026 | Frontend | Vite + TypeScript + shadcn/ui. |
| 3 | 03-10-2026 | Mobile | Expo (React Native). |
| 4 | 03-10-2026 | Integrations | NADRA verification, payment gateway and SMS are mocks. |
| 5 | 03-10-2026 | Virtual courtroom | Implemented via Jitsi embed (last priority). |
| 6 | 03-10-2026 | Design | Added a design system (`design-system/digitaladaalat/MASTER.md`) and the UI UX Pro Max skill (project scope, `.claude/skills/ui-ux-pro-max`). |

## Open issues for the report
- Methodology conflict: Chapter 1.6 says Agile/Scrum, while Chapter 3.3 says Iterative/Incremental. One must be chosen and both chapters made consistent.

## Report issues for my teammate
Found while comparing the report with the project scope. Fix in the report; none of these change the code.

1. Section 1.7 says the report has 6 chapters, but the template has 8.
2. Methodology: Section 1.6 says Agile/Scrum, Section 3.3 says Iterative/Incremental. Recommendation: choose Agile/Scrum and update 3.3 (see also the open issue above).
3. Section 3.2.1 contains a leftover "Store Side" heading from another project.
4. Functional requirement numbering in 3.2.1 (FR 1-15) differs from the traceability matrix (FR 01-46).
5. Table numbers jump from 3.15 to 3.24, and Table 3.78 is missing.
6. Use case IDs such as UC-1.1 repeat across portals; make them unique.
7. Judge and Mock NADRA are actors in 3.1 but are missing from the use case diagram.
8. Intern use cases in the diagram differ from the textual use cases.
9. Objectives mention the biometric QR bridge, random judge allocation and Digital Malkhana without matching functional requirements.
10. "2.5 Relevance to Your Project" is still template wording.
11. Chapter 2 has no APA citations.
12. A heading reads "FR 6" where it should read "NFR 6: Compatibility".
