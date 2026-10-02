import React, { useEffect, useState } from 'react';
import { Keyboard, Shield, Volume2, Clipboard, ArrowDownToLine, ExternalLink, Check, AlertTriangle } from 'lucide-react';
import { AppSettings } from '../../electron/providers/types';
import { HotkeyRecorder } from './HotkeyRecorder';

interface GeneralSettingsProps {
  settings: AppSettings;
  onUpdate: (partial: Partial<AppSettings>) => void;
}

export const GeneralSettings: React.FC<GeneralSettingsProps> = ({ settings, onUpdate }) => {
  const [hasAccessibility, setHasAccessibility] = useState<boolean | null>(null);

  const checkPerms = async () => {
    try {
      const allowed = await window.electronAPI.checkAccessibility();
      setHasAccessibility(allowed);
    } catch (e) {
      setHasAccessibility(false);
    }
  };

  useEffect(() => {
    checkPerms();
    const interval = setInterval(checkPerms, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6">
      {/* 1. Global Keyboard Shortcut */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2.5">
          <Keyboard size={18} className="text-blue-400" />
          <div>
            <h3 className="font-semibold text-sm text-neutral-100">Global Dictation Shortcut</h3>
            <p className="text-xs text-neutral-400">Trigger speech recording from anywhere on your Mac.</p>
          </div>
        </div>

        <div className="pt-1">
          <HotkeyRecorder
            currentHotkey={settings.hotkey}
            onSave={(newHotkey) => onUpdate({ hotkey: newHotkey })}
          />
        </div>

        <div className="pt-2 border-t border-neutral-800/80 flex items-center justify-between text-xs">
          <div>
            <span className="font-medium text-neutral-200">Recording Mode</span>
            <p className="text-[11px] text-neutral-400">Choose how the shortcut behaves</p>
          </div>
          <div className="flex bg-neutral-800 p-0.5 rounded-lg border border-neutral-700">
            <button
              onClick={() => onUpdate({ hotkeyMode: 'toggle' })}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                settings.hotkeyMode === 'toggle'
                  ? 'bg-blue-600 text-white'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              Toggle (Press to start / stop)
            </button>
            <button
              onClick={() => onUpdate({ hotkeyMode: 'pushToTalk' })}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                settings.hotkeyMode === 'pushToTalk'
                  ? 'bg-blue-600 text-white'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              Push-to-Talk
            </button>
          </div>
        </div>
      </div>

      {/* 2. Output & Pasting Behavior */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2.5">
          <ArrowDownToLine size={18} className="text-emerald-400" />
          <div>
            <h3 className="font-semibold text-sm text-neutral-100">Output & Insertion</h3>
            <p className="text-xs text-neutral-400">Control how dictated text is delivered to your Mac.</p>
          </div>
        </div>

        <div className="space-y-3 pt-1">
          {/* Auto-Paste Toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-neutral-800/40 border border-neutral-800">
            <div>
              <span className="font-medium text-xs text-neutral-200">Auto-paste into active app</span>
              <p className="text-[11px] text-neutral-400">
                Immediately pastes (Cmd+V) the transcribed text right where your cursor was typing.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.autoPaste}
                onChange={(e) => onUpdate({ autoPaste: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-neutral-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
            </label>
          </div>

          {/* Copy to Clipboard Toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-neutral-800/40 border border-neutral-800">
            <div>
              <span className="font-medium text-xs text-neutral-200">Copy to clipboard</span>
              <p className="text-[11px] text-neutral-400">
                Keep a copy of the transcribed text on your macOS clipboard. Can be disabled if you only want direct pasting without overwriting clipboard history.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.copyToClipboard}
                onChange={(e) => onUpdate({ copyToClipboard: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-neutral-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
            </label>
          </div>

          {/* Sound Effects Toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-neutral-800/40 border border-neutral-800">
            <div>
              <span className="font-medium text-xs text-neutral-200">Sound Effects</span>
              <p className="text-[11px] text-neutral-400">
                Subtle audio chimes on start recording, stop recording, and successful paste.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.soundEffects}
                onChange={(e) => onUpdate({ soundEffects: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-neutral-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
        </div>
      </div>

      {/* 3. macOS Accessibility Permissions */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Shield size={18} className="text-amber-400" />
            <div>
              <h3 className="font-semibold text-sm text-neutral-100">macOS Accessibility Permission</h3>
              <p className="text-xs text-neutral-400">
                Required for the app to automatically paste text into other applications.
              </p>
            </div>
          </div>

          {hasAccessibility ? (
            <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-medium flex items-center gap-1">
              <Check size={13} /> Granted
            </span>
          ) : (
            <button
              onClick={() => window.electronAPI.openAccessibilitySettings()}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 flex items-center gap-1.5 transition-colors"
            >
              <AlertTriangle size={13} />
              Open Settings <ExternalLink size={11} />
            </button>
          )}
        </div>

        {!hasAccessibility && (
          <p className="text-[11px] text-amber-300/80 bg-amber-500/10 p-2.5 rounded-lg border border-amber-500/20">
            If auto-paste does not paste into other apps, click "Open Settings", unlock the lock icon, and allow OpenHandy (or your terminal) under <strong>Privacy & Security → Accessibility</strong>.
          </p>
        )}
      </div>
    </div>
  );
};
