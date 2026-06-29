import SwiftUI

/// Numeric answer form for a counting drill, mirroring the web
/// `count-answer-form`. Fractional systems (Wong Halves) accept decimals; every
/// other case is integer-only. Submits on the keyboard return key too.
struct CountAnswerView: View {
    let mode: DrillMode
    let allowFractions: Bool
    let onAnswer: (Double) -> Void

    @State private var raw = ""
    @FocusState private var focused: Bool

    private let engine = CountingEngine()

    private var prompt: String {
        mode == .trueCount ? "What is the true count?" : "What is the running count?"
    }

    private var canSubmit: Bool {
        allowFractions ? engine.isValidDecimalAnswer(raw) : engine.isValidIntegerAnswer(raw)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(prompt)
                .font(.headline)
                .foregroundStyle(Theme.primaryText)
            TextField("Count", text: $raw)
                .keyboardType(.numbersAndPunctuation)
                .textFieldStyle(.roundedBorder)
                .focused($focused)
                .submitLabel(.go)
                .onSubmit(submit)
            if allowFractions {
                Text("This system uses fractional values — enter halves like 2.5 or -0.5.")
                    .font(.footnote)
                    .foregroundStyle(Theme.secondaryText)
            }
            Button(action: submit) {
                Text("Submit")
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
        onAnswer(value)
    }
}

#Preview {
    VStack(spacing: 20) {
        CountAnswerView(mode: .runningCount, allowFractions: false) { _ in }
        CountAnswerView(mode: .runningCount, allowFractions: true) { _ in }
        CountAnswerView(mode: .trueCount, allowFractions: false) { _ in }
    }
    .padding()
    .appBackground()
    .preferredColorScheme(.dark)
}
