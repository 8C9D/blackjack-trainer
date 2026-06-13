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

| Field | Value |
| --- | --- |
| App name | Blackjack Trainer |
| Subtitle | Basic strategy & card counting |
| Bundle ID (app) | `com.arthurzhang.blackjacktrainer.app` |
| Bundle ID (widget) | `com.arthurzhang.blackjacktrainer.app.widget` |
| Apple Team | `C3W798H8U8` |
| SKU | `blackjack-trainer-ios` (suggested) |
| Primary category | Education |
| Secondary category | Games › Card (optional) |
| Version / Build | 1.0 / 1 (`MARKETING_VERSION` / `CURRENT_PROJECT_VERSION`) |
| Price | Free (suggested) |

## Description (draft)

> Master blackjack basic strategy and card counting — no betting, no gambling,
> just practice.
>
> Blackjack Trainer is an educational trainer for the math behind the game. Drill
> the four skills the pros separate out, each graded instantly against the correct
> play:
>
> • Basic Strategy — every hand vs. dealer upcard, with H17/S17, DAS, and
>   late-surrender rules.
> • Running Count — 58 counting systems, including unbalanced and fractional
>   systems.
> • True Count — convert the running count using a live, depleting shoe and
>   deck-estimation practice.
> • Deviations — the Hi-Lo index plays (and the insurance line) that adjust basic
>   strategy by the count.
>
> Every answer is checked against an engine, with a clear explanation of the
> correct play. Track your accuracy and streaks per trainer, see them on a
> home-screen widget, sync across your devices with iCloud, and set an optional
> daily practice reminder.
>
> No wagering. No real or virtual money. Just the strategy.

## Keywords (draft, ≤100 chars)

```
blackjack,basic strategy,card counting,trainer,hi-lo,true count,deviations,21,casino,practice
```

## Promotional text (draft, ≤170 chars)

> Practice blackjack basic strategy, card counting, true count, and Hi-Lo
> deviations — instantly graded, no wagering. Now with a stats widget and daily
> reminders.

## Privacy — App Privacy nutrition labels

**Data Not Collected.** The app has no analytics, no accounts, and no third-party
SDKs. Per-trainer stats live in on-device `UserDefaults` and, when the user enables
it, sync through the user's **own** iCloud (NSUbiquitousKeyValueStore) and a local
App Group for the widget — none of it is collected by or sent to the developer.

- Answer **"No, we do not collect data from this app"** in the App Privacy section.
- A **privacy policy URL is still required** by App Store Connect even for
  data-not-collected apps — the human must host one (a short page stating the app
  collects no data and stores stats on-device / in the user's iCloud suffices).

## Age rating

Answer the questionnaire **honestly** for a no-wager blackjack trainer:

- **Simulated Gambling:** Yes — the app simulates blackjack play (the core
  activity), though with **no wagering and no real or virtual currency**.
- All other content categories (violence, mature/suggestive, profanity,
  horror, unrestricted web access, user-generated content, etc.): **None**.

Expected outcome: a mature rating (commonly **17+**, or the regional equivalent in
Apple's current age-rating scheme) because of the simulated-gambling category.
Accept whatever the honest questionnaire yields — do not understate it. Budget one
review round for the gambling/age-rating angle (roadmap risk register).

## Export compliance

`ITSAppUsesNonExemptEncryption = false` is **already set in the app's Info.plist**
(via `INFOPLIST_KEY_ITSAppUsesNonExemptEncryption` in `ios/project.yml`), so App
Store Connect will not prompt for export compliance on each upload. The app uses
only Apple-provided, exempt encryption (HTTPS/iCloud), no custom/non-exempt crypto.

## Review notes (suggested, for the App Review team)

> This is an educational blackjack **strategy trainer**. There is **no wagering,
> no real or virtual currency, and no payouts** — the optional post-count
> "showdown" only tracks a win/lose/push count for practice. No account or login
> is required; all data stays on-device or in the user's own iCloud.

## Licensing note

App code is **MIT**. The card artwork is the **Vector Playing Card Library 1.3**
(Chris Aguilar), **LGPL 3.0**; its attribution and full license texts ship in-app
on the About screen (Slice 2.3). No action needed beyond keeping that screen.

## Human checklist

These can only be done by a human with the Apple Developer account / a device —
the autopilot cannot and must not represent them as done:

- [ ] **Provision capabilities** for the App ID `com.arthurzhang.blackjacktrainer.app`
      (and the widget App ID): **iCloud Key-Value Store** (Slice 4.2) and the
      **App Group** `group.com.arthurzhang.blackjacktrainer` (Slice 4.3); sign with
      a matching profile. Turn `CODE_SIGNING_ALLOWED` back on for device/archive
      builds.
- [ ] **Create the App Store Connect record** (bundle ID above) and enter the
      metadata from this doc (name, subtitle, description, keywords, promo text,
      categories).
- [ ] **Host & link a privacy policy URL** and a **support URL**.
- [ ] **Answer App Privacy** = Data Not Collected, and the **age-rating
      questionnaire** as above.
- [ ] **Capture screenshots** from a near-final build for the required device
      sizes (6.9"/6.5" iPhone at minimum; iPad if shipping universal). The four
      trainer screens + the widget make good shots.
- [ ] **TestFlight (Slice 5.2):** archive, upload, internal/external testing across
      a device matrix; verify iCloud sync (two devices), the widget on a Home
      Screen, and notification delivery on schedule.
- [ ] **Submit for review (Slice 5.3):** address any rejection (most likely the
      gambling/age-rating angle), then release (phased rollout suggested).

**The app is _not_ submitted or approved.** This document only prepares the text
and flags; the App Store Connect entry, screenshots, TestFlight, and submission
remain to be done by the human.
