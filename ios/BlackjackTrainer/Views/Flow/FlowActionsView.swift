import SwiftUI

/// The six actions in their permanent order — never rearranged or hidden, so a
/// position can live in muscle memory. Mirrors the web `FLOW_ACTION_ORDER`.
let flowActionOrder: [Action] = [.hit, .stand, .double, .split, .surrender, .insurance]

/// Fixed six-action answer grid with grade-in-place feedback. While answering,
/// legal actions are enabled and illegal ones are visibly off and inert. Once
/// graded, the buttons lock: the correct action glows green, a wrong pick turns
/// red where the finger already is, and the rest dim. Mirrors `flow-actions`.
struct FlowActionsView: View {
    /// Actions answerable for the current hand (the rest are off).
    let legal: [Action]
    /// The user's answer for the graded hand, nil while answering.
    var picked: Action?
    /// The engine's correct action for the graded hand, nil while answering.
    var correct: Action?
    let onAction: (Action) -> Void

    private var graded: Bool {
        correct != nil
    }

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 10), count: 3)

    var body: some View {
        LazyVGrid(columns: columns, spacing: 10) {
            ForEach(flowActionOrder, id: \.self) { action in
                FlowActionButton(
                    action: action,
                    isLegal: legal.contains(action),
                    isCorrect: correct == action,
                    isWrongPick: picked == action && correct != action,
                    showCorrectNote: correct == action && picked != correct,
                    graded: graded,
                    onTap: { onAction(action) }
                )
            }
        }
        .padding(.horizontal, 18)
        .padding(.bottom, 8)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Player actions")
    }
}

private struct FlowActionButton: View {
    let action: Action
    let isLegal: Bool
    let isCorrect: Bool
    let isWrongPick: Bool
    let showCorrectNote: Bool
    let graded: Bool
    let onTap: () -> Void

    @Environment(\.hasHardwareKeyboard) private var hasHardwareKeyboard

    private var isDim: Bool {
        graded && !isCorrect && !isWrongPick
    }

    private var foreground: Color {
        if isCorrect { return Theme.good }
        if isWrongPick { return Theme.bad }
        return Theme.ink
    }

    private var border: Color {
        if isCorrect { return Theme.good }
        if isWrongPick { return Theme.bad }
        return Theme.hairline
    }

    private var background: Color {
        if isCorrect { return Theme.good.opacity(0.12) }
        if isWrongPick { return Theme.bad.opacity(0.10) }
        return Theme.raised
    }

    private var opacity: Double {
        if isCorrect || isWrongPick { return 1 }
        if !isLegal { return 0.3 }
        if isDim { return 0.45 }
        return 1
    }

    var body: some View {
        Button(action: onTap) {
            VStack(spacing: 3) {
                Text(action.label)
                    .font(.callout.weight(.semibold))
                if isWrongPick {
                    Text("your pick").font(.caption2)
                } else if showCorrectNote {
                    Text("correct").font(.caption2)
                } else if hasHardwareKeyboard, isLegal, !graded {
                    Text("[\(action.keyHint)]").font(.caption2).opacity(0.7)
                }
            }
            .frame(maxWidth: .infinity, minHeight: 54)
            .foregroundStyle(foreground)
            .background(background)
            .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(border, lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .shadow(color: isCorrect ? Theme.good.opacity(0.3) : .clear, radius: 10)
        }
        .buttonStyle(.plain)
        .keyboardShortcut(KeyEquivalent(action.hotkey), modifiers: [])
        .opacity(opacity)
        .disabled(graded || !isLegal)
    }
}

#Preview {
    VStack(spacing: 30) {
        FlowActionsView(legal: [.hit, .stand, .double], onAction: { _ in })
        FlowActionsView(
            legal: [.hit, .stand, .double],
            picked: .stand,
            correct: .hit,
            onAction: { _ in }
        )
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(Theme.ground)
    .preferredColorScheme(.dark)
}
