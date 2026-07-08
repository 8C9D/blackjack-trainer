import SwiftUI

/// Practice-reminder settings (4.4), reached from the About tab. A single daily
/// reminder, off until enabled; when on, the user picks the time and which
/// trainer a tapped reminder opens.
struct RemindersView: View {
    @State private var model = RemindersModel()

    private let trainerTabs: [AppTab] = [.strategy, .count, .deviations]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text(
                    "Get a daily nudge to run a quick drill. Reminders stay off "
                        + "until you turn them on, and you can change the time or "
                        + "cancel them anytime."
                )
                .font(.subheadline)
                .foregroundStyle(Theme.secondaryText)

                card {
                    Toggle("Daily reminder", isOn: enabledBinding)
                        .tint(Theme.accent)
                        .foregroundStyle(Theme.primaryText)
                }

                if model.authorizationDenied {
                    card {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Notifications are turned off")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(Theme.primaryText)
                            Text(
                                "Enable notifications for Blackjack Trainer in iOS "
                                    + "Settings to receive reminders."
                            )
                            .font(.footnote)
                            .foregroundStyle(Theme.secondaryText)
                        }
                    }
                }

                if model.settings.isEnabled {
                    card {
                        DatePicker(
                            "Time",
                            selection: timeBinding,
                            displayedComponents: .hourAndMinute
                        )
                        .foregroundStyle(Theme.primaryText)
                        .tint(Theme.accent)

                        Divider().overlay(Theme.background)

                        HStack {
                            Text("Open")
                                .foregroundStyle(Theme.primaryText)
                            Spacer()
                            Picker("Trainer", selection: targetBinding) {
                                ForEach(trainerTabs) { Text($0.title).tag($0) }
                            }
                            .labelsHidden()
                            .tint(Theme.accent)
                        }
                    }
                }
            }
            .padding()
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .appBackground()
        .navigationTitle("Practice reminders")
        .navigationBarTitleDisplayMode(.inline)
        .tint(Theme.accent)
        .task { await model.refreshAuthorization() }
    }

    // Async model calls are kicked off from the synchronous SwiftUI bindings.

    private var enabledBinding: Binding<Bool> {
        Binding(
            get: { model.settings.isEnabled },
            set: { newValue in Task { await model.setEnabled(newValue) } }
        )
    }

    private var timeBinding: Binding<Date> {
        Binding(
            get: {
                Calendar.current.date(
                    from: DateComponents(
                        hour: model.settings.hour,
                        minute: model.settings.minute
                    )
                ) ?? Date()
            },
            set: { newDate in
                let parts = Calendar.current.dateComponents([.hour, .minute], from: newDate)
                Task { await model.setTime(hour: parts.hour ?? 0, minute: parts.minute ?? 0) }
            }
        )
    }

    private var targetBinding: Binding<AppTab> {
        Binding(
            get: { model.settings.target },
            set: { newValue in Task { await model.setTarget(newValue) } }
        )
    }

    private func card(@ViewBuilder _ content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 12) { content() }
            .padding()
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.surface)
            .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

#Preview {
    NavigationStack {
        RemindersView()
    }
    .preferredColorScheme(.dark)
}
