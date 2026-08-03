import SwiftUI

/// Numeric answer form for a counting drill, mirroring the web
/// `count-answer-form`. Fractional systems (Wong Halves) accept decimals; every
/// other case is integer-only. Submits on the keyboard return key too.
struct CountAnswerView: View {
    /// The bet-spread drill asks twice: the count first, then the bet it is for.
    /// One form serves both — same field, focus, and return-key submit — with
    /// the question and the accepted range switched here.
    enum Question {
        case count, bet
    }

    let mode: DrillMode
    let allowFractions: Bool
    var question: Question = .count
    let onAnswer: (Double) -> Void

    @State private var raw = ""
    @FocusState private var focused: Bool

    private let engine = CountingEngine()

    private var prompt: String {
        if question == .bet { return "How many units do you bet?" }
        return mode.asksTrueCount ? "What is the true count?" : "What is the running count?"
    }

    private var canSubmit: Bool {
        if question == .bet {
            guard engine.isValidIntegerAnswer(raw),
                  let units = Int(raw.trimmingCharacters(in: .whitespaces)) else { return false }
            return units >= BetRamp.minUnits && units <= BetRamp.maxUnits
        }
        return allowFractions ? engine.isValidDecimalAnswer(raw) : engine.isValidIntegerAnswer(raw)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(prompt)
                .font(.headline)
                .foregroundStyle(Theme.ink)
            TextField(question == .bet ? "Units" : "Count", text: $raw)
                .keyboardType(.numbersAndPunctuation)
                .textFieldStyle(.roundedBorder)
                .focused($focused)
                .submitLabel(.go)
                .onSubmit(submit)
            if question == .bet {
                Text("In units of your bet spread, not chips — the spread itself is in Settings.")
                    .font(.footnote)
                    .foregroundStyle(Theme.muted)
            } else if allowFractions {
                Text("This system uses fractional values — enter halves like 2.5 or -0.5.")
                    .font(.footnote)
                    .foregroundStyle(Theme.muted)
            }
            Button(action: submit) {
                Text("Submit")
                    .frame(maxWidth: .infinity, minHeight: 30)
            }
            .accentFilledButton()
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
        CountAnswerView(mode: .betSpread, allowFractions: false, question: .bet) { _ in }
    }
    .padding()
    .appBackground()
    .preferredColorScheme(.dark)
}
