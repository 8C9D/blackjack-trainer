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

---

## W1 - the PWA manifest sent every installed copy to the wrong site

The claim is about what a browser resolves, so the artifact is a browser resolving it.
Chrome was asked directly, via CDP `Page.getAppManifest`, which returns the manifest the
browser would use to install and launch the app. Both runs use a build made exactly as
`.github/workflows/pages.yml:37` makes it (`npm run build -- --base-href /blackjack-trainer/`)
served under that same path prefix.

### Before

```
manifest URL       : http://127.0.0.1:4340/blackjack-trainer/manifest.webmanifest
raw start_url      : "/"
raw scope          : "/"
browser start_url  : http://127.0.0.1:4340/            <- the site root, not the app
browser scope      : http://127.0.0.1:4340/
```

### After

```
manifest URL       : http://127.0.0.1:4341/blackjack-trainer/manifest.webmanifest
raw start_url      : "./"
raw scope          : "./"
browser start_url  : http://127.0.0.1:4341/blackjack-trainer/     <- the app
browser scope      : http://127.0.0.1:4341/blackjack-trainer/
```

On the live host that "site root" is `https://8c9d.github.io/`, which is a **different
origin path from the app** and is not under this repository's control. Whether anything is
published there is not established by anything in this tree - `backup.model.ts:10-13`
establishes only that the origin is shared - so the accurate statement is that the installed
app launched somewhere other than itself: another project's page if one is published at the
root, a 404 if not. Either way it was not the trainer. (An earlier version of this paragraph
asserted "someone else's site" as fact; REVIEW-pass6 F6-3 was right to strike it.)

### The root deploy is unaffected

The same check against a default `npm run build` served at the origin root:

```
ROOT DEPLOY manifest URL     : http://127.0.0.1:4342/manifest.webmanifest
ROOT DEPLOY browser start_url: http://127.0.0.1:4342/
ROOT DEPLOY browser scope    : http://127.0.0.1:4342/
```

Identical to the old behaviour, which is why the change is safe for local dev, the
`serve-dist` E2E server, and any future root-hosted deploy.

### The new gate is not vacuous

Review 0 required the E2E assertion to be on the **raw** strings, because this suite serves
at the origin root where `/` and `./` resolve alike - a resolved assertion would pass either
way. With the old manifest restored and everything else unchanged:

```
✘ 12 [chromium] › e2e/smoke/navigation.e2e.ts:114:7 › the PWA manifest is linked and carries installable icons
    Expected: "./"
    Received: "/"
    > 126 |     expect(manifest.start_url).toBe('./');
  1 failed
  12 passed
```

### The consequence this change has, stated rather than left to be found

The manifest declares no `id`, so a PWA's application identity falls back to its
`start_url`. Changing `start_url` therefore changes the app's computed identity on the Pages
deploy. Confirmed with the same CDP call, reading `id` on both builds:

```
BEFORE:  raw id: undefined   computed id: http://127.0.0.1:4350/
AFTER:   raw id: undefined   computed id: http://127.0.0.1:4351/blackjack-trainer/
```

A browser that had already installed the app under the old manifest would treat the new one
as a **different app** - a second install beside the first, not an update to it.

The practical cost today is nil, which is why this is recorded rather than mitigated: Pages
has not been switched on (owner action O4 is still open, `LAUNCH-CHECKLIST.md:59`), so no
installed copy carrying the old identity exists. Pinning the identity would mean adding an
`id` key to the manifest - a new config key, which this run's scope forbids - and it would
pin it to the broken value. Raised by REVIEW-pass6 (F6-1) and reproduced here before being
written down. If the app is ever published _before_ this fix ships, the next run needs to
weigh an explicit `id` against a one-off duplicate install.

### Gates

All nine BASELINE gates were re-run with the fix in place, not only the four the first
version of this entry listed (REVIEW-pass6 F6-2): lint 0; build 0 with the same single
inherited budget warning; 1533 unit tests; coverage 96.11 / 93.23 / 93.28 / 97.97, every
floor met; E2E 111 passed with port 4200 confirmed free first; `export:fixtures` +
`git diff --exit-code -- ios/Fixtures` both 0; `swiftformat --lint` 0/105; `swiftlint`
clean; `xcodebuild build test` `** TEST SUCCEEDED **`, 335 tests.

---

## R0-4 - the `dist` E2E lane could pass green without running the production bundle

The failure mode is a gate reporting on an artifact it never loaded, so the artifact is that
exact scenario, staged deliberately: `ng serve` (the Vite dev server) holding 127.0.0.1:4200
before the `dist` lane is invoked.

The two servers are distinguishable, which is what makes the run readable at all: the dev
server's HTML contains `/@vite/client` (1 occurrence, measured) and the production bundle's
`index.html` contains it 0 times.

### Before

```
ng serve up; is it the dev server? 1 vite marker(s)

$ E2E_SERVER=dist npx playwright test e2e/smoke/navigation.e2e.ts
  13 passed (3.8s)
EXIT=0
```

Green, and wrong. Every `page.goto` resolves against `baseURL = http://127.0.0.1:4200`,
which for the whole run was the dev server - so the lane named `dist` tested the dev server
and never loaded a built file. Nothing in the output says so.

### After

```
$ E2E_SERVER=dist npx playwright test e2e/smoke/navigation.e2e.ts
Error: http://127.0.0.1:4200 is already used, make sure that nothing is running on the
port/url or set reuseExistingServer:true in config.webServer.
EXIT=1
```

The lane refuses to run rather than run against the wrong thing, and the message names the
port.

### The two paths that had to keep working

```
# serve lane still attaches to a running ng serve (the developer convenience)
$ E2E_SERVER=serve npx playwright test e2e/smoke/navigation.e2e.ts
  13 passed (3.1s)                     EXIT=0

# dist lane with the port free: the full suite, unchanged
$ lsof -nP -iTCP:4200 -sTCP:LISTEN  ->  4200 FREE
$ E2E_SERVER=dist npm run e2e
  111 passed (33.5s)                   EXIT=0
```

CI is unaffected: `CI=true` already disabled reuse for both lanes.

### On auditability

R0-4 also observed that a past run cannot be audited, because Playwright does not pipe the
`webServer` stdout, so no log distinguishes the two servers. That is still true and was
deliberately not fixed by adding `stdout: 'pipe'` - it is a second change, and it is now
moot for the lane that mattered. With reuse disabled, the dist lane cannot attach to a
foreign server at all: if a dist run succeeded, Playwright started `serve-dist` itself.
That is a structural guarantee rather than a log line to read afterwards.

Gates: lint 0, build 0 (same single inherited budget warning), 1533 unit tests, E2E 111.
