import AppKit
import Foundation
import MacCapture
import Vision

@main
struct MacCaptureBridge {
    static func main() async {
        do {
            let command = try BridgeCommand(arguments: Array(CommandLine.arguments.dropFirst()))
            try await command.run()
        } catch {
            FileHandle.standardError.write(Data((error.localizedDescription + "\n").utf8))
            Foundation.exit(1)
        }
    }
}

private enum BridgeCommand {
    case bootstrap
    case listSources
    case ocrImage(imagePath: String)
    case start(sessionId: String?, sourceId: String, includeAudio: Bool, resolution: CaptureResolutionProfile)
    case stream(
        sessionId: String,
        sourceId: String,
        includeAudio: Bool,
        resolution: CaptureResolutionProfile,
        frameIntervalMs: UInt64,
        maxFrames: Int?
    )
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
        case "ocr-image":
            let imagePath = try value(for: "--image-path", in: arguments)
            self = .ocrImage(imagePath: imagePath)
        case "start":
            let sessionId = optionalValue(for: "--session-id", in: arguments)
            let sourceId = try value(for: "--source-id", in: arguments)
            let includeAudio = boolValue(for: "--include-audio", in: arguments) ?? true
            let resolution = try resolutionValue(in: arguments) ?? .hd1080

            self = .start(
                sessionId: sessionId,
                sourceId: sourceId,
                includeAudio: includeAudio,
                resolution: resolution
            )
        case "stream":
            let sessionId = try value(for: "--session-id", in: arguments)
            let sourceId = try value(for: "--source-id", in: arguments)
            let includeAudio = boolValue(for: "--include-audio", in: arguments) ?? true
            let resolution = try resolutionValue(in: arguments) ?? .hd1080
            let frameIntervalMs = uint64Value(for: "--frame-interval-ms", in: arguments) ?? 900
            let maxFrames = intValue(for: "--max-frames", in: arguments)

            self = .stream(
                sessionId: sessionId,
                sourceId: sourceId,
                includeAudio: includeAudio,
                resolution: resolution,
                frameIntervalMs: frameIntervalMs,
                maxFrames: maxFrames
            )
        case "stop":
            let sessionId = try value(for: "--session-id", in: arguments)
            self = .stop(sessionId: sessionId)
        default:
            throw BridgeError.invalidArguments("Unknown bridge command: \(command)")
        }
    }

    func run() async throws {
        switch self {
        case .bootstrap:
            let coordinator = MacCaptureCoordinator()
            try writeJSONLine(
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
            try writeJSONLine(sources)
        case let .ocrImage(imagePath):
            let result = try OCRImageRecognizer().recognizeTokens(imagePath: imagePath)
            try writeJSONLine(result)
        case let .start(sessionId, sourceId, includeAudio, resolution):
            let started = try await startBridgeSession(
                sessionId: sessionId ?? defaultSessionId(),
                sourceId: sourceId,
                includeAudio: includeAudio,
                resolution: resolution
            )

            try writeJSONLine(started.storedSession)
        case let .stream(sessionId, sourceId, includeAudio, resolution, frameIntervalMs, maxFrames):
            let started = try await startBridgeSession(
                sessionId: sessionId,
                sourceId: sourceId,
                includeAudio: includeAudio,
                resolution: resolution
            )

            defer {
                _ = try? BridgeSessionRegistry.remove(sessionId: started.storedSession.sessionId)
            }

            try writeJSONLine(
                BridgeMacCaptureEvent.sessionStarted(
                    sessionId: started.storedSession.sessionId,
                    width: started.activeSession.outputWidth,
                    height: started.activeSession.outputHeight,
                    hasAudio: started.storedSession.hasAudio
                )
            )

            var audioMonitor: SystemAudioPreviewMonitor?

            if includeAudio {
                do {
                    let monitor = SystemAudioPreviewMonitor(
                        source: started.activeSession.source,
                        onAudioSample: { sample in
                            try? writeJSONLine(
                                BridgeMacCaptureEvent.audio(
                                    sessionId: started.storedSession.sessionId,
                                    tsMs: sample.tsMs,
                                    pcmRef: "native-audio://\(started.storedSession.sessionId)/\(sample.tsMs)",
                                    sampleRate: sample.sampleRate,
                                    channels: sample.channels
                                )
                            )
                        },
                        onError: { message in
                            try? writeJSONLine(
                                BridgeMacCaptureEvent.error(
                                    sessionId: started.storedSession.sessionId,
                                    code: "audio-preview-fallback",
                                    message: message
                                )
                            )
                        }
                    )
                    try await monitor.start()
                    audioMonitor = monitor
                } catch {
                    try writeJSONLine(
                        BridgeMacCaptureEvent.error(
                            sessionId: started.storedSession.sessionId,
                            code: "audio-preview-fallback",
                            message: error.localizedDescription
                        )
                    )
                }
            }

            var emittedFrameCount = 0

            while !Task.isCancelled {
                do {
                    let snapshot = try CapturePreviewSnapshotter.snapshot(
                        source: started.activeSession.source,
                        targetWidth: started.activeSession.outputWidth,
                        targetHeight: started.activeSession.outputHeight
                    )

                    try writeJSONLine(
                        BridgeMacCaptureEvent.frame(
                            sessionId: started.storedSession.sessionId,
                            tsMs: currentTimestampMs(),
                            width: snapshot.width,
                            height: snapshot.height,
                            pixelBufferRef: snapshot.dataURL
                        )
                    )
                } catch {
                    try writeJSONLine(
                        BridgeMacCaptureEvent.error(
                            sessionId: started.storedSession.sessionId,
                            code: "snapshot-failed",
                            message: error.localizedDescription
                        )
                    )
                }

                emittedFrameCount += 1

                if let maxFrames, emittedFrameCount >= maxFrames {
                    break
                }

                try await Task.sleep(nanoseconds: frameIntervalMs * 1_000_000)
            }

            if let audioMonitor {
                await audioMonitor.stop()
            }

            try writeJSONLine(
                BridgeMacCaptureEvent.sessionStopped(sessionId: started.storedSession.sessionId)
            )
        case let .stop(sessionId):
            let stopped = try BridgeSessionRegistry.remove(sessionId: sessionId)
            try writeJSONLine(BridgeStopResult(stopped: stopped))
        }
    }
}

private struct StartedBridgeSession {
    let storedSession: BridgeNativeCaptureSession
    let activeSession: ActiveCaptureSession
}

private func startBridgeSession(
    sessionId: String,
    sourceId: String,
    includeAudio: Bool,
    resolution: CaptureResolutionProfile
) async throws -> StartedBridgeSession {
    let coordinator = MacCaptureCoordinator()

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
    return StartedBridgeSession(storedSession: stored, activeSession: activeSession)
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

private struct BridgeOcrTokensResult: Codable {
    let tokens: [String]
}

private enum BridgeMacCaptureEvent: Encodable {
    case sessionStarted(sessionId: String, width: Int, height: Int, hasAudio: Bool)
    case frame(sessionId: String, tsMs: Int64, width: Int, height: Int, pixelBufferRef: String)
    case audio(sessionId: String, tsMs: Int64, pcmRef: String, sampleRate: Double, channels: Int)
    case error(sessionId: String, code: String, message: String)
    case sessionStopped(sessionId: String)

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)

        switch self {
        case let .sessionStarted(sessionId, width, height, hasAudio):
            try container.encode("session-started", forKey: .type)
            try container.encode(sessionId, forKey: .sessionId)
            try container.encode(width, forKey: .width)
            try container.encode(height, forKey: .height)
            try container.encode(hasAudio, forKey: .hasAudio)
        case let .frame(sessionId, tsMs, width, height, pixelBufferRef):
            try container.encode("frame", forKey: .type)
            try container.encode(sessionId, forKey: .sessionId)
            try container.encode(tsMs, forKey: .tsMs)
            try container.encode(width, forKey: .width)
            try container.encode(height, forKey: .height)
            try container.encode(pixelBufferRef, forKey: .pixelBufferRef)
        case let .audio(sessionId, tsMs, pcmRef, sampleRate, channels):
            try container.encode("audio", forKey: .type)
            try container.encode(sessionId, forKey: .sessionId)
            try container.encode(tsMs, forKey: .tsMs)
            try container.encode(pcmRef, forKey: .pcmRef)
            try container.encode(sampleRate, forKey: .sampleRate)
            try container.encode(channels, forKey: .channels)
        case let .error(sessionId, code, message):
            try container.encode("error", forKey: .type)
            try container.encode(sessionId, forKey: .sessionId)
            try container.encode(code, forKey: .code)
            try container.encode(message, forKey: .message)
        case let .sessionStopped(sessionId):
            try container.encode("session-stopped", forKey: .type)
            try container.encode(sessionId, forKey: .sessionId)
        }
    }

    private enum CodingKeys: String, CodingKey {
        case type
        case sessionId
        case width
        case height
        case hasAudio
        case tsMs
        case pixelBufferRef
        case pcmRef
        case sampleRate
        case channels
        case code
        case message
    }
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
    case ocrUnavailable(String)

    var errorDescription: String? {
        switch self {
        case let .invalidArguments(message):
            return message
        case let .ocrUnavailable(message):
            return message
        }
    }
}

private final class OCRImageRecognizer {
    func recognizeTokens(imagePath: String) throws -> BridgeOcrTokensResult {
        let imageURL = URL(fileURLWithPath: imagePath)

        guard
            let image = NSImage(contentsOf: imageURL),
            let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil)
        else {
            throw BridgeError.ocrUnavailable("Unable to decode OCR image at \(imagePath)")
        }

        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.recognitionLanguages = ["ko-KR", "en-US"]
        request.usesLanguageCorrection = false

        let handler = VNImageRequestHandler(cgImage: cgImage)
        try handler.perform([request])

        let tokens = (request.results ?? [])
            .compactMap { $0.topCandidates(1).first?.string }
            .flatMap(tokenizeRecognizedText)

        return BridgeOcrTokensResult(tokens: uniqueTokens(tokens))
    }
}

private func tokenizeRecognizedText(_ text: String) -> [String] {
    guard let regex = try? NSRegularExpression(pattern: #"[0-9A-Za-z가-힣]{2,}"#) else {
        return []
    }

    let range = NSRange(text.startIndex..., in: text)
    return regex.matches(in: text, range: range).compactMap { match in
        guard let tokenRange = Range(match.range, in: text) else {
            return nil
        }

        return String(text[tokenRange])
    }
}

private func uniqueTokens(_ tokens: [String]) -> [String] {
    var seen = Set<String>()

    return tokens.filter { token in
        if seen.contains(token) {
            return false
        }

        seen.insert(token)
        return true
    }
}

private func writeJSONLine(_ value: some Encodable) throws {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    let data = try encoder.encode(value)
    try OutputWriter.shared.write(data: data)
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

private func optionalValue(for flag: String, in arguments: [String]) -> String? {
    guard
        let index = arguments.firstIndex(of: flag),
        arguments.indices.contains(index + 1)
    else {
        return nil
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

private func intValue(for flag: String, in arguments: [String]) -> Int? {
    guard let value = optionalValue(for: flag, in: arguments) else {
        return nil
    }

    return Int(value)
}

private func uint64Value(for flag: String, in arguments: [String]) -> UInt64? {
    guard let value = optionalValue(for: flag, in: arguments) else {
        return nil
    }

    return UInt64(value)
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

private func defaultSessionId() -> String {
    "native-session-\(UUID().uuidString.lowercased())"
}

private func currentTimestampMs() -> Int64 {
    Int64(Date().timeIntervalSince1970 * 1000)
}

private final class OutputWriter: @unchecked Sendable {
    static let shared = OutputWriter()
    private let lock = NSLock()

    func write(data: Data) throws {
        lock.lock()
        defer { lock.unlock() }
        try FileHandle.standardOutput.write(contentsOf: data)
        try FileHandle.standardOutput.write(contentsOf: Data([0x0A]))
    }
}
