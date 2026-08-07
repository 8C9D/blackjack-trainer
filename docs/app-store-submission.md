# App Store submission — prepared metadata & handoff

_Originally prepared by the `ios-app-roadmap-autopilot` for roadmap Slice 5.1; rewritten 2026-08-06 for the launch pass (checklist item A9) against the trimmed v1 app and the answered launch decisions._
_The process now lives in `LAUNCH-CHECKLIST.md` at the repo root: this page is the copy to paste, the owner lane there is the order to paste it in._

Positioning: an **educational strategy trainer with no real-money wagering** — this framing drives the description, the rating answers, and the review notes.

## App identity

| Field              | Value                                                                                                                                                                                                                         |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App name           | Blackjack Trainer                                                                                                                                                                                                             |
| Subtitle           | Basic strategy & card counting                                                                                                                                                                                                |
| Bundle ID (app)    | `com.arthurzhang.blackjacktrainer.app`                                                                                                                                                                                        |
| Apple Team         | `C3W798H8U8`                                                                                                                                                                                                                  |
| SKU                | `blackjack-trainer-ios` (suggested)                                                                                                                                                                                           |
| Primary category   | Education                                                                                                                                                                                                                     |
| Secondary category | Games › Card (optional)                                                                                                                                                                                                       |
| Version / Build    | 1.0 / 1 (`MARKETING_VERSION` / `CURRENT_PROJECT_VERSION`)                                                                                                                                                                     |
| Devices            | iPhone only (launch decision D1)                                                                                                                                                                                              |
| Price              | Paid — pick the tier in App Store Connect (launch decision D5). **Gate:** the Agreements, Tax, and Banking section must be completed and cleared before a paid app can be submitted, and that can take days — start it first. |

## Description

Two variants, per launch decision D2 (the iCloud capability is not provisioned for 1.0, so the shipped build syncs nothing).
**Use variant A now.** Variant B is the same text plus the sync claim, ready for the release after the owner provisions iCloud Key-Value Store (O2) and verifies it on two devices (O11).

### Variant A — without the iCloud claim (use for 1.0)

> Master blackjack basic strategy and card counting — no betting, no gambling,
> just practice.
>
> Blackjack Trainer is an educational trainer for the math behind the game. Drill
> the skills the pros separate out, each graded instantly against the correct
> play:
>
> • Basic Strategy — every hand vs. dealer upcard, with H17/S17, DAS, and
> late-surrender rules, straight from the chart you can open anytime.
> • Running Count — 58 counting systems, including unbalanced and fractional
> systems.
> • True Count — convert the running count using a live, depleting shoe and
> deck-estimation practice.
> • Deviations — the Hi-Lo index plays (and the insurance line) that adjust basic
> strategy by the count.
>
> Every answer is checked against an engine, with a clear explanation of the
> correct play. A daily goal, streaks, and adaptive weak-spot review keep the
> practice honest, and every stat stays on your device.
>
> No wagering. No real or virtual money. No chips. Just the strategy.

### Variant B — with the iCloud claim (only after O2 + O11)

Identical to variant A, except the stats sentence reads:

> Every answer is checked against an engine, with a clear explanation of the
> correct play. A daily goal, streaks, and adaptive weak-spot review keep the
> practice honest, and your stats sync across your devices with iCloud.

## Keywords (≤100 chars)

```
blackjack,basic strategy,card counting,trainer,hi-lo,true count,deviations,21,casino,practice
```

## Promotional text (≤170 chars)

> Practice blackjack basic strategy, card counting, true count, and Hi-Lo
> deviations — instantly graded, no wagering, with adaptive weak-spot review.

## Privacy — App Privacy nutrition labels

**Data Not Collected.** The app has no analytics, no accounts, no third-party SDKs, and makes no network requests of its own.
Per-trainer stats live in on-device `UserDefaults`; the iCloud KVS entitlement is declared but unprovisioned for 1.0, and even when later enabled it syncs only through the **user's own** iCloud — nothing reaches the developer.

- Answer **"No, we do not collect data from this app"** in the App Privacy section.
- A **privacy policy URL is still required** by App Store Connect even for data-not-collected apps; A10/A11 produced the hosted page (see `LAUNCH-CHECKLIST.md` for the URL).

## Age rating

> **Re-derived after the v1.0 scope trim (2026-08-06).** The earlier answer was
> written for a build whose showdown table played hands out against a persisted
> chip bankroll with bet sizing — a simulated-wagering surface. That surface is
> archived: the shipped app has **no chips, no bankroll, no bets, no payouts,
> and no hand ever plays out to a win/lose outcome**.

What the app now contains, as it bears on the questionnaire:

- Flashcard-style drills: a dealt blackjack hand (or a card stream) is shown,
  the user names the correct play or count, and the answer is graded. No round
  is settled, nothing is staked, and no currency — real or virtual — exists
  anywhere in the app.
- The subject matter is still casino blackjack and card counting: real card
  faces, dealer upcards, insurance decisions, and instruction aimed at
  advantage play at a real table.

Questionnaire items this ships against:

- **Simulated Gambling** is the one item in play, and it is a judgment call the
  owner must answer against Apple's current questionnaire wording: the app
  depicts casino blackjack and teaches gambling-adjacent skills, but simulates
  no wagering at all. Answer it honestly from the description above — do not
  copy the old "Yes" forward, and do not assume the trim guarantees a "None".
- Every other content category (violence, mature/suggestive, profanity, horror,
  contests, unrestricted web access, user-generated content): **None**.

Do not assume a specific resulting rating. If the honest answers still yield a
mature rating, accept it; budget one review round for the gambling/age-rating
angle either way, and expect App Review to weigh the card-counting instruction
independently of the questionnaire.

## Export compliance

`ITSAppUsesNonExemptEncryption = false` is **already set in the app's Info.plist** (via `INFOPLIST_KEY_ITSAppUsesNonExemptEncryption` in `ios/project.yml`), so App Store Connect will not prompt for export compliance on each upload.
The app uses only Apple-provided, exempt encryption; no custom crypto.

## Review notes (paste into App Review Information)

The part App Review must not be able to miss comes first:

> **There is no wagering in this app. No real or virtual currency, no chips, no
> bankroll, no bets, no payouts, and no hand is ever played out to a win or
> lose outcome.** It is an educational blackjack strategy trainer: it shows a
> dealt hand or a card stream and grades the single decision — the correct play
> or the correct count — like a flashcard, with the textbook explanation.
>
> The app teaches the published mathematics of blackjack (basic strategy
> charts, Hi-Lo card counting, index deviations) for study away from any table.
> A privacy manifest is included; the app collects no data, has no accounts, no
> third-party SDKs, and makes no network requests. No demo account is needed —
> every feature is reachable from the first launch.

## Licensing note

App code is **MIT**. The card artwork is the **Vector Playing Card Library 1.3** (Chris Aguilar), **LGPL 3.0**; its attribution and full license texts ship in-app on the Settings → Licenses screen.
No action needed beyond keeping that screen.

## Collateral status (2026-08-06)

- `ios/AppStore/screenshots-6.9/` — **current**: retaken from the trimmed app (A8), six 1320×2868 portrait shots, iPhone-only per D1.
- `ios/AppStore/privacy.html` and `support.html` — brought in line with the shipped app by A10; each carries exactly one owner placeholder (the support email).
- The step-by-step submission path (App Store Connect record, privacy answers, age rating, screenshots upload, TestFlight, review) is the **owner lane (O1–O13) in `LAUNCH-CHECKLIST.md`** — this page no longer duplicates it.

**The app is _not_ submitted or approved.** This document only prepares the text and flags.
