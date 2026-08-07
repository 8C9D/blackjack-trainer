# Launch agent prompt

Paste the block below into a fresh Claude Code session (Fable 5, high effort) in this repo.
It drives the agent lane of `LAUNCH-CHECKLIST.md`.
Answer decisions D1 to D5 in the checklist first if you can; the prompt tells the agent how to proceed if you have not.

```
You are taking this repo from "feature complete" to "submittable to the App Store".

Read LAUNCH-CHECKLIST.md at the repo root first. It is the authoritative work list
and the place you record progress. Your job is the agent lane (items A1 to A16).
The owner lane (O1 to O13) is not yours: it needs an Apple account, a physical
device, or a legal attestation. Never do an O item, never pretend one is done, and
never advise that one can be skipped.

Supporting context, in order of authority:
- TRIM-REPORT.md - what the shipping iOS app is, after nine features were archived
  on 2026-08-06. This is the most current description of the product.
- review/findings.md - a pre-trim adversarial review. F1, F2, F3, F5 are fixed.
  F4 is open and is item A2. The three suspicions at the end are items A3 and A4
  (the widget one died with the widget).
- docs/app-store-submission.md - prepared store metadata, now partly stale.
- CLAUDE.md - the owner's standing engineering rules. They override your defaults.
- Anything in docs/ dated before 2026-08-06 predates the trim. Treat it as a lead
  to verify, never as fact.

Rules of engagement:

1. Verify everything against the source. Do not infer, do not trust a prior report,
   and do not trust your own earlier conclusions in this session. If a claim in a
   doc matters to your work, re-check it against the code before acting on it.
2. Reproduce before you fix. Every bug item starts with a failing test that
   demonstrates the defect end to end, as close to real conditions as you can get.
3. Both platforms stay green. Web: CI=true npm test. iOS: xcodebuild test on the
   iPhone 16 Pro simulator. Also npm run lint, and swiftformat --lint . plus
   swiftlint lint under ios/. Never weaken or skip a test to get green.
4. Web and iOS mirror each other. If you change shared engine behaviour on one
   platform, port it to the other and keep the parity fixtures in sync
   (npm run export:fixtures, then confirm git diff --exit-code -- ios/Fixtures).
5. Commit per checklist item, message one short sentence, no AI attribution
   trailers or footers. Do not push. Do not open a PR. Do not tag without saying so.
6. Update LAUNCH-CHECKLIST.md as you go: tick the item, and add a one-line note of
   what was actually done and how it was verified. If an item turns out to be
   unnecessary or wrong, mark it cut and say why. Do not tick anything you have
   not personally verified.
7. Nothing outward-facing. No deploys, no uploads to Apple, no publishing, no
   network side effects. You may write a GitHub Actions workflow; you may not
   enable Pages or trigger a release.
8. Ask when blocked, do not guess. If an item needs an owner decision or an owner
   input you do not have, do every part that does not depend on it, then stop that
   item and record precisely what you need. Batch those questions rather than
   interrupting per item.

Order of work:

Start with the blockers in the checklist table: A1 (privacy manifest), A2 (the
hard-20 drill bug, which is live on both platforms), then A8/A9/A10 once the
decisions they depend on are answered. Then the quality passes, then release
engineering, then A16 last.

Check the Decisions section of LAUNCH-CHECKLIST.md before starting. If D1 to D5 are
unanswered, do all the decision-independent work first (A1, A2, A3, A5, A12, A14,
A15), then ask for the answers you need in a single message with your recommendation
for each.

Environment notes, learned the hard way:

- xcodebuild, xcodegen, swiftformat, swiftlint, simctl, tsx and the vitest runner
  all need the sandbox disabled here. Run web unit tests as CI=true npm test (the
  ng test builder), not by invoking vitest directly - a direct vitest run fails
  with "describe is not defined" because it bypasses the Angular builder config.
- The simulator destination is iPhone 16 Pro. For the 6.9-inch screenshots the
  device type is available but no such simulator exists yet; create one with
  xcrun simctl create against
  com.apple.CoreSimulator.SimDeviceType.iPhone-16-Pro-Max.
  iPad Pro 13-inch (M5) already exists.
- After adding, moving or deleting any Swift file, run xcodegen generate in ios/
  and commit the regenerated project, or the file is invisible to the build.
- There is no iOS UI-test target. To actually look at a screen, render it to PNG
  from the test target with ImageRenderer and read the image. Do this rather than
  asserting a layout is fine.
- swiftformat's preferKeyPath rule rewrites closures inside #expect in ways that
  break the test; watch for it after formatting. SwiftLint enforces file and type
  length limits, so extract rather than append when a file is near the ceiling.
- When you pipe a lint or test command into another command, check the exit code of
  the tool and not of the pipeline.

Definition of done for the whole run:

- Every A item is ticked with a verification note, or explicitly cut with a reason,
  or explicitly blocked with the exact input needed from the owner.
- Web and iOS suites both green on the final commit, and the parity fixture gate
  clean.
- A closing report that states, plainly: what you changed, what you verified by
  executing versus by reading, what you could not verify and why, and the complete
  list of what the owner must now do. If something is broken or unfinished, say so
  in that report rather than rounding it up to done.
```
