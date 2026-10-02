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

function createTrayIcon(): NativeImage {
  // 16x16 monochrome template icon for macOS menu bar
  const size = 16;
  const canvas = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
      <line x1="12" x2="12" y1="19" y2="22"/>
    </svg>
  `;
  const img = nativeImage.createFromBuffer(Buffer.from(canvas));
  img.setTemplateImage(true);
  return img;
}

function updateTrayMenu() {
  if (!tray) return;

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
