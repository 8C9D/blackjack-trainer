import SwiftUI

/// The bet spread inside Settings' Card counting section: one stepper per
/// true-count band, the units the drill grades against. Its own view (and file)
/// so `SettingsView` stays inside the type-body length budget, the same move
/// `PracticeDataSection` made.
///
/// Steppers rather than the web's number fields: they are what the rest of this
/// screen uses for a number, and they cannot produce an out-of-range ramp.
struct BetRampEditor: View {
    @Environment(AppModel.self) private var model

    private var ramp: [Int] {
        model.flowPrefs.prefs.counting.betRamp
    }

    var body: some View {
        Text(
            "The drill asks for the true count, then the bet it is for, graded against this "
                + "spread — your own ramp, in units, not a table this app picked for you."
        )
        .font(.footnote)
        .foregroundStyle(Theme.muted)

        ForEach(Array(ramp.enumerated()), id: \.offset) { index, units in
            Stepper(
                "\(BetRamp.bandLabels[index]): \(BetRamp.unitsLabel(units))",
                value: binding(band: index),
                in: BetRamp.minUnits ... BetRamp.maxUnits
            )
        }

        if BetRamp.shrinks(ramp) {
            Text(
                "This spread bets less at a higher count than at a lower one. That is allowed, "
                    + "but it is usually a typo."
            )
            .font(.footnote)
            .foregroundStyle(Theme.bad)
        }
    }

    private func binding(band index: Int) -> Binding<Int> {
        Binding(
            get: { ramp[index] },
            set: { units in
                model.flowPrefs.updateCounting { $0.betRamp[index] = units }
            }
        )
    }
}
