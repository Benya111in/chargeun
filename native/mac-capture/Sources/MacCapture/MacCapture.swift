import AVFoundation
import Foundation
import ScreenCaptureKit

public struct CaptureSourceSummary: Sendable, Equatable {
    public let id: String
    public let displayName: String
    public let sourceType: String

    public init(id: String, displayName: String, sourceType: String) {
        self.id = id
        self.displayName = displayName
        self.sourceType = sourceType
    }
}

public enum MacCaptureBridgeEvent: Sendable, Equatable {
    case sessionStarted(sessionId: String, width: Int, height: Int, hasAudio: Bool)
    case frame(sessionId: String, tsMs: Int64, width: Int, height: Int, pixelBufferRef: String)
    case audio(sessionId: String, tsMs: Int64, pcmRef: String, sampleRate: Double, channels: Int)
    case error(sessionId: String, code: String, message: String)
    case sessionStopped(sessionId: String)
}

public enum MacCaptureError: Error, LocalizedError {
    case permissionDenied
    case notImplemented(String)

    public var errorDescription: String? {
        switch self {
        case .permissionDenied:
            return "Screen recording permission has not been granted."
        case let .notImplemented(message):
            return message
        }
    }
}

public actor MacCaptureCoordinator {
    public init() {}

    public func hasScreenRecordingPermission() -> Bool {
        CGPreflightScreenCaptureAccess()
    }

    @discardableResult
    public func requestScreenRecordingPermission() -> Bool {
        CGRequestScreenCaptureAccess()
    }

    public func enumerateSources() async throws -> [CaptureSourceSummary] {
        let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)

        let displays = content.displays.map {
            CaptureSourceSummary(
                id: $0.displayID.description,
                displayName: "Display \($0.displayID)",
                sourceType: "monitor"
            )
        }

        let windows = content.windows.map {
            CaptureSourceSummary(
                id: "\($0.windowID)",
                displayName: $0.title ?? "Untitled Window",
                sourceType: "window"
            )
        }

        return displays + windows
    }

    public func startSession(
        sessionId: String,
        sourceId: String,
        includeAudio: Bool
    ) async throws -> MacCaptureBridgeEvent {
        guard hasScreenRecordingPermission() || requestScreenRecordingPermission() else {
            throw MacCaptureError.permissionDenied
        }

        _ = sourceId
        return .error(
            sessionId: sessionId,
            code: "NOT_IMPLEMENTED",
            message: "ScreenCaptureKit bridge wiring will land in the next phase. Audio requested: \(includeAudio)"
        )
    }

    public func stopSession(sessionId: String) -> MacCaptureBridgeEvent {
        .sessionStopped(sessionId: sessionId)
    }
}
