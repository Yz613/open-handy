import Cocoa
import Foundation

struct StdinMessage: Codable {
    let cmd: String?
    let key: String?
    let mode: String?
    let app: String?
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

struct HotkeySpec {
    var singleModifier: Int64? = nil
    var keyCode: Int64? = nil
    var control = false
    var option = false
    var command = false
    var shift = false
    var fn = false
}

var eventTapPort: CFMachPort?

class KeyListenerService {
    static let shared = KeyListenerService()

    var targetKey: String = "LeftControl"
    var spec = HotkeySpec(singleModifier: 59)
    var mode: String = "toggle" // "toggle" | "pushToTalk"
    var isRecordingActive: Bool = false

    var isKeyDown: Bool = false
    var keyDownTime: TimeInterval = 0
    var otherKeyPressed: Bool = false
    var previousFlags: CGEventFlags = []

    // Dictation session started from this physical press (or a latched toggle).
    var dictationActive = false
    var latched = false
    var endOnRelease = false
    var armWork: DispatchWorkItem?

    func setHotkey(key: String, mode: String) {
        self.targetKey = key
        self.mode = mode
        self.spec = parseHotkey(key)
        let code = self.spec.singleModifier ?? self.spec.keyCode ?? -1
        sendJSON([
            "event": "hotkey_updated",
            "key": self.targetKey,
            "targetKeyCode": code,
            "mode": self.mode
        ])
    }

    func sendJSON(_ dict: [String: Any]) {
        if let data = try? JSONSerialization.data(withJSONObject: dict, options: []),
           let str = String(data: data, encoding: .utf8) {
            print(str)
            fflush(stdout)
        }
    }

    func frontmostAppName() -> String {
        return NSWorkspace.shared.frontmostApplication?.localizedName ?? ""
    }

    func trigger(_ action: String) {
        sendJSON([
            "event": "trigger",
            "action": action,
            "app": frontmostAppName()
        ])
    }

    func beginDictation() {
        if dictationActive { return }
        dictationActive = true
        latched = false
        endOnRelease = false
        trigger("start")
    }

    func endDictation(action: String) {
        armWork?.cancel()
        armWork = nil
        if dictationActive {
            dictationActive = false
            latched = false
            endOnRelease = false
            trigger(action)
        }
    }

    func scheduleArm() {
        armWork?.cancel()
        let work = DispatchWorkItem { [weak self] in
            guard let self = self else { return }
            if self.isKeyDown && !self.otherKeyPressed && !self.dictationActive {
                self.beginDictation()
            }
        }
        armWork = work
        // Short delay so Control/Command chords (Ctrl+C) don't flash the recorder,
        // while a real hold still shows the indicator almost immediately.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.06, execute: work)
    }

    func handlePressBegan() {
        isKeyDown = true
        keyDownTime = Date().timeIntervalSince1970
        otherKeyPressed = false
        if dictationActive && latched {
            // Second tap of a latched toggle session: stop when the key comes up.
            endOnRelease = true
            return
        }
        endOnRelease = false
        if mode == "pushToTalk" {
            beginDictation()
        } else {
            scheduleArm()
        }
    }

    func handlePressEnded() {
        armWork?.cancel()
        armWork = nil
        let duration = Date().timeIntervalSince1970 - keyDownTime
        isKeyDown = false

        if otherKeyPressed {
            if endOnRelease {
                endDictation(action: "stop")
            } else if dictationActive && !latched {
                endDictation(action: "cancel")
            }
            endOnRelease = false
            return
        }

        if endOnRelease {
            endDictation(action: "stop")
            return
        }

        if !dictationActive {
            // Released before the arm delay. A quick tap in toggle mode still starts.
            if mode != "pushToTalk" && duration < 0.45 {
                beginDictation()
                latched = true
            }
            return
        }

        if mode == "pushToTalk" || duration >= 0.18 {
            endDictation(action: "stop")
        } else {
            // Short tap in toggle mode: leave the recorder running.
            latched = true
        }
    }

    func noteOtherKey() {
        otherKeyPressed = true
        armWork?.cancel()
        armWork = nil
        if dictationActive && !latched {
            endDictation(action: "cancel")
        }
    }

    func handleEvent(type: CGEventType, event: CGEvent) {
        if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
            if let tap = eventTapPort {
                CGEvent.tapEnable(tap: tap, enable: true)
            }
            return
        }

        let keyCode = event.getIntegerValueField(.keyboardEventKeycode)
        let flags = event.flags

        if isRecordingActive {
            if handleRecordingCapture(type: type, event: event, keyCode: keyCode, flags: flags) {
                previousFlags = flags
                return
            }
        }

        if let single = spec.singleModifier {
            handleSingleModifier(type: type, event: event, keyCode: keyCode, flags: flags, target: single)
        } else if let watched = spec.keyCode {
            handleChord(type: type, event: event, keyCode: keyCode, flags: flags, watched: watched)
        }

        previousFlags = flags
    }

    func handleSingleModifier(type: CGEventType, event: CGEvent, keyCode: Int64, flags: CGEventFlags, target: Int64) {
        if type == .keyDown {
            if event.getIntegerValueField(.keyboardEventAutorepeat) == 1 { return }
            if keyCode != target && keyCode != 0 {
                noteOtherKey()
            }
            return
        }

        if type != .flagsChanged { return }

        let matchesTarget = keyCode == target || (keyCode == 0 && modifierFlagChanged(target, flags: flags))
        if !matchesTarget {
            if modifierFlagChanged(keyCode == 0 ? target : keyCode, flags: flags) && keyCode != target {
                noteOtherKey()
            }
            return
        }

        let isNowDown = isModifierPhysicallyDown(target, flags: flags)
        if isNowDown && !isKeyDown {
            handlePressBegan()
        } else if !isNowDown && isKeyDown {
            handlePressEnded()
        }
    }

    func handleChord(type: CGEventType, event: CGEvent, keyCode: Int64, flags: CGEventFlags, watched: Int64) {
        if type == .keyDown {
            if event.getIntegerValueField(.keyboardEventAutorepeat) == 1 { return }
            if keyCode == watched && modifiersMatch(flags) && !isKeyDown {
                isKeyDown = true
                keyDownTime = Date().timeIntervalSince1970
                otherKeyPressed = false
                if mode == "pushToTalk" {
                    beginDictation()
                } else if dictationActive {
                    endDictation(action: "stop")
                } else {
                    beginDictation()
                    latched = true
                }
            }
            return
        }

        if type == .keyUp && keyCode == watched && isKeyDown {
            isKeyDown = false
            if mode == "pushToTalk" {
                endDictation(action: "stop")
            }
        }
    }

    func modifierFlag(for keyCode: Int64) -> CGEventFlags? {
        switch keyCode {
        case 59, 62: return .maskControl
        case 58, 61: return .maskAlternate
        case 55, 54: return .maskCommand
        case 56, 60: return .maskShift
        case 63: return .maskSecondaryFn
        default: return nil
        }
    }

    func isModifierPhysicallyDown(_ keyCode: Int64, flags: CGEventFlags) -> Bool {
        guard let flag = modifierFlag(for: keyCode) else { return false }
        return flags.contains(flag)
    }

    func modifierFlagChanged(_ keyCode: Int64, flags: CGEventFlags) -> Bool {
        guard let flag = modifierFlag(for: keyCode) else { return false }
        return flags.contains(flag) != previousFlags.contains(flag)
    }

    func modifiersMatch(_ flags: CGEventFlags) -> Bool {
        if spec.control != flags.contains(.maskControl) { return false }
        if spec.option != flags.contains(.maskAlternate) { return false }
        if spec.command != flags.contains(.maskCommand) { return false }
        if spec.shift != flags.contains(.maskShift) { return false }
        if spec.fn != flags.contains(.maskSecondaryFn) { return false }
        return true
    }

    func handleRecordingCapture(type: CGEventType, event: CGEvent, keyCode: Int64, flags: CGEventFlags) -> Bool {
        if type == .flagsChanged {
            if let modInfo = MODIFIER_NAMES[keyCode], isModifierPhysicallyDown(keyCode, flags: flags) {
                sendJSON([
                    "event": "recorded_key",
                    "key": modInfo.id,
                    "display": modInfo.display,
                    "isModifier": true
                ])
                return true
            }
        } else if type == .keyDown {
            if event.getIntegerValueField(.keyboardEventAutorepeat) == 1 { return true }
            var mods: [String] = []
            if flags.contains(.maskControl) { mods.pushOrKeep("Control") }
            if flags.contains(.maskAlternate) { mods.pushOrKeep("Alt") }
            if flags.contains(.maskCommand) { mods.pushOrKeep("CommandOrControl") }
            if flags.contains(.maskShift) { mods.pushOrKeep("Shift") }

            let keyName = getNormalKeyName(keyCode: keyCode)
            if !keyName.isEmpty {
                let isFKey = keyName.hasPrefix("F") && keyName.dropFirst().allSatisfy({ $0.isNumber })
                if mods.isEmpty && !isFKey {
                    sendJSON(["event": "record_error", "message": "Global hotkey requires a modifier (⌥, ⌃, ⌘) or an F-key."])
                    return true
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
                return true
            }
        }
        return false
    }

    func postPaste(into appName: String) {
        DispatchQueue.main.async {
            if !appName.isEmpty,
               let target = NSWorkspace.shared.runningApplications.first(where: { $0.localizedName == appName }) {
                if #available(macOS 14.0, *) {
                    _ = target.activate(from: NSRunningApplication.current, options: [.activateAllWindows])
                } else {
                    _ = target.activate(options: [.activateIgnoringOtherApps])
                }
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                let ok = self.postCommandV()
                self.sendJSON(["event": "paste_done", "ok": ok])
            }
        }
    }

    func postCommandV() -> Bool {
        let source = CGEventSource(stateID: .combinedSessionState)
        guard let down = CGEvent(keyboardEventSource: source, virtualKey: 0x09, keyDown: true),
              let up = CGEvent(keyboardEventSource: source, virtualKey: 0x09, keyDown: false) else {
            return false
        }
        down.flags = .maskCommand
        up.flags = .maskCommand
        down.post(tap: .cghidEventTap)
        usleep(40_000)
        up.post(tap: .cghidEventTap)
        return true
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

func parseHotkey(_ raw: String) -> HotkeySpec {
    var spec = HotkeySpec()
    let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmed.isEmpty { return spec }

    if let code = exactModifierCode(trimmed) {
        spec.singleModifier = code
        return spec
    }

    let parts = trimmed.split(separator: "+").map { String($0).trimmingCharacters(in: .whitespaces) }
    for part in parts {
        let token = part.lowercased()
        switch token {
        case "control", "ctrl":
            spec.control = true
        case "commandorcontrol", "command", "cmd", "meta":
            spec.command = true
        case "alt", "option", "opt":
            spec.option = true
        case "shift":
            spec.shift = true
        case "fn", "function", "globe":
            spec.fn = true
        default:
            if let code = exactModifierCode(part), let flag = KeyListenerService.shared.modifierFlag(for: code) {
                if flag == .maskControl { spec.control = true }
                else if flag == .maskAlternate { spec.option = true }
                else if flag == .maskCommand { spec.command = true }
                else if flag == .maskShift { spec.shift = true }
                else if flag == .maskSecondaryFn { spec.fn = true }
            } else if let code = keyCodeForName(part) {
                spec.keyCode = code
            }
        }
    }
    return spec
}

func exactModifierCode(_ name: String) -> Int64? {
    let needle = name.lowercased()
    for (code, info) in MODIFIER_NAMES {
        if info.id.lowercased() == needle {
            return code
        }
    }
    return nil
}

func keyCodeForName(_ name: String) -> Int64? {
    switch name.lowercased() {
    case "space": return 49
    case "return", "enter": return 36
    case "tab": return 48
    case "escape", "esc": return 53
    case "f1": return 122
    case "f2": return 120
    case "f3": return 99
    case "f4": return 118
    case "f5": return 96
    case "f6": return 97
    case "f7": return 98
    case "f8": return 100
    case "f9": return 101
    case "f10": return 109
    case "f11": return 103
    case "f12": return 111
    case "a": return 0
    case "b": return 11
    case "c": return 8
    case "d": return 2
    case "e": return 14
    case "f": return 3
    case "g": return 5
    case "h": return 4
    case "i": return 34
    case "j": return 38
    case "k": return 40
    case "l": return 37
    case "m": return 46
    case "n": return 45
    case "o": return 31
    case "p": return 35
    case "q": return 12
    case "r": return 15
    case "s": return 1
    case "t": return 17
    case "u": return 32
    case "v": return 9
    case "w": return 13
    case "x": return 7
    case "y": return 16
    case "z": return 6
    case "1": return 18
    case "2": return 19
    case "3": return 20
    case "4": return 21
    case "5": return 23
    case "6": return 22
    case "7": return 26
    case "8": return 28
    case "9": return 25
    case "0": return 29
    default: return nil
    }
}

extension Array where Element == String {
    mutating func pushOrKeep(_ el: String) {
        if !self.contains(el) {
            self.append(el)
        }
    }
}

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
            } else if msg.cmd == "paste" {
                let app = msg.app ?? ""
                KeyListenerService.shared.postPaste(into: app)
            }
        }
    }
}

var initialKey = "LeftControl"
var initialMode = "toggle"

let cli = CommandLine.arguments
for i in 0..<cli.count {
    if cli[i] == "--key" && i + 1 < cli.count {
        initialKey = cli[i + 1]
    }
    if cli[i] == "--mode" && i + 1 < cli.count {
        initialMode = cli[i + 1]
    }
}

KeyListenerService.shared.setHotkey(key: initialKey, mode: initialMode)

let mask: CGEventMask = (1 << CGEventType.flagsChanged.rawValue)
    | (1 << CGEventType.keyDown.rawValue)
    | (1 << CGEventType.keyUp.rawValue)

guard let eventTap = CGEvent.tapCreate(
    tap: .cgSessionEventTap,
    place: .headInsertEventTap,
    options: .listenOnly,
    eventsOfInterest: mask,
    callback: { (_, type, event, _) -> Unmanaged<CGEvent>? in
        KeyListenerService.shared.handleEvent(type: type, event: event)
        return Unmanaged.passUnretained(event)
    },
    userInfo: nil
) else {
    KeyListenerService.shared.sendJSON(["event": "error", "message": "Allow this app under Privacy & Security → Accessibility, then try the shortcut again."])
    exit(1)
}

eventTapPort = eventTap
let runLoopSource = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, eventTap, 0)
CFRunLoopAddSource(CFRunLoopGetCurrent(), runLoopSource, .commonModes)
CGEvent.tapEnable(tap: eventTap, enable: true)

KeyListenerService.shared.sendJSON(["event": "ready", "key": initialKey, "mode": initialMode])
CFRunLoopRun()
