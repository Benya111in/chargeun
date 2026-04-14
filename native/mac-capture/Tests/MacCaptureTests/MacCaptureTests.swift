import XCTest
@testable import MacCapture

final class MacCaptureTests: XCTestCase {
    func testStopSessionReturnsStoppedEvent() async throws {
        let coordinator = MacCaptureCoordinator()
        let event = await coordinator.stopSession(sessionId: "demo")

        XCTAssertEqual(event, .sessionStopped(sessionId: "demo"))
    }
}
