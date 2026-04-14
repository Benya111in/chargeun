import AVFoundation
import Foundation
import ScreenCaptureKit

public struct CaptureSourceSummary: Sendable, Equatable {
    public let id: String
    public let displayName: String
    public let sourceType: String
    public let width: Int
    public let height: Int

    public init(
        id: String,
        displayName: String,
        sourceType: String,
        width: Int,
        height: Int
    ) {
        self.id = id
        self.displayName = displayName
        self.sourceType = sourceType
        self.width = width
        self.height = height
    }
}

public struct MacCaptureSessionRequest: Sendable, Equatable {
    public let sessionId: String
    public let sourceId: String
    public let includeAudio: Bool
    public let resolution: CaptureResolutionProfile

    public init(
        sessionId: String,
        sourceId: String,
        includeAudio: Bool,
        resolution: CaptureResolutionProfile = .hd1080
    ) {
        self.sessionId = sessionId
        self.sourceId = sourceId
        self.includeAudio = includeAudio
        self.resolution = resolution
    }
}

public struct ActiveCaptureSession: Sendable, Equatable {
    public let sessionId: String
    public let source: CaptureSourceSummary
    public let hasAudio: Bool
    public let startedAt: Date
    public let outputWidth: Int
    public let outputHeight: Int

    public init(
        sessionId: String,
        source: CaptureSourceSummary,
        hasAudio: Bool,
        startedAt: Date,
        outputWidth: Int,
        outputHeight: Int
    ) {
        self.sessionId = sessionId
        self.source = source
        self.hasAudio = hasAudio
        self.startedAt = startedAt
        self.outputWidth = outputWidth
        self.outputHeight = outputHeight
    }
}

public enum CaptureResolutionProfile: String, Sendable, Equatable {
    case hd720
    case hd1080

    var maxDimensions: (width: Int, height: Int) {
        switch self {
        case .hd720:
            return (1280, 720)
        case .hd1080:
            return (1920, 1080)
        }
    }
}

public enum ScreenRecordingPermissionState: String, Sendable, Equatable {
    case granted
    case denied
}

public enum MacCaptureBridgeEvent: Sendable, Equatable {
    case sessionStarted(sessionId: String, width: Int, height: Int, hasAudio: Bool)
    case frame(sessionId: String, tsMs: Int64, width: Int, height: Int, pixelBufferRef: String)
    case audio(sessionId: String, tsMs: Int64, pcmRef: String, sampleRate: Double, channels: Int)
    case error(sessionId: String, code: String, message: String)
    case sessionStopped(sessionId: String)
}

public enum MacCaptureError: Error, LocalizedError, Equatable {
    case permissionDenied
    case sourceNotFound(String)
    case sessionAlreadyRunning(String)
    case notImplemented(String)

    public var errorDescription: String? {
        switch self {
        case .permissionDenied:
            return "Screen recording permission has not been granted."
        case let .sourceNotFound(sourceId):
            return "Capture source \(sourceId) was not found."
        case let .sessionAlreadyRunning(sessionId):
            return "Capture session \(sessionId) is already running."
        case let .notImplemented(message):
            return message
        }
    }
}

public actor MacCaptureCoordinator {
    private let permissionProbe: @Sendable () -> Bool
    private let permissionRequester: @Sendable () -> Bool
    private let sourceLoader: @Sendable () async throws -> [CaptureSourceSummary]
    private var activeSessions: [String: ActiveCaptureSession] = [:]

    public init(
        permissionProbe: @escaping @Sendable () -> Bool = {
            CGPreflightScreenCaptureAccess()
        },
        permissionRequester: @escaping @Sendable () -> Bool = {
            CGRequestScreenCaptureAccess()
        },
        sourceLoader: @escaping @Sendable () async throws -> [CaptureSourceSummary] = {
            try await MacCaptureCoordinator.loadSystemSources()
        }
    ) {
        self.permissionProbe = permissionProbe
        self.permissionRequester = permissionRequester
        self.sourceLoader = sourceLoader
    }

    public func screenRecordingPermissionState() -> ScreenRecordingPermissionState {
        permissionProbe() ? .granted : .denied
    }

    public func hasScreenRecordingPermission() -> Bool {
        screenRecordingPermissionState() == .granted
    }

    @discardableResult
    public func requestScreenRecordingPermission() -> ScreenRecordingPermissionState {
        permissionRequester() ? .granted : .denied
    }

    public func enumerateSources() async throws -> [CaptureSourceSummary] {
        try await sourceLoader()
    }

    public func startSession(
        request: MacCaptureSessionRequest
    ) async throws -> MacCaptureBridgeEvent {
        guard activeSessions[request.sessionId] == nil else {
            throw MacCaptureError.sessionAlreadyRunning(request.sessionId)
        }

        guard hasScreenRecordingPermission() || requestScreenRecordingPermission() == .granted else {
            throw MacCaptureError.permissionDenied
        }

        let sources = try await enumerateSources()
        guard let source = sources.first(where: { $0.id == request.sourceId }) else {
            throw MacCaptureError.sourceNotFound(request.sourceId)
        }

        let outputSize = scaledDimensions(
            width: source.width,
            height: source.height,
            profile: request.resolution
        )

        let session = ActiveCaptureSession(
            sessionId: request.sessionId,
            source: source,
            hasAudio: request.includeAudio,
            startedAt: Date(),
            outputWidth: outputSize.width,
            outputHeight: outputSize.height
        )

        activeSessions[request.sessionId] = session

        return .sessionStarted(
            sessionId: request.sessionId,
            width: outputSize.width,
            height: outputSize.height,
            hasAudio: request.includeAudio
        )
    }

    public func startSession(
        sessionId: String,
        sourceId: String,
        includeAudio: Bool
    ) async throws -> MacCaptureBridgeEvent {
        try await startSession(
            request: MacCaptureSessionRequest(
                sessionId: sessionId,
                sourceId: sourceId,
                includeAudio: includeAudio
            )
        )
    }

    public func activeSession(sessionId: String) -> ActiveCaptureSession? {
        activeSessions[sessionId]
    }

    public func activeSessionCount() -> Int {
        activeSessions.count
    }

    public func stopSession(sessionId: String) -> MacCaptureBridgeEvent {
        activeSessions.removeValue(forKey: sessionId)
        return .sessionStopped(sessionId: sessionId)
    }

    public static func loadSystemSources() async throws -> [CaptureSourceSummary] {
        let content = try await SCShareableContent.excludingDesktopWindows(
            false,
            onScreenWindowsOnly: true
        )

        let displays = content.displays.map {
            CaptureSourceSummary(
                id: $0.displayID.description,
                displayName: "Display \($0.displayID)",
                sourceType: "monitor",
                width: Int($0.width),
                height: Int($0.height)
            )
        }

        let windows = content.windows.map {
            CaptureSourceSummary(
                id: "\($0.windowID)",
                displayName: $0.title ?? "Untitled Window",
                sourceType: "window",
                width: Int($0.frame.width),
                height: Int($0.frame.height)
            )
        }

        return displays + windows
    }
}

func scaledDimensions(
    width: Int,
    height: Int,
    profile: CaptureResolutionProfile
) -> (width: Int, height: Int) {
    let maxDimensions = profile.maxDimensions
    guard width > 0, height > 0 else {
        return (maxDimensions.width, maxDimensions.height)
    }

    let scale = min(
        1,
        min(
            Double(maxDimensions.width) / Double(width),
            Double(maxDimensions.height) / Double(height)
        )
    )

    return (
        width: max(1, Int(Double(width) * scale)),
        height: max(1, Int(Double(height) * scale))
    )
}
