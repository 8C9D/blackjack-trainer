# Verification artifacts

Recorded command output for each work-list finding this run claims to have resolved.
A finding may not be marked RESOLVED in `PROD-READINESS.md` without an entry here.
A green test report is not evidence about the committed code; what follows is the changed
path being exercised directly.

---

## B1 - `tools/serve-dist.mjs` exits the process on a malformed request URL

Both runs used the same command against the same production bundle, one at the parent
commit and one at the fix, on ports 4321 and 4401 respectively.

### Before (at `1413989`, the fix's parent)

```
$ PORT=4321 node tools/serve-dist.mjs &
$ curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4321/index.html
200
$ curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4321/%.js
000
$ curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4321/index.html
000          <- SERVER DEAD

server stderr:
file:///Users/arthurzhang/dev/blackjack-trainer/tools/serve-dist.mjs:32
  const path = normalize(decodeURIComponent(new URL(req.url, `http://${HOST}`).pathname));
                         ^
URIError: URI malformed
    at decodeURIComponent (<anonymous>)
    at Server.<anonymous> (file:///.../tools/serve-dist.mjs:32:26)
Node.js v24.15.0

process exit code: 1
```

### After (at `7377dca`)

```
$ PORT=4401 node tools/serve-dist.mjs &
index.html          -> 200
/%.js  (the killer) -> 404
/%zz.css            -> 404
index.html AGAIN    -> 200
SPA route /chart    -> 200
missing asset       -> 404
traversal encoded   -> 404
traversal literal   -> 404
manifest            -> 200
--- process alive? ---
YES, pid 22666 alive

server stderr:
serving /Users/arthurzhang/dev/blackjack-trainer/dist/blackjack-trainer/browser at http://127.0.0.1:4401
```

The request that killed the process now returns 404, the process survives it, and the
behaviours around the change are unmoved: the SPA fallback still serves the shell on an
extensionless path, a genuinely missing asset still 404s rather than falling back to the
shell, both traversal probes still 404, and valid assets still serve.

Gates at this commit, all matching `BASELINE.md`: build 0 (same single budget warning),
lint 0, 1526 unit tests, E2E 111 passed with `lsof -nP -iTCP:4200 -sTCP:LISTEN` confirmed
empty beforehand (the precondition finding R0-4 exists to remove).

**Known limitation, recorded rather than papered over:** no automated gate exercises this
path. `E2E_SERVER=dist npm run e2e` reports `111 passed` against the crashing server and
against the fixed one alike, because no test in `e2e/` requests a malformed URL. The
evidence above is a manual reproduction, and REVIEW-pass2 (F2-3) independently reproduced
both sides before accepting it.

---

## W2 - an unrecoverable service worker was never surfaced

**Correction.** The first version of this entry claimed the unrecoverable state "cannot be
produced in a real browser by any tooling in this repository" and marked W2 partly
UNVERIFIED on that basis. That was wrong, and REVIEW-pass4 (F4-1) was right to strike it:
the claim was inferred from the unit-test harness and generalised without being tested.
The state is inducible with nothing but Node and this repository's own Playwright, entirely
on 127.0.0.1, and the section below now records that run instead. W2 is verified end to end.

### Inducing the real state (the primary artifact)

`ngsw-worker.js` raises `SwUnrecoverableStateError` on exactly one condition: a hashed asset
that is missing from its cache **and** answered 404 by the origin. That is an ordinary
redeploy - the old chunk is gone from the server and evicted from the cache. Reproduced
against the production bundle from `npm run build`, served by a throwaway copy of
`serve-dist` that can be told to 404 one path:

```
controlled: true
cache victim: {"cacheName":"ngsw:/:acd03d05...:assets:app:cache","entries":25,
               "target":"/chunk--v5M_Gm0.js","deleted":true}
page fetch of victim: 404
BANNER: {
 "aria": "App needs reloading",
 "copyRole": "alert",
 "copyLive": "assertive",
 "text": "Reload to repair this app Some of its stored files are missing, so parts of it
          will not work. Reloading fetches a fresh copy. Your practice is saved separately
          and is not affected. Reload",
 "buttons": ["Reload"]
}
```

Before this change the same run produced no banner at all: the event had no subscriber.

The copy makes one promise, so the promise was tested. After clicking the single Reload
button:

```
AFTER RELOAD:          {"hasBanner":false,"body":"Blackjack TrainerMonday evening0/20hands today..."}
LAZY ROUTE AFTER RELOAD: {"hasBanner":false,"body":"✕ Basic Strategy0/20escDealer shows Hard 17 vs A..."}
```

The app is repaired, the banner is gone, and a lazy-loaded drill route - the class of file
that broke - loads again. No reload loop, no blank page. The screen-reader semantics the
remediation added (`role="alert"`, `aria-live="assertive"`) are confirmed on the real
rendered element, not only in the test bed.

### The unit tests are not vacuous

The signal and the template branch were left in place and **only** the
`swUpdate.unrecoverable.subscribe(...)` block was deleted, isolating the behavioural
change from the compile-time one:

```
$ npm test
     × asks for a reload, with no way to dismiss it, when the worker breaks 7ms
     × reports a worker that can no longer serve its version 13ms
     × will not let a broken worker be dismissed 2ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯
 Test Files  2 failed | 63 passed (65)
      Tests  3 failed | 1529 passed (1532)

exit 1
```

Restoring the subscription returns the suite to green. Three of the seven new tests fail on
the behaviour alone, at both the service level and the rendered-shell level; the other four
pin the states that must _not_ change (an available update must not report recovery, a
disabled worker must report nothing, reload still works, and a reload that has already been
refused keeps saying so when the worker then breaks).

That last one was added in remediation: REVIEW-pass4 (F4-3) showed that
`updateFailed.set(false)` inside the new handler could be deleted with the whole suite still
green, so nothing pinned it - and on inspection the line was wrong anyway. It cleared "Could
not reload. Please try again." off a banner whose only button had just failed. The line is
gone and the behaviour is now asserted. The counts above predate that change, which is why
the totals there read 1532 rather than the current 1533.

### With the fix

```
$ npm test
 Test Files  65 passed (65)
      Tests  1533 passed (1533)      <- 1526 at BASELINE, +7

$ npm run build        exit 0, same single budget warning as BASELINE
$ npm run lint         exit 0
$ E2E_SERVER=dist npm run e2e   111 passed (port 4200 confirmed free first)
```

### Rendering

The recovery state reuses the existing banner's DOM and classes exactly - `.update`,
`.update__copy`, `.update__reload` - and the new shell test now asserts each of them,
including `.update__copy`, which the first version of this entry claimed and did not do
(REVIEW-pass4 F4-4). `src/app/app.scss:81-84` styles `.update__actions` as a plain flex row
with a gap and no child-count or `:nth-child` rule, and `src/app/app.scss:87` styles buttons
via the descendant selector `.update button`, so a single button lays out under the existing
rules. No new CSS was added, and the induced-state run above confirms the rendered result.

### The cost of dropping "Later", recorded as a trade rather than a free win

REVIEW-pass4 (F4-2) measured that on a 375x700 phone the banner covers the drill's six
action controls and the page does not scroll. That overlap is pre-existing - the
update-ready banner covers the same controls - but in the recovery state there is now no
"Later" to press, so the only exit is the reload.

That is the intended trade and it is worth stating plainly: an app whose worker cannot serve
its own files is broken, and a dismiss button would buy back the six controls by hiding the
only explanation the trainee gets. The reload is verified above to actually repair the app,
and no practice is lost by taking it - `localStorage` is untouched by the worker's caches.
The pre-existing half of the overlap is recorded for the next run as N4.
