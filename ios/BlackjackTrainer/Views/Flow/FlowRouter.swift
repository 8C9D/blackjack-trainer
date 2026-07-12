import Observation

/// The Flow app's four moments reduce to three destinations: the Open home, a
/// running drill, and the Settings screen. The web app expresses these as routes;
/// on iOS a single observable router drives a root-level switch — no tab bar, no
/// navigation stack to reason about.
enum FlowRoute: Equatable {
    case home
    case settings
    case drill(TrainerId)
}

@MainActor
@Observable
final class FlowRouter {
    var route: FlowRoute = .home

    func go(_ route: FlowRoute) {
        self.route = route
    }

    func goHome() {
        route = .home
    }
}

/// The drill loop's only states. A correct answer flashes in place and
/// auto-advances; a miss is the loop's only pause; `done` is the session end.
/// Mirrors the web `DrillPhase`.
enum DrillPhase {
    case question
    case flash
    case miss
    case done
}
