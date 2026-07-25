import SwiftUI

/// Practice-reminder settings, reached from Settings. A single daily reminder,
/// off until enabled; when on, the user picks the time. A tapped reminder just
/// opens the app (which always lands on the Open home).
struct RemindersView: View {
    @State private var model = RemindersModel()

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text(
                    "Get a daily nudge to run a quick drill. Reminders stay off "
                        + "until you turn them on, and you can change the time or "
                        + "cancel them anytime."
                )
                .font(.subheadline)
                .foregroundStyle(Theme.muted)

                card {
                    Toggle("Daily reminder", isOn: enabledBinding)
                        .tint(Theme.accentInk)
                        .foregroundStyle(Theme.ink)
                }

                if model.authorizationDenied {
                    card {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Notifications are turned off")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(Theme.ink)
                            Text(
                                "Enable notifications for Blackjack Trainer in iOS "
                                    + "Settings to receive reminders."
                            )
                            .font(.footnote)
                            .foregroundStyle(Theme.muted)
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
                        .foregroundStyle(Theme.ink)
                        .tint(Theme.accentInk)
                    }
                }
            }
            .padding()
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .appBackground()
        .navigationTitle("Practice reminders")
        .navigationBarTitleDisplayMode(.inline)
        .tint(Theme.accentInk)
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
