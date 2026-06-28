import SwiftUI

/// Dealer-rule (S17/H17) and table-option (DAS, Late Surrender) controls reused
/// by the Basic Strategy and Deviations trainers, mirroring the web
/// `app-rule-controls`. Binds directly to the screen's rule state.
struct RuleControlsView: View {
    @Binding var ruleSet: RuleSet
    @Binding var options: EngineOptions

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 6) {
                label("Dealer rule")
                Picker("Dealer rule", selection: $ruleSet) {
                    Text("S17 — stand on soft 17").tag(RuleSet.s17)
                    Text("H17 — hit on soft 17").tag(RuleSet.h17)
                }
                .pickerStyle(.segmented)
            }

            VStack(alignment: .leading, spacing: 8) {
                label("Table options")
                Toggle("Double After Split (DAS)", isOn: dasBinding)
                Toggle("Late Surrender", isOn: lateSurrenderBinding)
            }
            .tint(Theme.accent)
        }
        .foregroundStyle(Theme.primaryText)
    }

    private func label(_ text: String) -> some View {
        Text(text.uppercased())
            .font(.caption.weight(.semibold))
            .foregroundStyle(Theme.secondaryText)
    }

    private var dasBinding: Binding<Bool> {
        Binding(
            get: { options.doubleAfterSplit },
            set: { options = EngineOptions(
                doubleAfterSplit: $0,
                lateSurrender: options.lateSurrender
            ) }
        )
    }

    private var lateSurrenderBinding: Binding<Bool> {
        Binding(
            get: { options.lateSurrender },
            set: { options = EngineOptions(
                doubleAfterSplit: options.doubleAfterSplit,
                lateSurrender: $0
            ) }
        )
    }
}

#Preview {
    @Previewable @State var ruleSet: RuleSet = .s17
    @Previewable @State var options = EngineOptions.default
    return RuleControlsView(ruleSet: $ruleSet, options: $options)
        .padding()
        .appBackground()
        .preferredColorScheme(.dark)
}
