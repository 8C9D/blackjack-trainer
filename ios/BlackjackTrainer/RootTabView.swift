import SwiftUI

/// Root tab scaffold mirroring the web app's routes: the three trainers
/// (Basic Strategy, Card Counting — which will host the running/true-count
/// modes, and Deviations) plus an About tab that carries the LGPL
/// acknowledgements (Slice 2.3). Every tab is a placeholder until Phase 3.
struct RootTabView: View {
    var body: some View {
        TabView {
            PlaceholderTab(title: "Basic Strategy", systemImage: "rectangle.on.rectangle")
                .tabItem { Label("Strategy", systemImage: "rectangle.on.rectangle") }

            PlaceholderTab(title: "Card Counting", systemImage: "number")
                .tabItem { Label("Count", systemImage: "number") }

            PlaceholderTab(title: "Deviations", systemImage: "arrow.triangle.branch")
                .tabItem { Label("Deviations", systemImage: "arrow.triangle.branch") }

            PlaceholderTab(title: "About", systemImage: "info.circle")
                .tabItem { Label("About", systemImage: "info.circle") }
        }
    }
}

/// Temporary empty screen used for every tab in the Phase 0 skeleton.
private struct PlaceholderTab: View {
    let title: String
    let systemImage: String

    var body: some View {
        NavigationStack {
            VStack(spacing: 12) {
                Image(systemName: systemImage)
                    .font(.largeTitle)
                    .foregroundStyle(.secondary)
                Text(title)
                    .font(.title2.weight(.semibold))
                Text("Coming soon")
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .navigationTitle(title)
        }
    }
}

#Preview {
    RootTabView()
        .preferredColorScheme(.dark)
}
