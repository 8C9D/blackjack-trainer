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

const LANES = ['dist', 'serve'] as const;

const requested = process.env.E2E_SERVER ?? (process.env.CI ? 'dist' : 'serve');

// An unrecognised value used to mean "serve", because the decision was written as
// `=== 'dist'`. So `E2E_SERVER=Dist`, a trailing space, or a typo in the CI
// workflow selected the dev-server lane while the operator believed they were
// testing the production bundle — R0-4's symptom (a suite green against a server
// it never meant to test) reached through the very variable the lane keys on.
// Rejecting the value is the only reading that cannot be silently wrong.
if (!(LANES as readonly string[]).includes(requested)) {
  throw new Error(
    `E2E_SERVER must be one of ${LANES.map((l) => `'${l}'`).join(' | ')}, got '${requested}'. ` +
      `Unset it to take the default ('dist' under CI, otherwise 'serve').`,
  );
}

/** True when the suite runs against the built bundle via `tools/serve-dist.mjs`. */
export const SERVES_DIST = requested === 'dist';
