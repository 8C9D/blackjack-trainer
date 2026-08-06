import SwiftUI
import UniformTypeIdentifiers

/// A backup file as SwiftUI's exporter wants it: bytes plus a name.
struct BackupDocument: FileDocument {
    static let readableContentTypes = [UTType.json]

    let data: Data

    init(data: Data) {
        self.data = data
    }

    init(configuration: ReadConfiguration) throws {
        data = configuration.file.regularFileContents ?? Data()
    }

    func fileWrapper(configuration _: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents: data)
    }
}

/// Settings' "Backup" section: write everything this app knows about a trainee
/// to a file, and put it back from one.
///
/// iCloud already carries a trainee between their own devices, silently. What it
/// cannot do is carry them *off* the platform — onto the web app, onto someone
/// else's phone, or into a file kept before deleting the app. The format is the
/// web's byte for byte, so one file moves a profile either way.
///
/// Its own view (and file) alongside `PracticeDataSection`, so the exporter and
/// importer state sit next to the controls and Settings stays inside the
/// file-length budget.
struct BackupSection: View {
    @Environment(AppModel.self) private var model
    @State private var exporting = false
    @State private var importing = false
    @State private var document: BackupDocument?
    @State private var fileName = ""
    @State private var status: String?
    @State private var statusIsError = false

    var body: some View {
        Section("Backup") {
            Text(
                "A backup holds every drill's stats, your practice history and streak, your weak "
                    + "spots, the showdown record and chips, and your settings. The same file "
                    + "restores in the web app."
            )
            .font(.footnote)
            .foregroundStyle(Theme.muted)

            Button("Export backup") { startExport() }
            Button("Restore from backup") { importing = true }

            if let status {
                Text(status)
                    .font(.footnote)
                    .foregroundStyle(statusIsError ? Theme.bad : Theme.muted)
            }
        }
        .fileExporter(
            isPresented: $exporting,
            document: document,
            contentType: .json,
            defaultFilename: fileName
        ) { result in
            switch result {
            case let .success(url): report("Saved \(url.lastPathComponent).", isError: false)
            case .failure: report("The backup could not be saved.", isError: true)
            }
        }
        .fileImporter(isPresented: $importing, allowedContentTypes: [.json]) { result in
            switch result {
            case let .success(url): restore(from: url)
            case .failure: report("That file could not be opened.", isError: true)
            }
        }
    }

    private func startExport() {
        let built = model.backup.build()
        guard let data = model.backup.encoded(built) else {
            report("The backup could not be prepared.", isError: true)
            return
        }
        document = BackupDocument(data: data)
        fileName = Backup.fileName(exportedAt: built.exportedAt)
        exporting = true
    }

    private func restore(from url: URL) {
        // A file handed over by the document picker lives outside the app's
        // sandbox, so it has to be opened under a security scope.
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        guard let bytes = try? Data(contentsOf: url),
              let text = String(data: bytes, encoding: .utf8)
        else {
            report("That file could not be read.", isError: true)
            return
        }
        switch model.restoreBackup(text) {
        case .ok: report("Backup restored.", isError: false)
        case let .failed(error): report(error, isError: true)
        }
    }

    private func report(_ message: String, isError: Bool) {
        status = message
        statusIsError = isError
    }
}
