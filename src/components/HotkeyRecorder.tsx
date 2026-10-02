import React, { useState, useEffect } from 'react';
import { Keyboard, Check, RefreshCw } from 'lucide-react';

interface HotkeyRecorderProps {
  currentHotkey: string;
  onSave: (hotkey: string) => void;
}

export const HotkeyRecorder: React.FC<HotkeyRecorderProps> = ({ currentHotkey, onSave }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [preview, setPreview] = useState(currentHotkey);

  useEffect(() => {
    setPreview(currentHotkey);
  }, [currentHotkey]);

  useEffect(() => {
    if (!isRecording) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Don't register if only modifier keys are pressed
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
        return;
      }

      const parts: string[] = [];

      if (e.metaKey) parts.push('CommandOrControl');
      if (e.ctrlKey && !e.metaKey) parts.push('Control');
      if (e.altKey) parts.push('Alt');
      if (e.shiftKey) parts.push('Shift');

      let keyName = e.code.replace('Key', '');
      if (e.code === 'Space') keyName = 'Space';
      if (e.code.startsWith('Digit')) keyName = e.code.replace('Digit', '');

      if (keyName) {
        parts.push(keyName);
        const accelerator = parts.join('+');
        setPreview(accelerator);
        onSave(accelerator);
        setIsRecording(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isRecording, onSave]);

  // Format accelerator for macOS display symbols
  const formatDisplayHotkey = (acc: string) => {
    return acc
      .replace(/CommandOrControl|Cmd/g, '⌘')
      .replace(/Alt|Option/g, '⌥')
      .replace(/Shift/g, '⇧')
      .replace(/Control|Ctrl/g, '⌃')
      .replace(/\+/g, ' ');
  };

  return (
    <div className="flex items-center gap-3">
      <div
        className={`px-3 py-1.5 rounded-lg border text-sm font-mono flex items-center gap-2 min-w-[140px] justify-center transition-all ${
          isRecording
            ? 'border-blue-500 bg-blue-500/10 text-blue-400 ring-2 ring-blue-500/20 animate-pulse'
            : 'border-neutral-700 bg-neutral-800/80 text-neutral-200'
        }`}
      >
        <Keyboard size={15} className={isRecording ? 'text-blue-400' : 'text-neutral-400'} />
        <span>{isRecording ? 'Press keys...' : formatDisplayHotkey(preview)}</span>
      </div>

      <button
        onClick={() => setIsRecording(!isRecording)}
        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
          isRecording
            ? 'bg-neutral-700 hover:bg-neutral-600 text-neutral-200'
            : 'bg-blue-600 hover:bg-blue-500 text-white'
        }`}
      >
        {isRecording ? 'Cancel' : 'Change Shortcut'}
      </button>

      {preview !== 'Alt+Space' && !isRecording && (
        <button
          onClick={() => {
            setPreview('Alt+Space');
            onSave('Alt+Space');
          }}
          className="text-xs text-neutral-400 hover:text-neutral-200 flex items-center gap-1"
          title="Reset to default (⌥ Space)"
        >
          <RefreshCw size={12} />
          Reset
        </button>
      )}
    </div>
  );
};
