import * as fs from 'fs';
import * as path from 'path';
import { AppSettings, DictationRecord, PromptPreset } from './providers/types';

function getUserDataDir(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const electron = require('electron');
    if (electron && typeof electron === 'object' && electron.app && typeof electron.app.getPath === 'function') {
      return electron.app.getPath('userData');
    }
  } catch {
    // Fallback if running outside Electron
  }
  return path.join(process.env.HOME || '.', '.open-handy');
}

export const BUILTIN_PRESETS: PromptPreset[] = [
  {
    id: 'clean',
    name: 'Clean & Polish',
    description: 'Removes filler words (um, uh, like, you know), fixes grammar & punctuation while preserving exact tone.',
    systemPrompt: `You are an expert speech-to-text editor. Your job is to take raw transcribed speech and clean it up into natural, polished text.
Guidelines:
1. Remove filler words (um, uh, like, you know, sort of, kind of, repeated words).
2. Fix punctuation, capitalization, and minor grammatical stutters.
3. DO NOT summarize, hallucinate, or change the user's authentic meaning, voice, or vocabulary.
4. Output ONLY the polished text with no conversational preamble or quotes.`,
    isBuiltIn: true
  },
  {
    id: 'raw',
    name: 'Raw Transcript',
    description: 'Outputs exactly what was transcribed with no post-processing modification.',
    systemPrompt: '',
    isBuiltIn: true
  },
  {
    id: 'email',
    name: 'Professional Email',
    description: 'Transforms spoken thoughts into a well-crafted, polite business email.',
    systemPrompt: `You are an executive communications assistant. Convert the user's spoken thoughts into a clear, professional, and courteous email.
Include:
- A concise Subject line (Subject: ...)
- Professional greeting
- Clearly structured paragraphs
- Professional closing and sign-off placeholder.
Output ONLY the formatted email text with no commentary.`,
    isBuiltIn: true
  },
  {
    id: 'notes',
    name: 'Meeting & Action Notes',
    description: 'Extracts key points, decisions, and action items into clean bullet points.',
    systemPrompt: `You are a high-level executive assistant. Convert the spoken dictation into structured meeting notes:
- **Key Takeaways** (bullet points)
- **Discussion Points** (concise summary)
- **Action Items** (with checkboxes [ ])
Output ONLY the markdown notes with no commentary.`,
    isBuiltIn: true
  },
  {
    id: 'code',
    name: 'Developer & Technical',
    description: 'Formats code concepts, identifiers (camelCase/snake_case), and markdown code blocks.',
    systemPrompt: `You are a software engineer assistant. Convert spoken dictation into technical documentation, comments, or code.
- Format variable names, functions, and file paths using backticks (e.g. \`handleSubmit\`, \`main.ts\`).
- If code is dictated, place it inside appropriate markdown fenced code blocks with language identifiers.
- Format git commands or shell scripts properly.
Output ONLY the formatted technical text with no conversational intro.`,
    isBuiltIn: true
  }
];

export const DEFAULT_SETTINGS: AppSettings = {
  hotkey: 'Alt+Space',
  hotkeyMode: 'toggle',
  autoPaste: true,
  copyToClipboard: true,
  soundEffects: true,
  activePresetId: 'clean',
  activeSttProvider: 'groq',
  activeLlmProvider: 'none',

  azure: {
    endpoint: '',
    apiKey: '',
    deployment: 'whisper',
    llmDeployment: 'gpt-4o',
    apiVersion: '2024-06-01'
  },
  vercel: {
    baseUrl: 'https://api.vercel.ai/v1',
    apiKey: '',
    sttModel: 'whisper-1',
    llmModel: 'openai/gpt-4o'
  },
  groq: {
    apiKey: '',
    sttModel: 'whisper-large-v3-turbo',
    llmModel: 'llama-3.3-70b-versatile'
  },
  openai: {
    apiKey: '',
    baseUrl: '',
    sttModel: 'whisper-1',
    llmModel: 'gpt-4o-mini'
  },
  gemini: {
    apiKey: '',
    model: 'gemini-2.0-flash'
  },
  anthropic: {
    apiKey: '',
    model: 'claude-3-5-haiku-20241022'
  },
  deepgram: {
    apiKey: '',
    model: 'nova-2'
  },
  openrouter: {
    apiKey: '',
    model: 'anthropic/claude-3.5-sonnet'
  },
  cloudflare: {
    accountId: '',
    apiToken: '',
    sttModel: '@cf/openai/whisper',
    llmModel: '@cf/meta/llama-3.3-70b-instruct',
    gatewayUrl: ''
  },
  custom: {
    baseUrl: 'http://localhost:11434/v1',
    apiKey: '',
    sttModel: 'whisper',
    llmModel: 'llama3'
  },

  presets: BUILTIN_PRESETS
};

export class AppStore {
  private configPath: string;
  private historyPath: string;
  private settings: AppSettings;
  private history: DictationRecord[] = [];

  constructor() {
    const userData = getUserDataDir();
    if (!fs.existsSync(userData)) {
      try {
        fs.mkdirSync(userData, { recursive: true });
      } catch (err) {
        console.error('Failed to create userData directory', err);
      }
    }
    this.configPath = path.join(userData, 'settings.json');
    this.historyPath = path.join(userData, 'history.json');

    this.settings = this.loadSettings();
    this.history = this.loadHistory();
  }

  private loadSettings(): AppSettings {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf8');
        const parsed = JSON.parse(data);
        return {
          ...DEFAULT_SETTINGS,
          ...parsed,
          azure: { ...DEFAULT_SETTINGS.azure, ...(parsed.azure || {}) },
          vercel: { ...DEFAULT_SETTINGS.vercel, ...(parsed.vercel || {}) },
          groq: { ...DEFAULT_SETTINGS.groq, ...(parsed.groq || {}) },
          openai: { ...DEFAULT_SETTINGS.openai, ...(parsed.openai || {}) },
          gemini: { ...DEFAULT_SETTINGS.gemini, ...(parsed.gemini || {}) },
          anthropic: { ...DEFAULT_SETTINGS.anthropic, ...(parsed.anthropic || {}) },
          deepgram: { ...DEFAULT_SETTINGS.deepgram, ...(parsed.deepgram || {}) },
          openrouter: { ...DEFAULT_SETTINGS.openrouter, ...(parsed.openrouter || {}) },
          cloudflare: { ...DEFAULT_SETTINGS.cloudflare, ...(parsed.cloudflare || {}) },
          custom: { ...DEFAULT_SETTINGS.custom, ...(parsed.custom || {}) },
          presets: parsed.presets && parsed.presets.length > 0 ? parsed.presets : BUILTIN_PRESETS
        };
      }
    } catch (e) {
      console.error('Error reading settings.json, using defaults', e);
    }
    return { ...DEFAULT_SETTINGS };
  }

  public getSettings(): AppSettings {
    return this.settings;
  }

  public updateSettings(partial: Partial<AppSettings>): AppSettings {
    this.settings = { ...this.settings, ...partial };
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.settings, null, 2), 'utf8');
    } catch (e) {
      console.error('Failed to save settings', e);
    }
    return this.settings;
  }

  private loadHistory(): DictationRecord[] {
    try {
      if (fs.existsSync(this.historyPath)) {
        const data = fs.readFileSync(this.historyPath, 'utf8');
        return JSON.parse(data);
      }
    } catch (e) {
      console.error('Error loading history.json', e);
    }
    return [];
  }

  public getHistory(): DictationRecord[] {
    return this.history;
  }

  public addHistoryRecord(record: DictationRecord): void {
    // Keep up to 200 most recent records
    this.history.unshift(record);
    if (this.history.length > 200) {
      this.history = this.history.slice(0, 200);
    }
    try {
      fs.writeFileSync(this.historyPath, JSON.stringify(this.history, null, 2), 'utf8');
    } catch (e) {
      console.error('Failed to save history', e);
    }
  }

  public clearHistory(): void {
    this.history = [];
    try {
      fs.writeFileSync(this.historyPath, JSON.stringify([], null, 2), 'utf8');
    } catch (e) {
      console.error('Failed to clear history', e);
    }
  }

  public deleteHistoryRecord(id: string): void {
    this.history = this.history.filter(item => item.id !== id);
    try {
      fs.writeFileSync(this.historyPath, JSON.stringify(this.history, null, 2), 'utf8');
    } catch (e) {
      console.error('Failed to delete history record', e);
    }
  }
}
