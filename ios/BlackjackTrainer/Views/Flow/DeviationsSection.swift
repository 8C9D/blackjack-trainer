import SwiftUI

/// Settings' "Deviations" section: practice mode, the true-count source, and
/// the advisory naming which system the indices belong to.
///
/// Its own view (and file) so the Settings screen stays inside the file-length
/// budget, following `PracticeDataSection`.
struct DeviationsSection: View {
    @Environment(AppModel.self) private var model

    private var prefs: FlowPrefs {
        model.flowPrefs.prefs
    }

    /// Shown here rather than beside the system picker: the picker is a
    /// card-counting choice, and this is what it costs the trainer below it.
    private var indexNote: String? {
        model.countingSystems
            .system(withId: prefs.counting.systemId)
            .flatMap(DeviationIndexSystem.note)
    }

    var body: some View {
        Section("Deviations") {
            if let indexNote {
                Text(indexNote)
                    .font(.caption)
                    .foregroundStyle(Theme.midInk)
            }
            Picker("Practice", selection: practiceModeBinding) {
                Text("All hands").tag(DeviationPracticeMode.allHands)
                Text("Deviation-only").tag(DeviationPracticeMode.deviationOnly)
            }
            Picker("True count", selection: sourceBinding) {
                Text("Random").tag(DeviationTrueCountSource.random)
                Text("Manual").tag(DeviationTrueCountSource.manual)
            }
            if prefs.deviations.trueCountSource == .manual {
                manualTrueCountStepper
            }
        }
    }

    private var manualTrueCountStepper: some View {
        let label = DeviationFeedback.formatTrueCount(prefs.deviations.manualTrueCount)
        return Stepper(
            "Practice true count: \(label)",
            value: Binding(
                get: { prefs.deviations.manualTrueCount },
                set: { value in model.flowPrefs.updateDeviations { $0.manualTrueCount = value } }
            ),
            in: DeviationTrainerConstants.minManualTrueCount
                ... DeviationTrainerConstants.maxManualTrueCount
        )
    }

    private var practiceModeBinding: Binding<DeviationPracticeMode> {
        Binding(
            get: { prefs.deviations.practiceMode },
            set: { value in model.flowPrefs.updateDeviations { $0.practiceMode = value } }
        )
    }

    private var sourceBinding: Binding<DeviationTrueCountSource> {
        Binding(
            get: { prefs.deviations.trueCountSource },
            set: { value in model.flowPrefs.updateDeviations { $0.trueCountSource = value } }
        )
    }
}
