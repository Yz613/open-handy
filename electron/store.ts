import * as fs from 'fs';
import * as path from 'path';
import { AppSettings, DictationRecord, PromptPreset, UsageStats, ProviderUsage } from './providers/types';

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
    description: 'Removes filler words (um, uh, like), cleans speech restarts and self-corrections while preserving authentic tone.',
    systemPrompt: `You are an expert speech-to-text post-processor.
Your job is to apply light post-processing to raw transcribed speech to produce clean, natural text while strictly preserving the speaker's authentic voice, tone, vocabulary, and meaning.

Rules:
1. Remove filler words and verbal hesitations (e.g., "um", "uh", "uhh", "er", "ah", "you know", and "like" when used purely as a filler pause).
2. Handle false starts, self-corrections, and thought restarts:
   - When the speaker hesitates, repeats themselves, or corrects what they just said (e.g., "it will, actually it will do this", or "I think we should do option A, or actually let's do option B"), take out the abandoned first part and keep only the final corrected statement that was spoken a second time.
   - Remove accidental duplicate words and stutters (e.g., "the the" -> "the", "I I" -> "I").
3. Apply natural punctuation, capitalization, and sentence boundaries.
4. Light post-processing only: DO NOT heavily rewrite, do NOT summarize, do NOT embellish, do NOT explain, and DO NOT convert casual speech into formal corporate jargon. Keep the speaker's own phrasing and intent intact.
5. Output ONLY the cleaned text. Never add conversational preamble, quotes, or meta-comments.`,
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

/**
 * Fast, deterministic local speech cleanup:
 * - Strips filler words (um, uh, er, ah, etc.)
 * - Strips immediate stutters / duplicate words ("the the" -> "the", "it it" -> "it")
 * - Cleans commas, pauses, spaces, and punctuation artifacts
 * - Ensures proper capitalization
 */
export function cleanSpeechLocally(text: string): string {
  if (!text || !text.trim()) return text;

  let cleaned = text;

  // 1. Remove standalone hesitation / filler words: um, uh, uhh, er, ah, hmm
  cleaned = cleaned.replace(/\b(um|uh|uhh|ummm|er|err|ah|ahh|hmm|hm)\b[,\s]*/gi, '');

  // 2. Remove filler "like" when isolated by pauses/commas (e.g. ", like," or "it was, like, 5")
  cleaned = cleaned.replace(/,\s*like\b,?\s*/gi, ', ');
  cleaned = cleaned.replace(/\s+like,\s*/gi, ' ');

  // 3. Remove immediate duplicate words (stutters): "it it", "we we", "to to", "the the"
  cleaned = cleaned.replace(/\b([a-zA-Z]+)\s+\1\b/gi, '$1');
  cleaned = cleaned.replace(/\b([a-zA-Z]+),\s+\1\b/gi, '$1');

  // 4. Remove immediate 2-word phrase stutters: "it will, it will" -> "it will"
  cleaned = cleaned.replace(/\b([a-zA-Z]+\s+[a-zA-Z]+)[,\s]+\1\b/gi, '$1');

  // 5. Clean up awkward spaces and punctuation
  cleaned = cleaned.replace(/\s{2,}/g, ' ');
  cleaned = cleaned.replace(/\s+([.,!?;:])/g, '$1');
  cleaned = cleaned.replace(/,\s*,/g, ',');
  cleaned = cleaned.replace(/^[,.\s]+/, '');
  cleaned = cleaned.replace(/[,;\s]+$/, '');

  // 6. Ensure initial capitalization
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  return cleaned.trim();
}

export function normalizeVercelBaseUrl(url: string | undefined): string {
  const value = (url || '').trim();
  if (!value || value.includes('api.vercel.ai')) {
    return 'https://ai-gateway.vercel.sh/v1';
  }
  return value.replace(/\/$/, '');
}

export const DEFAULT_SETTINGS: AppSettings = {
  hotkey: 'LeftControl',
  hotkeyMode: 'toggle',
  autoPaste: true,
  copyToClipboard: true,
  soundEffects: true,
  openAtLogin: true,
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
    baseUrl: 'https://ai-gateway.vercel.sh/v1',
    apiKey: '',
    sttModel: 'microsoft/mai-transcribe-2',
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

export interface StoredUsageData {
  totalSeconds: number;
  totalDictations: number;
  totalWords: number;
  totalCharacters: number;
  byProvider: Record<string, ProviderUsage>;
  lastDictationTimestamp?: number;
}

export class AppStore {
  private configPath: string;
  private historyPath: string;
  private usagePath: string;
  private settings: AppSettings;
  private history: DictationRecord[] = [];
  private usage: StoredUsageData;

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
    this.usagePath = path.join(userData, 'usage.json');

    this.settings = this.loadSettings();
    this.history = this.loadHistory();
    this.usage = this.loadUsage();
  }

  private mergePresets(builtin: PromptPreset[], stored: PromptPreset[]): PromptPreset[] {
    const builtinMap = new Map(builtin.map(b => [b.id, b]));
    const result: PromptPreset[] = [];

    for (const b of builtin) {
      const existing = stored.find(s => s.id === b.id);
      if (existing) {
        if (existing.isBuiltIn !== false) {
          result.push({
            ...b,
            ...existing,
            description: b.description,
            systemPrompt: b.systemPrompt,
          });
        } else {
          result.push(existing);
        }
      } else {
        result.push(b);
      }
    }

    for (const s of stored) {
      if (!builtinMap.has(s.id)) {
        result.push(s);
      }
    }

    return result;
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
          vercel: {
            ...DEFAULT_SETTINGS.vercel,
            ...(parsed.vercel || {}),
            baseUrl: normalizeVercelBaseUrl(parsed.vercel?.baseUrl || DEFAULT_SETTINGS.vercel.baseUrl),
          },
          groq: { ...DEFAULT_SETTINGS.groq, ...(parsed.groq || {}) },
          openai: { ...DEFAULT_SETTINGS.openai, ...(parsed.openai || {}) },
          gemini: { ...DEFAULT_SETTINGS.gemini, ...(parsed.gemini || {}) },
          anthropic: { ...DEFAULT_SETTINGS.anthropic, ...(parsed.anthropic || {}) },
          deepgram: { ...DEFAULT_SETTINGS.deepgram, ...(parsed.deepgram || {}) },
          openrouter: { ...DEFAULT_SETTINGS.openrouter, ...(parsed.openrouter || {}) },
          cloudflare: { ...DEFAULT_SETTINGS.cloudflare, ...(parsed.cloudflare || {}) },
          custom: { ...DEFAULT_SETTINGS.custom, ...(parsed.custom || {}) },
          presets: this.mergePresets(BUILTIN_PRESETS, parsed.presets || [])
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

  private loadUsage(): StoredUsageData {
    try {
      if (fs.existsSync(this.usagePath)) {
        const data = fs.readFileSync(this.usagePath, 'utf8');
        return JSON.parse(data);
      }
    } catch (e) {
      console.error('Error loading usage.json', e);
    }

    // Initialize/backfill from existing history if usage.json does not exist yet
    const initialUsage: StoredUsageData = {
      totalSeconds: 0,
      totalDictations: 0,
      totalWords: 0,
      totalCharacters: 0,
      byProvider: {},
    };

    for (const item of this.history) {
      const dur = item.durationSeconds || 0;
      const words = item.wordCount || 0;
      const chars = item.charCount || 0;
      initialUsage.totalSeconds += dur;
      initialUsage.totalDictations += 1;
      initialUsage.totalWords += words;
      initialUsage.totalCharacters += chars;

      const prov = item.sttProvider || 'other';
      if (!initialUsage.byProvider[prov]) {
        initialUsage.byProvider[prov] = { seconds: 0, dictations: 0, words: 0 };
      }
      initialUsage.byProvider[prov].seconds += dur;
      initialUsage.byProvider[prov].dictations += 1;
      initialUsage.byProvider[prov].words += words;

      if (!initialUsage.lastDictationTimestamp || item.timestamp > initialUsage.lastDictationTimestamp) {
        initialUsage.lastDictationTimestamp = item.timestamp;
      }
    }

    this.saveUsage(initialUsage);
    return initialUsage;
  }

  private saveUsage(data: StoredUsageData = this.usage): void {
    try {
      fs.writeFileSync(this.usagePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
      console.error('Failed to save usage.json', e);
    }
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

    // Increment cumulative usage statistics
    const dur = record.durationSeconds || 0;
    const words = record.wordCount || 0;
    const chars = record.charCount || 0;

    this.usage.totalSeconds = (this.usage.totalSeconds || 0) + dur;
    this.usage.totalDictations = (this.usage.totalDictations || 0) + 1;
    this.usage.totalWords = (this.usage.totalWords || 0) + words;
    this.usage.totalCharacters = (this.usage.totalCharacters || 0) + chars;
    this.usage.lastDictationTimestamp = record.timestamp;

    if (!this.usage.byProvider) {
      this.usage.byProvider = {};
    }
    const prov = record.sttProvider || 'other';
    if (!this.usage.byProvider[prov]) {
      this.usage.byProvider[prov] = { seconds: 0, dictations: 0, words: 0 };
    }
    this.usage.byProvider[prov].seconds += dur;
    this.usage.byProvider[prov].dictations += 1;
    this.usage.byProvider[prov].words += words;

    this.saveUsage();
  }

  public getUsageStats(): UsageStats {
    const totalSeconds = this.usage.totalSeconds || 0;
    const totalWords = this.usage.totalWords || 0;
    const typingMinutes = totalWords / 40;
    const speakingMinutes = totalSeconds / 60;
    const estimatedTypingMinutesSaved = Math.max(0, Math.round((typingMinutes - speakingMinutes) * 10) / 10);

    return {
      totalSeconds,
      totalMinutes: Math.round((totalSeconds / 60) * 10) / 10,
      totalHours: Math.round((totalSeconds / 3600) * 100) / 100,
      totalDictations: this.usage.totalDictations || 0,
      totalWords,
      totalCharacters: this.usage.totalCharacters || 0,
      estimatedTypingMinutesSaved,
      byProvider: this.usage.byProvider || {},
      lastDictationTimestamp: this.usage.lastDictationTimestamp,
    };
  }

  public resetUsageStats(): UsageStats {
    this.usage = {
      totalSeconds: 0,
      totalDictations: 0,
      totalWords: 0,
      totalCharacters: 0,
      byProvider: {},
    };
    this.saveUsage();
    return this.getUsageStats();
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

