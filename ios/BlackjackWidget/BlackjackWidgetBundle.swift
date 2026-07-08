import SwiftUI
import WidgetKit

/// Entry point for the widget extension. A single configurable stats widget.
@main
struct BlackjackWidgetBundle: WidgetBundle {
    var body: some Widget {
        BlackjackStatsWidget()
    }
}
