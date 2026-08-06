# App Store submission — prepared metadata & handoff (Slice 5.1)

_Prepared by the `ios-app-roadmap-autopilot`. This is the **automatable** part of
roadmap Slice 5.1: the metadata copy, privacy answers, age-rating answers, and the
export-compliance flag (already wired into the build). **Everything that requires
the App Store Connect web UI, a near-final build for screenshots, TestFlight, or
submission is a human/Apple action** — see [Human checklist](#human-checklist)._

Positioning follows decision **D7**: an **educational strategy trainer with no
real-money wagering** (drives the rating answers and review framing). See the
roadmap's _App Store specifics & review risk_.

## App identity

| Field              | Value                                                     |
| ------------------ | --------------------------------------------------------- |
| App name           | Blackjack Trainer                                         |
| Subtitle           | Basic strategy & card counting                            |
| Bundle ID (app)    | `com.arthurzhang.blackjacktrainer.app`                    |
| Apple Team         | `C3W798H8U8`                                              |
| SKU                | `blackjack-trainer-ios` (suggested)                       |
| Primary category   | Education                                                 |
| Secondary category | Games › Card (optional)                                   |
| Version / Build    | 1.0 / 1 (`MARKETING_VERSION` / `CURRENT_PROJECT_VERSION`) |
| Price              | Free (suggested)                                          |

## Description (draft)

> Master blackjack basic strategy and card counting — no betting, no gambling,
> just practice.
>
> Blackjack Trainer is an educational trainer for the math behind the game. Drill
> the skills the pros separate out, each graded instantly against the correct
> play:
>
> • Basic Strategy — every hand vs. dealer upcard, with H17/S17, DAS, and
> late-surrender rules.
> • Running Count — 58 counting systems, including unbalanced and fractional
> systems.
> • True Count — convert the running count using a live, depleting shoe and
> deck-estimation practice.
> • Deviations — the Hi-Lo index plays (and the insurance line) that adjust basic
> strategy by the count.
>
> Every answer is checked against an engine, with a clear explanation of the
> correct play. Track your accuracy, streaks, and weak spots per trainer, and
> sync across your devices with iCloud.
>
> No wagering. No real or virtual money. No chips. Just the strategy.

## Keywords (draft, ≤100 chars)

```
blackjack,basic strategy,card counting,trainer,hi-lo,true count,deviations,21,casino,practice
```

## Promotional text (draft, ≤170 chars)

> Practice blackjack basic strategy, card counting, true count, and Hi-Lo
> deviations — instantly graded, no wagering, with iCloud sync and adaptive
> weak-spot review.

## Privacy — App Privacy nutrition labels

**Data Not Collected.** The app has no analytics, no accounts, and no third-party
SDKs. Per-trainer stats live in on-device `UserDefaults` and, when the user enables
it, sync through the user's **own** iCloud (NSUbiquitousKeyValueStore) — none of
it is collected by or sent to the developer.

- Answer **"No, we do not collect data from this app"** in the App Privacy section.
- A **privacy policy URL is still required** by App Store Connect even for
  data-not-collected apps — the human must host one (a short page stating the app
  collects no data and stores stats on-device / in the user's iCloud suffices).

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
  human must answer against Apple's current questionnaire wording: the app
  depicts casino blackjack and teaches gambling-adjacent skills, but simulates
  no wagering at all. Answer it honestly from the description above — do not
  copy the old "Yes" forward, and do not assume the trim guarantees a "None".
- Every other content category (violence, mature/suggestive, profanity, horror,
  contests, unrestricted web access, user-generated content): **None**.

Do not assume a specific resulting rating. If the honest answers still yield a
mature rating, accept it; budget one review round for the gambling/age-rating
angle either way (roadmap risk register), and expect App Review to weigh the
card-counting instruction independently of the questionnaire.

## Export compliance

`ITSAppUsesNonExemptEncryption = false` is **already set in the app's Info.plist**
(via `INFOPLIST_KEY_ITSAppUsesNonExemptEncryption` in `ios/project.yml`), so App
Store Connect will not prompt for export compliance on each upload. The app uses
only Apple-provided, exempt encryption (HTTPS/iCloud), no custom/non-exempt crypto.

## Review notes (suggested, for the App Review team)

> This is an educational blackjack **strategy trainer**. There is **no wagering,
> no real or virtual currency, no payouts, and no hand is ever played out to a
> win/lose outcome** — the app grades individual decisions (the correct play or
> the correct count) like flashcards. No account or login is required; all data
> stays on-device or in the user's own iCloud.

## Licensing note

App code is **MIT**. The card artwork is the **Vector Playing Card Library 1.3**
(Chris Aguilar), **LGPL 3.0**; its attribution and full license texts ship in-app
on the Settings → Licenses screen. No action needed beyond keeping that screen.

## Human checklist

> **Update (2026-07-23):** Collateral for two of these items now exists locally under `ios/AppStore/` (currently untracked): `privacy.html` and `support.html` (ready-to-host pages for the privacy/support URLs, each still containing `CONTACT_EMAIL_HERE` / `PRIVACY_URL_HERE` placeholders to fill before hosting) and `screenshots-6.9/` (six 1320×2868 6.9″ portrait screenshots).
> The checklist items themselves remain human actions: the pages must be hosted and the screenshots uploaded via App Store Connect.

These can only be done by a human with the Apple Developer account / a device —
the autopilot cannot and must not represent them as done:

- [ ] **Provision capabilities** for the App ID `com.arthurzhang.blackjacktrainer.app`:
      **iCloud Key-Value Store** (Slice 4.2); sign with a matching profile. The
      widget App Group is no longer needed (the widget is archived). Turn
      `CODE_SIGNING_ALLOWED` back on for device/archive builds.
- [ ] **Create the App Store Connect record** (bundle ID above) and enter the
      metadata from this doc (name, subtitle, description, keywords, promo text,
      categories).
- [ ] **Host & link a privacy policy URL** and a **support URL**.
- [ ] **Answer App Privacy** = Data Not Collected, and **re-answer the
      age-rating questionnaire** from the re-derived section above.
- [ ] **Capture screenshots** from a near-final build for the required device
      sizes (6.9"/6.5" iPhone at minimum; iPad if shipping universal). The
      existing `ios/AppStore/screenshots-6.9/` set predates the scope trim and
      must be re-taken from the trimmed build.
- [ ] **TestFlight (Slice 5.2):** archive, upload, internal/external testing across
      a device matrix; verify iCloud sync (two devices).
- [ ] **Submit for review (Slice 5.3):** address any rejection (most likely the
      gambling/age-rating angle), then release (phased rollout suggested).

**The app is _not_ submitted or approved.** This document only prepares the text
and flags; the App Store Connect entry, screenshots, TestFlight, and submission
remain to be done by the human.
