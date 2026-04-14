import AVFoundation
import CoreMedia
import Foundation
import ScreenCaptureKit

public final class SystemAudioPreviewMonitor: NSObject {
    public typealias AudioSampleSink = @Sendable (SystemAudioSampleMetadata) -> Void
    public typealias ErrorSink = @Sendable (String) -> Void

    private let source: CaptureSourceSummary
    private let onAudioSample: AudioSampleSink
    private let onError: ErrorSink
    private let output = StreamOutputProxy()
    private let sampleQueue: DispatchQueue
    private var stream: SCStream?

    public init(
        source: CaptureSourceSummary,
        onAudioSample: @escaping AudioSampleSink,
        onError: @escaping ErrorSink
    ) {
        self.source = source
        self.onAudioSample = onAudioSample
        self.onError = onError
        self.sampleQueue = DispatchQueue(label: "com.slowlearner.audio-preview.\(source.id)")
        super.init()

        output.onAudioSample = { [onAudioSample] sample in
            onAudioSample(sample)
        }

        output.onError = { [onError] message in
            onError(message)
        }
    }

    public func start() async throws {
        let content = try await SCShareableContent.excludingDesktopWindows(
            false,
            onScreenWindowsOnly: true
        )
        let filter = try makeContentFilter(content: content)
        let configuration = SCStreamConfiguration()
        configuration.capturesAudio = true
        configuration.excludesCurrentProcessAudio = false
        configuration.minimumFrameInterval = CMTime(value: 1, timescale: 30)
        configuration.queueDepth = 1
        configuration.width = max(2, source.width)
        configuration.height = max(2, source.height)

        let stream = SCStream(
            filter: filter,
            configuration: configuration,
            delegate: output
        )

        try stream.addStreamOutput(output, type: .audio, sampleHandlerQueue: sampleQueue)
        try await stream.startCapture()
        self.stream = stream
    }

    public func stop() async {
        guard let stream else {
            return
        }

        try? await stream.stopCapture()
        self.stream = nil
    }

    private func makeContentFilter(content: SCShareableContent) throws -> SCContentFilter {
        switch source.sourceType {
        case "monitor":
            guard let display = content.displays.first(where: { "\($0.displayID)" == source.id }) else {
                throw MacCaptureError.sourceNotFound(source.id)
            }

            return SCContentFilter(display: display, excludingWindows: [])
        case "window":
            guard let window = content.windows.first(where: { "\($0.windowID)" == source.id }) else {
                throw MacCaptureError.sourceNotFound(source.id)
            }

            return SCContentFilter(desktopIndependentWindow: window)
        default:
            throw MacCaptureError.notImplemented(
                "System audio preview does not support source type \(source.sourceType)."
            )
        }
    }
}

public struct SystemAudioSampleMetadata: Sendable {
    public let tsMs: Int64
    public let sampleRate: Double
    public let channels: Int

    public init(tsMs: Int64, sampleRate: Double, channels: Int) {
        self.tsMs = tsMs
        self.sampleRate = sampleRate
        self.channels = channels
    }
}

private final class StreamOutputProxy: NSObject, SCStreamDelegate, SCStreamOutput {
    var onAudioSample: (@Sendable (SystemAudioSampleMetadata) -> Void)?
    var onError: (@Sendable (String) -> Void)?

    private var lastAudioEventAtMs: Int64 = 0
    private let throttleIntervalMs: Int64 = 350

    func stream(_ stream: SCStream, didStopWithError error: any Error) {
        onError?(error.localizedDescription)
    }

    func stream(
        _ stream: SCStream,
        didOutputSampleBuffer sampleBuffer: CMSampleBuffer,
        of outputType: SCStreamOutputType
    ) {
        guard outputType == .audio, CMSampleBufferIsValid(sampleBuffer) else {
            return
        }

        let tsMs = timestampMs(for: sampleBuffer)
        guard tsMs - lastAudioEventAtMs >= throttleIntervalMs else {
            return
        }

        lastAudioEventAtMs = tsMs
        let audioDescription = CMSampleBufferGetFormatDescription(sampleBuffer)
            .flatMap(CMAudioFormatDescriptionGetStreamBasicDescription)

        onAudioSample?(
            SystemAudioSampleMetadata(
                tsMs: tsMs,
                sampleRate: audioDescription?.pointee.mSampleRate ?? 48_000,
                channels: Int(audioDescription?.pointee.mChannelsPerFrame ?? 2)
            )
        )
    }

    private func timestampMs(for sampleBuffer: CMSampleBuffer) -> Int64 {
        let timestamp = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
        if timestamp.isNumeric {
            return Int64((CMTimeGetSeconds(timestamp) * 1_000).rounded())
        }

        return Int64(Date().timeIntervalSince1970 * 1_000)
    }
}
