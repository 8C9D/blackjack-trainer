import Foundation

// MARK: - Tolerant field-by-field decode / encode (mirrors mergePrefs)

extension FlowPrefs {
    /// Field-by-field merge of an untrusted parsed payload over the defaults, so
    /// a stale or partly-corrupt stored shape degrades per field rather than
    /// discarding everything. Mirrors the web `mergePrefs`.
    static func merged(
        from parsed: Any?,
        systems suppliedSystems: [CountingSystem]? = nil
    ) -> FlowPrefs {
        let d = FlowPrefs.default
        guard let p = parsed as? [String: Any] else { return d }
        let dev = p["deviations"] as? [String: Any] ?? [:]
        let cnt = p["counting"] as? [String: Any] ?? [:]
        let opts = p["options"] as? [String: Any] ?? [:]
        let systems = suppliedSystems ?? (try? GameData.loadCountingSystems()) ?? []
        return FlowPrefs(
            lastTrainer: oneOf(p["lastTrainer"], TrainerId.self, d.lastTrainer),
            dailyGoal: numberValue(p["dailyGoal"]).map { clampGoal($0) } ?? d.dailyGoal,
            theme: oneOf(p["theme"], ThemePref.self, d.theme),
            ruleSet: oneOf(p["ruleSet"], RuleSet.self, d.ruleSet),
            options: EngineOptions(
                doubleAfterSplit: boolValue(opts["doubleAfterSplit"]) ?? d.options.doubleAfterSplit,
                lateSurrender: boolValue(opts["lateSurrender"]) ?? d.options.lateSurrender
            ),
            deviations: mergedDeviations(dev, defaults: d.deviations),
            counting: mergedCounting(cnt, defaults: d.counting, systems: systems)
        )
    }

    /// The stored JSON shape (matching the web's key/value forms).
    var jsonObject: [String: Any] {
        [
            "lastTrainer": lastTrainer.rawValue,
            "dailyGoal": dailyGoal,
            "theme": theme.rawValue,
            "ruleSet": ruleSet.rawValue,
            "options": [
                "doubleAfterSplit": options.doubleAfterSplit,
                "lateSurrender": options.lateSurrender
            ],
            "deviations": [
                "practiceMode": practiceModeString(deviations.practiceMode),
                "trueCountSource": deviations.trueCountSource.rawValue,
                "manualTrueCount": deviations.manualTrueCount
            ],
            "counting": [
                "systemId": counting.systemId,
                "mode": counting.mode.rawValue,
                "numberOfCards": counting.numberOfCards,
                "millisecondsBetweenCards": counting.millisecondsBetweenCards,
                "decksRemaining": counting.decksRemaining,
                "trueCountSource": counting.trueCountSource.rawValue,
                "numberOfDecks": counting.numberOfDecks,
                "penetration": counting.penetration
            ]
        ]
    }
}

private func mergedDeviations(
    _ raw: [String: Any],
    defaults: DeviationPrefs
) -> DeviationPrefs {
    DeviationPrefs(
        practiceMode: practiceMode(raw["practiceMode"] as? String, default: defaults.practiceMode),
        trueCountSource: oneOf(
            raw["trueCountSource"],
            DeviationTrueCountSource.self,
            defaults.trueCountSource
        ),
        // Range-checked, not merely integer-checked: a hand-edited backup is
        // exactly the payload this merge exists for, and the trainer has no
        // indices written for a count the Settings stepper cannot reach.
        manualTrueCount: intValue(raw["manualTrueCount"])
            .flatMap(validManualTrueCount) ?? defaults.manualTrueCount
    )
}

private func mergedCounting(
    _ raw: [String: Any],
    defaults: CountingPrefs,
    systems: [CountingSystem]
) -> CountingPrefs {
    let requestedSystemId = raw["systemId"] as? String
    let system = systems.first { $0.id == requestedSystemId }
        ?? systems.first { $0.id == defaults.systemId }
    // A stored mode this build no longer hosts (an archived mode's raw value,
    // or a hand-edited payload) falls back to running count via `oneOf`; a mode
    // the system cannot host clamps the same way.
    let requestedMode = oneOf(raw["mode"], DrillMode.self, defaults.mode)
    let mode: DrillMode = system?.allows(requestedMode) == true ? requestedMode : .runningCount
    let source = oneOf(raw["trueCountSource"], TrueCountSource.self, defaults.trueCountSource)
    let decks = intValue(raw["numberOfDecks"])
        .flatMap { ShoeConstants.deckOptions.contains($0) ? $0 : nil }
        ?? defaults.numberOfDecks
    var cards = intValue(raw["numberOfCards"])
        .flatMap { (1 ... CountingConstants.maxCardsPerDrill).contains($0) ? $0 : nil }
        ?? defaults.numberOfCards
    if mode.usesLiveShoe(source: source), cards >= decks * ShoeConstants.cardsPerDeck {
        cards = defaults.numberOfCards
    }
    return CountingPrefs(
        systemId: system?.id ?? defaults.systemId,
        mode: mode,
        numberOfCards: cards,
        millisecondsBetweenCards: intValue(raw["millisecondsBetweenCards"])
            .flatMap { $0 >= CountingConstants.minMillisecondsBetweenCards ? $0 : nil }
            ?? defaults.millisecondsBetweenCards,
        decksRemaining: numberValue(raw["decksRemaining"])
            .flatMap { CountingConstants.decksRemainingPresets.contains($0) ? $0 : nil }
            ?? defaults.decksRemaining,
        trueCountSource: source,
        numberOfDecks: decks,
        penetration: numberValue(raw["penetration"])
            .flatMap { ShoeConstants.penetrationPresets.contains($0) ? $0 : nil }
            ?? defaults.penetration
    )
}

private func practiceModeString(_ mode: DeviationPracticeMode) -> String {
    mode == .deviationOnly ? "deviation-only" : "all-hands"
}

private func practiceMode(
    _ raw: String?,
    default fallback: DeviationPracticeMode
) -> DeviationPracticeMode {
    switch raw {
    case "deviation-only": .deviationOnly
    case "all-hands": .allHands
    default: fallback
    }
}

/// A JSON string in an enum's vocabulary, else the fallback. Mirrors `oneOf`.
private func oneOf<T: RawRepresentable>(
    _ value: Any?,
    _: T.Type,
    _ fallback: T
) -> T where T.RawValue == String {
    guard let raw = value as? String, let parsed = T(rawValue: raw) else { return fallback }
    return parsed
}

/// A JSON number as Double, rejecting JSON booleans (which bridge to NSNumber).
private func numberValue(_ value: Any?) -> Double? {
    guard let number = value as? NSNumber, !isBoolNumber(number) else { return nil }
    let value = number.doubleValue
    return value.isFinite ? value : nil
}

/// A JSON integer (rejects non-integers, mirroring the web `int()`).
private func intValue(_ value: Any?) -> Int? {
    guard let number = numberValue(value), number == number.rounded() else { return nil }
    return Int(number)
}

private func boolValue(_ value: Any?) -> Bool? {
    guard let number = value as? NSNumber, isBoolNumber(number) else { return nil }
    return number.boolValue
}

private func isBoolNumber(_ number: NSNumber) -> Bool {
    CFGetTypeID(number) == CFBooleanGetTypeID()
}
