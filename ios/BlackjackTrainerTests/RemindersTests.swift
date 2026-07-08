import Foundation
import Testing
import UserNotifications
@testable import BlackjackTrainer

/// Slice 4.4 — practice-reminder routing, request construction, and the settings
/// model driven by a fake scheduler (no real notification center, so it runs on
/// the simulator without a device).
@MainActor
struct RemindersTests {
    private final class FakeScheduler: NotificationScheduling {
        var granted = true
        var status: UNAuthorizationStatus = .notDetermined
        var scheduled: [UNNotificationRequest] = []
        var cancelCount = 0

        func requestAuthorization() async -> Bool {
            granted
        }

        func authorizationStatus() async -> UNAuthorizationStatus {
            status
        }

        func schedule(_ request: UNNotificationRequest) async {
            scheduled = [request]
        }

        func cancelAll() {
            cancelCount += 1
            scheduled = []
        }
    }

    private func suite() -> UserDefaults {
        let name = "reminders-test-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: name)!
        defaults.removePersistentDomain(forName: name)
        return defaults
    }

    // MARK: routing (deep-link a tapped reminder to a tab)

    @Test func routesValidPayloadToTab() {
        let userInfo: [AnyHashable: Any] = [
            PracticeReminder.tabUserInfoKey: AppTab.deviations.rawValue
        ]
        #expect(PracticeReminder.tab(from: userInfo) == .deviations)
    }

    @Test func routingIgnoresMissingOrUnknownPayload() {
        #expect(PracticeReminder.tab(from: [:]) == nil)
        #expect(PracticeReminder.tab(from: [PracticeReminder.tabUserInfoKey: "nope"]) == nil)
    }

    // MARK: request construction (daily-repeating, deep-linked)

    @Test func requestIsDailyRepeatingAndDeepLinked() {
        let request = PracticeReminder.request(hour: 8, minute: 30, target: .deviations)
        #expect(request.identifier == PracticeReminder.identifier)
        #expect(
            request.content.userInfo[PracticeReminder.tabUserInfoKey] as? String
                == AppTab.deviations.rawValue
        )
        let trigger = request.trigger as? UNCalendarNotificationTrigger
        #expect(trigger?.repeats == true)
        #expect(trigger?.dateComponents.hour == 8)
        #expect(trigger?.dateComponents.minute == 30)
    }

    // MARK: model behavior

    @Test func defaultsToOff() {
        let model = RemindersModel(scheduler: FakeScheduler(), defaults: suite())
        #expect(model.settings.isEnabled == false)
        #expect(model.settings.hour == 19)
        #expect(model.settings.target == .strategy)
    }

    @Test func enablingSchedulesWhenAuthorized() async {
        let scheduler = FakeScheduler()
        let model = RemindersModel(scheduler: scheduler, defaults: suite())
        await model.setEnabled(true)
        #expect(model.settings.isEnabled == true)
        #expect(model.authorizationDenied == false)
        #expect(scheduler.scheduled.count == 1)
    }

    @Test func enablingWhenDeniedStaysOff() async {
        let scheduler = FakeScheduler()
        scheduler.granted = false
        let model = RemindersModel(scheduler: scheduler, defaults: suite())
        await model.setEnabled(true)
        #expect(model.settings.isEnabled == false)
        #expect(model.authorizationDenied == true)
        #expect(scheduler.scheduled.isEmpty)
    }

    @Test func disablingCancels() async {
        let scheduler = FakeScheduler()
        let model = RemindersModel(scheduler: scheduler, defaults: suite())
        await model.setEnabled(true)
        await model.setEnabled(false)
        #expect(model.settings.isEnabled == false)
        #expect(scheduler.cancelCount >= 1)
        #expect(scheduler.scheduled.isEmpty)
    }

    @Test func changingTimeReschedulesWhenEnabled() async {
        let scheduler = FakeScheduler()
        let model = RemindersModel(scheduler: scheduler, defaults: suite())
        await model.setEnabled(true)
        await model.setTime(hour: 8, minute: 15)
        let trigger = scheduler.scheduled.first?.trigger as? UNCalendarNotificationTrigger
        #expect(trigger?.dateComponents.hour == 8)
        #expect(trigger?.dateComponents.minute == 15)
    }

    @Test func changingTimeWhileOffDoesNotSchedule() async {
        let scheduler = FakeScheduler()
        let model = RemindersModel(scheduler: scheduler, defaults: suite())
        await model.setTime(hour: 8, minute: 15)
        #expect(model.settings.hour == 8)
        #expect(scheduler.scheduled.isEmpty)
    }

    @Test func changingTargetReschedulesDeepLink() async {
        let scheduler = FakeScheduler()
        let model = RemindersModel(scheduler: scheduler, defaults: suite())
        await model.setEnabled(true)
        await model.setTarget(.count)
        let userInfo = scheduler.scheduled.first?.content.userInfo
        #expect(userInfo?[PracticeReminder.tabUserInfoKey] as? String == AppTab.count.rawValue)
    }

    @Test func settingsPersistAcrossModels() async {
        let defaults = suite()
        let first = RemindersModel(scheduler: FakeScheduler(), defaults: defaults)
        await first.setEnabled(true)
        await first.setTime(hour: 6, minute: 45)
        let second = RemindersModel(scheduler: FakeScheduler(), defaults: defaults)
        #expect(second.settings.isEnabled == true)
        #expect(second.settings.hour == 6)
        #expect(second.settings.minute == 45)
    }

    @Test func refreshAuthorizationReflectsDenied() async {
        let scheduler = FakeScheduler()
        scheduler.status = .denied
        let model = RemindersModel(scheduler: scheduler, defaults: suite())
        await model.refreshAuthorization()
        #expect(model.authorizationDenied == true)
    }
}
