import Foundation

/// Schedules the "flash → auto-advance" delay after a correct answer. Injectable
/// so tests drive advancement deterministically instead of racing a real clock
/// (the analogue of the web's `FLOW_ADVANCE_DELAY_MS` injection token).
@MainActor
protocol FlowAdvanceScheduler: AnyObject {
    /// Schedule `action` to run after `delay`, cancelling any pending advance.
    func schedule(after delay: Duration, _ action: @escaping () -> Void)
    /// Cancel a pending advance (e.g. the screen unmounts mid-flash).
    func cancel()
}

/// The real scheduler: a cancellable main-actor task that sleeps for the delay.
@MainActor
final class RealFlowAdvanceScheduler: FlowAdvanceScheduler {
    private var task: Task<Void, Never>?

    func schedule(after delay: Duration, _ action: @escaping () -> Void) {
        cancel()
        task = Task { @MainActor in
            try? await Task.sleep(for: delay)
            if Task.isCancelled { return }
            action()
        }
    }

    func cancel() {
        task?.cancel()
        task = nil
    }
}

/// A test scheduler that captures the pending advance so a test can fire it
/// synchronously — the analogue of `vi.advanceTimersByTime`.
@MainActor
final class ManualFlowAdvanceScheduler: FlowAdvanceScheduler {
    private var pending: (() -> Void)?

    var hasPending: Bool {
        pending != nil
    }

    func schedule(after _: Duration, _ action: @escaping () -> Void) {
        pending = action
    }

    func cancel() {
        pending = nil
    }

    /// Run and clear the pending advance, if any.
    func fire() {
        let action = pending
        pending = nil
        action?()
    }
}
