# iOS accessibility pass (A6) - 2026-08-06

The launch checklist called this the largest untested gap in the shipping app.
The standard matched is the web's `e2e/smoke/accessibility.e2e.ts`; the renders referenced below live in `review/a6-renders/` and were produced from the test target (window + `layer.render`) at Dynamic Type `accessibility5`, the largest setting.

## What was found and fixed

### 1. No spoken verdict anywhere (fixed)

The web drills carry an `sr-only` `role="status"` region that announces every grade; the iOS app had **zero** `AccessibilityNotification` posts, so under VoiceOver a drill graded silently - color and button position are the only feedback, and both announce as nothing.
Fixed: the two hand drills announce "Correct: Stand." / "Incorrect. Correct: Stand. <reason>" on every grade (`onChange` of the result in `BasicStrategyDrillView` / `DeviationsDrillView`), the counting flow announces the graded count with the expected and answered values (`CardCountingFlowView`), and the Done screen announces "Session complete. N of M hands today." on appear (`FlowDoneView`), since the drill swaps to it without moving focus.
This is what makes the timed drill loop usable end to end under VoiceOver: question (labelled hand and dealer groups) → actions (labelled buttons) → spoken verdict → next question.

### 2. Dynamic Type did nothing on most of the app (fixed)

Roughly seventy text sites used fixed `Font.system(size:)` calls, which do not scale with the user's text size at all - the "largest accessibility size without clipping" requirement was failing in the opposite way: nothing clipped because nothing grew.
Fixed: every fixed size moved to the nearest semantic text style (`11 → caption2`, `12 → caption`, `13 → footnote`, `14/15 → subheadline`, `16 → callout`, `23 → title2`), which keeps the design at standard sizes and scales at the accessibility ones.

### 3. Clipping and truncation at the accessibility sizes (fixed)

Rendering every screen at `accessibility5` after the font change surfaced these, all fixed and re-rendered:

- The goal ring's fixed 128 pt diameter clipped its own numbers; it now scales with the count's text style (`@ScaledMetric relativeTo: .title2`) - see `a5-home.png`, `a5-done.png`.
- Home's Continue card and trainer-card names truncated (`lineLimit(1)`); the texts now wrap, and the two trainer cards stack vertically at accessibility sizes (`AnyLayout`).
- "DEALER SHOWS" truncated beside the dealer card; it wraps now - `a5-basic-drill-pinned.png`.
- Home, the Done screen, and both hand drills outgrew the viewport with no way to reach the lower controls; each now scrolls at accessibility sizes only, keeping the fixed one-glance composition at standard sizes.
  (The counting flow already scrolled; Settings and the chart are scrolling surfaces by construction - `a5-settings.png`, `a5-chart-basic.png`.)

## What was verified and left alone

- **VoiceOver labels and traits.** Already solid: card faces are described ("Queen of hearts"), the action grid is a labelled container of labelled buttons, chart cells expose "<hand> vs <dealer>: <action>" with a "Drills this hand" hint, decorative glyphs are hidden, the goal ring / streak strip / progress bars collapse to single labelled elements, and the top bar's close control is "End session". Focus order follows the layout: advisory → stage → question → actions.
- **Reduce Motion.** The target contains no `withAnimation` and no `.animation` modifier anywhere (verified by grep): the correct-answer flash is an instant color state change and the auto-advance is a timer, so there is no motion to reduce on either - the two surfaces the checklist named are honoured vacuously. The web behaves the same way (its reduced-motion handling only drops CSS transition durations).
- **Contrast parity with the web tokens.** Every `Theme` color was compared hex-for-hex against `src/styles.scss` (both light and dark values: ground/surface/raised/hairline/ink/ink-strong/muted/accent/accent-ink/on-accent/good/bad) - identical, so the WCAG AA passes the web's axe-based e2e proves carry over by construction.
- **Form controls.** SwiftUI pickers, steppers and toggles in Settings take their accessible names from their labels natively; the counting answer field's label is its "Count" prompt.

## Verification

- iOS suite green at 335 after all changes; swiftformat and swiftlint clean.
- Renders at `accessibility5` for Home, both hand drills (including the pinned three-card hard 20), Settings, the chart, Progress, the counting flow, and the Done screen are committed beside this report.
- Announcements are wired at the view layer, which the unit target cannot execute; the on-device VoiceOver walk is O8 step 11 in the launch checklist.
