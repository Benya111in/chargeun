import Foundation
import MacCapture

@main
struct MacCaptureBridge {
    static func main() async {
        do {
            let command = try BridgeCommand(arguments: Array(CommandLine.arguments.dropFirst()))
            let output = try await command.execute()
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.sortedKeys]
            let data = try encoder.encode(output)
            FileHandle.standardOutput.write(data)
            FileHandle.standardOutput.write(Data([0x0A]))
        } catch {
            FileHandle.standardError.write(Data((error.localizedDescription + "\n").utf8))
            Foundation.exit(1)
        }
    }
}

private enum BridgeCommand {
    case bootstrap
    case listSources
    case start(sourceId: String, includeAudio: Bool, resolution: CaptureResolutionProfile)
    case stop(sessionId: String)

    init(arguments: [String]) throws {
        guard let command = arguments.first else {
            throw BridgeError.invalidArguments("Missing bridge command")
        }

        switch command {
        case "bootstrap":
            self = .bootstrap
        case "list-sources":
            self = .listSources
        case "start":
            let sourceId = try value(for: "--source-id", in: arguments)
            let includeAudio = boolValue(for: "--include-audio", in: arguments) ?? true
            let resolution = try resolutionValue(in: arguments) ?? .hd1080
            self = .start(
                sourceId: sourceId,
                includeAudio: includeAudio,
                resolution: resolution
            )
        case "stop":
            let sessionId = try value(for: "--session-id", in: arguments)
            self = .stop(sessionId: sessionId)
        default:
            throw BridgeError.invalidArguments("Unknown bridge command: \(command)")
        }
    }

    func execute() async throws -> BridgeOutput {
        switch self {
        case .bootstrap:
            let coordinator = MacCaptureCoordinator()
            return .bootstrap(
                BridgeBootstrapState(
                    platform: "mac-priority",
                    capturePath: "screen-capture-kit-swift-bridge-ready",
                    shadowDelayMs: 4000,
                    permissionState: await coordinator.screenRecordingPermissionState().rawValue
                )
            )
        case .listSources:
            let coordinator = MacCaptureCoordinator()
            let sources = try await coordinator.enumerateSources().map(BridgeCaptureSource.init)
            return .sources(sources)
        case let .start(sourceId, includeAudio, resolution):
            let coordinator = MacCaptureCoordinator()
            let sessionId = "native-session-\(UUID().uuidString.lowercased())"

            _ = try await coordinator.startSession(
                request: MacCaptureSessionRequest(
                    sessionId: sessionId,
                    sourceId: sourceId,
                    includeAudio: includeAudio,
                    resolution: resolution
                )
            )

            guard let activeSession = await coordinator.activeSession(sessionId: sessionId) else {
                throw BridgeError.invalidArguments("Coordinator did not retain the started session")
            }

            let stored = BridgeNativeCaptureSession(
                sessionId: activeSession.sessionId,
                sourceId: activeSession.source.id,
                sourceType: activeSession.source.sourceType,
                displayName: activeSession.source.displayName,
                hasAudio: activeSession.hasAudio,
                platform: "mac",
                startedAt: UInt64(activeSession.startedAt.timeIntervalSince1970 * 1000),
                outputWidth: activeSession.outputWidth,
                outputHeight: activeSession.outputHeight
            )

            try BridgeSessionRegistry.save(stored)
            return .session(stored)
        case let .stop(sessionId):
            let stopped = try BridgeSessionRegistry.remove(sessionId: sessionId)
            return .stop(BridgeStopResult(stopped: stopped))
        }
    }
}

private enum BridgeOutput: Encodable {
    case bootstrap(BridgeBootstrapState)
    case sources([BridgeCaptureSource])
    case session(BridgeNativeCaptureSession)
    case stop(BridgeStopResult)

    func encode(to encoder: Encoder) throws {
        switch self {
        case let .bootstrap(value):
            try value.encode(to: encoder)
        case let .sources(value):
            try value.encode(to: encoder)
        case let .session(value):
            try value.encode(to: encoder)
        case let .stop(value):
            try value.encode(to: encoder)
        }
    }
}

private struct BridgeBootstrapState: Codable {
    let platform: String
    let capturePath: String
    let shadowDelayMs: UInt64
    let permissionState: String
}

private struct BridgeCaptureSource: Codable {
    let id: String
    let displayName: String
    let sourceType: String
    let width: Int
    let height: Int

    init(_ source: CaptureSourceSummary) {
        id = source.id
        displayName = source.displayName
        sourceType = source.sourceType
        width = source.width
        height = source.height
    }
}

private struct BridgeNativeCaptureSession: Codable {
    let sessionId: String
    let sourceId: String
    let sourceType: String
    let displayName: String
    let hasAudio: Bool
    let platform: String
    let startedAt: UInt64
    let outputWidth: Int
    let outputHeight: Int
}

private struct BridgeStopResult: Codable {
    let stopped: Bool
}

private enum BridgeSessionRegistry {
    private static let storeURL = FileManager.default.temporaryDirectory
        .appendingPathComponent("slowlearner-mac-capture-sessions.json")

    static func save(_ session: BridgeNativeCaptureSession) throws {
        var sessions = try loadAll()
        sessions.removeAll { $0.sessionId == session.sessionId }
        sessions.append(session)
        try persist(sessions)
    }

    static func remove(sessionId: String) throws -> Bool {
        let sessions = try loadAll()
        let remaining = sessions.filter { $0.sessionId != sessionId }

        if remaining.count == sessions.count {
            return false
        }

        try persist(remaining)
        return true
    }

    private static func loadAll() throws -> [BridgeNativeCaptureSession] {
        guard FileManager.default.fileExists(atPath: storeURL.path) else {
            return []
        }

        let data = try Data(contentsOf: storeURL)
        return try JSONDecoder().decode([BridgeNativeCaptureSession].self, from: data)
    }

    private static func persist(_ sessions: [BridgeNativeCaptureSession]) throws {
        let data = try JSONEncoder().encode(sessions)
        try data.write(to: storeURL, options: .atomic)
    }
}

private enum BridgeError: Error, LocalizedError {
    case invalidArguments(String)

    var errorDescription: String? {
        switch self {
        case let .invalidArguments(message):
            return message
        }
    }
}

private func value(for flag: String, in arguments: [String]) throws -> String {
    guard
        let index = arguments.firstIndex(of: flag),
        arguments.indices.contains(index + 1)
    else {
        throw BridgeError.invalidArguments("Missing value for \(flag)")
    }

    return arguments[index + 1]
}

private func boolValue(for flag: String, in arguments: [String]) -> Bool? {
    guard
        let index = arguments.firstIndex(of: flag),
        arguments.indices.contains(index + 1)
    else {
        return nil
    }

    return ["1", "true", "yes"].contains(arguments[index + 1].lowercased())
}

private func resolutionValue(in arguments: [String]) throws -> CaptureResolutionProfile? {
    guard
        let index = arguments.firstIndex(of: "--resolution"),
        arguments.indices.contains(index + 1)
    else {
        return nil
    }

    guard let resolution = CaptureResolutionProfile(rawValue: arguments[index + 1]) else {
        throw BridgeError.invalidArguments("Unsupported resolution profile")
    }

    return resolution
}
