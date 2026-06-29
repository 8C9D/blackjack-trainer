import SwiftUI

/// The app's four tabs, mirroring the web routes (the two counting modes live
/// inside the Count tab) plus an About tab for the LGPL acknowledgements (2.3).
enum AppTab: String, CaseIterable, Identifiable {
    case strategy
    case count
    case deviations
    case about

    var id: String {
        rawValue
    }

    var label: String {
        switch self {
        case .strategy: "Strategy"
        case .count: "Count"
        case .deviations: "Deviations"
        case .about: "About"
        }
    }

    var title: String {
        switch self {
        case .strategy: "Basic Strategy"
        case .count: "Card Counting"
        case .deviations: "Deviations"
        case .about: "About"
        }
    }

    var icon: String {
        switch self {
        case .strategy: "rectangle.on.rectangle"
        case .count: "number"
        case .deviations: "arrow.triangle.branch"
        case .about: "info.circle"
        }
    }
}

/// Root tab shell. Each tab's content is keyed on a per-tab visit counter, so
/// re-entering a tab rebuilds it — in-memory drill state resets while the
/// persisted stats (owned by `AppModel`) survive, matching the web's behavior.
/// Tabs are placeholders until Phase 3.
struct RootTabView: View {
    @Environment(AppModel.self) private var model
    @State private var selection: AppTab = .strategy
    @State private var visits: [AppTab: Int] = [:]
    @State private var keyboardMonitor = HardwareKeyboardMonitor()

    var body: some View {
        TabView(selection: $selection) {
            ForEach(AppTab.allCases) { tab in
                content(for: tab)
                    .id(visits[tab, default: 0]) // re-entry → fresh in-memory state
                    .tabItem { Label(tab.label, systemImage: tab.icon) }
                    .tag(tab)
            }
        }
        .tint(Theme.accent)
        .environment(\.hasHardwareKeyboard, keyboardMonitor.isConnected)
        .onChange(of: selection, initial: true) { _, newValue in
            visits[newValue, default: 0] += 1
        }
    }

    /// The About tab carries the acknowledgements (Slice 2.3); trainer tabs are
    /// filled in across Phase 3 (the Strategy tab landed in 3.2).
    @ViewBuilder
    private func content(for tab: AppTab) -> some View {
        switch tab {
        case .strategy:
            BasicStrategyView(app: model)
        case .count:
            CountingView(app: model)
        case .about:
            AboutView()
        default:
            PlaceholderTab(title: tab.title, systemImage: tab.icon)
        }
    }
}

/// Temporary screen used for every tab until Phase 3. The tap counter is
/// in-memory "drill" state that demonstrates the reset-on-re-entry behavior.
private struct PlaceholderTab: View {
    let title: String
    let systemImage: String
    @State private var taps = 0

    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                Image(systemName: systemImage)
                    .font(.largeTitle)
                    .foregroundStyle(Theme.secondaryText)
                Text(title)
                    .font(.title2.weight(.semibold))
                    .foregroundStyle(Theme.primaryText)
                Text("Coming soon")
                    .foregroundStyle(Theme.secondaryText)
                Button("Taps this visit: \(taps)") { taps += 1 }
                    .buttonStyle(.borderedProminent)
                    .tint(Theme.accent)
            }
            .appBackground()
            .navigationTitle(title)
        }
    }
}

#Preview {
    RootTabView()
        .environment(AppModel())
        .preferredColorScheme(.dark)
}
