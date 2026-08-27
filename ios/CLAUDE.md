# CLAUDE.md — iOS

The root `CLAUDE.md` is the working orientation for the repository; this file covers only the iOS app.

## Commands

Run these from `ios/`:

```bash
xcodebuild -scheme BlackjackTrainer -destination 'platform=iOS Simulator,name=iPhone 16 Pro' build test
swiftformat --lint .
swiftlint lint
xcodegen generate
```

`iPhone 16 Pro` is the simulator destination CI uses.
Run `xcodegen generate` after changing `ios/project.yml` or adding files, because the `.xcodeproj` is generated and committed.

## Parity

The web engines are the source of truth and the Swift ones mirror them, so a decision change made here alone will fail the parity tests.
The root `CLAUDE.md` holds the fixture-drift rule that governs both sides.
