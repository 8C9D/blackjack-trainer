# License & Attribution Audit

**Date:** 2026-06-02
**Scope:** Point-in-time audit of the repository's current licensing and
asset-attribution state. The goal is to document what exists so the project
can make an informed licensing decision later. **This report does not change
any license, and it makes no final licensing choice.** It is an engineering
assessment, not legal advice; confirm any distribution decision with the
upstream asset license and, if needed, legal counsel.

---

## TL;DR

- **App code has no declared license.** There is no top-level `LICENSE` file
  and no `license` field in `package.json`. The package is marked
  `"private": true`, version `0.0.0`.
- **Card image assets are licensed (LGPL 3.0)** and their notices are present,
  committed, and shipped in the production build.
- Net effect today: the *bundled card art* is properly attributed, but the
  *project's own code* is in an undeclared state ("all rights reserved" by
  default under copyright law, but not explicitly documented).

---

## 1. App code license status

| Question | Finding |
|---|---|
| Does the app code have a declared license? | **No.** No license is declared for the project's own source. |
| Does `package.json` have a `license` field? | **No.** See `package.json` — keys are `name`, `version` (`0.0.0`), `scripts`, `private`, `packageManager`, `engines`, `dependencies`, `devDependencies`. No `license`. |
| Is there a top-level `LICENSE` file? | **No.** No `LICENSE`, `LICENSE.md`, `COPYING`, `AUTHORS`, or `NOTICE` exists at the repo root (`git ls-files` shows license/attribution files only under `public/cards/`). |
| Is the package private? | **Yes.** `"private": true` in `package.json` (prevents accidental `npm publish`; it is *not* a copyright license). |

**Interpretation:** With no explicit license, the project's first-party code
defaults to standard copyright — i.e., effectively "all rights reserved" — but
this is implicit and undocumented. That is fine for a private project, but it
should be made explicit if the repo is ever shared or open-sourced.

> **Post-audit update:** Following this audit, `README.md` gained a
> "License and attribution" section that makes the app-code status explicit:
> **no open-source license** and **all rights reserved** unless a top-level
> `LICENSE` is added later, with the card-art notices called out as separately
> licensed. This documents the *current* state only; it does **not** decide the
> future licensing question, which remains open (see §5).

---

## 2. Card asset attribution status

### What ships

- `public/cards/` contains **53 SVG images** (52 playing cards + `BLUE_BACK.svg`).
- Alongside the SVGs, **five upstream text files are committed and tracked**:
  - `AUTHORS.txt` — Chris Aguilar, `webmaster@totalnonsense.com`,
    `http://code.google.com/p/vectorized-playing-cards/` ("Vector Playing Card Library 1.3").
  - `COPYING.txt` — full **GNU GPL v3** text.
  - `COPYING.LESSER.txt` — full **GNU LGPL v3** text.
  - `CHANGELOG.txt`, `NEWS.txt` — upstream version history.

### Provenance chain

Per `README.md` ("License and attribution" section) and the upstream files, the
chain is:

> **Chris Aguilar — Vector Playing Card Library 1.3** (LGPL)
> → packaged by **[richardschneider/cardsJS](https://github.com/richardschneider/cardsJS)**
> → vendored into `public/cards/` in this repo.

### License confirmation

The card art is **LGPL 3.0**, corroborated three ways:

1. `public/cards/COPYING.LESSER.txt` (LGPL v3) + `COPYING.txt` (GPL v3, which
   the LGPL incorporates by reference).
2. Embedded RDF/Dublin Core metadata inside the court-card SVGs (e.g.
   `public/cards/JC.svg`): `<dc:title>Chris Aguilar</dc:title>` and
   `<dc:rights><dc:title>LGPL 3.0</dc:title></dc:rights>`.
3. `README.md` explicitly documents the LGPL attribution.

### Distribution reachability

`angular.json` configures the asset root as `public/` with glob `**/*`, so the
entire `public/cards/` tree — **including the `.txt` license/attribution
files** — is copied into `dist/` and served as static files (e.g. at
`/cards/COPYING.txt`). The notices therefore travel with the production bundle,
not just the source tree.

---

## 3. Obligations & cautions likely applicable to the card SVGs

> Framed as "likely" because the LGPL was written for software libraries, and
> mapping its "Library / Application / Combined Work" concepts onto static SVG
> artwork is an imperfect fit. The points below describe the apparent posture;
> they are not a legal opinion.

**Obligations that appear to apply — and currently appear satisfied:**

- **Preserve the author/copyright notice.** `AUTHORS.txt` (Chris Aguilar) is
  committed and shipped. ✓
- **Include the license texts.** `COPYING.txt` (GPL v3) and
  `COPYING.LESSER.txt` (LGPL v3) are committed and shipped. ✓
- **Give notice that the work is used and is LGPL-covered.** Covered by the
  README attribution section and the embedded `dc:rights` SVG metadata. ✓

**Why bundling LGPL art does *not* force the app code to be LGPL:**

- The SVGs are used **verbatim and unmodified**, served as standalone static
  files, and are **not** compiled, inlined, or transformed into the app's JS
  bundle. The artwork (the "Library") stays separate and replaceable.
- The LGPL is specifically designed so that an "Application" that merely *uses*
  the Library can be conveyed under terms of the project's choice, provided the
  notices ship and a user could substitute a modified version of the Library.
  Serving the SVGs as discrete files preserves that substitutability.
- **Consequence:** the project's own code can be proprietary *or* permissively
  licensed (e.g. MIT) **without** the LGPL "infecting" it — as long as the card
  asset notices remain in place.

**Cautions to keep in mind:**

- **Don't strip the notices.** If the assets are ever re-bundled, optimized, or
  moved, the `AUTHORS.txt` / `COPYING*.txt` files (and ideally the embedded SVG
  metadata) must remain shipped and reachable wherever the app is distributed.
- **Modifying the SVGs raises the bar.** If the project edits the card artwork,
  those modifications remain LGPL and would need to be conveyable under LGPL
  (i.e., the editable/source SVG made available). Today the assets are unmodified.
- **"Distribution" is the trigger.** Obligations bite when the bundle is
  conveyed — public hosting or shipping a build — not during local development.
  The notices ship in `dist/` today, but they are **not surfaced in the UI**; a
  public deployment may want an in-app credits/attribution link in addition to
  the static `/cards/*.txt` files.

---

## 4. Known vs. unknown

**Known:**

- Card art license: **LGPL 3.0**, attributed to Chris Aguilar via cardsJS.
- License/attribution notices: present, git-tracked, and shipped in the build.
- App code: **no declared license**, `package.json` has **no `license` field**,
  **no top-level `LICENSE`**, package is `private: true`, version `0.0.0`.

**Unknown / not decided (out of scope for this audit):**

- The **intended license for the project's own code** (engines, charts as
  encoded, UI components).
- Whether the project intends to **go public / be redistributed** at all.
- **Strategy & deviation chart data provenance.** `README.md` and the
  `src/app/data/*.ts` files attribute the H17/S17 basic-strategy and Hi-Lo
  deviation charts to
  [Blackjack Apprenticeship](https://www.blackjackapprenticeship.com/). These
  are transcribed as static data, not scraped at runtime. Whether such chart
  *data* is copyrightable (facts/strategy tables often are not) is a **separate
  question** from the card-art license and is **not resolved here** — flagged so
  it isn't overlooked in any public-release decision.
- **Provenance of `public/favicon.ico` and `public/manifest.webmanifest`
  icons** — not assessed; they appear to be project/framework defaults but this
  is unconfirmed.

---

## 5. Recommended next options (no choice made here)

These are presented as options for a later, deliberate decision — this report
intentionally does **not** pick one.

1. **Keep app code private / all-rights-reserved, documented clearly.**
   Keep `private: true`, and add an explicit short statement (in `README.md` or
   a `NOTICE`) that the first-party code is proprietary / all rights reserved.
   Lowest effort; appropriate if the project stays private. The card asset
   notices remain as-is.

2. **Add an open-source license for the app code (e.g. MIT) while preserving
   the card asset notices.**
   Add a top-level `LICENSE` and a `package.json` `license` field covering the
   project's *own* code, and clarify that the bundled card art under
   `public/cards/` is **not** covered by that license but remains **LGPL 3.0**
   (notices retained). Make the scope split explicit so the two licenses don't
   get conflated.

3. **Consult the original card asset source/license before any public reuse or
   distribution decision.**
   Re-verify the upstream terms (cardsJS / Vector Playing Card Library 1.3,
   LGPL 3.0) and confirm the project's intended distribution satisfies them
   (notices shipped + assets replaceable). Decide whether LGPL-on-artwork
   imposes anything the project is uncomfortable with, and consider an
   alternative public-domain/CC0 card set if a cleaner posture is preferred.

**Optional, complementary to any of the above:**

4. **Surface attribution in the UI** (a small "Credits" / "Card art" link) if
   the app is ever deployed publicly, in addition to the static
   `/cards/*.txt` notices that already ship.

---

## Appendix — files inspected

- `package.json` — no `license` field; `private: true`.
- `README.md` — "License and attribution" section documents the LGPL chain and
  now explicitly states the app code has no open-source license (all rights
  reserved unless a top-level license is added later).
- `.gitignore` — no licensing relevance (ignores build output, `node_modules`,
  IDE/local files, `.claude/`).
- `public/` — `favicon.ico`, `manifest.webmanifest`, `cards/`.
- `public/cards/` — 53 SVGs + `AUTHORS.txt`, `COPYING.txt`,
  `COPYING.LESSER.txt`, `CHANGELOG.txt`, `NEWS.txt`.
- Repo root — confirmed **no** `LICENSE` / `COPYING` / `AUTHORS` / `NOTICE`.
- `angular.json` — `public/` is the served asset root (notices ship in `dist/`).
- `docs/security-sanity-check.md` — no substantive licensing content (one
  incidental mention of license-text false positives in scanning).
</content>
</invoke>
