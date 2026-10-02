import Foundation
import Speech

struct SpeechOutput: Codable {
    var text: String?
    var error: String?
}

let args = CommandLine.arguments
guard args.count >= 2 else {
    emit(SpeechOutput(error: "Usage: localstt <wav-path>"))
    exit(1)
}

let audioURL = URL(fileURLWithPath: args[1])
guard FileManager.default.fileExists(atPath: audioURL.path) else {
    emit(SpeechOutput(error: "Audio file was not found."))
    exit(1)
}

let finished = DispatchSemaphore(value: 0)
let once = NSLock()
var didFinish = false
var payload = SpeechOutput(error: "Speech recognition timed out.")

func finish(_ output: SpeechOutput) {
    once.lock()
    let already = didFinish
    if !already {
        didFinish = true
        payload = output
    }
    once.unlock()
    if !already {
        finished.signal()
    }
}

func emit(_ output: SpeechOutput) {
    if let data = try? JSONEncoder().encode(output),
       let text = String(data: data, encoding: .utf8) {
        print(text)
        fflush(stdout)
    }
}

DispatchQueue.global(qos: .userInitiated).async {
    _ = finished.wait(timeout: .now() + 90)
    emit(payload)
    CFRunLoopStop(CFRunLoopGetMain())
}

SFSpeechRecognizer.requestAuthorization { status in
    guard status == .authorized else {
        finish(SpeechOutput(error: "Speech recognition permission was not granted. Turn it on for Electron / OpenHandy under Privacy & Security → Speech Recognition."))
        return
    }

    DispatchQueue.main.async {
        guard let recognizer = SFSpeechRecognizer(locale: Locale.current), recognizer.isAvailable else {
            finish(SpeechOutput(error: "On-device speech recognition is unavailable for the current language."))
            return
        }

        let request = SFSpeechURLRecognitionRequest(url: audioURL)
        request.shouldReportPartialResults = true

        recognizer.recognitionTask(with: request) { result, error in
            if let result = result, result.isFinal {
                finish(SpeechOutput(text: result.bestTranscription.formattedString))
            } else if result == nil, let error = error {
                finish(SpeechOutput(error: error.localizedDescription))
            }
        }
    }
}

CFRunLoopRun()
