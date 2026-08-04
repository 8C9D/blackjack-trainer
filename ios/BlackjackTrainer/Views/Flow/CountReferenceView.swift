import SwiftUI

/// The chart's count tab: the tags the counting drill actually grades against.
/// Its own file so the strategy grids' screen stays inside the lint limit.
/// Mirrors the web chart page's `mode() === 'count'` branch.
struct CountReferenceView: View {
    let reference: CountReference

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            tagCard
            note(reference.systemDescription)
            note(reference.balanceNote)
            if !reference.keyCountRows.isEmpty {
                scheduleCard
            } else if let missing = reference.keyCountMissing {
                note(missing)
            }
            if let colorNote = reference.colorNote {
                note(colorNote)
            }
        }
    }

    private func note(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 12))
            .foregroundStyle(Theme.muted)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// The tags as chips that wrap, where the web prints a table.
    ///
    /// The column count is the system's, not the layout's — three for a system
    /// a human can play, ten for the computer-only ones with a distinct weight
    /// per rank — so a fixed row of columns would either crush the common case
    /// to fit the extreme one or need a sideways scroll. A chip carries its own
    /// ranks, so it needs no column to be read under and simply wraps.
    private var tagCard: some View {
        card(title: "What each card is worth") {
            VStack(alignment: .leading, spacing: 10) {
                ForEach(Array(reference.table.rowLabels.enumerated()),
                        id: \.element) { index, label in
                    // One unlabelled group for a rank-only system; for a
                    // color-dependent one, a named group each for red and black.
                    if reference.table.rowLabels.count > 1 {
                        Text(label)
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(Theme.midInk)
                            .accessibilityHidden(true)
                    }
                    tagChips(row: index, label: label)
                }
            }
        }
    }

    private func tagChips(row: Int, label: String) -> some View {
        LazyVGrid(
            columns: [GridItem(.adaptive(minimum: 62), spacing: 6, alignment: .leading)],
            alignment: .leading,
            spacing: 6
        ) {
            ForEach(reference.table.columns) { column in
                tagChip(column.values[row], cards: column.label, row: label)
            }
        }
    }

    /// A tag is a number, not one of the six actions, so it takes the neutral
    /// raised surface rather than borrowing an action's colour.
    private func tagChip(_ value: String, cards: String, row: String) -> some View {
        VStack(spacing: 1) {
            Text(cards)
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(Theme.muted)
            Text(value)
                .font(.system(size: 15, weight: .semibold))
                .monospacedDigit()
                .foregroundStyle(Theme.ink)
        }
        .lineLimit(1)
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 6)
        .padding(.vertical, 6)
        .background(Theme.raised)
        .clipShape(RoundedRectangle(cornerRadius: 6))
        .accessibilityElement()
        // The chips have no table semantics for VoiceOver to lean on, so each
        // names its own ranks — and, for a color-dependent system, which of the
        // two groups it is in.
        .accessibilityLabel(
            reference.table.rowLabels.count > 1
                ? "\(cards), \(row): \(value)"
                : "\(cards): \(value)"
        )
    }

    private var scheduleCard: some View {
        card(title: reference.keyCountCaption) {
            VStack(spacing: 0) {
                ForEach(Array(reference.keyCountRows.enumerated()),
                        id: \.element.id) { index, row in
                    if index > 0 {
                        Divider().overlay(Theme.hairline)
                    }
                    HStack(spacing: 8) {
                        Text(row.label)
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.ink)
                        Spacer(minLength: 4)
                        Text(row.value)
                            .font(.system(size: 13))
                            .monospacedDigit()
                            .foregroundStyle(Theme.midInk)
                    }
                    .padding(.vertical, 7)
                    .accessibilityElement(children: .combine)
                }
            }
        }
    }

    private func card(title: String, @ViewBuilder content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(.system(size: 11, weight: .semibold))
                .tracking(1.4)
                .textCase(.uppercase)
                .foregroundStyle(Theme.muted)
            content()
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.surface)
        .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Theme.hairline, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }
}
