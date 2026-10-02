export type STTProviderId = 'azure' | 'vercel' | 'groq' | 'openai' | 'gemini' | 'deepgram' | 'cloudflare' | 'custom';
export type LLMProviderId = 'none' | 'azure' | 'vercel' | 'groq' | 'openai' | 'anthropic' | 'gemini' | 'openrouter' | 'cloudflare' | 'custom';

export interface AzureConfig {
  endpoint: string;       // e.g. https://my-resource.openai.azure.com
  apiKey: string;
  deployment: string;     // STT deployment (e.g. whisper)
  llmDeployment: string;  // LLM deployment (e.g. gpt-4o)
  apiVersion: string;     // e.g. 2024-06-01
}

export interface VercelGatewayConfig {
  baseUrl: string;        // e.g. https://ai-gateway.vercel.sh/v1 or custom gateway
  apiKey: string;
  sttModel: string;       // e.g. microsoft/mai-transcribe-2
  llmModel: string;       // e.g. openai/gpt-4o
}

export interface GroqConfig {
  apiKey: string;
  sttModel: string;       // whisper-large-v3 or whisper-large-v3-turbo
  llmModel: string;       // llama-3.3-70b-versatile
}

export interface OpenAIConfig {
  apiKey: string;
  baseUrl?: string;       // optional proxy baseUrl
  sttModel: string;       // whisper-1
  llmModel: string;       // gpt-4o, gpt-4o-mini
}

export interface GeminiConfig {
  apiKey: string;
  model: string;          // gemini-2.0-flash, gemini-1.5-flash
}

export interface AnthropicConfig {
  apiKey: string;
  model: string;          // claude-3-5-sonnet-20241022, claude-3-5-haiku-20241022
}

export interface DeepgramConfig {
  apiKey: string;
  model: string;          // nova-2, nova-3
}

export interface OpenRouterConfig {
  apiKey: string;
  model: string;          // e.g. anthropic/claude-3.5-sonnet
}

export interface CustomProviderConfig {
  baseUrl: string;        // e.g. http://localhost:11434/v1
  apiKey: string;
  sttModel: string;
  llmModel: string;
  customHeaders?: Record<string, string>;
}

export interface CloudflareConfig {
  accountId: string;      // Cloudflare Account ID
  apiToken: string;       // Cloudflare API Token (Workers AI Read/Edit permissions)
  sttModel: string;       // e.g. "@cf/openai/whisper" or "@cf/openai/whisper-large-v3-turbo"
  llmModel: string;       // e.g. "@cf/meta/llama-3.3-70b-instruct" or "@cf/meta/llama-3.1-8b-instruct"
  gatewayUrl?: string;    // Optional Cloudflare AI Gateway URL (e.g. https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id})
}

export interface PromptPreset {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  isBuiltIn?: boolean;
}

export interface AppSettings {
  hotkey: string;                       // e.g. "Alt+Space" or "CommandOrControl+Shift+Space"
  hotkeyMode: 'toggle' | 'pushToTalk';
  autoPaste: boolean;                   // Default: true (Cmd+V into the focused app)
  copyToClipboard: boolean;             // Default: true (can be toggled OFF)
  soundEffects: boolean;                // Default: true
  activePresetId: string;               // e.g. "clean"
  activeSttProvider: STTProviderId;
  activeLlmProvider: LLMProviderId;
  
  // Specific provider configs
  azure: AzureConfig;
  vercel: VercelGatewayConfig;
  groq: GroqConfig;
  openai: OpenAIConfig;
  gemini: GeminiConfig;
  anthropic: AnthropicConfig;
  deepgram: DeepgramConfig;
  openrouter: OpenRouterConfig;
  cloudflare: CloudflareConfig;
  custom: CustomProviderConfig;

  // Custom prompt presets
  presets: PromptPreset[];
}

export interface DictationRecord {
  id: string;
  timestamp: number;
  durationSeconds: number;
  rawTranscript: string;
  finalOutput: string;
  sttProvider: STTProviderId;
  sttModel: string;
  llmProvider: LLMProviderId;
  llmModel?: string;
  presetId: string;
  presetName: string;
  charCount: number;
  wordCount: number;
}

export type HUDState = 
  | { status: 'idle' }
  | { status: 'listening'; elapsedSeconds: number }
  | { status: 'transcribing'; providerName: string }
  | { status: 'polishing'; providerName: string; presetName: string }
  | { status: 'pasted'; previewText: string }
  | { status: 'copied'; previewText: string }
  | { status: 'error'; message: string };
