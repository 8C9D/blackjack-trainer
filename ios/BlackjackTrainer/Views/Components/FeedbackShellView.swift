import SwiftUI

/// Verdict-card shell reused by the Basic Strategy and Deviations feedback
/// panels, mirroring the web `app-feedback-shell`. It owns the chrome
/// (correct/incorrect colouring, verdict line, and the "Deal next hand" button);
/// trainer-specific detail is supplied via the `content` closure.
struct FeedbackShellView<Content: View>: View {
    let correct: Bool
    var nextDisabled = false
    let onNext: () -> Void
    @ViewBuilder var content: Content

    @Environment(\.hasHardwareKeyboard) private var hasHardwareKeyboard

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(correct ? "Correct." : "Incorrect.")
                .font(.title3.weight(.bold))
                .foregroundStyle(correct ? Theme.correct : Theme.incorrect)

            content

            Button {
                onNext()
            } label: {
                Text(hasHardwareKeyboard ? "Deal next hand  [Enter]" : "Deal next hand")
                    .frame(maxWidth: .infinity, minHeight: 30)
            }
            .buttonStyle(.borderedProminent)
            .tint(Theme.accent)
            .keyboardShortcut(.return, modifiers: [])
            .disabled(nextDisabled)
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background((correct ? Theme.correct : Theme.incorrect).opacity(0.14))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(correct ? Theme.correct : Theme.incorrect, lineWidth: 1)
        )
        .accessibilityElement(children: .contain)
    }
}

#Preview {
    VStack(spacing: 20) {
        FeedbackShellView(correct: true, onNext: {}) {
            Text("You chose Stand — correct.")
                .foregroundStyle(Theme.primaryText)
        }
        FeedbackShellView(correct: false, onNext: {}) {
            Text("Basic strategy says Double.")
                .foregroundStyle(Theme.primaryText)
        }
    }
    .padding()
    .appBackground()
    .preferredColorScheme(.dark)
}
