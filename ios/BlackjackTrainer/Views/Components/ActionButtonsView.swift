import SwiftUI

/// Subsettable player-action buttons, mirroring the web `app-action-buttons`.
/// Defaults to the full set; callers pass a subset (e.g. the showdown's
/// hit/stand only). Each button wires its hardware-keyboard shortcut and shows
/// the key hint when a keyboard is attached.
struct ActionButtonsView: View {
    var actions: [Action] = Action.fullTrainerSet
    var disabled = false
    let onAction: (Action) -> Void

    @Environment(\.hasHardwareKeyboard) private var hasHardwareKeyboard

    private let columns = [GridItem(.adaptive(minimum: 96), spacing: 10)]

    var body: some View {
        LazyVGrid(columns: columns, spacing: 10) {
            ForEach(actions, id: \.self) { action in
                Button {
                    onAction(action)
                } label: {
                    HStack(spacing: 4) {
                        Text(action.label)
                            .fontWeight(.semibold)
                        if hasHardwareKeyboard {
                            Text("[\(action.keyHint)]")
                                .font(.caption2)
                                .opacity(0.7)
                        }
                    }
                    .frame(maxWidth: .infinity, minHeight: 30)
                }
                .buttonStyle(.borderedProminent)
                .tint(Theme.surfaceRaised)
                .keyboardShortcut(KeyEquivalent(action.hotkey), modifiers: [])
                .accessibilityLabel(action.label)
            }
        }
        .disabled(disabled)
    }
}

#Preview {
    VStack(spacing: 24) {
        ActionButtonsView { _ in }
        ActionButtonsView(actions: [.hit, .stand]) { _ in }
        ActionButtonsView(disabled: true) { _ in }
    }
    .padding()
    .appBackground()
    .environment(\.hasHardwareKeyboard, true)
    .preferredColorScheme(.dark)
}
