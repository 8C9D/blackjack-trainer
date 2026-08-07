import SwiftUI

/// A standing correctness warning: bordered, at full body contrast rather than
/// the muted grey a footnote uses, and never dismissible. It is for the case
/// where a setting made elsewhere in the app means the numbers on this screen
/// are not what they look like. Mirrors the web `.drill__advisory` /
/// `.chart__note--warn` / `.settings__advisory` rule.
struct AdvisoryNoteView: View {
    let text: String
    var alignment: TextAlignment = .center

    var body: some View {
        Text(text)
            .font(.caption)
            .foregroundStyle(Theme.midInk)
            .multilineTextAlignment(alignment)
            // Take the height the wrapped text actually needs. Without it the
            // sentence is offered one line's worth of height and tails off in an
            // ellipsis — which for a warning loses the half that says what to do.
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: 420, alignment: alignment == .center ? .center : .leading)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(Theme.hairline, lineWidth: 1)
            )
    }
}

#Preview {
    AdvisoryNoteView(
        text: "These indices are Hi-Lo true counts, and you count Omega II, which reads a "
            + "different true count off the same shoe. Its own indices are not these numbers."
    )
    .padding()
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(Theme.ground)
    .preferredColorScheme(.dark)
}
