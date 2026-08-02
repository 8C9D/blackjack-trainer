import SwiftUI

/// The app's root: a router-driven switch between the Open home, a running drill,
/// and the Settings screen. Replaces the tab bar — the app always launches into
/// the Open moment. Mirrors the web `app.routes`.
struct FlowRootView: View {
    @Environment(AppModel.self) private var model
    @State private var router = FlowRouter()

    var body: some View {
        content
            .environment(router)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Theme.ground.ignoresSafeArea())
    }

    @ViewBuilder private var content: some View {
        switch router.route {
        case .home:
            HomeView()
        case .settings:
            SettingsView()
        case .chart:
            ChartView()
        case let .drill(trainer):
            drill(trainer)
        }
    }

    @ViewBuilder private func drill(_ trainer: TrainerId) -> some View {
        switch trainer {
        case .basicStrategy:
            BasicStrategyDrillView(app: model) { router.goHome() }
        case .deviations:
            DeviationsDrillView(app: model) { router.goHome() }
        case .cardCounting:
            CardCountingFlowView(app: model) { router.goHome() }
        }
    }
}
