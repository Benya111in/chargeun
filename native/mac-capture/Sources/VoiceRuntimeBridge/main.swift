import AppKit
import Foundation

@main
struct VoiceRuntimeBridge {
    static func main() {
        do {
            let command = try VoiceRuntimeCommand(arguments: Array(CommandLine.arguments.dropFirst()))
            try command.run()
        } catch {
            FileHandle.standardError.write(Data((error.localizedDescription + "\n").utf8))
            Foundation.exit(1)
        }
    }
}

private enum VoiceRuntimeCommand {
    case status
    case speak(text: String)
    case listenIntent(timeoutMs: UInt64)

    init(arguments: [String]) throws {
        guard let command = arguments.first else {
            throw VoiceRuntimeError.invalidArguments("Missing voice runtime command")
        }

        switch command {
        case "status":
            self = .status
        case "speak":
            self = .speak(text: try value(for: "--text", in: arguments))
        case "listen-intent":
            self = .listenIntent(timeoutMs: uint64Value(for: "--timeout-ms", in: arguments) ?? 6000)
        default:
            throw VoiceRuntimeError.invalidArguments("Unknown voice runtime command: \(command)")
        }
    }

    func run() throws {
        switch self {
        case .status:
            try writeJSONLine(currentStatus())
        case let .speak(text):
            try VoiceSpeaker().speak(text: text)
            try writeJSONLine(["status": "completed"])
        case let .listenIntent(timeoutMs):
            let result = IntentSpeechListener().listen(timeoutMs: timeoutMs)
            try writeJSONLine(result)
        }
    }
}

private struct VoiceRuntimeStatus: Codable {
    let nativeTtsAvailable: Bool
    let nativeSttAvailable: Bool
    let preferredVoiceIdentifier: String?
    let preferredVoiceName: String?
}

private struct VoiceIntentRecognitionResult: Codable {
    let status: String
    let intent: String?
    let transcript: String?
    let source: String
    let message: String?
}

private enum VoiceRuntimeError: Error, LocalizedError {
    case invalidArguments(String)
    case unavailable(String)
    case speechFailed(String)

    var errorDescription: String? {
        switch self {
        case let .invalidArguments(message):
            return message
        case let .unavailable(message):
            return message
        case let .speechFailed(message):
            return message
        }
    }
}

private final class VoiceSpeaker: NSObject, NSSpeechSynthesizerDelegate {
    private var isFinished = false

    func speak(text: String) throws {
        guard !NSSpeechSynthesizer.availableVoices.isEmpty else {
            throw VoiceRuntimeError.unavailable("No macOS system voice is available.")
        }

        guard let synthesizer = NSSpeechSynthesizer(voice: preferredVoiceIdentifier()) else {
            throw VoiceRuntimeError.unavailable("macOS speech synthesizer is unavailable.")
        }
        synthesizer.delegate = self
        synthesizer.rate = 175

        guard synthesizer.startSpeaking(text) else {
            throw VoiceRuntimeError.speechFailed("macOS speech synthesis failed to start.")
        }

        while !isFinished {
            _ = RunLoop.current.run(mode: .default, before: Date().addingTimeInterval(0.1))
        }
    }

    func speechSynthesizer(
        _ sender: NSSpeechSynthesizer,
        didFinishSpeaking finishedSpeaking: Bool
    ) {
        isFinished = true
    }
}

private final class IntentSpeechListener: NSObject, NSSpeechRecognizerDelegate {
    private var recognizer: NSSpeechRecognizer?
    private var recognizedCommand: String?

    func listen(timeoutMs: UInt64) -> VoiceIntentRecognitionResult {
        guard let recognizer = NSSpeechRecognizer() else {
            return VoiceIntentRecognitionResult(
                status: "unavailable",
                intent: nil,
                transcript: nil,
                source: "native-stt",
                message: "NSSpeechRecognizer is unavailable in this environment."
            )
        }

        self.recognizer = recognizer
        recognizer.commands = intentCommands
        recognizer.delegate = self
        recognizer.blocksOtherRecognizers = true
        recognizer.listensInForegroundOnly = false
        recognizer.startListening()
        defer {
            recognizer.stopListening()
        }

        let deadline = Date().addingTimeInterval(Double(timeoutMs) / 1000)
        while recognizedCommand == nil, Date() < deadline {
            _ = RunLoop.current.run(mode: .default, before: Date().addingTimeInterval(0.1))
        }

        guard let command = recognizedCommand else {
            return VoiceIntentRecognitionResult(
                status: "timeout",
                intent: nil,
                transcript: nil,
                source: "native-stt",
                message: "No supported intent was recognized before timeout."
            )
        }

        return VoiceIntentRecognitionResult(
            status: "recognized",
            intent: intentAliasMap[command],
            transcript: command,
            source: "native-stt",
            message: nil
        )
    }

    func speechRecognizer(_ sender: NSSpeechRecognizer, didRecognizeCommand command: String) {
        recognizedCommand = command
    }
}

private let intentAliasMap: [String: String] = [
    "다시 말해줘": "repeat",
    "다시 설명해줘": "repeat",
    "다시": "repeat",
    "더 쉽게 말해줘": "easy",
    "쉽게 말해줘": "easy",
    "쉽게": "easy",
    "왜 그래": "why",
    "왜 그래?": "why",
    "왜": "why",
    "지금 뭐 해야 해": "action",
    "지금 뭐 해야 해?": "action",
    "지금 뭐해": "action",
    "무엇을 해야 해": "action",
    "119에 뭐라고 말해": "report",
    "119에 뭐라고 말해?": "report",
    "신고 뭐라고 해": "report",
    "신고": "report"
]

private let intentCommands = Array(intentAliasMap.keys)

private func currentStatus() -> VoiceRuntimeStatus {
    let voiceId = preferredVoiceIdentifier()
    return VoiceRuntimeStatus(
        nativeTtsAvailable: !NSSpeechSynthesizer.availableVoices.isEmpty,
        nativeSttAvailable: true,
        preferredVoiceIdentifier: voiceId.map { "\($0)" },
        preferredVoiceName: voiceId.flatMap(preferredVoiceName(for:))
    )
}

private func preferredVoiceIdentifier() -> NSSpeechSynthesizer.VoiceName? {
    let voices = NSSpeechSynthesizer.availableVoices
    if let korean = voices.first(where: { voiceId in
        preferredVoiceLocale(for: voiceId)?.lowercased().hasPrefix("ko") == true
    }) {
        return korean
    }

    return NSSpeechSynthesizer.defaultVoice
}

private func preferredVoiceLocale(for voiceId: NSSpeechSynthesizer.VoiceName) -> String? {
    NSSpeechSynthesizer.attributes(forVoice: voiceId)[.localeIdentifier] as? String
}

private func preferredVoiceName(for voiceId: NSSpeechSynthesizer.VoiceName) -> String? {
    NSSpeechSynthesizer.attributes(forVoice: voiceId)[.name] as? String
}

private func writeJSONLine(_ value: some Encodable) throws {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    let data = try encoder.encode(value)
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data([0x0A]))
}

private func value(for flag: String, in arguments: [String]) throws -> String {
    guard
        let index = arguments.firstIndex(of: flag),
        arguments.indices.contains(index + 1)
    else {
        throw VoiceRuntimeError.invalidArguments("Missing value for \(flag)")
    }

    return arguments[index + 1]
}

private func uint64Value(for flag: String, in arguments: [String]) -> UInt64? {
    guard
        let index = arguments.firstIndex(of: flag),
        arguments.indices.contains(index + 1)
    else {
        return nil
    }

    return UInt64(arguments[index + 1])
}
