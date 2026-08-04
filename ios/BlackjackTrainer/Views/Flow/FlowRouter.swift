import Observation

/// The Flow app's four moments reduce to four destinations: the Open home, a
/// running drill, the Settings screen, and the read-only strategy chart. The web
/// app expresses these as routes; on iOS a single observable router drives a
/// root-level switch — no tab bar, no navigation stack to reason about.
enum FlowRoute: Equatable {
    case home
    case settings
    case chart
    case progress
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
/// auto-advances; a miss is the loop's only pause; `over` holds the beat where a
/// played-out hand ends on its own (bust, or 21); `done` is the session end.
/// Mirrors the web `DrillPhase`.
enum DrillPhase {
    case question
    case flash
    case miss
    case over
    case done
}
