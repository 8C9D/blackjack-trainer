import SwiftUI

/// Thin session header for the drill screens: exit, progress toward the session
/// target, count, and the current correct-streak chip. The only chrome a drill
/// screen carries — settings never appear here. Mirrors the web `flow-topbar`.
struct FlowTopBarView: View {
    let count: Int
    let target: Int
    var streak: Int = 0
    let onExit: () -> Void

    private var fraction: Double {
        guard target > 0 else { return 1 }
        return min(1, Double(count) / Double(target))
    }

    var body: some View {
        HStack(spacing: 12) {
            Button(action: onExit) {
                Image(systemName: "xmark")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(Theme.muted)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("End session")

            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(Theme.raised)
                    Capsule().fill(Theme.accent)
                        .frame(width: max(0, geo.size.width * fraction))
                }
            }
            .frame(height: 8)

            Text("\(count)/\(target)")
                .font(.system(size: 13))
                .monospacedDigit()
                .foregroundStyle(Theme.muted)

            if streak > 1 {
                Text("streak \(streak)")
                    .font(.system(size: 12))
                    .monospacedDigit()
                    .foregroundStyle(Theme.good)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 3)
                    .background(Capsule().fill(Theme.raised))
                    .overlay(Capsule().strokeBorder(Theme.good.opacity(0.4), lineWidth: 1))
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
        .padding(.bottom, 8)
    }
}

#Preview {
    VStack {
        FlowTopBarView(count: 15, target: 20, streak: 4, onExit: {})
        FlowTopBarView(count: 3, target: 20, onExit: {})
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    .background(Theme.ground)
    .preferredColorScheme(.dark)
}
