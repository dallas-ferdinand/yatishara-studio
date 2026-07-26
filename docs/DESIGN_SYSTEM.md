# Yatishara Studio — Design System

The single source of truth for chrome UI/UX in this repo: **admin, Offers/marketplace,
Studio settings, file manager, desk chrome, dropdowns, tables, and forms.**

> Read this before any UI/CSS/token work. If you add or change a shared pattern, update
> this doc **and** the MercuryOS memory pinned decisions (see [Memory](#memory)).

Owner file for tokens: `src/mos-app/theme.js` (runtime + boot inline script).
Owner file for chrome CSS: `src/desk/desk-shell.css`.
Admin/Offers embedded CSS lives in `src/studio/components/StudioShell.tsx`.

---

## 1. Themes & appearance

- **Appearance modes:** `light` / `dark`, set on `document.documentElement[data-appearance]`.
- **Accent schemes:** 16 named schemes in `SCHEMES` (`agent` Genesis, `ocean`, `ember`,
  `violet`, `cobalt`, `teal`, `indigo`, …). Each defines `accent`, `bg`, `surface`, `raised`.
- Tokens are applied at runtime by `applyDeskTokens()` **and** pre-paint by the inline
  boot script (`getThemeBootInlineScript()`). **Any token change must be made in BOTH
  places** or the first paint will disagree with hydration.

### The golden rule for greys

**Shade steps are semantic tokens that carry across both modes — never light-only greys.**

Do NOT bake `[data-appearance="light"] { background: #ececf0 }` style overrides. Use the
role tokens below; dark mode gets the *same step amounts* from the active scheme (so Ocean
stays blue-tinted, Ember warm), light mode gets neutral greys.

---

## 2. Surface shade scale (the important part)

Three chrome roles, lightest → darkest. Applied to `:root` by the theme engine:

| Token | Role | Light | Dark |
|---|---|---|---|
| `--mos-page` | Level 1 — app canvas / panel background | `#f5f5f7` | `deepen(scheme.bg)` |
| `--mos-plate` | Level 2 — cards, tables, section bars, **open dropdown menus** | `#ececf0` | `mix(page, panel)` |
| `--mos-plate-strong` | Level 3 — **select buttons**, menu item hover/active, empty icon chips | `#d4d4da` | `deepen(scheme.raised)` |

Supporting tokens (also both modes):

| Token | Meaning |
|---|---|
| `--mos-hover` | Row / control hover wash |
| `--mos-active` | Pressed / selected wash (a touch darker than hover) |
| `--mos-surface` | Neutral mid surface (composer, inputs base) |
| `--mos-raised` | Legacy alias, **equals `--mos-plate-strong`** in both modes |
| `--mos-bg` / `--mos-panel` | Legacy: in light, `mos-bg ≈ plate`, `mos-panel ≈ page` |

**Usage cheatsheet**

```css
.app-canvas       { background: var(--mos-page); }          /* L1 */
.card, .table-wrap, .section-bar,
.dropdown-panel   { background: var(--mos-plate); }         /* L2 + shadow on menus */
.select-trigger, .empty-icon-chip,
.menu-item:hover  { background: var(--mos-plate-strong); }  /* L3 */
```

### Select / dropdown (locked decision)

- **One source of truth:** the shared menu block in `desk-shell.css` styles
  `.cursor-dropdown, .cursor-tab-context-menu, .desk-explorer-view-dropdown,
  .desk-explorer-type-filter-menu` together (fill, shadow, padding, gap, radius).
  Per-menu rules carry **positioning/sizing only** — never restyle the panel.
  New menus must join that selector list (or reuse `.cursor-dropdown` /
  `.cursor-tab-context-menu`), so they are correct by default — including DM
  right-click menus (`.studio-dm-context-menu` + shared classes).
- **Open menu panel** → level-2 `--mos-plate`, **no border**, **with** the tight
  `var(--cursor-shadow-menu)` (not the big `--cursor-shadow-pop`).
  Roomier surround, tight options: `6px` panel padding, `1px` gap between rows,
  rows `5px 8px`, radius `md`. Size with `width: max-content`; parents must
  `overflow: visible`.
- **Leading icons** → put an icon **in front of** every option label (and on the
  trigger when the active option has one). Prefer Lucide; explorer may use `Icon`.
- **Trigger / button** → level-3 `--mos-plate-strong` at rest; hover/open → `--mos-active`.
- **Menu item hover / active** → level-3 `--mos-plate-strong`.
- **Caret icon** → Lucide `ArrowDown` (same as StudioShell / profile chrome). **Not**
  `Icon name="chevDown"` / chevron.
- Shared classes: `.cursor-dropdown` / `.cursor-dropdown-item` (also type filter,
  view menu, tab context menus).

```tsx
import { ArrowDown } from "lucide-react";
// …inside trigger:
<ArrowDown className="cursor-select-arrow" aria-hidden="true" />
```

---

## 3. Borders

Hairlines are low-contrast rgba, never lightened hex stripes (`hairlineBorder()`).

| Token | Light α | Dark α | Use |
|---|---|---|---|
| `--mos-border` / `--color-cursor-border` | 0.11 | 0.07 | Default control & card borders |
| `--mos-border-soft` / `--color-cursor-border-soft` | 0.075 | 0.04 | Table row dividers, icon chip rings |
| `--mos-border-subtle` | 0.09 | 0.05 | Quiet separators (not dropdowns — those are borderless) |
| `--cursor-border-focus` | accent-mixed | accent-mixed | Focus ring border |

Rules:
- **Never** hardcode `#fff` / `rgba(255,255,255,…)` / `#000` borders on chrome — they vanish
  in the opposite mode. Always use `--color-cursor-border*` / `--mos-border*`.
- Focus/hover accent borders: `color-mix(in srgb, var(--cursor-accent) 32%, var(--color-cursor-border))`.

---

## 4. Radius scale

Aliases Studio DS tokens; use the `--cursor-radius-*` names in chrome CSS.

| Token | Value |
|---|---|
| `--cursor-radius-xs` | 4px |
| `--cursor-radius-sm` | 6px — inputs, chips, small controls, section bars |
| `--cursor-radius-md` | 8px — dropdown panels, settings actions |
| `--cursor-radius-lg` | 10px — cards, table wraps (default `--cursor-radius`) |
| `--cursor-radius-xl`…`4xl` | 12/14/16/18px — larger surfaces |
| `--cursor-radius-pill` | 999px — tabs, chips, icon-chip |

---

## 5. Typography

| Token | Size | Use |
|---|---|---|
| `--desk-text-2xs` | 10px | Uppercase table headers, kickers |
| `--desk-text-xs` | 11px | Secondary meta |
| `--desk-text-sm` | 12px | Table cells, dropdown items |
| `--desk-text-ui` | 13px | Default control text |
| `--desk-text-base` | 14px | Body |
| `--desk-text-lg` | 16px | Section / card headings |

Weights: `--desk-w-medium` 500, `--desk-w-semibold` 600, `--desk-w-strong` 650,
`--desk-w-bold` 700. Text colors: `--color-cursor-text`, `-text-bright`, `-muted`, `-faint`.

Layout constant: `--cursor-head-h: 32px` (all panel/tab headers share this height).
Spacing rhythm for admin/finance panes: **16 / 12 / 8** (body padding / section gap / control gap).

---

## 5b. Button & chip sizing (locked)

Do **not** invent one-off heights. Match siblings on the same surface.

| Role | Min-height | Pad | Font | Notes |
|---|---|---|---|---|
| **Compact action / profile chip** | **28px** | `0 10px` | 12px / 650 | Public profile Follow, Hire Me/Us, website links, suggestion chips |
| Compact icon / filter chip | 24–28px | tight | 11–12px | Sidebar chips, step chips in Offers header |
| Default chrome control | **32px** | `0 12px` | 13px | Panel/tab heads (`--cursor-head-h`), `.cursor-icon-btn-sm`, settings actions |
| Form / primary field button | 34–36px | `0 14px` | 13px | Full-width form saves, tall field selects — **not** for profile hero CTAs |

Rules:
- On a public profile hero, Follow must match Hire Me / website chips (28×12), never a taller accent pill.
- Prefer shared classes (`.public-profile-links a`, `.public-profile-follow`) over inline sizes.
- Header bars stay exactly `--cursor-head-h` (32px); nest 24–28px chips inside, don’t grow the bar.
- **In-rail / inline panel heads** (DM New/Edit label, assign sheets, secondary pane titles) use the
  **same** `--cursor-head-h` — never a taller padded `10px 12px` dialog strip. Close/back icons
  nest at **24px** inside the 32px bar (same as `.studio-dm-back` / chat head).

## 6. Shared components

Prefer these over bespoke markup. Located in `src/desk/components/`.

### `CursorSelect` — themed dropdown select
`src/desk/components/CursorSelect.tsx`

- Root class **`cursor-select-menu`** — **never `cursor-select`** (that styles native
  `<select>` and double-boxes the control).
- Variants: `ghost` (default, compact chrome filter) and `field` (full-width taller, forms/sidebars).
- Props: `value`, `options[{value,label,icon?,tone?}]`, `onChange`, `ariaLabel`, `align`, `variant`, `disabled`.
- Prefer a leading `icon` on every option (shows on trigger + menu row).
- Status filters: set `tone` — `good` (green), `warn` (amber), `bad` (red), `info` (accent), `muted`.
- Flat darker fill, no border; caret is Lucide `ArrowDown` (see [select / dropdown](#select--dropdown-locked-decision)).

```tsx
<CursorSelect ariaLabel="Status" value={f} onChange={setF}
  options={[{ value: "pending", label: "Pending", icon: <Clock3 />, tone: "warn" }]} />
```

### `CursorTable` / `CursorTableEmpty` — global table plate
`src/desk/components/CursorTable.tsx`

- Renders `.cursor-table-wrap` + `.cursor-table` (legacy aliases `.studio-admin-table*`).
- Pass `<thead>`/`<tbody>` as children. Handles **loading**, **empty**, and populated states.
- When `empty`, the header is hidden and a centered **empty state** renders instead.
- Empty state props: `emptyIcon` (lucide node), `emptyTitle`, `emptyHint`, `emptyAction`.
- Table wrap = `--mos-plate`; empty icon chip = 44px pill on `--mos-plate-strong` + soft ring.

```tsx
<CursorTable ariaLabel="Sellers" loading={!rows}
  empty={!!rows && !rows.length}
  emptyIcon={<Store />} emptyTitle="No sellers"
  emptyHint="No sellers match this filter yet.">
  <thead>…</thead><tbody>…</tbody>
</CursorTable>
```

### Other chrome classes (in `desk-shell.css`)

| Class | Purpose | Key shades |
|---|---|---|
| `.cursor-dropdown` / `.cursor-dropdown-item` | Menu panel + rows | panel L2 `--mos-plate` + `--cursor-shadow-menu`, no border; item hover/active L3 |
| `.cursor-tab-context-menu`, `.desk-explorer-view-dropdown`, `.desk-explorer-type-filter-menu` | Floating menus | share the `.cursor-dropdown` panel block; positioning only per class |
| `.cursor-settings-action` | Standard button/action | border-soft, hover `--color-cursor-hover` |
| `.cursor-icon-btn` (`-sm`) | 24px icon button | transparent → hover wash |
| `.cursor-input`, `textarea.cursor-input` | Text field | `--cursor-surface-input`, focus ring |
| `.studio-admin-panel` | Admin canvas | `--mos-page` |
| `.studio-admin-section-head` | Compact section bar (36px, `0 8px` pad) | `--mos-plate` |
| `.studio-admin-card`, `.studio-plan-card`, `.studio-bank-card` | Cards | `--mos-plate` |
| `.studio-admin-chip` | Count / meta chip | subtle |

**DM peer right sidebar** (`StudioDmPeerSidebar`) reuses this chrome — do not invent a
second tab/button language: `cursor-panel-head` + `studio-admin-head-tabs` /
`studio-admin-head-tab`, body stacks with `studio-admin-section` /
`studio-admin-section-head`, actions via `cursor-settings-action`, fields via
`cursor-input`, empty copy via `studio-settings-empty`, labels via
`studio-dm-assign-row` + checkbox (same as Assign labels). Layout-only helpers live in
`studio-messages.css` under `.studio-dm-peer-*`. Memory: **745**.

Inside that sidebar `cursor-settings-action` is **full-width** — never use it for an inline
action inside a row. Job/offer summaries use `.studio-dm-peer-job-card` /
`.studio-dm-peer-offer-card`: an ellipsised title row (`.studio-dm-peer-card-head` +
`.studio-dm-peer-card-title`) over a `.studio-dm-peer-chips` meta row, with the primary
action as a compact 22px accent pill (`.studio-dm-peer-book`). Status chip tones:
`is-live` / `is-done` / `is-wait` / `is-off`. Memory: **747**.

### Marketplace form fields (locked)

`IconField` / `IconTextarea` (`MarketplaceIconField.tsx`) take `label` and `hint`. Any
field the user can *fill and come back to* must carry a `label` — an icon plus a
placeholder is not a label, because the placeholder disappears once there is a value.
Placeholders are examples only (`e.g. ads`), never the field name.

- `.marketplace-field` wraps label + control + hint (`4px` grid).
- `.marketplace-field-label` / `.marketplace-field-hint` — 11px muted; hint carries the
  "where does this show up" note.
- `.marketplace-offers-hint` — dashed-border inline note that *replaces* a field
  (e.g. pricing moved to Packages), so it reads as part of the form, not stray copy.
- `.marketplace-offers-public-link` — L3 row with `ExternalLink` + ellipsised slug +
  accent "View". Never a bare accent `<a>`; a lone red URL reads as an error.
- `.marketplace-offers-footer` — hairline top divider, status sentence left, actions
  right. Primary = `.is-primary` (accent tint), destructive = `.is-danger`
  (`--mos-danger` text, tinted hover). Memory: **752**.

### Offer media slots (locked)

Offer banner/gallery media is **not** a flat "recent assets" grid. `OfferMediaEditor`
(`MarketplaceMediaEditor.tsx`):

- **Desktop** — empty dashed `.marketplace-media-slot` drop zones; drag assets from the
  file manager (standard explorer DnD: `EXPLORER_DND_TYPE`, `studioKind === "asset"`,
  `peekActiveExplorerDrag()` during dragOver). Active target = `.is-drop-target`
  (accent border + 10% tint). Banner accepts images; gallery accepts image/video, ≤6.
- **Mobile** (`useMobileLayout`) — slot shows a `.marketplace-media-pick-btn` pill that
  opens `OfferMediaPickerSheet`: `studio-mobile-app-menu-sheet` chrome portaled into
  `.studio-polish`, folder browsing via `folders.listWithPeeks` +
  `assets.listByFolder`, back-crumb row, asset tiles reuse
  `.marketplace-offers-asset-grid`, gallery mode gets an accent Done footer.
- Selected media resolves thumbs via `assets.listByIds`; filled banner =
  `.marketplace-media-banner` (140px cover + L3 name bar + remove), gallery =
  `.marketplace-media-tile` with overlay remove. Memory: **753**.

### Studio Files asset picker (locked)

`StudioAssetPickerSheet` (`StudioAssetPickerSheet.tsx` + `studio-asset-picker.css`)
is the **mobile** folder browser for picking assets. Desktop does **not** use the
sheet for DM attach — it opens the left Files rail instead.

- **Desktop pick mode** (`StudioShell` `assetPickRequest`): forces the owner-scoped
  file explorer into the left rail even on `messages:` / social tabs, resets the
  trail to the signed-in user's root folder, shows `.studio-asset-pick-banner`
  ("Pick a photo to send — Cancel"), intercepts asset clicks in `handleEntryOpen`
  (folders still navigate; wrong kinds toast). Escape / Cancel / tab change ends
  the session. Main pane stays on the DM. Wired via
  `onRequestPickAsset` → `ActivePane` → `StudioMessagesPane`.
- **Mobile**: sheet chrome (`studio-mobile-app-menu-sheet`); portal into
  `.studio-polish`. Browse: `folders.listWithPeeks` + `assets.listByFolder`
  (both owner-scoped — clients never see another user's root).
- Consumers: DM attach ("Choose from Studio Files"), offer Media slots (mobile Pick).
  DM: picker → `assets.signedReadUrl` → blob → same pending image send path as
  uploads. Memory: **753**.

---

## 6b. Public routes (`/offers`, share links)

Public pages live outside the Studio shell, but `desk-shell.css` is imported by
`src/app/globals.css` and the theme boot script sets the `--mos-*` tokens on `<html>`, so
**the whole token set is available on every route** — never re-invent greys with Tailwind
color classes or gradients.

`src/studio/components/public-offers.css` is the reference: page canvas `--mos-page`, a
48px sticky brand bar with a hairline bottom border, plate cards/hero/section bars, L3
chips and buttons, and the accent-tinted primary button (`accent 16%` fill + `accent 34%`
border, same as `.studio-account-save`). Logo mark comes from `useMercurySidebarLogo()`
so its ink follows appearance. The `studio-admin-*` classes are **not** available on public
routes (they live in the `StudioShell` inline `<style>`) — mirror them with local classes.

The public marketplace brand is **Yatishara Creative Network** ("Creative services from
verified creators"); listings are *services/packages*, never "offers" in public copy
(route stays `/offers`). Catalog shell = full-height left rail (248px, `--color-cursor-sidebar`,
32px brand head + flat search strip + tree-row filters — same chrome family as the Studio
file-manager sidebar) + main column (workspace head + scrolling page body). Value grid sits
in the main column (verified creators / secure booking / delivery tracking). Filters are
client-side (search + category/price/delivery); ≤860px the rail stacks above content with
pill chips. Memory: **705**.

---

## 7. Scrollbars

Hidden globally (`src/mos-css/scrollbars.css`): `scrollbar-width: none !important` +
`::-webkit-scrollbar { display: none }`. Do not re-introduce thin/visible scrollbars in chrome.

---

## 8. Do / Don't

**Do**
- Use `--mos-page` / `--mos-plate` / `--mos-plate-strong` for chrome surfaces.
- Use `CursorSelect` and `CursorTable` instead of hand-rolled selects/tables.
- Use Lucide `ArrowDown` as the select caret (not chevron).
- Put a leading icon in front of dropdown option text.
- Keep card/table borders on `--color-cursor-border*` / `--mos-border*`.
- Mirror every token change in `applyDeskTokens()` **and** the boot inline script.
- Match button height to siblings: profile chips **28px**, chrome heads **32px** (see §5b).
- When a pattern solidifies, update this doc **and** MercuryOS memory in the same turn.

**Don't**
- Hardcode light-only greys (`#ececf0`, `#d4d4da`, `#f5f5f7`) behind `[data-appearance="light"]`.
- Hardcode `#fff`/`#000` borders on glass or chrome.
- Put a stroke/border on dropdown menus (fill + shadow only).
- Use `Icon name="chevDown"` on selects.
- Make the select button the same grey as `--mos-plate` (it must read darker).
- Use `cursor-select` as the CursorSelect root.
- Put table wraps on `--mos-plate-strong` (that's for chips/menus, not the plate).
- Make Follow / Hire / link chips taller than 28px on the public profile hero.

---

## Memory

These are mirrored as MercuryOS pinned/namespaced decisions (`namespace: yatishara-studio`).
Update memory when you change a rule here:

- **702** (pinned) — Design system pointer → `docs/DESIGN_SYSTEM.md`.
- **698** — Shade scale + flat borderless dropdowns + `ArrowDown` caret.
- **692** — CursorSelect root = `cursor-select-menu`, never `cursor-select`.
- **700** — Table empty = `CursorTable` empty + centered icon chip.
- **694** — Glass/chrome borders = `--color-cursor-border`, never hardcoded white.
- **695** — File manager plates = mos greys, never cool slate/teal.
- **696** — Scrollbars hidden globally.
- **691** — Light admin: page lighter, plates darker; 16/12/8 spacing.
- **697** — Offers inputs keep raised fill; white/borderless rejected.
- **703** — Public routes reuse mos tokens; `public-offers.css` mirrors admin billing chrome.
- Button/chip heights — profile compact actions **28px** / chrome heads **32px** / form primaries 34–36px (`docs/DESIGN_SYSTEM.md` §5b).
- **668** (pinned) — Chrome + inline panel heads = `--cursor-head-h` 32px (DM New label, Offers steps, etc.); close 24px.
