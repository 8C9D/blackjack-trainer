import SwiftUI

/// The verdict on the last playing decision at the showdown table. Coaching,
/// not grading: the play stands either way, so a miss is tinted rather than
/// shouted. Mirrors the web `.showdown__coach` rule.
///
/// Its own view (and file) so `ShowdownView` stays inside the type-body budget,
/// following `PracticeDataSection`.
struct PlayCoachView: View {
    let verdict: PlayVerdict

    var body: some View {
        line
            .font(.system(size: 12))
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(
                RoundedRectangle(cornerRadius: 8)
                    .fill(verdict.correct ? Color.clear : Theme.badTint)
            )
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(Theme.hairline, lineWidth: 1))
    }

    private var line: Text {
        let head = verdict.correct ? "Correct." : "\(verdict.expected.label) was the play."
        return Text(head).bold().foregroundStyle(verdict.correct ? Theme.good : Theme.bad)
            + Text(" ")
            + Text(verdict.reason).foregroundStyle(Theme.midInk)
    }
}

/// The round's misplays, named in the result panel — a verdict that scrolls past
/// as the next hand is played would be no use.
struct MisplayListView: View {
    let misplays: [String]

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(misplays.count == 1
                ? "One misplay this round"
                : "\(misplays.count) misplays this round")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Theme.bad)
            ForEach(misplays, id: \.self) { line in
                Text("• " + line)
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.midInk)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

#Preview {
    VStack(spacing: 12) {
        PlayCoachView(verdict: PlayVerdict(
            correct: false, expected: .stand,
            reason: "Hard 15 vs dealer 3 under S17: stand."
        ))
        MisplayListView(misplays: ["Hard 15 vs 3: Stand, not Double"])
    }
    .padding()
    .background(Theme.surface)
    .preferredColorScheme(.dark)
}
