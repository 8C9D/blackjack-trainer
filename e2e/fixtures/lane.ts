/* Which server backs the E2E run, decided once.
 *
 * `playwright.config.ts` reads this to choose what to launch; a spec that is
 * only meaningful against one lane reads it to decide whether it applies. Both
 * have to agree, and the way to guarantee that is for neither to re-derive it.
 *
 * The alternative — a spec inferring its lane from runtime state — is what N7
 * was: `offline.e2e.ts` excused itself when no service worker took control,
 * which is indistinguishable from the production bundle having shipped without
 * one. A suite must not stand down on the evidence it exists to report. */

const requested = process.env.E2E_SERVER ?? (process.env.CI ? 'dist' : 'serve');

/** True when the suite runs against the built bundle via `tools/serve-dist.mjs`. */
export const SERVES_DIST = requested === 'dist';
