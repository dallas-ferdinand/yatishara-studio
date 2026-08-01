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
  First-visit default = **light** + **Archive** (`gold` / gold-archive wallpaper).
- **Accent schemes:** 16 named schemes in `SCHEMES` (`gold` Archive, `agent` Genesis, `ocean`, `ember`,
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

### Mobile action sheets (locked)

History, Files dock, Places/Extras, app menu, settings, and explorer context
sheets use **L2 `--mos-plate`** for the sheet canvas. The **drag-handle top band**
is **L1 `--mos-page`** (whitish in light — menu-style). Nested folder/file tiles
stay L2 plate with their own edge treatment. Never paint the handle L2 (muddy
under the grab) or the whole sheet L3.

### File manager tiles (locked)

The explorer canvas is L1 (`--mos-panel` in light = `--mos-page`), so **file / folder
tiles are L2 plates** — never L3. In light mode L3 (`#d4d4da`) reads as heavy dark-grey
slabs against the canvas. Both the Studio grid tokens and the desk peek surfaces derive
from `--mos-plate`:

- `--studio-grid-tile-bg` / `-folder-tile-bg` / `-hover` / `-selected` (StudioShell light
  block, desktop **and** `.is-studio-mobile`) = `--mos-plate` plus a small `--mos-text`
  mix for hover/selected (hover darkens in light, lifts in dark).
- `.desk-file-thumb-peek-wrap`, `.desk-folder-peek-card`, peek label bands,
  `.desk-file-thumb-audio`, `.desk-file-thumb-visual` light overrides = `--mos-plate`.
- File-manager type chips (`.desk-file-thumb-badge` on peek wraps): **same white
  pill + ink glyph** for folders, images, and audio — never dark glass on media
  only. **System folders** (Trash / Messages / Purchased / My Public): center glyph
  only (`trash` / `message` / `shoppingBag` / `globe`) — **no** bottom-left type
  chip.
- File-manager **search strip** (`.cursor-panel-search`): always nested in
  `.studio-files-search-row` (or workspace `.studio-files-chrome`) so the bottom
  hairline belongs to that container — search itself has no top/bottom border.
  Under a brand head that already drew a line (Messages `.studio-dm-sidebar`),
  **no top border**. Never stack two adjacent lines. Type filter is a **labeled
  dropdown** in the search end (`.desk-explorer-type-filter`) with leading icons
  — same CursorSelect language (`ArrowDown`, plate menu). Creative Network Files
  mode uses the same control for All / Music / SFX (no pill row).
- **Messages rail** search (Feed / My offers / My jobs `.studio-dm-sidebar
  .cursor-panel-search`): **no top border** — brand head already draws that
  divider; only the bottom hairline.
- **Files workspace tab** (`files:main`, desktop only): Windows-style left nav
  (`.studio-files-nav-pane`) **is** the resizable `studio-sidebar` Panel content
  (same drag handle as Messages / explorer) — not a nested panel inside it. Full
  sidebar width, one right divider only (`aside.is-files-nav`). Head label
  **Files**. Stays open while browsing folders. **Active** highlight only on
  **Home** and **Places** (Recents / Trash / …) — Quick access / Recent folders /
  Frequent rows open the folder with **no** selected/active wash. Home, Places
  (**Recents** = last 20 opens/creates/edits + folders; Trash; Messages; …), Quick
  access (drag folders to pin), **Recent folders** (last 5 folder opens),
  **Frequent** (most-visited folders). File activity: `explorer-file-access.js`
  (prune 20). Folder visits: `explorer-folder-access.js`. Main pane = explorer
  body + add/view controls in the pathbar.
- Files source toggle (`.studio-files-source-toggle`): **full Files workspace**
  only — left of search in `.studio-files-chrome` with a **full-height** vertical
  divider. Search ↔ type-filter keeps the **short** hairline
  (`.cursor-panel-search-end::before`). **Sidebar explorer** (editing / left rail)
  and mobile: toggle stays on its **own row above** search (stacked). Search
  always lives inside `.studio-files-search-row` so the bottom hairline wraps the
  whole strip. Chrome fill = L1 `--mos-page` / `--mos-panel` (same grey as the
  rail — never a darker `--mos-bg` band). Folder = Your files, Library = **Asset
  library**. Owned library cards are HTML5-draggable onto the timeline; play/scrub
  row stays interactive.
- Active *controls* inside the file manager (breadcrumb `.is-current`) stay L3
  — that's the control affordance, not a plate.
- File / folder **hover** (grid tile visual, preview tile, list row): accent
  border ring + slight drop shadow — never flat hover-only fill.
- External file drag/drop uses a restrained centered **“Drop to upload”** L2 chip plus
  a subtle accent inset on the explorer — never a full-panel oversized drop card.
- Multi-select is an explicit mode (also entered by Ctrl/Cmd-click): selected tiles use
  the normal selected L2 treatment plus a compact accent check. The action rail sits
  immediately above transfers.
- Upload/download progress lives in the **bottom transfer tray**, below file content.
  Rows are compact L3 plates (28px), show live bytes/progress, and keep cancel/retry
  controls reachable without displacing breadcrumbs or search.
- **ZIP is transport only:** dropping/uploading a `.zip` unpacks into a new folder
  named after the archive (nested paths preserved). Nested `.zip`s inside unpack
  recursively into folders of the same name (`A.zip` containing `B.zip` → folder
  `A` with folder `B` inside). The zip blob is never stored as an asset.
  Folder/multi-select **Download ZIP** remains export-only.

### Select / dropdown (locked decision)

- **One source of truth:** the shared menu block in `desk-shell.css` styles
  `.cursor-dropdown, .cursor-tab-context-menu, .desk-explorer-view-dropdown,
  .desk-explorer-type-filter-menu` together (fill, shadow, padding, gap, radius).
  Per-menu rules carry **positioning/sizing only** — never restyle the panel.
  New menus must join that selector list (or reuse `.cursor-dropdown` /
  `.cursor-tab-context-menu`), so they are correct by default — including DM
  right-click menus (`.studio-dm-context-menu` + shared classes).
  Explorer context menus use **flyout submenus** (New / Pin / More) via a second
  `.cursor-tab-context-menu.desk-explorer-context-submenu` panel — same plate
  look; caret = Lucide `ChevronRight`.
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
| Settings **section containers** | Soft surface cards for Settings panes | see below |
| History **chat bubbles** | Flat chronological list — each thread is its own bubble | see below |

**Settings section containers** (shared chrome in `StudioShell.tsx`):

- Selectors: `.studio-account-card`, `.studio-settings-appearance-card`,
  `.studio-settings-plans`, `.studio-settings-storage-card`,
  `.studio-settings-invoices-card`, `.studio-settings-activity-card`,
  `.studio-settings-payment-card`
- Fill: `color-mix(mos-surface 58%, transparent)` · border soft 82% · **radius 18px**
- Shadow: inset top highlight + soft 1px/4px drop (light mode uses white inset)

**Landing auth / sign-in sheet** (`StudioAuthGate` → `AuthFrame`):

- Always **light** page (`--mos-page`) + centered opaque **plate sheet** (`--mos-plate`,
  radius 18px, ~300px max-width). No wallpaper carousel, no glass / `backdrop-filter`.
- Theme = landing ink (no agent green): accent `#1c1c1e`, mute icons, dark primary +
  bordered secondary pills. Fields = opaque white **42px pills**, 12px input text
  centered with icons.
- **Intent chooser** (“What brings you here?”): wider sheet (400px), **2×2 image tiles**
  (`.studio-auth-choice-tile`) with generated bg photos + gradient/radial mask + title
  label. Assets in `public/landing/intent/`. Memory: **807**.
- **Embedded in landing**: sign-in fills `.studio-landing-auth-stage` (content band);
  header / mobile bottom nav stay mounted. Head **Sign in** = dark pill; toggles to
  **Close**. Desktop head has tighter horizontal pad. Memory: **807**.

**History + Messages chat-list bubbles** (shared soft bubble language):

- Flat list rows: `.studio-history-item` and `.studio-dm-row` — `16px` radius,
  `mos-surface` 58% wash, soft border, inset top highlight. Active = accent wash
  + inset ring. List pad/gap `10px` / `8px`. Memory: **759**.

**Mobile bottom sheets** (Studio chrome — shared edge language):

- Surfaces: menu, Settings, History, Files dock (when open), DM peer actions —
  canvas L2 `--mos-plate`, handle band L1 `--mos-page` (whitish), top radii
  `18px` (peek) / `14px` (full), grab handle `44×5`.
- Shadow token: `--studio-mobile-sheet-shadow` (inset top highlight + upward soft lift).
  Do **not** use inset glass panels with title+X for Settings on mobile.
- Menu / History / Settings share peek↔full drag: bottom-anchored, band-capped under
  top chrome, window `pointermove` during drag, `--*-sheet-h` inline px.
  Peek/full tokens: History `0.68/0.88` of files-band; menu + Settings alias those.
  Never force full-band height from `desk-shell.css` (`!important` kills drag).
  Memory: **790**.
- Hamburger menu **list** = phone home-screen app grid: 4 columns,
  locked `52×52` L3 tiles + 11px ellipsis label. Scroll chain like History —
  stage `flex: 1 1 0%` + `overflow: hidden`, body `overflow-y: auto`,
  `grid-auto-rows: max-content` so sheet collapse scrolls instead of squishing
  tiles. Landing 40px plate fade masks on `.studio-mobile-app-menu-scroll`.
  Scoped via `.is-app-grid`. Memory: **790**.

**DM peer right sidebar** (`StudioDmPeerSidebar`) reuses this chrome — do not invent a
second tab/button language: `cursor-panel-head` + `studio-admin-head-tabs` /
`studio-admin-head-tab`, body stacks with `studio-admin-section` /
`studio-admin-section-head`, actions via `cursor-settings-action`, fields via
`cursor-input`, empty copy via `studio-settings-empty`, labels via
`studio-dm-assign-row` + checkbox (same as Assign labels). Layout-only helpers live in
`studio-messages.css` under `.studio-dm-peer-*`. Memory: **745**.

**Settings horizontal section menu** (`.studio-settings-horizontal-menu`) matches the
same head-tab language: idle labels are plain (transparent, muted); **only**
`.is-active` gets the accent pill. Never glass-fill every section chip. Same rule as
`studio-admin-head-tab` / `studio-cn-head-tab`.

**Horizontal overflow edge fades** (Settings section nav, Creative Network head
tabs, Messages **label rail**): use `.cursor-h-scroll-fade` + `useHorizontalScrollFade`
+ `useHorizontalWheelScroll` (desktop hover wheel → sideways, no Ctrl/Shift). Soft
mask matches workspace tab strip (`.cursor-unified-tabs-scroll` right fade).
`data-scroll-fade` is `right` / `left` / `both` / `none` — clear a side when scrolled
flush so items can fully reach that edge. No container pad on the track —
`::before`/`::after` spacers inset the first/last pill at rest but scroll away so
pills can go flush under the fade. Memory: **806**.

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

### Instant chrome (desktop + mobile)

Studio must feel **native**, not like a website waiting to load:

- **Sync tab/nav selection** — never wrap `setActiveTab` / overlay open in
  `useTransition` (deferred paint reads as lag).
- **Warm panes** — Feed already keepalive-mounts; Messages + Creative Network do
  the same after first visit (switch back = show slot, no remount/resubscribe).
- **Idle prefetch** — after auth, `preloadStudioHotPanes()` warms Feed / Network /
  History / Profile chunks so first open isn’t a blank wait.
- **Intent prefetch** — after paint (rAF + setTimeout 0): mark intent cheaply,
  then warm chunks. Never `import()` or stringify cache on pointerdown before
  the tab paints. Mobile nav activates first, then defers warm.
- **Optimistic live cache** — `studioLiveOrCached` / `dmClientCache`: memory Map
  for Feed / folders / threads / History / CN (no sync `sessionStorage`
  stringify — that made mobile tabs lag). Small DM snapshots may still use
  session. Never flash “Loading…” when cache exists (quiet pending only).
  Legacy heavy session keys are purged on read.
- **Signed-URL budget** — `SIGNED_URL_BUDGET` caps folder preview fallbacks and
  chat playable lazy-signs (`signedUrlBudget.ts`). Thumbs first; full media lazy.
- **Wallpaper layer** — `StudioBackdrop` is `memo()` with no props so Convex ticks
  don’t repaint the wallpaper. Glass stays on fixed chrome only.
- **Dallas paint HUD** — admin + `?studioPerf=1` or
  `localStorage yatishara-studio-perf-hud=1` shows intent→paint ms (`StudioPerfHud`).
- **Messages instant open** — DM cache + warm top chats in the sidebar.
- **Gate Shell Convex** — skip composer catalog / threads / seller listings until
  that surface is active; skip folder contents while Files isn’t shown — desktop
  social rails **and** mobile until the Files dock is open. Asset-pick / my-assets
  re-enable. Live `listEvents` skips bulk playable CDN signatures. `StudioComposer`
  mounts only on `composer:` / `thread:` tabs. Do **not** split Shell into
  components for this.
- **Scroll glass** — no `backdrop-filter` on scrolling surfaces; glass stays on
  fixed composer / menus.
- **Overlay motion** — app menu / history sheet rise ~110ms (not 220ms+).
- Files dock + Back stack: see Mobile Generate Files dock. Memory: **786**.

#### Instant surface checklist (every new pane)

Before merge, a pane must:

1. Mount-gate / keepalive so switch-back isn’t a remount tax  
2. Skip unused Convex queries when the surface is hidden  
3. Use `live ?? cache ?? empty` — no “Loading…” when cache exists  
4. No `backdrop-filter` on its scroll surface  
5. No unbounded signed-URL fan-out (respect `SIGNED_URL_BUDGET`)  
6. Prefetch chunk on nav intent when first open is common  

### Mobile Files: sheet vs tab (locked)

- **Generate / My Assets Folder pill** → **sheet dock** under Create (see below).
- **App menu Files** (and desktop-parity `openFiles()`) → full workspace **tab**
  `files:main` on mobile too. Explorer fills the main pane; **Extras** opens the
  Places sidepanel sheet (no left rail on phone). Folder pill active while the
  tab is open; tap again to return to the last chat.
- Do **not** route app-menu Files through `openMobileSection("files")` (sheet).

### Mobile Generate Files dock (locked)

Bottom-nav **Files** on Generate is an **in-flow flex dock** under Generate — not a
floating/absolute overlay sheet.

**Folder pill ↔ keyboard (locked):** Generate Folder toggles the dock with the
composer keyboard — open Folder to browse (blurs KB); Folder again / back returns
to composer and restores the keyboard. Composer input focus while the dock is open
also hides the dock and focuses the editor. Keyboard-dismiss restore only applies
when the dock was tucked away for typing (not after a manual Folder close).

Structure:

```
.studio-mobile-stage (flex column, clears bottom nav)
  .studio-main-panels (flex: 1)   ← Generate
  .studio-files-dock (height 0 → sheet)  ← Files
```

| Token | Role |
|---|---|
| `--studio-mobile-bottom-chrome` | nav height + safe-bottom |
| `--studio-mobile-top-chrome` | header height + safe-top |
| `--studio-mobile-files-band` | viewport between header and nav |
| `--studio-mobile-files-sheet-height` | **60%** of that band |

- **Motion**: snap `.studio-files-dock` `height` (`0` ↔ sheet token) — **no height
  tween** on mobile (layout thrash). Token `--studio-mobile-files-dock-duration`
  stays `0ms`. Generate is `flex: 1` and shrinks/grows in the same frame.
- Keep dock **mounted** at height 0 after close; warm-mount ASAP on mobile enter.
  **Open/close paint path**: `paintMobileFilesDock` sets `data-files-open` on the
  tap frame (CSS expands/collapses), then React `setMobileSection` /
  `setFilesDockExpanded` run in `setTimeout(0)` — a sync Shell re-render on the
  pointer frame is what made both directions feel like “load/init”.
- Do **not** re-apply composer editor HTML when `mobileSection` flips (only on
  real `composerContextKey` change). Do **not** tear down composer
  ResizeObserver / visualViewport listeners when Files opens — read
  `data-files-open` inside the keyboard inset sync instead.
- Keep dock body laid out while collapsed (`height:0` + `overflow:hidden`);
  avoid `visibility:hidden` (cold reveal of `content-visibility` thumbs).
- **Browser/gesture Back**: mobile overlays (Files dock, sheets, menus, comments,
  pickers) push a history entry via `mobileBackStack` / `useMobileBackLayer` so
  Back closes the top overlay before leaving the page. Files pushes on the same
  paint frame as `data-files-open`. Docs/memory: **757**, taps **786**.
- Composer stays absolute in Generate and rides the flex shrink.
- z-index: Files dock `25` < Generate content; bottom nav `60`.
- No "Files" title bar. Grab handle = menu/History (transparent on L1 `--mos-page` —
  no pathbar/search band under the grab). Sheet canvas = **grey 1** `--mos-page`
  (same as desktop Files); folder/file tiles stay L2 `--mos-plate`. Chrome =
  search + pathbar (desktop layout): breadcrumbs + select + view toggle + Add.
  Pathbar tools = ghost **circle** icon buttons (L1 `--mos-page` fill — never
  darker `--mos-plate` grey — soft border, **no** drop shadow / accent glow).
  Same language as desktop workspace-head `.studio-settings-trigger` circles.
  Your files / Asset library = L1 `--mos-page` fill + border-soft;
  active = accent wash/border. Bottom nav **Files** and **Create** are icon-only.
  Memory: **757**, instant taps **786**.

### Mobile Places sheet (locked)

Desktop Files left rail (`StudioFilesNavPane`: Home, Places, Quick access,
Recent folders, Frequent) has no in-flow dock on phone. On Generate / My Assets
it opens as a **History-style floating sheet** (`StudioFilesNavMobileSheet`):
grab handle, peek ↔ full height drag, flick dismiss, portal under `.studio-polish`.

- **Generate** bottom-nav cluster: Create | **Files** | **History** only.
- While **Files dock is open**: History is replaced by **Extras** (`PanelLeft`)
  — opens the Places sidepanel sheet. Shell passes `extrasAction` only when
  `mobileSection === "files"`. Closing Files also closes the Places sheet.
- Picking Home / a place / pin / recent / frequent navigates in the Files dock
  and closes the Places sheet.
- Browser Back: `useMobileBackLayer("files-nav-sheet")`. z-index `55` (with
  History), above Files dock `25`, below bottom nav `60`.
- Shade: L1 `--mos-page` (grey 1) sheet — same canvas as desktop Files; folder
  tiles stay L2 `--mos-plate`. Handle/grab matches menu/History.

Memory: **869**.

### Studio Files asset picker (locked)

`StudioAssetPickerSheet` (`StudioAssetPickerSheet.tsx` + `studio-asset-picker.css`)
is the **mobile** folder browser for picking assets. Desktop does **not** use the
sheet for DM attach — it opens the left Files rail instead.

- **Desktop pick mode** (`StudioShell` `assetPickRequest`): forces the owner-scoped
  file explorer into the left rail even on `messages:` / social tabs, resets the
  trail to the signed-in user's root folder, and pins `.studio-asset-pick-chrome`
  at the bottom of the Files rail: a **selected-preview strip**
  (`.studio-asset-pick-selected` — thumbs with remove) above the action bar
  (`.studio-asset-pick-footer`: "N selected — Cancel — Confirm", same language
  as the mobile sheet foot). Clicks **toggle** selection (`.is-picked` on
  FileTree rows via `pickedPaths`); Confirm calls `onConfirm(assets[])`. Folders
  still navigate; wrong kinds toast. Escape / Cancel / tab change ends the session.
  Main pane stays on the DM. Wired via `onRequestPickAsset` → `ActivePane` →
  `StudioMessagesPane`.
- **Mobile**: sheet chrome (`studio-mobile-app-menu-sheet`); portal into
  `.studio-polish`. Multi-select + Confirm footer (`onDone`). Browse:
  `folders.listWithPeeks` + `assets.listByFolder` (owner-scoped — clients never
  see another user's root).
- Consumers: DM attach ("Choose from Studio Files"), offer Media slots (mobile Pick).
  DM: confirm → `assets.signedReadUrl` → blobs → pending images queue (up to 10)
  → send as separate image messages (caption on the first). Memory: **758**.

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

**Feed / Profile** left rail uses the same Messages list ↔ inline chat as My offers /
My jobs (`StudioMessagesSidebar` / `StudioMessagesPane` `embeddedInRail`) — not a
global People directory search. Mobile Social sheet matches (Messages, not People).
Memory: **727**.

**Desktop post + comments** (`ProfilePostViewer` / `profile-post-viewer.css`): edge-flush,
full-height, square — no inset padding, no 18px floating cards. Post media fills the
main pane; comments rail is a flat `--mos-panel` column with a left hairline (like other
Studio sidebars). Light mode: post stage L1 `--mos-page` (never hardcoded black);
comments rail solid `--mos-panel` (excluded from StudioShell transparent/`aside`
!important). Divider between post ↔ comments (and between swipe posts) = L2
`--mos-plate`. Memory: **775**. Caption username/body ink is **backdrop-
sampled** (`captionBackdropContrast.ts` → `.is-on-light` / `.is-on-dark` on caption
**and** action rail), not tied to appearance — letterbox vs media luminance.
Caption uses mean luma; the action rail always uses white ink (`.is-on-dark`)
so candle/neon posts don’t flip icons black — comments dock stays theme panel.
Comments/description dock stays theme ink.
Mobile comments stay a bottom glass sheet.
Post timestamps always show relative ago · short date
(`formatPostWhen`, e.g. `12d ago · Jul 14`); caption edits set `editedAt` and
append “· edited”. Memory: **774**.

**Creative Network** is a normal Studio workspace tab (`network:home`), not a separate
public catalog site. Deep links (`/creative-network/`, `/creative-network/[slug]/`, legacy
`/offers/*`) authenticate into Studio with `?network=1` (+ optional `slug` / `u`).

| Mode | Left rail | Main pane | Right (when open) |
|---|---|---|---|
| **Network** (all users) | Catalog filters (`StudioCreativeNetworkSidebar`) — search = shared `PanelSearchBar` (no pill; **no top border** under brand/rail edge, same Messages rule) | Browse + banner; offer detail (gallery thumbs **below** stage; secondary `--cursor-head-h` **Back** bar). Top Network tab becomes **Back to Network** (not active) while an offer is open | Offer **Book** dock (`PackagePicker` + `BookPanel` via PanelGroup). Mobile: bottom Book bar → sheet — not a cramped right column |
| **My offers** (approved sellers) | Messages list ↔ inline chat | Offer list (no duplicate Offers head — CN tabs only) | — |
| **My jobs** (approved sellers) | Messages list ↔ inline chat | Job list (no duplicate Jobs head — CN tabs only) | — |
| **Assets** (approved sellers) | File manager (Your files — list audio from Files) | Summary + listings table | — |
| Non-sellers | Catalog filters | Network browse + Become seller / Continue registration CTA | — |

On **Network** (and seller-apply), the left rail is the catalog filter rail like the
public Creative Network page — **Price (TTD)** first, then **Sort** (not in the
main results head), then category/facet sections.
Studio Network filter search uses `PanelSearchBar` (Messages language), not a pill
input. Keep **~10px horizontal pad** on search + `.public-offers-rail-body` (do not
zero left/right — flush content reads as a bug). Filter sections in Studio CN are
soft **L2** `--mos-plate` cards (12px radius, soft border, light top sheen) with
accent-tinted active rows — not a flat wall of transparent chips. Scope those
lift styles to `.studio-cn-sidebar` so public `/creative-network/` stays as-is.
Public `/creative-network/` keeps its existing left book rail on offer detail;
in-Studio offer book is the **right** secondary dock (`--mos-panel`).
On **My offers / My jobs**, the rail is Messages with inline chat (Back stays in the
rail — no Messages tab). On **Assets**, the rail is the normal file manager (Your files)
so sellers can List on Creative Network from context menu — not filters or Messages.
Mobile CN sheet mirrors Filters vs Messages; Assets middle action is Files. Signup
intent + Settings → General “Default tab” control first-open tab. Admin Offers/Jobs
ops tabs unchanged.
`.studio-cn-head` (and nested `.studio-admin-head`) use **L1** `--mos-panel` /
`--mos-page` — same fill as `cursor-workspace-head`, never `--mos-bg`/plate (reads as a
deeper second bar in light). Memory: **712**.
Listings are *services/packages* in product copy. CSS: `studio-creative-network.css` +
shared `public-offers.css` tokens. Memory: Creative Network Studio tab model.

**Stock audio (v1 digital goods)** is separate from service offers/jobs: Files left rail
toggles **Your files | Asset library** to browse music/SFX at fixed **3× generate**
price (TTD UI). Store listing cards = **one** L2 `--mos-plate` **`StudioChatAudioPlayer`**
with **`compact`** density (tighter pad, 28px wave, sm orb — not chat height), not
native `<audio>` or a plain play button. Head: **`Music|SFX · title`** left, compact
**Buy** pill (`ShoppingBag` + TTD price, ~22px) right — first click → **Confirm**
(same pill, no modal); second click purchases and jumps to **Your files → Purchased**
(no success toast / asset tab). **Owned** cards drag onto the timeline like files.
**No** download count. **Seller list flow:** workspace tab
`listAsset:<assetId>` (Details head tab + Submit — same chrome as create offer, not a
dialog) → Bunny copy into locked **My Public** (`systemKind: public_assets`,
`licenseKind: listed_network`) → `pending_review` → admin **Assets** tab listens /
approves (live) or rejects with reason (seller resubmits same file with a new name).
CN **Assets** pill: summary chips + listings table only — **no** “Your assets” section
bar / Balance button (credits stay in the workspace credit pill). **Once purchased:**
seller cannot unlist; they may **release to platform** (stays live; future profits 100%
platform). Unpaid storage: seller share of sales auto-covers `storageBilling` debt;
after **90 days** still owed, live seller-owned listings are removed and profit-banned.
Public / Purchased copies cannot be trashed. Platform/seller split **30/70** when
seller-owned; admin Payouts shows job and audio rows. Backend: `convex/assetStore.ts` +
`assetStoreActions.listOnNetwork` / `purchaseListing`. Never say “credits” in
buyer/seller copy (memory **715** / **769**).

---

## 7. Scrollbars

Hidden globally (`src/mos-css/scrollbars.css`): `scrollbar-width: none !important` +
`::-webkit-scrollbar { display: none }`. Do not re-introduce thin/visible scrollbars in chrome.

### Billing invoices

Invoice rows use a soft hairline divider between items (not cards). Status uses
`.studio-payment-status-pill` with a dot + tinted wash — **Paid** green, **Pending**
blue, review/amber for receipts, soft rose for failed (never harsh bordered red).

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
- **695** — File manager plates = mos greys at **L2 `--mos-plate`** (never cool slate/teal, never L3).
- **696** — Scrollbars hidden globally.
- **691** — Light admin: page lighter, plates darker; 16/12/8 spacing.
- **697** — Offers inputs keep raised fill; white/borderless rejected.
- **703** — Public routes reuse mos tokens; `public-offers.css` mirrors admin billing chrome.
- **807** — Landing auth embeds in content; dark Sign in pill; Continue = flat dark (not 3D green).
- Button/chip heights — profile compact actions **28px** / chrome heads **32px** / form primaries 34–36px (`docs/DESIGN_SYSTEM.md` §5b).
- **668** (pinned) — Chrome + inline panel heads = `--cursor-head-h` 32px (DM New label, Offers steps, etc.); close 24px.
- **Preview load quality** — Video editor preview header center `CursorSelect` (40/60/80/100%, default **60%**), same plate greys as zoom controls. ≤60% loads 720 edit proxy; ≥80% prefers 1080 proxy. Also drives opened-image Bunny `signedReadUrl.quality`. Downloads / generation stay at 100%. Persisted `yatishara-studio-preview-load-quality`.
