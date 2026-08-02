import SwiftUI

/// Settings' "Practice data" section: the app's one destructive control, so it
/// asks first. A confirmation dialog rather than the web's in-place confirm —
/// it is what iOS does, and what a destructive button role is for.
///
/// Its own view (and file) so the confirm state lives next to the control and
/// the Settings screen stays inside the file-length budget.
struct PracticeDataSection: View {
    @Environment(AppModel.self) private var model
    @State private var confirmingReset = false
    @State private var resetDone = false

    var body: some View {
        Section("Practice data") {
            Button("Reset practice data", role: .destructive) { confirmingReset = true }
                // The role alone paints the label systemRed, which is only
                // ~3.5:1 on the light theme's near-white row. `Theme.bad` is
                // the pair tuned for both schemes, as the web `--bad` is.
                .foregroundStyle(Theme.bad)
                .confirmationDialog(
                    "Reset practice data?",
                    isPresented: $confirmingReset,
                    titleVisibility: .visible
                ) {
                    Button("Reset everything", role: .destructive) {
                        model.resetPracticeData()
                        resetDone = true
                    }
                    Button("Cancel", role: .cancel) {}
                } message: {
                    Text(
                        "This clears every drill's stats, the practice history and streak, your "
                            + "weak spots, and the showdown record and chips. Your settings stay "
                            + "as they are."
                    )
                }
            if resetDone {
                Text("Practice data cleared.")
                    .font(.footnote)
                    .foregroundStyle(Theme.muted)
            }
        }
    }
}
