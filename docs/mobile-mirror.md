# Mobile Mirror (v1)

A mobile-first, phone-friendly presentation of the **existing** Blackjack
Trainer. This is a _mirror_, not a fork: same app, same routes, same trainers,
same decision/counting/deviation engines, and the same `localStorage` stats.
The only changes are layout, navigation, and PWA-ready metadata — implemented
with responsive CSS, **no duplicated trainer logic**.

## What was implemented

1. **Responsive navigation (`src/app/app.ts`, `src/app/app.scss`)**
   - The desktop **top nav** is unchanged on wide screens (`Basic Strategy`,
     `Card Counting`, `Deviations`).
   - On phones (`max-width: 600px`) it is replaced by a fixed **bottom tab
     bar** with short labels (`Strategy`, `Count`, `Deviations`).
   - Both navs are rendered from one shared `links` array, so routes stay in
     one place. Only one nav is ever visible (the other is `display: none`, so
     it is also removed from the accessibility tree).
   - The active route is shown with a brighter label, a filled background, and
     a top accent border on the active tab.
   - The router outlet is wrapped in `<main class="app-main">`, which gets
     `padding-bottom` on phones so trainer content (stats / feedback) always
     scrolls clear of the fixed tab bar — the nav never covers controls.

2. **PWA-ready basics (`src/index.html`, `public/manifest.webmanifest`)**
   - `viewport` now includes `viewport-fit=cover` so the layout can use
     `env(safe-area-inset-*)` under notches and the iOS home indicator. Pinch
     zoom is intentionally left enabled (accessibility).
   - Added `theme-color`, `color-scheme: dark`, `description`, and the iOS
     `apple-mobile-web-app-*` / `mobile-web-app-capable` add-to-home-screen
     hints.
   - Added a minimal `manifest.webmanifest` (name, theme/background color,
     `display: standalone`, icons). It is served as a static asset — no service
     worker, no network calls.

3. **Global mobile safety (`src/styles.scss`)**
   - `--mobile-nav-height` custom property shared by the bottom nav and the
     content padding (single source of truth for the bar height).
   - `-webkit-text-size-adjust: 100%` (no orientation-change text inflation),
     `-webkit-tap-highlight-color: transparent` (use components' own `:active`
     states), and `overflow-x: hidden` as a horizontal-scroll guard.
   - `:host` on the app shell uses `min-height: 100dvh` (with a `100vh`
     fallback) to avoid the mobile-browser "100vh is too tall" gap.

4. **Per-trainer layout polish** — all responsive, scoped to each component's
   own SCSS at the `max-width: 600px` breakpoint:
   - **Action buttons** (shared by Basic Strategy + Deviations): switch from
     wrap-flex to an even **3-column grid** with ~48px min-height targets; the
     `[H]/[S]/…` keyboard hints are hidden on touch (shortcuts still work with a
     hardware keyboard).
   - **Stats panel** (shared): cells become a 2-column grid; **Reset** becomes a
     full-width, taller button.
   - **Rule controls** (shared) & **Deviation settings**: groups stack
     full-width; radio/checkbox rows get taller tap areas.
   - **Counting settings**: fields stack full-width with ~44px-tall inputs.
   - **Count answer form** & **count feedback**: full-width input / Submit /
     Run-again / breakdown-toggle with larger targets; touch-irrelevant hints
     hidden.
   - **Feedback shell** (shared): full-width "Deal next hand" button.
   - **Number inputs** (counting fields, manual true count) use ≥16px font on
     phones so iOS Safari does not auto-zoom on focus. `inputmode="numeric"`
     was already present on the numeric inputs and is preserved.

## Routes / trainers covered

All existing routes are mirrored — **routes are unchanged**:

| Route             | Trainer(s)                             | Mobile coverage                                                                                                         |
| ----------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `/basic-strategy` | Basic Strategy                         | hand/dealer table, action grid, rule toggles, feedback, stats                                                           |
| `/card-counting`  | Hi-Lo Running Count + Hi-Lo True Count | mode selector, settings, card stream, numeric answer, feedback + breakdown, stats                                       |
| `/deviations`     | Hi-Lo Deviations                       | settings (rule set, DAS/LS, practice mode, TC source), scenario table, true-count display, action grid, feedback, stats |

## Mobile UX decisions

- **Bottom tabs over a hamburger.** Thumb-reachable, always visible, and the
  app only has three destinations — a tab bar fits perfectly and makes the
  active trainer obvious.
- **Single `600px` breakpoint.** Matches the breakpoint the app already used in
  every component, so desktop behavior is untouched above it and there is one
  consistent phone boundary.
- **Two nav elements, one link source.** Simpler and more accessible than
  CSS-swapping labels inside one element (avoids duplicated/garbled text in the
  accessibility tree); duplication is avoided by generating both from `links`.
- **Hide keyboard hints on touch.** The `[Enter]` / `[H]` hints are desktop
  affordances; hiding them on phones declutters without removing the
  shortcuts.
- **Text-only tabs (no icons).** The existing design language is icon-free and
  text-led; matching it keeps the mirror feeling intentional rather than
  bolted-on. (Icons are listed as a future improvement.)
- **No engine or logic changes.** Strategy, counting, true-count truncation,
  deviation evaluation, and stats are byte-for-byte unchanged. No bug was found
  that required touching them.

## What was intentionally NOT done

- **No native app / Capacitor / Cordova.** This is the same Angular SPA made
  responsive — not a packaged native build. No native shell, plugins, or app
  store tooling were added.
- **No service worker / offline mode.** Per the task's low-risk constraint, no
  `@angular/pwa` / `@angular/service-worker` was installed and no SW is
  registered. The app is therefore **not** offline-capable yet. The manifest
  makes it installable-ish, but a production-grade installable PWA still needs
  proper icons and (optionally) a service worker (see below).
- **No new runtime dependencies.** `package.json` is unchanged. The manifest is
  a plain static file.
- **No dedicated PWA icons.** The manifest reuses the existing `favicon.ico`.
  Maskable 192×192 / 512×512 PNG icons were not generated (no image tooling in
  scope), so some browsers will not offer "Install".
- **No backend / network layer.** Still frontend-only; `localStorage` remains
  the only persistence.
- **No blanket reformatting.** Changes are targeted edits to component SCSS,
  `app.*`, `index.html`, and `styles.scss`. The wide chart/data files were not
  touched.

## Manual testing checklist (phone-width)

Run `npm start` and open DevTools device mode (e.g. iPhone SE 375×667, Pixel
360×800) or a real phone. Verify:

**Navigation**

- [ ] At ≤600px the top nav is hidden and a bottom tab bar is shown.
- [ ] At >600px the original top nav is shown and the bottom bar is hidden.
- [ ] Tapping `Strategy` / `Count` / `Deviations` routes correctly and the
      active tab is visually highlighted.
- [ ] The bottom bar never covers the **Reset stats** button or the feedback /
      "Deal next hand" button — you can scroll the last content above the bar.
- [ ] On a notched device, the bar sits above the home indicator (safe area).

**Basic Strategy (`/basic-strategy`)**

- [ ] Dealer up-card + face-down and the two player cards are clear.
- [ ] The six action buttons form a 3×2 grid and are comfortably tappable.
- [ ] Rule toggles (S17/H17, DAS, Late Surrender) stack and are easy to tap.
- [ ] Feedback (verdict + hand/correct action/why) and stats are readable.

**Card Counting (`/card-counting`)**

- [ ] Running-count vs true-count mode selector is clear.
- [ ] Settings fields stack full-width; focusing a number field does **not**
      zoom the page (iOS).
- [ ] In true-count mode the "Decks remaining" select appears and is usable.
- [ ] Card stream + "Card N of M" progress is legible.
- [ ] The numeric keypad appears for the answer field; Submit is full-width.
- [ ] "Show card-by-card breakdown" expands and the grid fits the width.

**Deviations (`/deviations`)**

- [ ] Settings (rule set, DAS/LS, practice mode, TC source) stack and are
      tappable; the "Manual true count" input does not zoom on focus.
- [ ] Scenario table, "Practice true count" value, and the action grid work.
- [ ] Feedback (incl. matched-rule line) is readable; deviation logic and the
      true-count evaluation behave exactly as on desktop.

**General**

- [ ] No unexpected horizontal scrolling on any page.
- [ ] Portrait and landscape both usable.

## Post-implementation QA (v1 review)

Reviewed commit `f2ee290` across all three routes (`/basic-strategy`,
`/card-counting`, `/deviations`) at 320 / 375 / 390 / 414 / 430 / 768 px. The
pass was done at the **responsive-CSS + DOM level** (each `max-width: 600px`
block checked against its component's template) plus automated validation and a
served-output asset check — not on-device pixel testing.

**Verified**

- **Dual nav** — only one nav is ever rendered: at ≤600px `.nav--top` is
  `display: none` and the fixed `.nav--bottom` tab bar shows; above it, the
  reverse. Active-tab styling (`--active`) and per-tab `aria-label`s are correct,
  and both navs are generated from the one shared `links` array.
- **Content clears the bar** — `.app-main`'s bottom padding
  (`--mobile-nav-height` + `env(safe-area-inset-bottom)`) equals the bar's own
  `min-height` + safe-area inset, so stats / Reset / "Deal next hand" are never
  covered.
- **No horizontal overflow (320–768px)** — card rows hold at most two 72px
  cards, the action grid is `repeat(3, 1fr)`, settings/rule controls stack
  full-width, and the count breakdown is `auto-fill minmax(110px, 1fr)` (two
  columns even at 320px). `overflow-x: hidden` is the backstop.
- **No iOS focus-zoom** — every focusable number input computes to ≥16px on
  phones (counting fields `1rem`, count answer `1.4rem`, manual true count
  bumped `0.95rem → 1rem` at the breakpoint); `inputmode="numeric"` preserved.
- **Touch targets** 40–48px across actions, buttons, and stacked controls.
- **Desktop unaffected** — every per-trainer change lives inside
  `@media (max-width: 600px)`; the new `<main class="app-main">` and
  `.nav--bottom` are `display: block` / `display: none` above the breakpoint.

**Validation**

- `CI=true npm test` → **393/393 passing** (17 files).
- `npm run build` → clean; `manifest.webmanifest`, `favicon.ico`, and all 58
  card SVGs emit under `dist/.../browser/` and serve with correct MIME types
  (`application/manifest+json`, `image/x-icon`, `image/svg+xml`).

**Known limitation (not changed in v1)**

- In iOS **standalone** mode (Add to Home Screen),
  `apple-mobile-web-app-status-bar-style: black-translucent` + `viewport-fit=cover`
  let the web view fill the screen, but nothing applies `env(safe-area-inset-top)`,
  so the page header can sit under the status bar / notch. Harmless in normal
  Safari (the top inset is 0 there). Best folded into the "real PWA install" work
  below rather than patched piecemeal.

## Future mobile improvements

- **Real PWA install** — add maskable 192/512 PNG icons and, if offline use is
  wanted, a carefully scoped service worker (`@angular/service-worker`) with a
  cache-first strategy for the static bundle + card SVGs. Apply
  `env(safe-area-inset-top)` padding at the same time so standalone-mode content
  clears the translucent status bar (see the QA known limitation above).
- **Tab-bar icons** — add small inline-SVG icons above each tab label.
- **Larger / swipeable card stream** — bigger flashed card and optional
  swipe-between-trainers gesture.
- **Haptics & transitions** — subtle tap feedback and route transitions on
  supported devices.
- **`@media (hover: none)`** — drop hover-only affordances on touch devices.
- **Landscape-specific tuning** — e.g. a side rail instead of the bottom bar in
  landscape on short viewports.
