import { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, screen, nativeImage, NativeImage, shell, systemPreferences, session } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import { exec, spawn, ChildProcess } from 'child_process';
import { AppStore } from './store';
import { TextInjector } from './injector';
import { loadEnvFiles } from './env';
import { transcribeAudio, sttProviderConfigured, STTResult } from './providers/stt';
import { processWithLLM } from './providers/llm';
import { testProviderConnection } from './providers/tester';
import { HUDState, DictationRecord, AppSettings } from './providers/types';

loadEnvFiles();
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

let tray: Tray | null = null;
let hudWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let isQuitting = false;
let keylistenerProcess: ChildProcess | null = null;

const store = new AppStore();
const injector = new TextInjector();

let isRecording = false;
let recordingStartTime = 0;
let recordingTimer: NodeJS.Timeout | null = null;
let hudReady = false;
let queuedHUDState: HUDState | null = null;
let hudWantsRecording = false;
let nativeListenerReady = false;
let keylistenerFailures = 0;
let pendingPaste: ((ok: boolean) => void) | null = null;
let recordingToken = 0;
let accessibilityWarned = false;

// Ensure single instance lock so clicking the app in Applications focuses the existing instance
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    openSettingsWindow('general');
  });
}

const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';

const TRAY_IDLE_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAhUlEQVR4nO2VSQ7AIAwDY6v//zK9V1QkxBFCMFfCxCwCs8vpIDm/ZV0QNE45aYuhePWe8XQAKdTqboA4tMXw+ABP4VPrmsudjqBV1HIw3tu60VEgUk+L4VmZ/C/ATwPPpRzWwCH5NvbiclMtjNbC5mgqHyYD9IJMuWiLwU6XsATWaC8b8QJzLA8x5euh8wAAAABJRU5ErkJggg==';

const TRAY_RECORDING_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAoUlEQVR4nO2WOQ6AIBBFZ344kNZyfK31RlpqjOAsEGLkVSbyF4KARJ3O32GLaJ+GPWm4bCpPLhVsLYIa4ZrxqBGu0aFWuFSPmuESn+ByntfzOY4mCzbN/hp8J1PkaWeAGgO1Ijd7yXt3gcLgewXiy9eu3A2gxrDrIFKcA6nLKZAH4+EjXgJW3u0WH3jE3nBRAU8JiQ4lzSzjmRr/E3Y61JoDxbY+l9zw4b0AAAAASUVORK5CYII=';

function createTrayIcon(recording: boolean = false): NativeImage {
  const dataUrl = recording ? TRAY_RECORDING_DATA_URL : TRAY_IDLE_DATA_URL;
  const img = nativeImage.createFromDataURL(dataUrl);
  const resized = img.resize({ width: 18, height: 18 });
  if (!recording) {
    resized.setTemplateImage(true);
  }
  return resized;
}

function updateTrayMenu() {
  if (!tray) return;

  tray.setImage(createTrayIcon(isRecording));

  const settings = store.getSettings();
  const activePreset = settings.presets.find(p => p.id === settings.activePresetId) || settings.presets[0];

  const contextMenu = Menu.buildFromTemplate([
    {
      label: isRecording ? '⏹ Stop Dictation' : '🎙 Start Dictation',
      accelerator: settings.hotkey,
      click: () => toggleRecording(),
    },
    { type: 'separator' },
    {
      label: `Mode: ${activePreset?.name || 'Raw'}`,
      submenu: settings.presets.map(preset => ({
        label: preset.name,
        type: 'radio',
        checked: preset.id === settings.activePresetId,
        click: () => {
          store.updateSettings({ activePresetId: preset.id });
          updateTrayMenu();
        },
      })),
    },
    { type: 'separator' },
    {
      label: '⚙️ Settings...',
      accelerator: 'CommandOrControl+,',
      click: () => openSettingsWindow('general'),
    },
    {
      label: '📜 Dictation History...',
      accelerator: 'CommandOrControl+H',
      click: () => openSettingsWindow('history'),
    },
    { type: 'separator' },
    {
      label: '✏️ Edit Source Code...',
      click: () => {
        const projectDir = '/Users/yehudazahler/Projects/Personal/STT';
        exec(`cursor "${projectDir}" || code "${projectDir}" || open "${projectDir}"`);
      },
    },
    {
      label: '📁 Open Project Folder...',
      click: () => {
        shell.openPath('/Users/yehudazahler/Projects/Personal/STT');
      },
    },
    { type: 'separator' },
    {
      label: 'Quit OpenHandy',
      accelerator: 'CommandOrControl+Q',
      click: () => app.quit(),
    },
  ]);

  tray.setContextMenu(contextMenu);
}

function hudBounds() {
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const area = display.workArea;
  const hudWidth = 440;
  const hudHeight = 120;
  return {
    x: Math.round(area.x + (area.width - hudWidth) / 2),
    y: Math.round(area.y + area.height - hudHeight - 16),
    width: hudWidth,
    height: hudHeight,
  };
}

function positionHUD() {
  if (!hudWindow) return;
  hudWindow.setBounds(hudBounds());
}

function probeDevServer(page: string): Promise<boolean> {
  if (app.isPackaged) return Promise.resolve(false);
  return new Promise((resolve) => {
    const req = http.get(`${VITE_DEV_SERVER_URL}/${page}`, (res) => {
      res.resume();
      resolve((res.statusCode || 500) < 500);
    });
    req.setTimeout(400, () => {
      req.destroy();
      resolve(false);
    });
    req.on('error', () => resolve(false));
  });
}

async function loadRenderer(win: BrowserWindow, page: string) {
  const distFile = path.join(__dirname, '../dist', page);
  if (await probeDevServer(page)) {
    await win.loadURL(`${VITE_DEV_SERVER_URL}/${page}`);
    return;
  }
  if (fs.existsSync(distFile)) {
    await win.loadFile(distFile);
    return;
  }
  await win.loadURL(`${VITE_DEV_SERVER_URL}/${page}`);
}

function createHUDWindow() {
  const bounds = hudBounds();

  hudWindow = new BrowserWindow({
    ...bounds,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    focusable: false,
    hasShadow: false,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    show: false,
    roundedCorners: false,
    type: 'panel',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
    },
  });

  hudWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  hudWindow.setAlwaysOnTop(true, 'screen-saver');
  hudWindow.webContents.setBackgroundThrottling(false);

  hudWindow.webContents.on('did-finish-load', () => {
    hudReady = true;
    if (queuedHUDState) {
      hudWindow?.webContents.send('hud-state-change', queuedHUDState);
    }
    if (hudWantsRecording) {
      hudWindow?.webContents.send('start-recording');
    }
  });

  hudWindow.on('closed', () => {
    hudWindow = null;
    hudReady = false;
  });

  void loadRenderer(hudWindow, 'hud.html');
}

function openSettingsWindow(initialTab: string = 'general') {
  if (process.platform === 'darwin') {
    app.dock?.show();
  }

  if (settingsWindow) {
    if (settingsWindow.isMinimized()) settingsWindow.restore();
    settingsWindow.show();
    settingsWindow.focus();
    settingsWindow.webContents.send('switch-tab', initialTab);
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 940,
    height: 680,
    minWidth: 840,
    minHeight: 560,
    title: 'OpenHandy Settings',
    titleBarStyle: 'hiddenInset',
    vibrancy: 'sidebar',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  void loadRenderer(settingsWindow, 'index.html');

  settingsWindow.once('ready-to-show', () => {
    settingsWindow?.show();
    settingsWindow?.focus();
    if (initialTab !== 'general') {
      settingsWindow?.webContents.send('switch-tab', initialTab);
    }
  });

  settingsWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      settingsWindow?.hide();
      if (process.platform === 'darwin') {
        app.dock?.hide();
      }
    }
  });

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

const MODIFIER_HOTKEYS = [
  'LeftControl', 'RightControl', 'LeftOption', 'RightOption',
  'LeftCommand', 'RightCommand', 'LeftShift', 'RightShift', 'Fn', 'CapsLock'
];

function isModifierHotkey(hotkey: string): boolean {
  if (!hotkey) return false;
  return MODIFIER_HOTKEYS.some(m => m.toLowerCase() === hotkey.toLowerCase().trim());
}

function getHelperPath(name: string): string {
  const prodPath = path.join(process.resourcesPath, 'bin', name);
  if (fs.existsSync(prodPath)) return prodPath;
  const devPath = path.join(__dirname, '../bin', name);
  if (fs.existsSync(devPath)) return devPath;
  return path.join(__dirname, '../../bin', name);
}

function getKeylistenerPath(): string {
  return getHelperPath('keylistener');
}

function updateNativeKeyListener(key: string, mode: string) {
  if (keylistenerProcess && keylistenerProcess.stdin?.writable) {
    keylistenerProcess.stdin.write(JSON.stringify({ cmd: 'set_hotkey', key, mode }) + '\n');
  }
}

function initNativeKeyListener() {
  if (keylistenerProcess) return;
  const exePath = getKeylistenerPath();
  if (!fs.existsSync(exePath)) {
    console.warn('Native keylistener binary not found at:', exePath);
    return;
  }

  const settings = store.getSettings();
  const args = ['--key', settings.hotkey, '--mode', settings.hotkeyMode];

  try {
    keylistenerProcess = spawn(exePath, args, { stdio: ['pipe', 'pipe', 'inherit'] });

    keylistenerProcess.stdout?.on('data', (chunk: Buffer) => {
      const lines = chunk.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const msg = JSON.parse(line);
          handleKeyListenerMessage(msg);
        } catch (_) {}
      }
    });

    keylistenerProcess.on('exit', (code) => {
      keylistenerProcess = null;
      nativeListenerReady = false;
      if (pendingPaste) {
        pendingPaste(false);
        pendingPaste = null;
      }
      if (isQuitting) return;
      keylistenerFailures += code === 0 ? 0 : 1;
      if (keylistenerFailures <= 6) {
        setTimeout(() => initNativeKeyListener(), 800);
      }
    });
  } catch (err) {
    console.error('Failed to start native keylistener:', err);
  }
}

function requestNativePaste(target: { app: string | null; pid: number; bundleId: string | null; text: string }): Promise<boolean> {
  return new Promise((resolve) => {
    const exePath = getKeylistenerPath();
    if (!fs.existsSync(exePath)) {
      resolve(false);
      return;
    }
    // A second copy of the helper inserts into the app that had the cursor.
    // The long-running copy owns the keyboard tap, and events it posts never
    // reach other apps. stdio ignore also dropped the target pid's text.
    const child = spawn(exePath, ['--paste', String(target.pid || 0), '--app', target.app || ''], {
      stdio: ['pipe', 'ignore', 'ignore'],
    });
    child.stdin?.end(target.text || '');
    const timer = setTimeout(() => {
      try { child.kill(); } catch (_) {}
      resolve(false);
    }, 3000);
    child.on('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
  });
}

function handleKeyListenerMessage(msg: any) {
  if (msg.event === 'ready') {
    nativeListenerReady = true;
    keylistenerFailures = 0;
    globalShortcut.unregisterAll();
    return;
  }

  if (msg.event === 'error') {
    console.error('Key listener:', msg.message);
    if (!accessibilityWarned) {
      accessibilityWarned = true;
      setHUDState({
        status: 'error',
        message: msg.message || 'Enable Accessibility for OpenHandy, then try again.',
      });
      setTimeout(() => setHUDState({ status: 'idle' }), 4200);
    }
    return;
  }

  if (msg.event === 'paste_done') {
    pendingPaste?.(Boolean(msg.ok));
    pendingPaste = null;
    return;
  }

  if (msg.event === 'trigger') {
    const appName = typeof msg.app === 'string' ? msg.app : '';
    const pid = Number(msg.pid) || 0;
    const bundleId = typeof msg.bundleId === 'string' ? msg.bundleId : '';
    if (msg.action === 'toggle') {
      if (!isRecording) injector.setFrontmostApp(appName, pid, bundleId);
      toggleRecording();
    } else if (msg.action === 'start') {
      startRecording(appName, pid, bundleId);
    } else if (msg.action === 'stop') {
      stopRecording();
    } else if (msg.action === 'cancel') {
      cancelRecording();
    }
  } else if (msg.event === 'recorded_key') {
    settingsWindow?.webContents.send('native-key-recorded', msg);
  }
}

function registerGlobalHotkey(targetHotkey?: string): { success: boolean; error?: string } {
  const settings = store.getSettings();
  const hotkeyToTest = targetHotkey || settings.hotkey;
  if (!hotkeyToTest || !hotkeyToTest.trim()) {
    globalShortcut.unregisterAll();
    updateNativeKeyListener('', settings.hotkeyMode);
    return { success: true };
  }

  // 1. If it's a standalone modifier key (like LeftControl, RightControl, Fn, LeftOption)
  if (isModifierHotkey(hotkeyToTest)) {
    globalShortcut.unregisterAll();
    updateNativeKeyListener(hotkeyToTest, settings.hotkeyMode);
    console.log(`Native modifier hotkey activated: ${hotkeyToTest}`);
    return { success: true };
  }

  // The native listener owns both modifier keys and chords, including hold-to-talk.
  // globalShortcut cannot see key-up, so it is only a fallback when the helper is down.
  if (nativeListenerReady && keylistenerProcess) {
    updateNativeKeyListener(hotkeyToTest, settings.hotkeyMode);
    return { success: true };
  }

  // 2. Standard accelerator shortcut (e.g. Alt+Space, Control+Space)
  const normalized = hotkeyToTest
    .replace(/Option/gi, 'Alt')
    .replace(/Cmd/gi, 'CommandOrControl')
    .replace(/Ctrl/gi, 'Control')
    .trim();

  try {
    globalShortcut.unregisterAll();
    const success = globalShortcut.register(normalized, () => {
      toggleRecording();
    });

    if (!success) {
      if (settings.hotkey && settings.hotkey !== normalized) {
        try {
          if (isModifierHotkey(settings.hotkey)) {
            updateNativeKeyListener(settings.hotkey, settings.hotkeyMode);
          } else {
            globalShortcut.register(settings.hotkey, () => toggleRecording());
          }
        } catch (_) {}
      }
      return {
        success: false,
        error: `macOS could not register "${hotkeyToTest}". This shortcut may already be reserved by macOS (e.g. Spotlight) or another app.`,
      };
    } else {
      console.log(`Global hotkey registered: ${normalized}`);
      updateNativeKeyListener(normalized, settings.hotkeyMode);
      return { success: true };
    }
  } catch (err: any) {
    console.error('Error registering global shortcut:', err);
    if (settings.hotkey && settings.hotkey !== normalized) {
      try {
        if (isModifierHotkey(settings.hotkey)) {
          updateNativeKeyListener(settings.hotkey, settings.hotkeyMode);
        } else {
          globalShortcut.register(settings.hotkey, () => toggleRecording());
        }
      } catch (_) {}
    }
    return {
      success: false,
      error: `Invalid shortcut format: ${err.message || 'Please use a valid combination.'}`,
    };
  }
}

function setHUDState(state: HUDState) {
  queuedHUDState = state;
  if (!hudWindow || hudWindow.isDestroyed()) return;

  if (state.status === 'idle') {
    hudWindow.hide();
  } else {
    positionHUD();
    hudWindow.setAlwaysOnTop(true, 'screen-saver');
    hudWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    if (!hudWindow.isVisible()) {
      hudWindow.showInactive();
    }
    hudWindow.moveTop();
  }

  if (hudReady && !hudWindow.webContents.isLoading()) {
    hudWindow.webContents.send('hud-state-change', state);
  }
}

function notifyHUD(channel: 'start-recording' | 'stop-recording' | 'cancel-recording') {
  if (channel === 'start-recording') hudWantsRecording = true;
  if (channel === 'stop-recording' || channel === 'cancel-recording') hudWantsRecording = false;
  if (hudWindow && hudReady && !hudWindow.webContents.isLoading()) {
    hudWindow.webContents.send(channel);
  }
}

function startRecording(fromApp?: string, pid?: number, bundleId?: string) {
  if (isRecording) return;
  isRecording = true;
  recordingToken += 1;

  if ((fromApp && fromApp.trim()) || (pid && pid > 0) || (bundleId && bundleId.trim())) {
    injector.setFrontmostApp(fromApp || null, pid, bundleId);
  } else {
    void injector.captureFrontmostApp();
  }

  recordingStartTime = Date.now();
  setHUDState({ status: 'listening', elapsedSeconds: 0 });
  notifyHUD('start-recording');

  if (recordingTimer) clearInterval(recordingTimer);
  recordingTimer = setInterval(() => {
    if (!isRecording) return;
    const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
    setHUDState({ status: 'listening', elapsedSeconds: elapsed });
  }, 1000);

  updateTrayMenu();
}

function stopRecording() {
  if (!isRecording) return;
  isRecording = false;
  const token = recordingToken;

  if (recordingTimer) {
    clearInterval(recordingTimer);
    recordingTimer = null;
  }

  notifyHUD('stop-recording');
  setHUDState({ status: 'transcribing', providerName: 'audio' });
  updateTrayMenu();

  setTimeout(() => {
    if (recordingToken !== token || isRecording) return;
    if (queuedHUDState?.status === 'transcribing' && queuedHUDState.providerName === 'audio') {
      setHUDState({ status: 'error', message: 'No audio was captured. Allow microphone access and try again.' });
      setTimeout(() => setHUDState({ status: 'idle' }), 3200);
    }
  }, 5000);
}

function cancelRecording() {
  if (!isRecording) return;
  isRecording = false;
  recordingToken += 1;

  if (recordingTimer) {
    clearInterval(recordingTimer);
    recordingTimer = null;
  }

  notifyHUD('cancel-recording');
  setHUDState({ status: 'idle' });
  updateTrayMenu();
}

function toggleRecording() {
  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
}

function transcribeLocally(audioBuffer: Buffer): Promise<STTResult> {
  const exe = getHelperPath('localstt');
  if (!fs.existsSync(exe)) {
    return Promise.reject(new Error('Add an API key in Settings. On-device transcription is unavailable.'));
  }

  const tmp = path.join(os.tmpdir(), `openhandy-${Date.now()}.wav`);
  fs.writeFileSync(tmp, audioBuffer);

  return new Promise((resolve, reject) => {
    const child = spawn(exe, [tmp], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const cleanup = () => fs.unlink(tmp, () => {});

    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on('error', (err) => {
      cleanup();
      reject(err);
    });
    child.on('close', () => {
      cleanup();
      const line = stdout.trim().split('\n').filter(Boolean).pop() || '';
      try {
        const parsed = JSON.parse(line) as { text?: string; error?: string };
        if (parsed.error) {
          reject(new Error(parsed.error));
          return;
        }
        resolve({
          text: parsed.text || '',
          provider: 'custom',
          model: 'macOS Speech',
        });
      } catch {
        reject(new Error(stderr.trim() || 'On-device transcription failed.'));
      }
    });
  });
}

// IPC Handlers
function setupIPCHandlers() {
  ipcMain.handle('get-settings', () => store.getSettings());

  ipcMain.handle('update-settings', (_event, partial) => {
    const updated = store.updateSettings(partial);
    if (partial.hotkey || partial.hotkeyMode) {
      registerGlobalHotkey(updated.hotkey);
    }
    updateTrayMenu();
    return updated;
  });

  ipcMain.handle('set-hotkey', (_event, newHotkey: string) => {
    const regResult = registerGlobalHotkey(newHotkey);
    if (regResult.success) {
      // Normalize before saving if standard, or keep identifier if modifier
      const normalized = isModifierHotkey(newHotkey)
        ? newHotkey.trim()
        : newHotkey
            .replace(/Option/gi, 'Alt')
            .replace(/Cmd/gi, 'CommandOrControl')
            .replace(/Ctrl/gi, 'Control')
            .trim();
      const updated = store.updateSettings({ hotkey: normalized });
      updateTrayMenu();
      return { success: true, hotkey: normalized, settings: updated };
    } else {
      return { success: false, error: regResult.error };
    }
  });

  ipcMain.on('start-recording-hotkey', () => {
    if (keylistenerProcess && keylistenerProcess.stdin?.writable) {
      keylistenerProcess.stdin.write(JSON.stringify({ cmd: 'start_recording' }) + '\n');
    }
  });

  ipcMain.on('stop-recording-hotkey', () => {
    if (keylistenerProcess && keylistenerProcess.stdin?.writable) {
      keylistenerProcess.stdin.write(JSON.stringify({ cmd: 'stop_recording' }) + '\n');
    }
  });

  ipcMain.handle('test-provider', async (_event, provider) => {
    return await testProviderConnection(provider, store.getSettings());
  });

  ipcMain.handle('get-history', () => store.getHistory());
  ipcMain.handle('clear-history', () => store.clearHistory());
  ipcMain.handle('delete-history-record', (_event, id) => store.deleteHistoryRecord(id));

  ipcMain.handle('check-accessibility', () => injector.checkAccessibilityPermission());
  ipcMain.handle('open-accessibility-settings', () => injector.openAccessibilitySettings());

  ipcMain.handle('open-project-folder', () => {
    const projectDir = '/Users/yehudazahler/Projects/Personal/STT';
    shell.openPath(projectDir);
  });

  ipcMain.handle('open-in-editor', () => {
    const projectDir = '/Users/yehudazahler/Projects/Personal/STT';
    exec(`cursor "${projectDir}" || code "${projectDir}" || open "${projectDir}"`);
  });

  ipcMain.on('trigger-toggle-recording', () => {
    toggleRecording();
  });

  ipcMain.on('recording-error', (_event, message: string) => {
    isRecording = false;
    hudWantsRecording = false;
    recordingToken += 1;
    if (recordingTimer) {
      clearInterval(recordingTimer);
      recordingTimer = null;
    }
    const text = (message || 'Recording failed').slice(0, 140);
    setHUDState({ status: 'error', message: text });
    setTimeout(() => setHUDState({ status: 'idle' }), 3200);
    updateTrayMenu();
  });

  // Audio level streaming from renderer to HUD visualizer
  ipcMain.on('audio-level', (_event, level) => {
    if (hudWindow && isRecording) {
      hudWindow.webContents.send('audio-level-update', level);
    }
  });

  // Process the recorded audio
  ipcMain.handle('process-audio', async (_event, arrayBuffer: ArrayBuffer, mimeType: string, durationSeconds: number) => {
    const settings = store.getSettings();
    const audioBuffer = Buffer.from(arrayBuffer);

    if (audioBuffer.length < 1000) {
      setHUDState({ status: 'error', message: 'Recording too short or empty.' });
      setTimeout(() => setHUDState({ status: 'idle' }), 2500);
      return;
    }

    try {
      // 1. Transcription stage
      let sttResult: STTResult;
      if (!sttProviderConfigured(settings)) {
        setHUDState({ status: 'transcribing', providerName: 'this Mac' });
        sttResult = await transcribeLocally(audioBuffer);
      } else {
        setHUDState({ status: 'transcribing', providerName: settings.activeSttProvider.toUpperCase() });
        sttResult = await transcribeAudio(audioBuffer, mimeType, settings);
      }
      const rawTranscript = sttResult.text.trim();

      if (!rawTranscript) {
        setHUDState({ status: 'error', message: 'No speech was detected.' });
        setTimeout(() => setHUDState({ status: 'idle' }), 2500);
        return;
      }

      // 2. LLM Post-Processing stage (optional)
      let finalText = rawTranscript;
      const activePreset = settings.presets.find(p => p.id === settings.activePresetId) || settings.presets[0];

      if (settings.activeLlmProvider !== 'none' && activePreset && activePreset.id !== 'raw') {
        setHUDState({
          status: 'polishing',
          providerName: settings.activeLlmProvider.toUpperCase(),
          presetName: activePreset.name,
        });

        const llmResult = await processWithLLM(rawTranscript, activePreset, settings);
        finalText = llmResult.text.trim();
      }

      // 3. Inject text (Auto-paste and/or clipboard copy)
      if (hudWindow && !hudWindow.isDestroyed()) hudWindow.hide();
      const pasteSuccess = await injector.pasteText(finalText, {
        autoPaste: settings.autoPaste,
        copyToClipboard: settings.copyToClipboard,
      });

      function getActiveLlmModelName(s: AppSettings): string | undefined {
        switch (s.activeLlmProvider) {
          case 'azure': return s.azure.llmDeployment;
          case 'vercel': return s.vercel.llmModel;
          case 'groq': return s.groq.llmModel;
          case 'openai': return s.openai.llmModel;
          case 'anthropic': return s.anthropic.model;
          case 'gemini': return s.gemini.model;
          case 'openrouter': return s.openrouter.model;
          case 'custom': return s.custom.llmModel;
          default: return undefined;
        }
      }

      // 4. Save to history
      const record: DictationRecord = {
        id: `rec_${Date.now()}`,
        timestamp: Date.now(),
        durationSeconds: Math.round(durationSeconds),
        rawTranscript,
        finalOutput: finalText,
        sttProvider: settings.activeSttProvider,
        sttModel: sttResult.model,
        llmProvider: settings.activeLlmProvider,
        llmModel: getActiveLlmModelName(settings),
        presetId: activePreset.id,
        presetName: activePreset.name,
        charCount: finalText.length,
        wordCount: finalText.split(/\s+/).filter(Boolean).length,
      };
      store.addHistoryRecord(record);

      // Notify settings window if open
      if (settingsWindow) {
        settingsWindow.webContents.send('history-updated', record);
      }

      // 5. Visual HUD feedback
      const preview = finalText.length > 35 ? finalText.slice(0, 35) + '...' : finalText;
      if (settings.autoPaste && pasteSuccess) {
        setHUDState({ status: 'pasted', previewText: preview });
      } else {
        setHUDState({ status: 'copied', previewText: preview });
      }

      // Smooth dismiss
      setTimeout(() => {
        setHUDState({ status: 'idle' });
      }, 1800);
    } catch (err: any) {
      console.error('Audio processing failed:', err);
      const message = err.message || 'Processing failed';
      setHUDState({ status: 'error', message: message.slice(0, 80) });
      setTimeout(() => {
        setHUDState({ status: 'idle' });
      }, 3500);
    }
  });
}

// App Initialization
app.whenReady().then(() => {
  // Prevent dock icon clutter if desired, or keep as standard accessory
  if (process.platform === 'darwin') {
    app.dock?.hide(); // Runs purely in the menu bar tray like Handy
  }

  tray = new Tray(createTrayIcon());
  tray.setToolTip('OpenHandy — Universal Speech-to-Text & AI');
  tray.on('click', () => openSettingsWindow('general'));
  tray.on('right-click', () => tray?.popUpContextMenu());

  injector.setNativePaste((appName) => requestNativePaste(appName));

  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media');
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
    return permission === 'media';
  });

  if (process.platform === 'darwin') {
    systemPreferences.askForMediaAccess('microphone').catch(() => {});
    if (!systemPreferences.isTrustedAccessibilityClient(false)) {
      systemPreferences.isTrustedAccessibilityClient(true);
    }
  }

  updateTrayMenu();
  createHUDWindow();
  setupIPCHandlers();
  registerGlobalHotkey();
  initNativeKeyListener();

  // If user hasn't configured any API key yet, open settings on first launch
  const settings = store.getSettings();
  const hasAnyKey = Boolean(
    settings.azure.apiKey ||
    settings.groq.apiKey ||
    settings.openai.apiKey ||
    settings.gemini.apiKey ||
    settings.anthropic.apiKey ||
    settings.deepgram.apiKey ||
    settings.vercel.apiKey ||
    settings.cloudflare?.apiToken ||
    settings.custom.baseUrl
  );

  if (!hasAnyKey) {
    setTimeout(() => {
      openSettingsWindow('providers');
    }, 600);
  }
});

app.on('activate', () => {
  openSettingsWindow('general');
});

app.on('before-quit', () => {
  isQuitting = true;
  try { keylistenerProcess?.kill(); } catch (_) {}
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  try { keylistenerProcess?.kill(); } catch (_) {}
});

app.on('window-all-closed', () => {
  // Keep app running in menu bar
});

process.on('SIGTERM', () => {
  app.quit();
});

process.on('SIGINT', () => {
  app.quit();
});


