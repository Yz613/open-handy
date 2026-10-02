import React, { useEffect, useState, useRef } from 'react';
import { Mic, Loader2, Sparkles, Check, AlertCircle, Square } from 'lucide-react';
import { AudioRecorder } from '../audio/recorder';
import {
  playStartChime,
  playStopChime,
  playSuccessChime,
  playErrorChime,
} from '../audio/soundEffects';

interface HUDState {
  status: 'idle' | 'listening' | 'transcribing' | 'polishing' | 'pasted' | 'copied' | 'error';
  elapsedSeconds?: number;
  providerName?: string;
  presetName?: string;
  previewText?: string;
  message?: string;
}

export const FloatingHUD: React.FC = () => {
  const [hudState, setHudState] = useState<HUDState>({ status: 'idle' });
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const recorderRef = useRef<AudioRecorder | null>(null);
  const opRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    if (!window.electronAPI) return;

    // Initialize recorder
    recorderRef.current = new AudioRecorder((level) => {
      setAudioLevel(level);
      window.electronAPI.sendAudioLevel(level);
    });

    const enqueue = (job: () => Promise<void>) => {
      opRef.current = opRef.current.then(job).catch((err) => {
        console.error('Recording pipeline error:', err);
      });
    };

    // Start recording event from global hotkey or tray
    const unsubStart = window.electronAPI.onStartRecording(() => {
      enqueue(async () => {
        try {
          playStartChime();
          await recorderRef.current?.start();
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Microphone unavailable';
          window.electronAPI.reportRecordingError(message);
        }
      });
    });

    // Stop recording event
    const unsubStop = window.electronAPI.onStopRecording(() => {
      enqueue(async () => {
        const recorder = recorderRef.current;
        if (!recorder?.isActive()) {
          window.electronAPI.reportRecordingError('No audio was captured.');
          return;
        }
        try {
          playStopChime();
          const { arrayBuffer, mimeType, durationSeconds } = await recorder.stop();
          await window.electronAPI.sendAudioChunk(arrayBuffer, mimeType, durationSeconds);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Could not finish the recording.';
          window.electronAPI.reportRecordingError(message);
        }
      });
    });

    const unsubCancel = window.electronAPI.onCancelRecording(() => {
      enqueue(async () => {
        recorderRef.current?.discard();
      });
    });

    // State changes from main process
    const unsubHUD = window.electronAPI.onHUDStateChange((state: any) => {
      setHudState(state);
      if (state.status === 'pasted' || state.status === 'copied') {
        playSuccessChime();
      } else if (state.status === 'error') {
        playErrorChime();
      }
    });

    // Direct level updates if needed
    const unsubLevel = window.electronAPI.onAudioLevelChange((lvl: number) => {
      setAudioLevel(lvl);
    });

    return () => {
      unsubStart();
      unsubStop();
      unsubCancel();
      unsubHUD();
      unsubLevel();
    };
  }, []);

  if (hudState.status === 'idle') {
    return null;
  }

  // Format elapsed time MM:SS
  const formatTime = (secs: number = 0) => {
    const mins = Math.floor(secs / 60);
    const remaining = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remaining.toString().padStart(2, '0')}`;
  };

  // Render animated sound wave bars
  const renderWaveform = () => {
    const bars = [0.4, 0.7, 1.0, 0.8, 0.5];
    return (
      <div className="flex items-center gap-1 h-5 px-1">
        {bars.map((weight, idx) => {
          // Dynamic scale based on real-time microphone volume
          const scale = Math.max(0.2, Math.min(1.0, audioLevel * 2.2 * weight + 0.15));
          const heightPx = Math.round(scale * 18);
          return (
            <div
              key={idx}
              className="w-1 bg-red-400 rounded-full transition-all duration-75"
              style={{ height: `${heightPx}px` }}
            />
          );
        })}
      </div>
    );
  };

  return (
    <div className="animate-scale-in">
      <div className="flex items-center gap-3 px-4 py-2.5 rounded-full bg-neutral-900/90 backdrop-blur-2xl border border-white/15 shadow-2xl text-white select-none">
        {hudState.status === 'listening' && (
          <>
            {/* Pulsing red record indicator */}
            <div className="relative flex items-center justify-center">
              <span className="absolute animate-ping inline-flex h-3 w-3 rounded-full bg-red-500 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
            </div>

            {/* Audio Waveform */}
            {renderWaveform()}

            {/* Timer and label */}
            <div className="flex items-center gap-1.5 font-medium text-xs text-neutral-200">
              <span className="font-mono text-neutral-100">{formatTime(hudState.elapsedSeconds)}</span>
              <span className="text-neutral-400">•</span>
              <span className="text-neutral-300">Listening...</span>
            </div>

            {/* Quick stop button */}
            <button
              onClick={() => window.electronAPI.triggerToggleRecording()}
              className="ml-1 p-1 rounded-full bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors"
              title="Stop Recording"
            >
              <Square size={12} className="fill-current" />
            </button>
          </>
        )}

        {hudState.status === 'transcribing' && (
          <div className="flex items-center gap-2.5 py-0.5">
            <Loader2 size={16} className="animate-spin text-blue-400" />
            <span className="text-xs font-medium text-neutral-200">
              {hudState.providerName === 'audio' ? (
                'Finishing recording...'
              ) : (
                <>
                  Transcribing with <span className="text-blue-300 font-semibold">{hudState.providerName}</span>...
                </>
              )}
            </span>
          </div>
        )}

        {hudState.status === 'polishing' && (
          <div className="flex items-center gap-2.5 py-0.5">
            <Sparkles size={16} className="text-purple-400 animate-pulse" />
            <div className="flex flex-col">
              <span className="text-xs font-medium text-neutral-200">
                Polishing with <span className="text-purple-300 font-semibold">{hudState.providerName}</span>...
              </span>
              {hudState.presetName && (
                <span className="text-[10px] text-neutral-400">{hudState.presetName}</span>
              )}
            </div>
          </div>
        )}

        {hudState.status === 'pasted' && (
          <div className="flex items-center gap-2 py-0.5">
            <div className="h-5 w-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Check size={13} strokeWidth={3} />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-emerald-400">Pasted!</span>
              {hudState.previewText && (
                <span className="text-[10px] text-neutral-300 max-w-[200px] truncate">
                  "{hudState.previewText}"
                </span>
              )}
            </div>
          </div>
        )}

        {hudState.status === 'copied' && (
          <div className="flex items-center gap-2 py-0.5">
            <div className="h-5 w-5 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center">
              <Check size={13} strokeWidth={3} />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-blue-400">Copied to Clipboard</span>
              {hudState.previewText && (
                <span className="text-[10px] text-neutral-300 max-w-[200px] truncate">
                  "{hudState.previewText}"
                </span>
              )}
            </div>
          </div>
        )}

        {hudState.status === 'error' && (
          <div className="flex items-center gap-2 py-0.5">
            <div className="h-5 w-5 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center">
              <AlertCircle size={13} strokeWidth={2.5} />
            </div>
            <span className="text-xs font-medium text-rose-300 max-w-[220px] truncate">
              {hudState.message || 'Dictation failed'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
