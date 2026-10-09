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
3. Lists & Enumerations:
   - When the speaker dictates a sequence of steps, numbered items, or a list (e.g., "first ..., second ...", "number one ..., number two ...", "tasks: X, Y, and Z", or "do this, this, and this" when clearly meant as distinct items), format them into a clean markdown list (numbered 1. / 2. for steps or bulleted - for item lists).
4. Apply natural punctuation, capitalization, and sentence boundaries.
5. Light post-processing only: DO NOT heavily rewrite, do NOT summarize, do NOT embellish, do NOT explain, and DO NOT convert casual speech into formal corporate jargon. Keep the speaker's own phrasing and intent intact.
6. Output ONLY the cleaned text. Never add conversational preamble, quotes, or meta-comments.`,
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
 * Formats spoken lists, enumerations, and bullet items into clean markdown lists.
 */
export function formatListsLocally(text: string): string {
  if (!text || !text.trim()) return text;

  // 1. Spoken numbered/step lists: "Number one, ... Number two, ..." or "Step one, ... Step two, ..."
  const numWords = '(?:one|two|three|four|five|six|seven|eight|nine|ten|\\d+)';
  const numRegex = new RegExp(`(?:^|[.!?\\n]\\s*)(?:number\\s+${numWords}|step\\s+${numWords})[,\\s:]+`, 'gi');
  const numMatches = [...text.matchAll(numRegex)];
  if (numMatches.length >= 2) {
    const preamble = text.slice(0, numMatches[0].index).trim();
    const items: string[] = [];
    for (let i = 0; i < numMatches.length; i++) {
      const start = (numMatches[i].index ?? 0) + numMatches[i][0].length;
      const end = i < numMatches.length - 1 ? (numMatches[i + 1].index ?? text.length) : text.length;
      let item = text.slice(start, end).trim().replace(/[.,;]+$/, '');
      if (item) items.push(item.charAt(0).toUpperCase() + item.slice(1));
    }
    const listLines = items.map((it, idx) => `${idx + 1}. ${it}`).join('\n');
    return preamble ? `${preamble}\n\n${listLines}` : listLines;
  }

  // 2. Ordinals: "First(ly)( of all)?, ... Second(ly)?, ... Third(ly)?..."
  const hasFirst = /\b(?:first(?: of all)?|firstly)\b/i.test(text);
  const hasSecond = /\b(?:second|secondly)\b/i.test(text);
  if (hasFirst && hasSecond) {
    const ordRegex = /(?:^|[.!?\n]\s*)(?:first(?: of all)?|firstly|second|secondly|third|thirdly|fourth|fourthly|fifth|fifthly|finally|lastly)[,\s:]+/gi;
    const ordMatches = [...text.matchAll(ordRegex)];
    if (ordMatches.length >= 2) {
      const preamble = text.slice(0, ordMatches[0].index).trim();
      const items: string[] = [];
      for (let i = 0; i < ordMatches.length; i++) {
        const start = (ordMatches[i].index ?? 0) + ordMatches[i][0].length;
        const end = i < ordMatches.length - 1 ? (ordMatches[i + 1].index ?? text.length) : text.length;
        let item = text.slice(start, end).trim().replace(/[.,;]+$/, '');
        if (item) items.push(item.charAt(0).toUpperCase() + item.slice(1));
      }
      const listLines = items.map((it, idx) => `${idx + 1}. ${it}`).join('\n');
      return preamble ? `${preamble}\n\n${listLines}` : listLines;
    }
  }

  // 3. Colon list lead-ins: "Tasks to do: A, B, and C" / "Do the following: X, Y, and Z"
  const colonMatch = text.match(/^(.*?(?:list|following|things to do|tasks to do|tasks|todo|to-do|checklist|we need to))(?:\s+(?:of|with))?\s*:\s*(.+)$/i);
  if (colonMatch) {
    const preamble = colonMatch[1].trim() + ':';
    const rest = colonMatch[2].trim();
    const rawItems = rest
      .split(/(?:,\s*(?:and\s+)?|\s+and\s+)/i)
      .map(s => s.trim().replace(/[.,;]+$/, ''))
      .filter(Boolean);
    if (rawItems.length >= 2) {
      const listLines = rawItems.map(item => `- ${item.charAt(0).toUpperCase() + item.slice(1)}`).join('\n');
      return `${preamble}\n\n${listLines}`;
    }
  }

  // 4. Ensure bullet items are properly capitalized
  if (text.includes('\n- ') || text.startsWith('- ')) {
    text = text.replace(/(^|\n)(-\s+)([a-z])/g, (_m, p1, p2, l) => p1 + p2 + l.toUpperCase());
  }

  return text;
}

/**
 * Fast, deterministic on-device speech cleanup and polishing:
 * - Strips filler words (um, uh, er, ah, you know, etc.)
 * - Strips immediate stutters & clipped speech false starts ("the the" -> "the", "twin- " -> "")
 * - Preserves compound words like "on-device" and "real-time"
 * - Automatically formats spoken enumerations and list sequences into markdown lists
 * - Cleans commas, pauses, spaces, and punctuation artifacts
 * - Ensures proper capitalization after sentence boundaries
 */
export function cleanSpeechLocally(text: string): string {
  if (!text || !text.trim()) return text;

  let cleaned = text;

  // 1. Spoken bullet points & dashes: "bullet: ...", "bullet point: ...", "dash: ..."
  cleaned = cleaned.replace(/(?:^|[.!?\n]\s*)(?:bullet(?:\s+point)?|dash)\s*[,:\-]?\s+/gi, '\n- ');

  // 2. Remove standalone hesitation / filler words: um, uh, uhh, er, ah, hmm
  cleaned = cleaned.replace(/\b(um|uh|uhh|ummm|er|err|ah|ahh|hmm|hm)\b[,\s]*/gi, '');

  // 3. Remove filler "you know" when used parenthetically or as a hesitation pause
  cleaned = cleaned.replace(/(?<!\b(?:as|do|did|if|don't|does|let|should|to)\s+)\b,\s*you know\b,?\s*/gi, ' ');
  cleaned = cleaned.replace(/(?<!\b(?:as|do|did|if|don't|does|let|should|to)\s+)\byou know,\s*/gi, '');

  // 4. Remove parenthetical filler "I mean"
  cleaned = cleaned.replace(/(?:^|,\s*)\bI mean\b,?\s*/gi, ' ');

  // 5. Remove filler "like" when isolated by pauses/commas (e.g. ", like," or "it was, like, 5")
  cleaned = cleaned.replace(/,\s*like\b,?\s*/gi, ', ');
  cleaned = cleaned.replace(/\s+like,\s*/gi, ' ');

  // 6. Clipped false-start words with trailing hyphens (e.g., "twin- the- the")
  // Using lookahead \s+ ensures compound words like "on-device" or "real-time" are NOT stripped.
  cleaned = cleaned.replace(/\b\w+-(?=\s+)/g, '');

  // 7. Remove immediate duplicate words (stutters): "the the" -> "the", "it it" -> "it"
  cleaned = cleaned.replace(/\b([a-zA-Z]+)\s+\1\b/gi, '$1');
  cleaned = cleaned.replace(/\b([a-zA-Z]+),\s+\1\b/gi, '$1');

  // 8. Remove immediate 2-word phrase stutters: "it will, it will" -> "it will"
  cleaned = cleaned.replace(/\b([a-zA-Z]+\s+[a-zA-Z]+)[,\s]+\1\b/gi, '$1');

  // 9. Clean up awkward spaces and punctuation artifacts
  cleaned = cleaned.replace(/\s{2,}/g, ' ');
  cleaned = cleaned.replace(/\s+([.,!?;:])/g, '$1');
  cleaned = cleaned.replace(/,\s*,/g, ',');
  cleaned = cleaned.replace(/,\s*\./g, '.');
  cleaned = cleaned.replace(/^[,.\s]+/, '');
  cleaned = cleaned.replace(/[,;\s]+$/, '');

  // 10. Ensure capitalization after sentence boundaries (. ! ?) and newlines
  cleaned = cleaned.replace(/(^|[.!?\n]\s+)([a-z])/g, (_m, prefix, letter) => prefix + letter.toUpperCase());

  // 11. Format lists (ordinals, numbers, colon lead-ins, spoken bullets)
  cleaned = formatListsLocally(cleaned);

  // 12. Final capitalization pass for the entire text
  if (cleaned.length > 0 && !cleaned.startsWith('-') && !cleaned.match(/^\d+\./)) {
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

