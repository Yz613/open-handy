import { AppSettings, STTProviderId } from './types';

export interface STTResult {
  text: string;
  provider: STTProviderId;
  model: string;
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

// 2. Vercel AI Gateway / Versacell
async function transcribeWithVercel(
  audioBuffer: Buffer,
  mimeType: string,
  settings: AppSettings
): Promise<STTResult> {
  const { baseUrl, apiKey, sttModel } = settings.vercel;
  if (!apiKey) {
    throw new Error('Vercel Gateway API Key is required in Settings.');
  }

  const cleanBase = (baseUrl || 'https://api.vercel.ai/v1').replace(/\/$/, '');
  const url = `${cleanBase}/audio/transcriptions`;

  const extension = mimeType.includes('wav') ? 'wav' : 'webm';
  const blob = new Blob([audioBuffer], { type: mimeType });

  const formData = new FormData();
  formData.append('file', blob, `dictation.${extension}`);
  formData.append('model', sttModel || 'whisper-1');
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
    throw new Error(`Vercel Gateway STT error (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as { text?: string };
  return {
    text: data.text || '',
    provider: 'vercel',
    model: sttModel || 'whisper-1',
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
