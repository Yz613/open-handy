import Cocoa
import CoreAudio
import Foundation

struct StdinMessage: Codable {
    let cmd: String?
    let key: String?
    let mode: String?
    let app: String?
    let pid: Int32?
    let bundleId: String?
    let text: String?
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

    var audioHoldEngaged = false
    var audioSentMediaKey = false
    var audioHadMute = false
    var audioPreviousMute: UInt32 = 0
    var audioHadVolume = false
    var audioPreviousVolume: Float32 = 1
    var audioGeneration = 0
    var focusedElement: AXUIElement?
    var focusedPid: pid_t = 0
    var pasteInFlight = false

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

    func frontmostTarget() -> (name: String, pid: Int32, bundleId: String) {
        let app = NSWorkspace.shared.frontmostApplication
        return (
            app?.localizedName ?? "",
            app?.processIdentifier ?? 0,
            app?.bundleIdentifier ?? ""
        )
    }

    func trigger(_ action: String) {
        let target = frontmostTarget()
        sendJSON([
            "event": "trigger",
            "action": action,
            "app": target.name,
            "pid": Int(target.pid),
            "bundleId": target.bundleId
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
        pauseAudioForHold()
        // Modifier holds start immediately. A delayed arm was cancelled by the extra
        // keyDown macOS emits alongside Control, so the hold never began.
        if mode == "pushToTalk" || spec.singleModifier != nil {
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
        scheduleAudioResume()

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
        // The Control press itself arrives with a companion key event. Cancelling
        // on that event made a hold look like it did nothing.
        if mode == "pushToTalk" { return }
        if Date().timeIntervalSince1970 - keyDownTime < 0.25 { return }
        otherKeyPressed = true
        armWork?.cancel()
        armWork = nil
        if dictationActive && !latched {
            endDictation(action: "cancel")
        }
    }

    func configuredModifierIsDown() -> Bool {
        guard let code = spec.singleModifier else { return false }
        if CGEventSource.keyState(.hidSystemState, key: CGKeyCode(truncatingIfNeeded: code)) {
            return true
        }
        // Some keyboards never report the left/right keycode. The modifier flag still changes.
        if let flag = modifierFlag(for: code) {
            return CGEventSource.flagsState(.hidSystemState).contains(flag)
        }
        return false
    }

    func pollHotkey() {
        if !pasteInFlight, let tap = eventTapPort {
            CGEvent.tapEnable(tap: tap, enable: true)
        }
        guard spec.singleModifier != nil else { return }
        let down = configuredModifierIsDown()
        if down && !isKeyDown {
            handlePressBegan()
        } else if !down && isKeyDown {
            handlePressEnded()
        }
    }

    func pauseAudioForHold() {
        if audioHoldEngaged { return }
        let device = defaultOutputDevice()
        guard device != 0, outputDeviceIsRunning(device) else { return }

        audioGeneration += 1
        audioHoldEngaged = true
        if let mute = readMute(device) {
            audioHadMute = true
            audioPreviousMute = mute
            if mute == 0 {
                writeMute(device, 1)
            }
        }
        if let volume = readVolume(device) {
            audioHadVolume = true
            audioPreviousVolume = volume
            writeVolume(device, 0)
        }
        sendPlayPauseKey()
        audioSentMediaKey = true
    }

    func scheduleAudioResume() {
        let generation = audioGeneration
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.28) { [weak self] in
            guard let self = self else { return }
            if self.isKeyDown || self.audioGeneration != generation { return }
            self.resumeAudioAfterHold()
        }
    }

    func resumeAudioAfterHold() {
        guard audioHoldEngaged else { return }
        let device = defaultOutputDevice()
        if audioSentMediaKey {
            sendPlayPauseKey()
        }
        if device != 0 {
            if audioHadVolume {
                writeVolume(device, audioPreviousVolume)
            }
            if audioHadMute {
                writeMute(device, audioPreviousMute)
            }
        }
        audioHoldEngaged = false
        audioSentMediaKey = false
        audioHadMute = false
        audioHadVolume = false
    }

    func defaultOutputDevice() -> AudioDeviceID {
        var deviceID = AudioDeviceID(0)
        var size = UInt32(MemoryLayout<AudioDeviceID>.size)
        var address = AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyDefaultOutputDevice,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        let status = AudioObjectGetPropertyData(
            AudioObjectID(kAudioObjectSystemObject),
            &address,
            0,
            nil,
            &size,
            &deviceID
        )
        return status == noErr ? deviceID : 0
    }

    func outputDeviceIsRunning(_ device: AudioDeviceID) -> Bool {
        var running: UInt32 = 0
        var size = UInt32(MemoryLayout<UInt32>.size)
        var address = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyDeviceIsRunningSomewhere,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        let status = AudioObjectGetPropertyData(device, &address, 0, nil, &size, &running)
        return status == noErr && running != 0
    }

    func readMute(_ device: AudioDeviceID) -> UInt32? {
        var mute: UInt32 = 0
        var size = UInt32(MemoryLayout<UInt32>.size)
        var address = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyMute,
            mScope: kAudioDevicePropertyScopeOutput,
            mElement: kAudioObjectPropertyElementMain
        )
        let status = AudioObjectGetPropertyData(device, &address, 0, nil, &size, &mute)
        return status == noErr ? mute : nil
    }

    func writeMute(_ device: AudioDeviceID, _ mute: UInt32) {
        var value = mute
        let size = UInt32(MemoryLayout<UInt32>.size)
        var address = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyMute,
            mScope: kAudioDevicePropertyScopeOutput,
            mElement: kAudioObjectPropertyElementMain
        )
        AudioObjectSetPropertyData(device, &address, 0, nil, size, &value)
    }

    func readVolume(_ device: AudioDeviceID) -> Float32? {
        var volume: Float32 = 1
        var size = UInt32(MemoryLayout<Float32>.size)
        var address = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyVolumeScalar,
            mScope: kAudioDevicePropertyScopeOutput,
            mElement: kAudioObjectPropertyElementMain
        )
        let status = AudioObjectGetPropertyData(device, &address, 0, nil, &size, &volume)
        return status == noErr ? volume : nil
    }

    func writeVolume(_ device: AudioDeviceID, _ volume: Float32) {
        var value = volume
        let size = UInt32(MemoryLayout<Float32>.size)
        var address = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyVolumeScalar,
            mScope: kAudioDevicePropertyScopeOutput,
            mElement: kAudioObjectPropertyElementMain
        )
        AudioObjectSetPropertyData(device, &address, 0, nil, size, &value)
    }

    func sendPlayPauseKey() {
        let key: Int = 16 // NX_KEYTYPE_PLAY
        func post(_ down: Bool) {
            let flag: UInt = down ? 0xA00 : 0xB00
            let data1 = (key << 16) | ((down ? 0xA : 0xB) << 8)
            guard let event = NSEvent.otherEvent(
                with: .systemDefined,
                location: .zero,
                modifierFlags: NSEvent.ModifierFlags(rawValue: flag),
                timestamp: 0,
                windowNumber: 0,
                context: nil,
                subtype: 8,
                data1: data1,
                data2: -1
            ) else { return }
            event.cgEvent?.post(tap: .cghidEventTap)
        }
        post(true)
        usleep(30_000)
        post(false)
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

    func captureFocusedElement() {
        let system = AXUIElementCreateSystemWide()
        var raw: CFTypeRef?
        let err = AXUIElementCopyAttributeValue(system, kAXFocusedUIElementAttribute as CFString, &raw)
        guard err == .success, let raw else { return }
        let element = raw as! AXUIElement
        var pid: pid_t = 0
        if AXUIElementGetPid(element, &pid) == .success {
            if pid == ProcessInfo.processInfo.processIdentifier { return }
            focusedPid = pid
        }
        focusedElement = element
    }

    func postPaste(text: String, into appName: String, pid: Int32, bundleId: String) {
        let target = resolveTarget(appName: appName, pid: pid, bundleId: bundleId)
        let targetPid = target?.processIdentifier ?? pid
        let ok = deliverText(text, to: targetPid)
        sendJSON(["event": "paste_done", "ok": ok])
    }

    func resolveTarget(appName: String, pid: Int32, bundleId: String) -> NSRunningApplication? {
        let selfPid = ProcessInfo.processInfo.processIdentifier
        let preferred = focusedPid > 0 ? focusedPid : pid
        if preferred > 0, let app = NSRunningApplication(processIdentifier: preferred), !app.isTerminated, app.processIdentifier != selfPid {
            return app
        }
        if !bundleId.isEmpty {
            return NSWorkspace.shared.runningApplications.first {
                $0.bundleIdentifier == bundleId && $0.processIdentifier != selfPid
            }
        }
        if !appName.isEmpty {
            return NSWorkspace.shared.runningApplications.first {
                $0.localizedName == appName && $0.processIdentifier != selfPid
            }
        }
        return nil
    }

    func elementContains(_ text: String, _ element: AXUIElement) -> Bool {
        let probe = String(text.prefix(48))
        guard !probe.isEmpty else { return false }
        var raw: CFTypeRef?
        guard AXUIElementCopyAttributeValue(element, kAXValueAttribute as CFString, &raw) == .success,
              let value = raw as? String else {
            return false
        }
        return value.contains(probe)
    }

    func focusTextElement(in pid: pid_t) -> AXUIElement? {
        guard pid > 0 else { return nil }
        let app = AXUIElementCreateApplication(pid)
        AXUIElementSetAttributeValue(app, kAXFrontmostAttribute as CFString, kCFBooleanTrue)
        var raw: CFTypeRef?
        guard AXUIElementCopyAttributeValue(app, kAXFocusedUIElementAttribute as CFString, &raw) == .success,
              let raw else {
            return nil
        }
        let element = raw as! AXUIElement
        AXUIElementSetAttributeValue(element, kAXFocusedAttribute as CFString, kCFBooleanTrue)
        var window: CFTypeRef?
        if AXUIElementCopyAttributeValue(element, kAXWindowAttribute as CFString, &window) == .success, let window {
            AXUIElementPerformAction(window as! AXUIElement, kAXRaiseAction as CFString)
        }
        return element
    }

    func insertIntoFocusedField(_ text: String, pid: pid_t) -> Bool {
        guard !text.isEmpty, let element = focusTextElement(in: pid) else { return false }
        let before = elementValue(element)
        guard AXUIElementSetAttributeValue(element, kAXSelectedTextAttribute as CFString, text as CFString) == .success else {
            return false
        }
        guard let after = elementValue(element) else { return false }
        let probe = String(text.prefix(48))
        return after.contains(probe) && after != before
    }

    func elementValue(_ element: AXUIElement) -> String? {
        var raw: CFTypeRef?
        guard AXUIElementCopyAttributeValue(element, kAXValueAttribute as CFString, &raw) == .success else {
            return nil
        }
        return raw as? String
    }

    func deliverText(_ text: String, to pid: pid_t) -> Bool {
        guard pid > 0 else { return false }
        if insertIntoFocusedField(text, pid: pid) {
            return true
        }
        _ = focusTextElement(in: pid)
        Thread.sleep(forTimeInterval: 0.2)
        return postCommandV(to: pid)
    }

    func postCommandV(to pid: pid_t) -> Bool {
        // Press the Command key, then V. A flag on V alone is dropped: the system
        // modifier state still says Command is up, so the target app does not paste.
        guard let source = CGEventSource(stateID: .hidSystemState) else { return false }
        source.localEventsSuppressionInterval = 0

        func key(_ code: CGKeyCode, _ down: Bool, _ flags: CGEventFlags) -> CGEvent? {
            let event = CGEvent(keyboardEventSource: source, virtualKey: code, keyDown: down)
            event?.flags = flags
            return event
        }
        guard let cmdDown = key(0x37, true, .maskCommand),
              let vDown = key(0x09, true, .maskCommand),
              let vUp = key(0x09, false, .maskCommand),
              let cmdUp = key(0x37, false, []) else {
            return false
        }
        let events = [cmdDown, vDown, vUp, cmdUp]
        for event in events {
            if pid > 0 {
                event.postToPid(pid)
            } else {
                event.post(tap: .cghidEventTap)
            }
            usleep(20_000)
        }
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

if CommandLine.arguments.contains("--paste") {
    var pastePid: Int32 = 0
    var pasteApp = ""
    let args = CommandLine.arguments
    for i in 0..<args.count {
        if args[i] == "--paste", i + 1 < args.count, let value = Int32(args[i + 1]) {
            pastePid = value
        }
        if args[i] == "--app", i + 1 < args.count {
            pasteApp = args[i + 1]
        }
    }
    if pastePid <= 0, !pasteApp.isEmpty,
       let match = NSWorkspace.shared.runningApplications.first(where: { $0.localizedName == pasteApp }) {
        pastePid = match.processIdentifier
    }
    let pastedText = String(data: FileHandle.standardInput.readDataToEndOfFile(), encoding: .utf8) ?? ""
    let ok = KeyListenerService.shared.deliverText(pastedText, to: pastePid)
    exit(ok ? 0 : 1)
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
                let pid = msg.pid ?? 0
                let bundleId = msg.bundleId ?? ""
                let text = msg.text ?? ""
                KeyListenerService.shared.postPaste(text: text, into: app, pid: pid, bundleId: bundleId)
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

Timer.scheduledTimer(withTimeInterval: 0.03, repeats: true) { _ in
    KeyListenerService.shared.pollHotkey()
}

KeyListenerService.shared.sendJSON(["event": "ready", "key": initialKey, "mode": initialMode])
CFRunLoopRun()
