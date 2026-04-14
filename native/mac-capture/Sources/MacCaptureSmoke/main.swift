import Foundation
import MacCapture

@main
struct MacCaptureSmoke {
    static func main() async throws {
        try await verifyStartStopFlow()
        try await verifyPermissionFailure()
        print("MacCapture smoke checks passed")
    }

    private static func verifyStartStopFlow() async throws {
        let coordinator = MacCaptureCoordinator(
            permissionProbe: { true },
            permissionRequester: { true },
            sourceLoader: {
                [
                    CaptureSourceSummary(
                        id: "display-1",
                        displayName: "Primary Display",
                        sourceType: "monitor",
                        width: 2560,
                        height: 1440
                    )
                ]
            }
        )

        let event = try await coordinator.startSession(
            request: MacCaptureSessionRequest(
                sessionId: "smoke-demo",
                sourceId: "display-1",
                includeAudio: true,
                resolution: .hd720
            )
        )

        guard case let .sessionStarted(sessionId, width, height, hasAudio) = event else {
            throw SmokeError.failed("Expected a session-started event")
        }

        guard sessionId == "smoke-demo", width == 1280, height == 720, hasAudio else {
            throw SmokeError.failed("Unexpected session-started payload")
        }

        let activeSession = await coordinator.activeSession(sessionId: "smoke-demo")
        guard activeSession?.outputWidth == 1280, activeSession?.outputHeight == 720 else {
            throw SmokeError.failed("Active session was not retained with scaled dimensions")
        }

        let stopEvent = await coordinator.stopSession(sessionId: "smoke-demo")
        guard stopEvent == .sessionStopped(sessionId: "smoke-demo") else {
            throw SmokeError.failed("Expected a session-stopped event")
        }

        guard await coordinator.activeSessionCount() == 0 else {
            throw SmokeError.failed("Session store should be empty after stop")
        }
    }

    private static func verifyPermissionFailure() async throws {
        let coordinator = MacCaptureCoordinator(
            permissionProbe: { false },
            permissionRequester: { false },
            sourceLoader: { [] }
        )

        do {
            _ = try await coordinator.startSession(
                request: MacCaptureSessionRequest(
                    sessionId: "denied-demo",
                    sourceId: "missing",
                    includeAudio: false
                )
            )
            throw SmokeError.failed("Expected permission failure")
        } catch let error as MacCaptureError {
            guard error == .permissionDenied else {
                throw SmokeError.failed("Expected permissionDenied, got \(error.localizedDescription)")
            }
        }
    }
}

enum SmokeError: Error, LocalizedError {
    case failed(String)

    var errorDescription: String? {
        switch self {
        case let .failed(message):
            return message
        }
    }
}
