import { AppSettings, STTProviderId } from './types';
import { gatewayApiKey } from '../env';

export interface STTResult {
  text: string;
  provider: STTProviderId;
  model: string;
}

export function sttProviderConfigured(settings: AppSettings): boolean {
  switch (settings.activeSttProvider) {
    case 'azure':
      return Boolean(settings.azure.endpoint && settings.azure.apiKey);
    case 'vercel':
      return Boolean(gatewayApiKey(settings.vercel.apiKey));
    case 'groq':
      return Boolean(settings.groq.apiKey);
    case 'openai':
      return Boolean(settings.openai.apiKey);
    case 'gemini':
      return Boolean(settings.gemini.apiKey);
    case 'deepgram':
      return Boolean(settings.deepgram.apiKey);
    case 'cloudflare':
      return Boolean(settings.cloudflare.accountId && settings.cloudflare.apiToken);
    case 'custom':
      return Boolean(settings.custom.baseUrl);
    default:
      return false;
  }
}

export async function transcribeAudio(
  audioBuffer: Buffer,
  mimeType: string,
  settings: AppSettings
): Promise<STTResult> {
  const provider = settings.activeSttProvider;

  switch (provider) {
    case 'azure':
      return await transcribeWithAzure(audioBuffer, mimeType, settings);
    case 'vercel':
      return await transcribeWithVercel(audioBuffer, mimeType, settings);
    case 'groq':
      return await transcribeWithGroq(audioBuffer, mimeType, settings);
    case 'openai':
      return await transcribeWithOpenAI(audioBuffer, mimeType, settings);
    case 'gemini':
      return await transcribeWithGemini(audioBuffer, mimeType, settings);
    case 'deepgram':
      return await transcribeWithDeepgram(audioBuffer, mimeType, settings);
    case 'cloudflare':
      return await transcribeWithCloudflare(audioBuffer, mimeType, settings);
    case 'custom':
      return await transcribeWithCustom(audioBuffer, mimeType, settings);
    default:
      throw new Error(`Unsupported STT provider: ${provider}`);
  }
}

// 1. Azure OpenAI Whisper
async function transcribeWithAzure(
  audioBuffer: Buffer,
  mimeType: string,
  settings: AppSettings
): Promise<STTResult> {
  const { endpoint, apiKey, deployment, apiVersion } = settings.azure;
  if (!endpoint || !apiKey) {
    throw new Error('Azure endpoint and API Key are required in Settings.');
  }

  const cleanEndpoint = endpoint.replace(/\/$/, '');
  const url = `${cleanEndpoint}/openai/deployments/${deployment}/audio/transcriptions?api-version=${apiVersion || '2024-06-01'}`;

  const extension = mimeType.includes('wav') ? 'wav' : 'webm';
  const blob = new Blob([audioBuffer], { type: mimeType });

  const formData = new FormData();
  formData.append('file', blob, `dictation.${extension}`);
  formData.append('model', deployment);
  formData.append('response_format', 'json');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'api-key': apiKey,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Azure Whisper error (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as { text?: string };
  return {
    text: data.text || '',
    provider: 'azure',
    model: deployment,
  };
}

const MAI_TRANSCRIBE_MODEL = 'microsoft/mai-transcribe-2';
const MAI_STREAMING_MODEL = 'microsoft/mai-transcribe-2-streaming';
// File transcription lives on the gateway's transcription route. The OpenAI-style
// /v1/audio/transcriptions upload is not served, and gateway.ai.vercel.com does not complete TLS.
const MAI_TRANSCRIBE_URL = 'https://ai-gateway.vercel.sh/v4/ai/transcription-model';
const MAI_STREAM_WS_URL = 'wss://ai-gateway.vercel.sh/v4/ai/transcription-model';
const MAX_WS_AUDIO_FRAME_BYTES = 32768;

function transcriptionMediaType(mimeType: string): string {
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'audio/mpeg';
  if (mimeType.includes('flac')) return 'audio/flac';
  if (mimeType.includes('ogg') || mimeType.includes('opus')) return 'audio/ogg';
  return 'audio/wav';
}

export function resolveVercelStreamingModel(configuredRaw?: string): string | null {
  const configured = (configuredRaw || '').trim();
  if (
    !configured ||
    configured === 'whisper-1' ||
    configured === MAI_TRANSCRIBE_MODEL ||
    configured === MAI_STREAMING_MODEL
  ) {
    return MAI_STREAMING_MODEL;
  }
  if (configured === 'xai/grok-stt' || configured === 'spacexai/grok-stt') {
    return 'spacexai/grok-stt';
  }
  if (
    configured === 'openai/gpt-realtime-whisper' ||
    configured === 'google/gemini-3.5-transcribe-live' ||
    configured.endsWith('-streaming') ||
    configured.endsWith('-live')
  ) {
    return configured;
  }
  return null;
}

export class VercelLiveTranscriptionSession {
  private ws: WebSocket | null = null;
  private isOpen = false;
  private hasFailed = false;
  private failureReason = '';
  private audioDoneSent = false;
  private pendingChunks: Buffer[] = [];
  private sentBytes = 0;
  private finalSegments: string[] = [];
  private latestPartial = '';
  private finishedText: string | null = null;
  private finishResolver: ((res: STTResult) => void) | null = null;
  private finishRejecter: ((err: Error) => void) | null = null;
  public readonly model: string;

  constructor(apiKey: string, model: string, sampleRate: number = 16000) {
    this.model = model;
    const url = `${MAI_STREAM_WS_URL}?ai-model-id=${encodeURIComponent(model)}`;
    const protocols = ['ai-gateway-transcription.v1', `ai-gateway-auth.${apiKey}`];

    try {
      this.ws = new WebSocket(url, protocols);
    } catch (err: any) {
      this.fail(err?.message || 'Failed to construct WebSocket');
      return;
    }

    this.ws.onopen = () => {
      if (!this.ws || this.hasFailed) return;
      this.isOpen = true;
      try {
        this.ws.send(
          JSON.stringify({
            type: 'transcription-stream.start',
            inputAudioFormat: { type: 'audio/pcm', rate: sampleRate },
          })
        );
        for (const chunk of this.pendingChunks) {
          this.sendRawChunk(chunk);
        }
        this.pendingChunks = [];
        if (this.audioDoneSent) {
          this.ws.send(JSON.stringify({ type: 'transcription-stream.audio-done' }));
        }
      } catch (err: any) {
        this.fail(err?.message || 'Failed to send WebSocket start frame');
      }
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(String(event.data));
        if (msg.type === 'transcript-partial' && typeof msg.text === 'string') {
          this.latestPartial = msg.text;
        } else if (msg.type === 'transcript-final' && typeof msg.text === 'string') {
          if (msg.text.trim()) this.finalSegments.push(msg.text.trim());
          this.latestPartial = '';
        } else if (msg.type === 'finish') {
          const text =
            typeof msg.text === 'string' && msg.text.trim()
              ? msg.text.trim()
              : this.finalSegments.join(' ').trim() || this.latestPartial.trim();
          this.finishedText = text;
          this.resolveFinish(text);
          this.cleanup();
        } else if (msg.type === 'error') {
          const errMsg =
            msg.error?.message ||
            (typeof msg.error === 'string' ? msg.error : 'Vercel streaming transcription error');
          this.fail(errMsg);
        }
      } catch {
        // Ignore non-JSON frames
      }
    };

    this.ws.onerror = () => {
      this.fail('WebSocket connection error on Vercel AI Gateway');
    };

    this.ws.onclose = () => {
      if (this.finishedText === null && !this.hasFailed) {
        const fallbackText = this.finalSegments.join(' ').trim() || this.latestPartial.trim();
        if (fallbackText && this.audioDoneSent) {
          this.finishedText = fallbackText;
          this.resolveFinish(fallbackText);
        } else {
          this.fail('WebSocket closed before transcription completed');
        }
      }
    };
  }

  private sendRawChunk(chunk: Buffer) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    for (let offset = 0; offset < chunk.length; offset += MAX_WS_AUDIO_FRAME_BYTES) {
      this.ws.send(chunk.subarray(offset, offset + MAX_WS_AUDIO_FRAME_BYTES));
    }
  }

  public pushPcmChunk(chunk: Buffer) {
    if (this.hasFailed || this.audioDoneSent || chunk.length === 0) return;
    this.sentBytes += chunk.length;
    if (this.isOpen && this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.sendRawChunk(chunk);
      } catch (err: any) {
        this.fail(err?.message || 'Failed to send audio frame');
      }
    } else {
      this.pendingChunks.push(chunk);
    }
  }

  public finish(timeoutMs: number = 5000): Promise<STTResult> {
    if (this.hasFailed) {
      return Promise.reject(new Error(this.failureReason || 'Live stream failed'));
    }
    if (this.sentBytes < 500) {
      this.cleanup();
      return Promise.reject(new Error('Insufficient live audio bytes streamed'));
    }
    if (this.finishedText !== null) {
      return Promise.resolve({
        text: this.finishedText,
        provider: 'vercel',
        model: this.model,
      });
    }

    this.audioDoneSent = true;
    if (this.isOpen && this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ type: 'transcription-stream.audio-done' }));
      } catch (err: any) {
        this.fail(err?.message || 'Failed to send audio-done frame');
        return Promise.reject(new Error(this.failureReason));
      }
    }

    return new Promise<STTResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        const partial = this.finalSegments.join(' ').trim() || this.latestPartial.trim();
        this.cleanup();
        if (partial) {
          resolve({ text: partial, provider: 'vercel', model: this.model });
        } else {
          reject(new Error('Vercel streaming transcription timed out'));
        }
      }, timeoutMs);

      this.finishResolver = (res) => {
        clearTimeout(timer);
        resolve(res);
      };
      this.finishRejecter = (err) => {
        clearTimeout(timer);
        reject(err);
      };
    });
  }

  private resolveFinish(text: string) {
    if (this.finishResolver) {
      const resolve = this.finishResolver;
      this.finishResolver = null;
      this.finishRejecter = null;
      resolve({ text, provider: 'vercel', model: this.model });
    }
  }

  private fail(reason: string) {
    if (this.hasFailed) return;
    this.hasFailed = true;
    this.failureReason = reason;
    this.cleanup();
    if (this.finishRejecter) {
      const reject = this.finishRejecter;
      this.finishResolver = null;
      this.finishRejecter = null;
      reject(new Error(reason));
    }
  }

  public cancel() {
    this.hasFailed = true;
    this.cleanup();
  }

  private cleanup() {
    this.pendingChunks = [];
    if (this.ws) {
      try {
        this.ws.onopen = null;
        this.ws.onmessage = null;
        this.ws.onerror = null;
        this.ws.onclose = null;
        if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
          this.ws.close(1000);
        }
      } catch {
        // Ignore close errors
      }
      this.ws = null;
    }
  }
}

export function createVercelLiveSession(settings: AppSettings): VercelLiveTranscriptionSession | null {
  if (settings.activeSttProvider !== 'vercel') return null;
  const apiKey = gatewayApiKey(settings.vercel.apiKey);
  if (!apiKey) return null;
  const streamingModel = resolveVercelStreamingModel(settings.vercel.sttModel);
  if (!streamingModel) return null;
  return new VercelLiveTranscriptionSession(apiKey, streamingModel, 16000);
}

// 2. Vercel AI Gateway — Microsoft MAI Transcribe (WebSocket streaming + REST fallback)
async function transcribeWithVercel(
  audioBuffer: Buffer,
  mimeType: string,
  settings: AppSettings
): Promise<STTResult> {
  const apiKey = gatewayApiKey(settings.vercel.apiKey);
  if (!apiKey) {
    throw new Error('Set AI_GATEWAY_API_KEY in .env to transcribe with Microsoft MAI.');
  }

  const configured = (settings.vercel.sttModel || '').trim();
  const streamingModel = resolveVercelStreamingModel(configured);

  // Fast path: stream raw PCM over WebSocket (~1s cold vs 35-69s on batch REST for MAI-Transcribe-2)
  const isWav =
    mimeType.includes('wav') &&
    audioBuffer.length > 44 &&
    audioBuffer.toString('ascii', 0, 4) === 'RIFF';

  if (streamingModel && isWav) {
    const sampleRate = audioBuffer.readUInt32LE(24) || 16000;
    const pcmBuffer = audioBuffer.subarray(44);
    try {
      const session = new VercelLiveTranscriptionSession(apiKey, streamingModel, sampleRate);
      session.pushPcmChunk(pcmBuffer);
      return await session.finish(8000);
    } catch (wsErr) {
      console.warn('Vercel WebSocket transcription failed, falling back to REST:', wsErr);
    }
  }

  // REST path (for non-streaming models like openai/gpt-4o-mini-transcribe, or fallback)
  const restModel =
    !configured || configured === 'whisper-1' || configured === MAI_STREAMING_MODEL
      ? 'openai/gpt-4o-mini-transcribe'
      : configured;

  const response = await fetch(MAI_TRANSCRIBE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'ai-gateway-protocol-version': '0.0.1',
      'ai-transcription-model-specification-version': '4',
      'ai-model-id': restModel,
    },
    body: JSON.stringify({
      audio: audioBuffer.toString('base64'),
      mediaType: transcriptionMediaType(mimeType),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Vercel Gateway STT error (${response.status}): ${errorText.slice(0, 240)}`);
  }

  const data = (await response.json()) as { text?: string };
  return {
    text: data.text || '',
    provider: 'vercel',
    model: restModel,
  };
}

// 3. Groq Whisper (Ultra Fast)
async function transcribeWithGroq(
  audioBuffer: Buffer,
  mimeType: string,
  settings: AppSettings
): Promise<STTResult> {
  const { apiKey, sttModel } = settings.groq;
  if (!apiKey) {
    throw new Error('Groq API Key is required in Settings.');
  }

  const model = sttModel || 'whisper-large-v3-turbo';
  const url = 'https://api.groq.com/openai/v1/audio/transcriptions';

  const extension = mimeType.includes('wav') ? 'wav' : 'webm';
  const blob = new Blob([audioBuffer], { type: mimeType });

  const formData = new FormData();
  formData.append('file', blob, `dictation.${extension}`);
  formData.append('model', model);
  formData.append('response_format', 'json');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Groq Whisper error (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as { text?: string };
  return {
    text: data.text || '',
    provider: 'groq',
    model,
  };
}

// 4. OpenAI Whisper
async function transcribeWithOpenAI(
  audioBuffer: Buffer,
  mimeType: string,
  settings: AppSettings
): Promise<STTResult> {
  const { apiKey, baseUrl, sttModel } = settings.openai;
  if (!apiKey) {
    throw new Error('OpenAI API Key is required in Settings.');
  }

  const cleanBase = baseUrl ? baseUrl.replace(/\/$/, '') : 'https://api.openai.com/v1';
  const url = `${cleanBase}/audio/transcriptions`;
  const model = sttModel || 'whisper-1';

  const extension = mimeType.includes('wav') ? 'wav' : 'webm';
  const blob = new Blob([audioBuffer], { type: mimeType });

  const formData = new FormData();
  formData.append('file', blob, `dictation.${extension}`);
  formData.append('model', model);
  formData.append('response_format', 'json');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI Whisper error (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as { text?: string };
  return {
    text: data.text || '',
    provider: 'openai',
    model,
  };
}

// 5. Google Gemini Multimodal Audio
async function transcribeWithGemini(
  audioBuffer: Buffer,
  mimeType: string,
  settings: AppSettings
): Promise<STTResult> {
  const { apiKey, model } = settings.gemini;
  if (!apiKey) {
    throw new Error('Google Gemini API Key is required in Settings.');
  }

  const geminiModel = model || 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`;

  const base64Audio = audioBuffer.toString('base64');

  const payload = {
    contents: [
      {
        parts: [
          {
            text: 'Transcribe the following spoken audio accurately. Output ONLY the raw transcript with no intro, explanations, or quotes.',
          },
          {
            inline_data: {
              mime_type: mimeType.split(';')[0],
              data: base64Audio,
            },
          },
        ],
      },
    ],
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini Audio error (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as any;
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

  return {
    text,
    provider: 'gemini',
    model: geminiModel,
  };
}

// 6. Deepgram Nova
async function transcribeWithDeepgram(
  audioBuffer: Buffer,
  mimeType: string,
  settings: AppSettings
): Promise<STTResult> {
  const { apiKey, model } = settings.deepgram;
  if (!apiKey) {
    throw new Error('Deepgram API Key is required in Settings.');
  }

  const deepgramModel = model || 'nova-2';
  const cleanMime = mimeType.split(';')[0];
  const url = `https://api.deepgram.com/v1/listen?model=${deepgramModel}&smart_format=true&punctuate=true`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': cleanMime,
    },
    body: audioBuffer,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Deepgram error (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as any;
  const transcript =
    data?.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() || '';

  return {
    text: transcript,
    provider: 'deepgram',
    model: deepgramModel,
  };
}

// 7. Custom OpenAI-Compatible STT
async function transcribeWithCustom(
  audioBuffer: Buffer,
  mimeType: string,
  settings: AppSettings
): Promise<STTResult> {
  const { baseUrl, apiKey, sttModel, customHeaders } = settings.custom;
  if (!baseUrl) {
    throw new Error('Custom Provider Base URL is required in Settings.');
  }

  const cleanBase = baseUrl.replace(/\/$/, '');
  const url = `${cleanBase}/audio/transcriptions`;
  const model = sttModel || 'whisper';

  const extension = mimeType.includes('wav') ? 'wav' : 'webm';
  const blob = new Blob([audioBuffer], { type: mimeType });

  const formData = new FormData();
  formData.append('file', blob, `dictation.${extension}`);
  formData.append('model', model);
  formData.append('response_format', 'json');

  const headers: Record<string, string> = {
    ...(customHeaders || {}),
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Custom STT error (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as { text?: string };
  return {
    text: data.text || '',
    provider: 'custom',
    model,
  };
}

// 8. Cloudflare Workers AI Whisper
async function transcribeWithCloudflare(
  audioBuffer: Buffer,
  mimeType: string,
  settings: AppSettings
): Promise<STTResult> {
  const { accountId, apiToken, sttModel, gatewayUrl } = settings.cloudflare;
  if (!accountId || !apiToken) {
    throw new Error('Cloudflare Account ID and API Token are required in Settings.');
  }

  const model = sttModel || '@cf/openai/whisper';
  let url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;
  if (gatewayUrl && gatewayUrl.trim()) {
    const cleanGw = gatewayUrl.trim().replace(/\/$/, '');
    url = cleanGw.includes('/workers-ai')
      ? `${cleanGw}/run/${model}`
      : `${cleanGw}/workers-ai/run/${model}`;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiToken}`,
      'Content-Type': 'application/octet-stream',
    },
    body: audioBuffer,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Cloudflare Workers AI error (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as {
    result?: { text?: string };
    success?: boolean;
    errors?: any[];
  };

  if (data.success === false && data.errors && data.errors.length > 0) {
    const errMsg = data.errors.map((e: any) => e.message || JSON.stringify(e)).join(', ');
    throw new Error(`Cloudflare error: ${errMsg}`);
  }

  return {
    text: data.result?.text || '',
    provider: 'cloudflare',
    model,
  };
}
