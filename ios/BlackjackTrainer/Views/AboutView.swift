import SwiftUI

/// The About tab. Beyond a short app description it carries the acknowledgements
/// the app is obligated to ship: the LGPL 3.0 attribution for the card artwork
/// and the MIT notice for the app's own code (Slice 2.3). The full license texts
/// are bundled and viewable in-app.
struct AboutView: View {
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    header
                    section(title: "Practice", body: practiceLinks)
                    section(title: "Card artwork", body: cardArtwork)
                    section(title: "App code", body: appCode)
                    section(title: "License texts", body: licenseLinks)
                }
                .padding()
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .appBackground()
            .navigationTitle("About")
            .tint(Theme.accent)
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Blackjack Trainer")
                .font(.title.weight(.bold))
                .foregroundStyle(Theme.primaryText)
            Text("An educational basic-strategy and card-counting trainer. No real-money wagering.")
                .font(.subheadline)
                .foregroundStyle(Theme.secondaryText)
        }
    }

    private var cardArtwork: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(
                "Card faces and the card back are from the Vector Playing Card "
                    + "Library 1.3 by Chris Aguilar (totalnonsense.com), used under "
                    + "the GNU Lesser General Public License v3.0. The artwork is "
                    + "repackaged as iOS asset-catalog vectors; that format change "
                    + "does not alter its license."
            )
            .font(.subheadline)
            .foregroundStyle(Theme.primaryText)

            Text("Vector Playing Card Library 1.3 — © Chris Aguilar — LGPL 3.0")
                .font(.footnote)
                .foregroundStyle(Theme.secondaryText)
        }
    }

    private var appCode: some View {
        Text(
            "Blackjack Trainer's own code is released under the MIT License. "
                + "© 2026 Arthur Zhang."
        )
        .font(.subheadline)
        .foregroundStyle(Theme.primaryText)
    }

    private var practiceLinks: some View {
        NavigationLink {
            RemindersView()
        } label: {
            HStack {
                Text("Practice reminders")
                    .foregroundStyle(Theme.primaryText)
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Theme.secondaryText)
            }
            .padding()
        }
        .background(Theme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private var licenseLinks: some View {
        VStack(alignment: .leading, spacing: 0) {
            licenseLink("Card art authors", file: "AUTHORS.txt")
            divider
            licenseLink("LGPL 3.0 (LESSER)", file: "COPYING.LESSER.txt")
            divider
            licenseLink("GPL 3.0", file: "COPYING.txt")
        }
        .background(Theme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func licenseLink(_ title: String, file: String) -> some View {
        NavigationLink {
            LicenseTextView(title: title, file: file)
        } label: {
            HStack {
                Text(title)
                    .foregroundStyle(Theme.primaryText)
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Theme.secondaryText)
            }
            .padding()
        }
    }

    private var divider: some View {
        Divider().overlay(Theme.background)
    }

    private func section(title: String, body: some View) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title.uppercased())
                .font(.caption.weight(.semibold))
                .foregroundStyle(Theme.secondaryText)
            body
        }
    }
}

/// Scrollable, selectable view of a bundled license text file.
struct LicenseTextView: View {
    let title: String
    let file: String

    var body: some View {
        ScrollView {
            Text(LicenseLoader.text(file))
                .font(.system(.footnote, design: .monospaced))
                .foregroundStyle(Theme.primaryText)
                .textSelection(.enabled)
                .padding()
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .appBackground()
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// Loads a bundled license text file by exact file name.
enum LicenseLoader {
    static func text(_ fileName: String) -> String {
        guard
            let url = Bundle.main.url(forResource: fileName, withExtension: nil),
            let contents = try? String(contentsOf: url, encoding: .utf8)
        else {
            return "License text is bundled with the app. If you are seeing this, the file could not be read."
        }
        return contents
    }
}

#Preview {
    AboutView()
        .preferredColorScheme(.dark)
}
