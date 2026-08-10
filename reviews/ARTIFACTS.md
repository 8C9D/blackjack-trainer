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
