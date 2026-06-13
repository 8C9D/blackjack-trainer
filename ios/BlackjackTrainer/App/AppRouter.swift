import Observation

/// Lightweight navigation intent shared via the environment, so a tapped
/// practice-reminder notification can route the app to a specific tab (4.4).
/// `RootTabView` consumes `pendingTab` and then clears it.
@Observable
final class AppRouter {
    /// A tab the app should switch to, set from outside the view tree (e.g. a
    /// notification tap). `nil` when there's nothing pending.
    var pendingTab: AppTab?
}
