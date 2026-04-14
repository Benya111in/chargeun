import AVFoundation
import CoreMedia
import Foundation
import ScreenCaptureKit

public final class SystemAudioPreviewMonitor: NSObject {
    public typealias AudioSampleSink = @Sendable (SystemAudioSampleMetadata) -> Void
    public typealias ErrorSink = @Sendable (String) -> Void

    private let sessionId: String
    private let source: CaptureSourceSummary
    private let onAudioSample: AudioSampleSink
    private let onError: ErrorSink
    private let output: StreamOutputProxy
    private let sampleQueue: DispatchQueue
    private var stream: SCStream?

    public init(
        sessionId: String,
        source: CaptureSourceSummary,
        onAudioSample: @escaping AudioSampleSink,
        onError: @escaping ErrorSink
    ) {
        self.sessionId = sessionId
        self.source = source
        self.onAudioSample = onAudioSample
        self.onError = onError
        self.output = StreamOutputProxy(sessionId: sessionId)
        self.sampleQueue = DispatchQueue(label: "com.slowlearner.audio-preview.\(sessionId)")
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
        output.discardPendingChunk()
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
    public let pcmRef: String
    public let sampleRate: Double
    public let channels: Int

    public init(tsMs: Int64, pcmRef: String, sampleRate: Double, channels: Int) {
        self.tsMs = tsMs
        self.pcmRef = pcmRef
        self.sampleRate = sampleRate
        self.channels = channels
    }
}

private final class StreamOutputProxy: NSObject, SCStreamDelegate, SCStreamOutput {
    var onAudioSample: (@Sendable (SystemAudioSampleMetadata) -> Void)?
    var onError: (@Sendable (String) -> Void)?

    private let chunkRecorder: AudioChunkRecorder

    init(sessionId: String) {
        self.chunkRecorder = AudioChunkRecorder(sessionId: sessionId)
    }

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
        let audioDescription = CMSampleBufferGetFormatDescription(sampleBuffer)
            .flatMap(CMAudioFormatDescriptionGetStreamBasicDescription)
        let sampleRate = audioDescription?.pointee.mSampleRate ?? 48_000
        let channels = Int(audioDescription?.pointee.mChannelsPerFrame ?? 2)

        do {
            guard
                let chunk = try chunkRecorder.append(
                    sampleBuffer: sampleBuffer,
                    tsMs: tsMs,
                    sampleRate: sampleRate,
                    channels: channels
                )
            else {
                return
            }

            onAudioSample?(chunk)
        } catch {
            onError?(error.localizedDescription)
        }
    }

    private func timestampMs(for sampleBuffer: CMSampleBuffer) -> Int64 {
        return Int64(Date().timeIntervalSince1970 * 1_000)
    }

    func discardPendingChunk() {
        chunkRecorder.discardPendingChunk()
    }
}

private final class AudioChunkRecorder {
    private let chunkDurationMs: Int64
    private let outputDirectory: URL
    private var currentChunkStartMs: Int64?
    private var currentChannels: Int = 2
    private var currentInput: AVAssetWriterInput?
    private var currentOutputURL: URL?
    private var currentSampleRate: Double = 48_000
    private var currentWriter: AVAssetWriter?

    init(sessionId: String, chunkDurationMs: Int64 = 1_500) {
        self.chunkDurationMs = chunkDurationMs
        self.outputDirectory = FileManager.default.temporaryDirectory
            .appendingPathComponent("slowlearner-audio-preview", isDirectory: true)
            .appendingPathComponent(sessionId, isDirectory: true)
    }

    func append(
        sampleBuffer: CMSampleBuffer,
        tsMs: Int64,
        sampleRate: Double,
        channels: Int
    ) throws -> SystemAudioSampleMetadata? {
        if currentWriter == nil {
            try startChunk(sampleBuffer: sampleBuffer, tsMs: tsMs)
        }

        guard let writer = currentWriter, let input = currentInput else {
            throw SystemAudioPreviewError.chunkWriteFailed("Audio chunk writer was not ready.")
        }

        currentSampleRate = sampleRate
        currentChannels = channels

        guard input.isReadyForMoreMediaData else {
            return nil
        }

        guard input.append(sampleBuffer) else {
            let message = writer.error?.localizedDescription ?? "Unknown audio append failure."
            throw SystemAudioPreviewError.chunkWriteFailed(message)
        }

        guard let currentChunkStartMs else {
            return nil
        }

        if tsMs - currentChunkStartMs < chunkDurationMs {
            return nil
        }

        return try finishChunk(tsMs: tsMs)
    }

    func discardPendingChunk() {
        reset(removeOutputFile: true)
    }

    private func startChunk(sampleBuffer: CMSampleBuffer, tsMs: Int64) throws {
        let fileManager = FileManager.default
        try fileManager.createDirectory(at: outputDirectory, withIntermediateDirectories: true)

        let outputURL = outputDirectory.appendingPathComponent(
            "audio-\(tsMs)-\(UUID().uuidString.lowercased()).caf"
        )
        let writer = try AVAssetWriter(outputURL: outputURL, fileType: .caf)
        let formatDescription = CMSampleBufferGetFormatDescription(sampleBuffer)
        let input = AVAssetWriterInput(
            mediaType: .audio,
            outputSettings: nil,
            sourceFormatHint: formatDescription
        )
        input.expectsMediaDataInRealTime = true

        guard writer.canAdd(input) else {
            throw SystemAudioPreviewError.chunkWriteFailed(
                "Audio chunk writer could not attach the sample input."
            )
        }

        writer.add(input)

        guard writer.startWriting() else {
            let message = writer.error?.localizedDescription ?? "Audio writer failed to start."
            throw SystemAudioPreviewError.chunkWriteFailed(message)
        }

        writer.startSession(atSourceTime: CMSampleBufferGetPresentationTimeStamp(sampleBuffer))

        currentChunkStartMs = tsMs
        currentInput = input
        currentOutputURL = outputURL
        currentWriter = writer
    }

    private func finishChunk(tsMs: Int64) throws -> SystemAudioSampleMetadata {
        guard
            let writer = currentWriter,
            let input = currentInput,
            let outputURL = currentOutputURL
        else {
            throw SystemAudioPreviewError.chunkWriteFailed(
                "Audio chunk writer lost its active state before finishing."
            )
        }

        input.markAsFinished()
        let semaphore = DispatchSemaphore(value: 0)
        writer.finishWriting {
            semaphore.signal()
        }
        semaphore.wait()

        defer {
            reset(removeOutputFile: false)
        }

        guard writer.status == .completed else {
            let message = writer.error?.localizedDescription ?? "Audio chunk writer did not complete."
            throw SystemAudioPreviewError.chunkWriteFailed(message)
        }

        return SystemAudioSampleMetadata(
            tsMs: tsMs,
            pcmRef: outputURL.path,
            sampleRate: currentSampleRate,
            channels: currentChannels
        )
    }

    private func reset(removeOutputFile: Bool) {
        let outputURL = currentOutputURL
        currentChunkStartMs = nil
        currentInput = nil
        currentOutputURL = nil
        currentWriter = nil

        if removeOutputFile, let outputURL {
            try? FileManager.default.removeItem(at: outputURL)
        }
    }
}

private enum SystemAudioPreviewError: Error, LocalizedError {
    case chunkWriteFailed(String)

    var errorDescription: String? {
        switch self {
        case let .chunkWriteFailed(message):
            return message
        }
    }
}
