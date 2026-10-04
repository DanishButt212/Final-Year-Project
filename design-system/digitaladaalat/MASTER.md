# DigitalAdaalat Design System (MASTER)

> **AUTHORITY:** The tokens and rules in this file are final. Where the UI UX Pro Max generator suggested anything different (blue palette, EB Garamond/Lato, landing-page patterns, dark mode, blur overlays, hover lift), this file wins.
> Page-specific overrides, if any, live in `design-system/digitaladaalat/pages/[page].md` and override this file for that page only.

**Project:** DigitalAdaalat (Judicial ERP, Pakistan)
**Feel:** Official, calm, trustworthy Pakistan court / government portal. Light mode only.

---

## 1. Color tokens

| Role | Hex | CSS variable | Notes |
|---|---|---|---|
| Primary | `#01411C` | `--color-primary` | Header, primary buttons, links, charts |
| Primary hover | `#0B5D2E` | `--color-primary-hover` | Hover/active of primary |
| On primary | `#FFFFFF` | `--color-on-primary` | Text on primary |
| Accent (gold) | `#B8962E` | `--color-accent` | Small highlights only: active tab underline, badges. Never body text, never large fills |
| Page background | `#F5F6F4` | `--color-background` | |
| Card / surface | `#FFFFFF` | `--color-surface` | |
| Text | `#1A1A1A` | `--color-text` | |
| Muted text | `#4A524C` | `--color-text-muted` | 7:1 on white; use for secondary text |
| Border | `#D9DED9` | `--color-border` | |
| Focus ring | `#0B5D2E` | `--color-ring` | 2px ring with 2px offset |
| Destructive | `#9B1C1C` | `--color-destructive` | Delete/reject buttons |

Gold `#B8962E` is about 2.9:1 on white, so it fails text contrast. Use it only for decoration (underline, border, badge outline) and pair any gold badge with dark text (`#1A1A1A`) on a pale gold fill (`#F6EFD6`).

### Status badges
Meaning is never conveyed by color alone: every badge has an icon (Lucide) and a text label.

| Status | Background | Text | Border | Icon |
|---|---|---|---|---|
| Decided | `#E3F1E7` | `#01411C` | `#B5D6BF` | `check-circle-2` |
| Pending | `#FDF1D6` | `#6B4300` | `#EBC987` | `clock` |
| Rejected / Overdue | `#FBE4E4` | `#9B1C1C` | `#EDB3B3` | `x-circle` / `alert-triangle` |
| Hearing Fixed | `#E4EAF0` | `#2F4558` | `#B9C6D3` | `calendar-check` |

All text/background pairs above are at least 4.5:1.

---

## 2. Typography

| Use | Font | Fallback |
|---|---|---|
| Headings | **Merriweather** (600/700) | Georgia, serif |
| Body, forms, tables | **Inter** (400/500/600) | system-ui, sans-serif |
| Case numbers (UCN), challan/receipt IDs | **JetBrains Mono** (or any monospace) | ui-monospace, monospace |
| Urdu labels (optional) | **Noto Nastaliq Urdu** | serif; set `dir="rtl"` and extra line-height (1.9) |

```css
@import url('https://fonts.googleapis.com/css2?family=Merriweather:wght@400;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&family=Noto+Nastaliq+Urdu:wght@400;600&display=swap');
```

Scale (rem): 0.75 / 0.875 / 1 (body) / 1.125 / 1.25 / 1.5 / 1.875 / 2.25. Body line-height 1.5. Minimum body size 14px in tables, 16px in forms (avoids iOS zoom).

---

## 3. Spacing, radius, elevation

- Spacing scale: 4, 8, 12, 16, 24, 32, 48 px.
- Radius: 6px for inputs/buttons/badges, 8px for cards. No pill-shaped buttons.
- Elevation: flat. Cards use a 1px `--color-border` border; at most `0 1px 2px rgba(0,0,0,0.06)`. Modals/dropdowns may use `0 8px 24px rgba(0,0,0,0.12)`. No glows, no blur.
- Modal overlay: solid `rgba(26,26,26,0.5)`, **no** backdrop blur.

---

## 4. Layout and components

- **Top header:** thin (48-56px) primary-green bar. Left: simple scales-of-justice SVG icon plus the name "DigitalAdaalat" in Merriweather, white. Right: user menu, notifications. Do **not** use the Pakistan State Emblem or any real court logo.
- **Left sidebar:** role-based navigation (items depend on LITIGANT, LAWYER, INTERN, JUDGE, ADMIN). White surface, 1px border. Active item: green text, 3px gold left or bottom marker, pale green background `#E3F1E7`. Collapses to a drawer below 1024px.
- **Breadcrumbs** on every page below the dashboard.
- **Data tables:** search box, filters, column sort, pagination (10/25/50), sticky header, zebra optional (`#FAFBFA`). Long text wraps; no clipping. On mobile, tables scroll horizontally inside their container or collapse to stacked cards.
- **Buttons:** Primary (green fill, white text, hover `#0B5D2E`), Secondary (white, green 1px border, green text), Destructive (`#9B1C1C`). No hover lift or scale; hover changes color only.
- **Inputs:** 1px border `--color-border`, focus: border and 2px ring `--color-ring`. Labels above fields. Required marker plus clear inline error text (icon + message, `--color-destructive`) under the field; summarize errors at form top on submit.
- **Tabs:** active tab has a 2px gold underline and green text.
- **Toasts:** top-right, auto-dismiss 5s, with icon and text, `role="status"` (errors: `role="alert"`).
- **Skeleton loaders** for tables and cards while loading (static or very subtle pulse).
- **Empty states:** a Lucide icon, one-line explanation, and a single next-step action (for example "No cases yet. File a new case").
- **Printable pages:** cause list, challan, receipt, certificate. Provide a `@media print` style: white background, no header/sidebar/buttons, black text, page-break rules, monospace for numbers, QR/UCN visible.
- **Icons:** Lucide SVG only.
- **Formats shown in UI:** dates `DD-MM-YYYY`, currency `PKR 12,500`, CNIC `12345-1234567-1`, phone `+92 3XX XXXXXXX`.

---

## 5. Charts (admin dashboard)

Simple **bar**, **line** and **donut** charts only, in one green palette:

`#01411C`, `#0B5D2E`, `#3E8A5A`, `#7FB596`, `#BFD9C8` (sequential greens). Use gold `#B8962E` at most for one highlighted series. Use a neutral grey `#9AA39C` for "other". Always show a legend or direct labels, axis labels, and a text/table alternative (title + summary or accessible data table). Do not rely on color alone: add direct value labels or patterns where series are adjacent. No 3D, no gradients, no animated entrance beyond a short fade.

---

## 6. Anti-patterns (must avoid)

- Gradients (including subtle ones)
- Glassmorphism / backdrop blur
- Neumorphism
- Dark mode (light mode only; do not ship a theme toggle)
- Neon colors
- Emojis as icons
- Heavy animations (keep transitions 150-200ms, color/opacity only)
- Trendy marketing-landing-page styles (hero sections, mega menus, "Contact Sales" patterns)
- Any purple/pink "AI" look
- Hover scale/translate transforms that shift layout

---

## 7. Quality checklist (verify before delivering any UI)

- [ ] Text contrast at least 4.5:1 (3:1 for large text and UI borders)
- [ ] Visible keyboard focus on every interactive element
- [ ] `cursor-pointer` on all clickable elements
- [ ] Responsive and tested at 375, 768, 1024 and 1440px; no horizontal page scroll
- [ ] Long text and badges wrap without clipping
- [ ] Icons are Lucide SVG; no emojis as icons
- [ ] Badge meaning never by color alone (icon + label)
- [ ] Forms show clear validation messages next to fields
- [ ] Touch targets at least 40x40px (44px on mobile)
- [ ] `prefers-reduced-motion` respected (disable non-essential transitions)
- [ ] No gradients, blur, dark mode, or neon
- [ ] Printable pages render cleanly in print preview
- [ ] Gold used only for small highlights, never for text
