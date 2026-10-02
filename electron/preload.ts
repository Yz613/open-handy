import { contextBridge, ipcRenderer } from 'electron';
import { AppSettings, HUDState, DictationRecord } from './providers/types';

export const electronAPI = {
  // Settings
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('get-settings'),
  updateSettings: (settings: Partial<AppSettings>): Promise<AppSettings> =>
    ipcRenderer.invoke('update-settings', settings),
  setHotkey: (hotkey: string): Promise<{ success: boolean; error?: string; hotkey?: string; settings?: AppSettings }> =>
    ipcRenderer.invoke('set-hotkey', hotkey),

  // Connection testing
  testProvider: (provider: string): Promise<{ success: boolean; message: string }> =>
    ipcRenderer.invoke('test-provider', provider),

  // History
  getHistory: (): Promise<DictationRecord[]> => ipcRenderer.invoke('get-history'),
  clearHistory: (): Promise<void> => ipcRenderer.invoke('clear-history'),
  deleteHistoryRecord: (id: string): Promise<void> => ipcRenderer.invoke('delete-history-record', id),

  // Accessibility
  checkAccessibility: (): Promise<boolean> => ipcRenderer.invoke('check-accessibility'),
  openAccessibilitySettings: (): Promise<void> => ipcRenderer.invoke('open-accessibility-settings'),

  // Developer & Project editing
  openProjectFolder: (): Promise<void> => ipcRenderer.invoke('open-project-folder'),
  openInEditor: (): Promise<void> => ipcRenderer.invoke('open-in-editor'),

  // Dictation flow
  sendAudioChunk: (arrayBuffer: ArrayBuffer, mimeType: string, durationSeconds: number): Promise<void> =>
    ipcRenderer.invoke('process-audio', arrayBuffer, mimeType, durationSeconds),

  sendAudioLevel: (level: number) => {
    ipcRenderer.send('audio-level', level);
  },

  // Manual Trigger
  triggerToggleRecording: () => {
    ipcRenderer.send('trigger-toggle-recording');
  },

  // Listeners from Main to Renderer
  onStartRecording: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('start-recording', handler);
    return () => ipcRenderer.removeListener('start-recording', handler);
  },

  onStopRecording: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('stop-recording', handler);
    return () => ipcRenderer.removeListener('stop-recording', handler);
  },

  onHUDStateChange: (callback: (state: HUDState) => void) => {
    const handler = (_event: any, state: HUDState) => callback(state);
    ipcRenderer.on('hud-state-change', handler);
    return () => ipcRenderer.removeListener('hud-state-change', handler);
  },

  onAudioLevelChange: (callback: (level: number) => void) => {
    const handler = (_event: any, level: number) => callback(level);
    ipcRenderer.on('audio-level-update', handler);
    return () => ipcRenderer.removeListener('audio-level-update', handler);
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

declare global {
  interface Window {
    electronAPI: typeof electronAPI;
  }
}
