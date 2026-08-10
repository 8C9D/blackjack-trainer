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

An unrecoverable worker cannot be induced from a test browser, so the artifact is the
changed path driven directly, plus proof that the new tests are not vacuous.

### The new tests fail when only the subscription is removed

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

Restoring the subscription returns the suite to `1532 passed`. Three of the six new tests
fail on the behaviour alone, at both the service level and the rendered-shell level; the
other three pin the states that must _not_ change (an available update must not report
recovery, a disabled worker must report nothing, and reload still works).

### With the fix

```
$ npm test
 Test Files  65 passed (65)
      Tests  1532 passed (1532)      <- 1526 at BASELINE, +6

$ npm run test:coverage
Statements   : 96.11% ( 5290/5504 )   floor 94
Branches     : 93.23% ( 2358/2529 )   floor 92
Functions    : 93.28% ( 917/983 )     floor 90
Lines        : 97.97% ( 4064/4148 )   floor 96

$ npm run build        exit 0, same single budget warning as BASELINE
$ npm run lint         exit 0
$ E2E_SERVER=dist npm run e2e   111 passed (port 4200 confirmed free first)
```

### Rendering

The recovery state reuses the existing banner's DOM and classes exactly - `.update`,
`.update__copy`, `.update__reload` - and the shell test asserts each of them. It differs
in two ways only: the copy, and the absence of `.update__later`.
`src/app/app.scss:81-84` styles `.update__actions` as a plain flex row with a gap and no
child-count or `:nth-child` rule, and `src/app/app.scss:87` styles buttons by class, so a
single button lays out under the existing rules with no style change. No new CSS was added.

**Known limitation, recorded rather than papered over:** the state cannot be produced in a
real browser by any tooling in this repository, so it is UNVERIFIED end-to-end against an
actual damaged service worker. What is verified is that the event now reaches the shell and
what the shell renders when it does.
