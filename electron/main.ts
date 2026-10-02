import { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, screen, nativeImage, NativeImage } from 'electron';
import * as path from 'path';
import { AppStore } from './store';
import { TextInjector } from './injector';
import { transcribeAudio } from './providers/stt';
import { processWithLLM } from './providers/llm';
import { testProviderConnection } from './providers/tester';
import { HUDState, DictationRecord, AppSettings } from './providers/types';

let tray: Tray | null = null;
let hudWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;

const store = new AppStore();
const injector = new TextInjector();

let isRecording = false;
let recordingStartTime = 0;
let recordingTimer: NodeJS.Timeout | null = null;

// Determine development vs production URLs
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
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
      label: 'Quit OpenHandy',
      accelerator: 'CommandOrControl+Q',
      click: () => app.quit(),
    },
  ]);

  tray.setContextMenu(contextMenu);
}

function createHUDWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

  const hudWidth = 360;
  const hudHeight = 84;
  const x = Math.round((screenWidth - hudWidth) / 2);
  const y = screenHeight - hudHeight - 40; // Hover nicely above dock

  hudWindow = new BrowserWindow({
    width: hudWidth,
    height: hudHeight,
    x,
    y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    focusable: false,      // CRUCIAL: Do not steal focus from the user's active typing cursor!
    hasShadow: false,
    resizable: false,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  hudWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  hudWindow.setAlwaysOnTop(true, 'floating');

  if (isDev) {
    hudWindow.loadURL(`${VITE_DEV_SERVER_URL}/hud.html`);
  } else {
    hudWindow.loadFile(path.join(__dirname, '../dist/hud.html'));
  }

  hudWindow.on('closed', () => {
    hudWindow = null;
  });
}

function openSettingsWindow(initialTab: string = 'general') {
  if (settingsWindow) {
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

  if (isDev) {
    settingsWindow.loadURL(`${VITE_DEV_SERVER_URL}/index.html`);
  } else {
    settingsWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  settingsWindow.once('ready-to-show', () => {
    settingsWindow?.show();
    if (initialTab !== 'general') {
      settingsWindow?.webContents.send('switch-tab', initialTab);
    }
  });

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

function registerGlobalHotkey() {
  globalShortcut.unregisterAll();

  const settings = store.getSettings();
  const hotkey = settings.hotkey;
  if (!hotkey) return;

  try {
    const success = globalShortcut.register(hotkey, () => {
      toggleRecording();
    });

    if (!success) {
      console.warn(`Failed to register global hotkey: ${hotkey}`);
    } else {
      console.log(`Global hotkey registered: ${hotkey}`);
    }
  } catch (err) {
    console.error('Error registering global shortcut:', err);
  }
}

function setHUDState(state: HUDState) {
  if (!hudWindow) return;

  if (state.status === 'idle') {
    hudWindow.hide();
  } else {
    if (!hudWindow.isVisible()) {
      hudWindow.showInactive(); // Show without taking focus
    }
  }

  hudWindow.webContents.send('hud-state-change', state);
}

async function startRecording() {
  if (isRecording) return;
  isRecording = true;

  // 1. Capture the frontmost application before recording starts
  await injector.captureFrontmostApp();

  // 2. Notify renderer HUD to begin Web Audio recording
  if (hudWindow) {
    hudWindow.webContents.send('start-recording');
  }

  recordingStartTime = Date.now();
  setHUDState({ status: 'listening', elapsedSeconds: 0 });

  // Start elapsed timer ticker for HUD
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

  if (recordingTimer) {
    clearInterval(recordingTimer);
    recordingTimer = null;
  }

  // Request audio blob from HUD window
  if (hudWindow) {
    hudWindow.webContents.send('stop-recording');
  }

  updateTrayMenu();
}

function toggleRecording() {
  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
}

// IPC Handlers
function setupIPCHandlers() {
  ipcMain.handle('get-settings', () => store.getSettings());

  ipcMain.handle('update-settings', (_event, partial) => {
    const updated = store.updateSettings(partial);
    if (partial.hotkey) {
      registerGlobalHotkey();
    }
    updateTrayMenu();
    return updated;
  });

  ipcMain.handle('test-provider', async (_event, provider) => {
    return await testProviderConnection(provider, store.getSettings());
  });

  ipcMain.handle('get-history', () => store.getHistory());
  ipcMain.handle('clear-history', () => store.clearHistory());
  ipcMain.handle('delete-history-record', (_event, id) => store.deleteHistoryRecord(id));

  ipcMain.handle('check-accessibility', () => injector.checkAccessibilityPermission());
  ipcMain.handle('open-accessibility-settings', () => injector.openAccessibilitySettings());

  ipcMain.on('trigger-toggle-recording', () => {
    toggleRecording();
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
      setHUDState({ status: 'transcribing', providerName: settings.activeSttProvider.toUpperCase() });
      const sttResult = await transcribeAudio(audioBuffer, mimeType, settings);
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
  tray.on('click', () => toggleRecording());

  updateTrayMenu();
  createHUDWindow();
  setupIPCHandlers();
  registerGlobalHotkey();

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
    settings.custom.baseUrl
  );

  if (!hasAnyKey) {
    setTimeout(() => {
      openSettingsWindow('providers');
    }, 600);
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  // Keep app running in menu bar
});
