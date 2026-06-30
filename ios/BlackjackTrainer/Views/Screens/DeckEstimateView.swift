import SwiftUI

/// Asks the player for the decks remaining after the card stream and before the
/// true-count answer (live-shoe mode). Mirrors the web `deck-estimate-form`;
/// estimates within ±0.5 of the actual count as good (scored by the model).
struct DeckEstimateView: View {
    let onEstimate: (Double) -> Void

    @State private var raw = ""
    @FocusState private var focused: Bool

    private let engine = CountingEngine()

    private var canSubmit: Bool {
        guard engine.isValidDecimalAnswer(raw),
              let value = Double(raw.trimmingCharacters(in: .whitespaces)) else { return false }
        return value > 0
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("How many decks remain?")
                .font(.headline)
                .foregroundStyle(Theme.primaryText)
            TextField("Decks", text: $raw)
                .keyboardType(.decimalPad)
                .textFieldStyle(.roundedBorder)
                .focused($focused)
                .submitLabel(.go)
                .onSubmit(submit)
            Text("Estimate to the nearest half-deck — within ±0.5 counts as good.")
                .font(.footnote)
                .foregroundStyle(Theme.secondaryText)
            Button(action: submit) {
                Text("Submit estimate")
                    .frame(maxWidth: .infinity, minHeight: 30)
            }
            .buttonStyle(.borderedProminent)
            .tint(Theme.accent)
            .disabled(!canSubmit)
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .onAppear { focused = true }
    }

    private func submit() {
        guard canSubmit,
              let value = Double(raw.trimmingCharacters(in: .whitespaces)) else { return }
        onEstimate(value)
    }
}

#Preview {
    DeckEstimateView { _ in }
        .padding()
        .appBackground()
        .preferredColorScheme(.dark)
}
