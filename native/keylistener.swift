import Cocoa
import Foundation

// Structure for JSON messages to/from Electron
struct StdinMessage: Codable {
    let cmd: String?
    let key: String?
    let mode: String?
}

let MODIFIER_NAMES: [Int64: (id: String, display: String)] = [
    59: ("LeftControl", "Left Control (⌃)"),
    62: ("RightControl", "Right Control (⌃)"),
    58: ("LeftOption", "Left Option (⌥)"),
    61: ("RightOption", "Right Option (⌥)"),
    55: ("LeftCommand", "Left Command (⌘)"),
    54: ("RightCommand", "Right Command (⌘)"),
    56: ("LeftShift", "Left Shift (⇧)"),
    60: ("RightShift", "Right Shift (⇧)"),
    63: ("Fn", "Fn / Globe (🌐)"),
    57: ("CapsLock", "Caps Lock")
]

class KeyListenerService {
    static let shared = KeyListenerService()

    var targetKey: String = "LeftControl"
    var targetKeyCode: Int64 = 59
    var mode: String = "toggle" // "toggle" | "pushToTalk" | "doubleTap"
    var isRecordingActive: Bool = false

    var isKeyDown: Bool = false
    var keyDownTime: TimeInterval = 0
    var otherKeyPressed: Bool = false
    var lastTapTime: TimeInterval = 0

    func setHotkey(key: String, mode: String) {
        self.targetKey = key
        self.mode = mode

        // Determine target keycode if it's a modifier key
        var foundCode: Int64 = -1
        for (code, info) in MODIFIER_NAMES {
            if info.id.lowercased() == key.lowercased() || key.lowercased().contains(info.id.lowercased()) {
                foundCode = code
                break
            }
        }
        self.targetKeyCode = foundCode
        sendJSON(["event": "hotkey_updated", "key": self.targetKey, "targetKeyCode": self.targetKeyCode, "mode": self.mode])
    }

    func sendJSON(_ dict: [String: Any]) {
        if let data = try? JSONSerialization.data(withJSONObject: dict, options: []),
           let str = String(data: data, encoding: .utf8) {
            print(str)
            fflush(stdout)
        }
    }

    func handleEvent(type: CGEventType, event: CGEvent) {
        let keyCode = event.getIntegerValueField(.keyboardEventKeycode)
        let flags = event.flags

        // 1. If currently in Settings recording mode, report any key pressed
        if isRecordingActive {
            if type == .flagsChanged {
                if let modInfo = MODIFIER_NAMES[keyCode] {
                    // Check if modifier was pressed down (not released)
                    var isDown = false
                    if keyCode == 59 || keyCode == 62 { isDown = flags.contains(.maskControl) }
                    else if keyCode == 58 || keyCode == 61 { isDown = flags.contains(.maskAlternate) }
                    else if keyCode == 55 || keyCode == 54 { isDown = flags.contains(.maskCommand) }
                    else if keyCode == 56 || keyCode == 60 { isDown = flags.contains(.maskShift) }
                    else if keyCode == 63 { isDown = flags.contains(.maskSecondaryFn) }

                    if isDown {
                        sendJSON([
                            "event": "recorded_key",
                            "key": modInfo.id,
                            "display": modInfo.display,
                            "isModifier": true
                        ])
                        return
                    }
                }
            } else if type == .keyDown {
                // Regular key combination pressed
                var mods: [String] = []
                if flags.contains(.maskControl) { mods.pushOrKeep("Control") }
                if flags.contains(.maskAlternate) { mods.pushOrKeep("Alt") }
                if flags.contains(.maskCommand) { mods.pushOrKeep("CommandOrControl") }
                if flags.contains(.maskShift) { mods.pushOrKeep("Shift") }

                let keyName = getNormalKeyName(keyCode: keyCode)
                if !keyName.isEmpty {
                    let isFKey = keyName.hasPrefix("F")
                    if mods.isEmpty && !isFKey {
                        // User pressed regular key without modifier
                        sendJSON(["event": "record_error", "message": "Global hotkey requires a modifier (⌥, ⌃, ⌘) or an F-key."])
                        return
                    }
                    let acc = (mods + [keyName]).joined(separator: "+")
                    sendJSON([
                        "event": "recorded_key",
                        "key": acc,
                        "display": acc.replacingOccurrences(of: "CommandOrControl", with: "⌘ ")
                                      .replacingOccurrences(of: "Alt", with: "⌥ ")
                                      .replacingOccurrences(of: "Control", with: "⌃ ")
                                      .replacingOccurrences(of: "Shift", with: "⇧ ")
                                      .replacingOccurrences(of: "+", with: ""),
                        "isModifier": false
                    ])
                    return
                }
            }
        }

        // 2. Normal execution mode: Check target hotkey
        if targetKeyCode > 0 {
            // Target is a single modifier key like LeftControl (59)
            if type == .keyDown {
                if keyCode != targetKeyCode {
                    otherKeyPressed = true
                }
            } else if type == .flagsChanged {
                if keyCode == targetKeyCode {
                    var isNowDown = false
                    if targetKeyCode == 59 || targetKeyCode == 62 { isNowDown = flags.contains(.maskControl) }
                    else if targetKeyCode == 58 || targetKeyCode == 61 { isNowDown = flags.contains(.maskAlternate) }
                    else if targetKeyCode == 55 || targetKeyCode == 54 { isNowDown = flags.contains(.maskCommand) }
                    else if targetKeyCode == 56 || targetKeyCode == 60 { isNowDown = flags.contains(.maskShift) }
                    else if targetKeyCode == 63 { isNowDown = flags.contains(.maskSecondaryFn) }

                    if isNowDown && !isKeyDown {
                        // Key Down
                        isKeyDown = true
                        keyDownTime = Date().timeIntervalSince1970
                        otherKeyPressed = false

                        if mode == "pushToTalk" {
                            sendJSON(["event": "trigger", "action": "start"])
                        }
                    } else if !isNowDown && isKeyDown {
                        // Key Up
                        isKeyDown = false
                        let duration = Date().timeIntervalSince1970 - keyDownTime

                        if mode == "pushToTalk" {
                            sendJSON(["event": "trigger", "action": "stop"])
                        } else if mode == "doubleTap" {
                            if !otherKeyPressed && duration < 0.4 {
                                let now = Date().timeIntervalSince1970
                                if now - lastTapTime < 0.4 {
                                    lastTapTime = 0
                                    sendJSON(["event": "trigger", "action": "toggle"])
                                } else {
                                    lastTapTime = now
                                }
                            }
                        } else {
                            // Single tap to toggle: only trigger if no other key was pressed during the tap
                            if !otherKeyPressed && duration < 0.7 {
                                sendJSON(["event": "trigger", "action": "toggle"])
                            }
                        }
                    }
                } else {
                    otherKeyPressed = true
                }
            }
        }
    }

    func getNormalKeyName(keyCode: Int64) -> String {
        switch keyCode {
        case 49: return "Space"
        case 36: return "Return"
        case 48: return "Tab"
        case 51: return "Backspace"
        case 53: return "Escape"
        case 122: return "F1"
        case 120: return "F2"
        case 99: return "F3"
        case 118: return "F4"
        case 96: return "F5"
        case 97: return "F6"
        case 98: return "F7"
        case 100: return "F8"
        case 101: return "F9"
        case 109: return "F10"
        case 103: return "F11"
        case 111: return "F12"
        case 0: return "A"
        case 11: return "B"
        case 8: return "C"
        case 2: return "D"
        case 14: return "E"
        case 3: return "F"
        case 5: return "G"
        case 4: return "H"
        case 34: return "I"
        case 38: return "J"
        case 40: return "K"
        case 37: return "L"
        case 46: return "M"
        case 45: return "N"
        case 31: return "O"
        case 35: return "P"
        case 12: return "Q"
        case 15: return "R"
        case 1: return "S"
        case 17: return "T"
        case 32: return "U"
        case 9: return "V"
        case 13: return "W"
        case 7: return "X"
        case 16: return "Y"
        case 6: return "Z"
        case 18: return "1"
        case 19: return "2"
        case 20: return "3"
        case 21: return "4"
        case 23: return "5"
        case 22: return "6"
        case 26: return "7"
        case 28: return "8"
        case 25: return "9"
        case 29: return "0"
        default: return ""
        }
    }
}

extension Array where Element == String {
    mutating func pushOrKeep(_ el: String) {
        if !self.contains(el) {
            self.append(el)
        }
    }
}

// Background thread to listen to standard input from Electron
DispatchQueue.global(qos: .userInitiated).async {
    while let line = readLine() {
        guard let data = line.data(using: .utf8) else { continue }
        if let msg = try? JSONDecoder().decode(StdinMessage.self, from: data) {
            if msg.cmd == "set_hotkey", let key = msg.key {
                let mode = msg.mode ?? "toggle"
                DispatchQueue.main.async {
                    KeyListenerService.shared.setHotkey(key: key, mode: mode)
                }
            } else if msg.cmd == "start_recording" {
                DispatchQueue.main.async {
                    KeyListenerService.shared.isRecordingActive = true
                    KeyListenerService.shared.sendJSON(["event": "recording_started"])
                }
            } else if msg.cmd == "stop_recording" {
                DispatchQueue.main.async {
                    KeyListenerService.shared.isRecordingActive = false
                    KeyListenerService.shared.sendJSON(["event": "recording_stopped"])
                }
            }
        }
    }
}

// Parse initial CLI arguments
var initialKey = "LeftControl"
var initialMode = "toggle"

let args = CommandLine.arguments
for i in 0..<args.count {
    if args[i] == "--key" && i + 1 < args.count {
        initialKey = args[i + 1]
    }
    if args[i] == "--mode" && i + 1 < args.count {
        initialMode = args[i + 1]
    }
}

KeyListenerService.shared.setHotkey(key: initialKey, mode: initialMode)

// Setup macOS CGEventTap
let mask: CGEventMask = (1 << CGEventType.flagsChanged.rawValue) | (1 << CGEventType.keyDown.rawValue) | (1 << CGEventType.keyUp.rawValue)

guard let eventTap = CGEvent.tapCreate(
    tap: .cgSessionEventTap,
    place: .headInsertEventTap,
    options: .listenOnly,
    eventsOfInterest: mask,
    callback: { (proxy, type, event, refcon) -> Unmanaged<CGEvent>? in
        KeyListenerService.shared.handleEvent(type: type, event: event)
        return Unmanaged.passRetained(event)
    },
    userInfo: nil
) else {
    KeyListenerService.shared.sendJSON(["event": "error", "message": "Failed to create CGEvent tap. Ensure Accessibility is enabled."])
    exit(1)
}

let runLoopSource = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, eventTap, 0)
CFRunLoopAddSource(CFRunLoopGetCurrent(), runLoopSource, .commonModes)
CGEvent.tapEnable(tap: eventTap, enable: true)

KeyListenerService.shared.sendJSON(["event": "ready", "key": initialKey, "mode": initialMode])
CFRunLoopRun()
