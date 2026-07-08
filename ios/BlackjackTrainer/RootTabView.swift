import SwiftUI

/// The app's four tabs, mirroring the web routes (the two counting modes live
/// inside the Count tab) plus an About tab for the LGPL acknowledgements (2.3).
enum AppTab: String, CaseIterable, Identifiable, Codable {
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
struct RootTabView: View {
    @Environment(AppModel.self) private var model
    @Environment(AppRouter.self) private var router
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
        .onChange(of: router.pendingTab) { _, pending in
            // A tapped reminder routed here; switch tabs and clear the intent.
            guard let pending else { return }
            selection = pending
            router.pendingTab = nil
        }
    }

    /// Each tab's screen. The About tab carries the acknowledgements (2.3); the
    /// four trainers landed across Phase 3.
    @ViewBuilder
    private func content(for tab: AppTab) -> some View {
        switch tab {
        case .strategy:
            BasicStrategyView(app: model)
        case .count:
            CountingView(app: model)
        case .deviations:
            DeviationsView(app: model)
        case .about:
            AboutView()
        }
    }
}

#Preview {
    RootTabView()
        .environment(AppModel())
        .environment(AppRouter())
        .preferredColorScheme(.dark)
}
