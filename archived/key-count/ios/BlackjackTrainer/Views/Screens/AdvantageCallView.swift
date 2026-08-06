import SwiftUI

/// The key-count drill's second question, after the running count: does the
/// player have the advantage? Correct is yes exactly when the running count has
/// reached the system's key count for this shoe — the threshold itself is not
/// shown, because recalling it is the skill being drilled. Mirrors the web
/// `advantage-form`.
struct AdvantageCallView: View {
    let onAnswer: (Bool) -> Void

    @Environment(\.hasHardwareKeyboard) private var hasHardwareKeyboard

    var body: some View {
        VStack(spacing: 12) {
            Text("Do you have the advantage?")
                .font(.headline)
                .foregroundStyle(Theme.ink)
            HStack(spacing: 12) {
                Button { onAnswer(true) } label: {
                    Text(hasHardwareKeyboard ? "Yes  [Y]" : "Yes")
                        .frame(maxWidth: .infinity, minHeight: 30)
                }
                .accentFilledButton()
                .keyboardShortcut("y", modifiers: [])
                Button { onAnswer(false) } label: {
                    Text(hasHardwareKeyboard ? "No  [N]" : "No")
                        .frame(maxWidth: .infinity, minHeight: 30)
                }
                .accentFilledButton()
                .keyboardShortcut("n", modifiers: [])
            }
            Text("Yes when the running count has reached this shoe's key count.")
                .font(.footnote)
                .foregroundStyle(Theme.muted)
                .multilineTextAlignment(.center)
        }
        .padding()
        .frame(maxWidth: .infinity)
        .background(Theme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

#Preview {
    AdvantageCallView { _ in }
        .padding()
        .background(Theme.ground)
        .preferredColorScheme(.dark)
}
