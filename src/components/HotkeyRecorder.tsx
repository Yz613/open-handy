import React, { useState, useEffect } from 'react';
import { Keyboard, Check, RefreshCw, AlertCircle, Sparkles, Edit3 } from 'lucide-react';

interface HotkeyRecorderProps {
  currentHotkey: string;
  onSave: (hotkey: string) => void;
}

export const HotkeyRecorder: React.FC<HotkeyRecorderProps> = ({ currentHotkey, onSave }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [preview, setPreview] = useState(currentHotkey || 'LeftControl');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [manualText, setManualText] = useState(currentHotkey || 'LeftControl');
  const [liveModifiers, setLiveModifiers] = useState<string[]>([]);

  useEffect(() => {
    setPreview(currentHotkey || 'LeftControl');
    setManualText(currentHotkey || 'LeftControl');
  }, [currentHotkey]);

  // Hook into native macOS listener for hardware-level modifier keys (Left Control, Right Control, Fn, etc.)
  useEffect(() => {
    if (!window.electronAPI?.onNativeKeyRecorded) return;

    const unsub = window.electronAPI.onNativeKeyRecorded((data) => {
      if (isRecording) {
        setIsRecording(false);
        setLiveModifiers([]);
        applyHotkey(data.key);
      }
    });

    return () => unsub();
  }, [isRecording]);

  useEffect(() => {
    if (!window.electronAPI) return;
    if (isRecording) {
      window.electronAPI.startRecordingHotkey();
    } else {
      window.electronAPI.stopRecordingHotkey();
    }
  }, [isRecording]);

  // Translate key code into clean Electron accelerator key name
  const getAcceleratorKeyName = (e: KeyboardEvent): string => {
    const code = e.code;
    if (code.startsWith('Key')) return code.slice(3); // KeyA -> A
    if (code.startsWith('Digit')) return code.slice(5); // Digit1 -> 1
    if (code === 'Space') return 'Space';
    if (code.startsWith('F') && /^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code; // F1-F24
    if (code === 'Backquote') return '`';
    if (code === 'Minus') return '-';
    if (code === 'Equal') return '=';
    if (code === 'BracketLeft') return '[';
    if (code === 'BracketRight') return ']';
    if (code === 'Backslash') return '\\';
    if (code === 'Semicolon') return ';';
    if (code === 'Quote') return "'";
    if (code === 'Comma') return ',';
    if (code === 'Period') return '.';
    if (code === 'Slash') return '/';
    if (code === 'Tab') return 'Tab';
    if (code === 'Enter') return 'Return';
    return '';
  };

  const applyHotkey = async (accelerator: string) => {
    setStatusMessage(null);

    if (!window.electronAPI) {
      onSave(accelerator);
      setPreview(accelerator);
      setStatusMessage({ type: 'success', text: 'Shortcut saved!' });
      return;
    }

    try {
      const result = await window.electronAPI.setHotkey(accelerator);
      if (result.success) {
        const savedKey = result.hotkey || accelerator;
        setPreview(savedKey);
        setManualText(savedKey);
        onSave(savedKey);
        setStatusMessage({
          type: 'success',
          text: `✓ Saved! Shortcut registered & active: ${formatDisplayHotkey(savedKey)}`,
        });
      } else {
        setStatusMessage({
          type: 'error',
          text: result.error || 'Failed to register shortcut with macOS.',
        });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Error saving shortcut.' });
    }
  };

  useEffect(() => {
    if (!isRecording) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Cancel with Escape
      if (e.key === 'Escape') {
        setIsRecording(false);
        setLiveModifiers([]);
        return;
      }

      // Check for standalone modifier keys in browser event
      if (e.code === 'ControlLeft') {
        setIsRecording(false);
        setLiveModifiers([]);
        applyHotkey('LeftControl');
        return;
      }
      if (e.code === 'ControlRight') {
        setIsRecording(false);
        setLiveModifiers([]);
        applyHotkey('RightControl');
        return;
      }
      if (e.code === 'AltLeft') {
        setIsRecording(false);
        setLiveModifiers([]);
        applyHotkey('LeftOption');
        return;
      }
      if (e.code === 'AltRight') {
        setIsRecording(false);
        setLiveModifiers([]);
        applyHotkey('RightOption');
        return;
      }

      // Track active modifier keys for live display
      const mods: string[] = [];
      if (e.metaKey) mods.push('CommandOrControl');
      if (e.ctrlKey) mods.push('Control');
      if (e.altKey) mods.push('Alt');
      if (e.shiftKey) mods.push('Shift');
      setLiveModifiers(mods);

      // If only a modifier key is pressed, wait for the actual trigger key or native listener
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
        return;
      }

      const keyName = getAcceleratorKeyName(e);
      if (!keyName) return;

      const isFKey = keyName.startsWith('F');
      if (mods.length === 0 && !isFKey) {
        setStatusMessage({
          type: 'error',
          text: 'Global shortcuts must include at least one modifier (⌥ Option, ⌘ Command, ⌃ Control, or ⇧ Shift), or an F-key.',
        });
        return;
      }

      const fullAccelerator = [...mods, keyName].join('+');
      setIsRecording(false);
      setLiveModifiers([]);
      applyHotkey(fullAccelerator);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const mods: string[] = [];
      if (e.metaKey) mods.push('CommandOrControl');
      if (e.ctrlKey) mods.push('Control');
      if (e.altKey) mods.push('Alt');
      if (e.shiftKey) mods.push('Shift');
      setLiveModifiers(mods);
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
    };
  }, [isRecording]);

  // Format accelerator for macOS display symbols
  const formatDisplayHotkey = (acc: string) => {
    if (!acc) return 'Not Set';
    if (acc === 'LeftControl') return '⌃ Left Control';
    if (acc === 'RightControl') return '⌃ Right Control';
    if (acc === 'LeftOption') return '⌥ Left Option';
    if (acc === 'RightOption') return '⌥ Right Option';
    if (acc === 'Fn') return '🌐 Fn / Globe';
    return acc
      .replace(/CommandOrControl|Cmd/g, '⌘')
      .replace(/Alt|Option/g, '⌥')
      .replace(/Shift/g, '⇧')
      .replace(/Control|Ctrl/g, '⌃')
      .replace(/\+/g, ' ');
  };

  const presets = [
    { label: '⌃ Left Control', value: 'LeftControl', desc: 'Left Control key (Handy & Mac Dictation style)' },
    { label: '⌥ Space', value: 'Alt+Space', desc: 'Option + Space (Default)' },
    { label: '⌃ Space', value: 'Control+Space', desc: 'Control + Space' },
    { label: '⌥ D', value: 'Alt+D', desc: 'Option + D' },
    { label: '🌐 Fn / Globe', value: 'Fn', desc: 'Fn / Globe key' },
    { label: '⌃ Right Control', value: 'RightControl', desc: 'Right Control key' },
    { label: '⌘ ⇧ Space', value: 'CommandOrControl+Shift+Space', desc: 'Cmd + Shift + Space' },
    { label: 'F8', value: 'F8', desc: 'F8 key' },
  ];

  return (
    <div className="space-y-4">
      {/* 1. Interactive Key Recorder Box */}
      <div className="flex items-center gap-3">
        <div
          onClick={() => {
            setIsRecording(!isRecording);
            setStatusMessage(null);
          }}
          className={`px-4 py-2.5 rounded-xl border text-sm font-mono flex items-center gap-2.5 min-w-[160px] justify-center cursor-pointer transition-all select-none ${
            isRecording
              ? 'border-blue-500 bg-blue-500/15 text-blue-300 ring-2 ring-blue-500/30 animate-pulse'
              : 'border-neutral-700 bg-neutral-800/90 text-neutral-100 hover:border-neutral-600 hover:bg-neutral-800'
          }`}
          title="Click to record new shortcut"
        >
          <Keyboard size={16} className={isRecording ? 'text-blue-400' : 'text-neutral-400'} />
          <span className="font-semibold tracking-wide">
            {isRecording
              ? liveModifiers.length > 0
                ? `${formatDisplayHotkey(liveModifiers.join('+'))} ...`
                : 'Press any key or Left Control now...'
              : formatDisplayHotkey(preview)}
          </span>
        </div>

        <button
          onClick={() => {
            setIsRecording(!isRecording);
            setStatusMessage(null);
          }}
          className={`px-3.5 py-2 rounded-xl text-xs font-medium transition-colors ${
            isRecording
              ? 'bg-neutral-700 hover:bg-neutral-600 text-neutral-200'
              : 'bg-blue-600 hover:bg-blue-500 text-white shadow-sm'
          }`}
        >
          {isRecording ? 'Cancel (Esc)' : 'Record Shortcut'}
        </button>

        <button
          onClick={() => setShowManual(!showManual)}
          className="px-3 py-2 rounded-xl text-xs font-medium bg-neutral-800 hover:bg-neutral-700 text-neutral-300 flex items-center gap-1.5 transition-colors"
        >
          <Edit3 size={13} />
          {showManual ? 'Hide Manual' : 'Type Manually'}
        </button>

        {preview !== 'LeftControl' && !isRecording && (
          <button
            onClick={() => applyHotkey('LeftControl')}
            className="text-xs text-neutral-400 hover:text-neutral-200 flex items-center gap-1 py-1 px-2 rounded hover:bg-neutral-800 transition-colors"
            title="Set to Left Control (Handy default)"
          >
            <RefreshCw size={12} />
            Set to Left Control
          </button>
        )}
      </div>

      {/* Manual Input Form if toggled */}
      {showManual && (
        <div className="p-3 bg-neutral-950/70 border border-neutral-800 rounded-xl space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
              placeholder="e.g. LeftControl or Alt+Space"
              className="flex-1 px-3 py-1.5 text-xs rounded-lg bg-neutral-800 border border-neutral-700 focus:border-blue-500 focus:outline-none text-neutral-100 font-mono"
            />
            <button
              onClick={() => applyHotkey(manualText)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors"
            >
              Save Shortcut
            </button>
          </div>
          <p className="text-[11px] text-neutral-400">
            Use standard names: <code className="text-neutral-300">LeftControl</code>, <code className="text-neutral-300">RightControl</code>, <code className="text-neutral-300">Fn</code>, <code className="text-neutral-300">Alt+Space</code>, <code className="text-neutral-300">Control+Space</code>.
          </p>
        </div>
      )}

      {/* 2. One-Click Popular Presets */}
      <div className="space-y-1.5">
        <span className="text-[11px] text-neutral-400 font-medium">Quick 1-Click Presets:</span>
        <div className="flex flex-wrap gap-2">
          {presets.map((p) => {
            const isCurrent = preview === p.value;
            return (
              <button
                key={p.value}
                onClick={() => applyHotkey(p.value)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                  isCurrent
                    ? 'bg-blue-600/20 text-blue-300 border border-blue-500/40 ring-1 ring-blue-500/30'
                    : 'bg-neutral-800/80 hover:bg-neutral-700 text-neutral-300 border border-neutral-700/60'
                }`}
                title={p.desc}
              >
                {isCurrent && <Check size={12} className="text-blue-400" />}
                <span>{p.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Status Notification */}
      {statusMessage && (
        <div
          className={`p-2.5 rounded-lg text-xs flex items-center gap-2 ${
            statusMessage.type === 'success'
              ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
              : 'bg-rose-500/10 text-rose-300 border border-rose-500/20'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <Check size={14} className="text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle size={14} className="text-rose-400 shrink-0" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}
    </div>
  );
};
