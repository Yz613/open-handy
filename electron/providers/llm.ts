import { AppSettings, LLMProviderId, PromptPreset } from './types';

export interface LLMResult {
  text: string;
  provider: LLMProviderId;
  model: string;
}

export async function processWithLLM(
  rawTranscript: string,
  preset: PromptPreset,
  settings: AppSettings
): Promise<LLMResult> {
  const provider = settings.activeLlmProvider;

  // If LLM provider is 'none' or preset has no systemPrompt, return raw transcript
  if (provider === 'none' || !preset.systemPrompt || preset.id === 'raw') {
    return {
      text: rawTranscript,
      provider: 'none',
      model: 'raw',
    };
  }

  switch (provider) {
    case 'azure':
      return await processWithAzure(rawTranscript, preset, settings);
    case 'vercel':
      return await processWithVercel(rawTranscript, preset, settings);
    case 'groq':
      return await processWithGroq(rawTranscript, preset, settings);
    case 'openai':
      return await processWithOpenAI(rawTranscript, preset, settings);
    case 'anthropic':
      return await processWithAnthropic(rawTranscript, preset, settings);
    case 'gemini':
      return await processWithGemini(rawTranscript, preset, settings);
    case 'openrouter':
      return await processWithOpenRouter(rawTranscript, preset, settings);
    case 'cloudflare':
      return await processWithCloudflare(rawTranscript, preset, settings);
    case 'custom':
      return await processWithCustom(rawTranscript, preset, settings);
    default:
      return {
        text: rawTranscript,
        provider: 'none',
        model: 'raw',
      };
  }
}

// 1. Azure OpenAI Chat Completions
async function processWithAzure(
  rawTranscript: string,
  preset: PromptPreset,
  settings: AppSettings
): Promise<LLMResult> {
  const { endpoint, apiKey, llmDeployment, apiVersion } = settings.azure;
  if (!endpoint || !apiKey) {
    throw new Error('Azure endpoint and API Key are required in Settings.');
  }

  const cleanEndpoint = endpoint.replace(/\/$/, '');
  const deployment = llmDeployment || 'gpt-4o';
  const url = `${cleanEndpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion || '2024-06-01'}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': apiKey,
    },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: preset.systemPrompt },
        { role: 'user', content: rawTranscript },
      ],
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Azure LLM error (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as any;
  const text = data?.choices?.[0]?.message?.content?.trim() || rawTranscript;

  return { text, provider: 'azure', model: deployment };
}

// 2. Vercel AI Gateway Chat Completions
async function processWithVercel(
  rawTranscript: string,
  preset: PromptPreset,
  settings: AppSettings
): Promise<LLMResult> {
  const { baseUrl, apiKey, llmModel } = settings.vercel;
  if (!apiKey) {
    throw new Error('Vercel Gateway API Key is required in Settings.');
  }

  const cleanBase = (baseUrl || 'https://api.vercel.ai/v1').replace(/\/$/, '');
  const url = `${cleanBase}/chat/completions`;
  const model = llmModel || 'openai/gpt-4o';

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: preset.systemPrompt },
        { role: 'user', content: rawTranscript },
      ],
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Vercel Gateway LLM error (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as any;
  const text = data?.choices?.[0]?.message?.content?.trim() || rawTranscript;

  return { text, provider: 'vercel', model };
}

// 3. Groq Llama 3.3 (Instant LLM Post-Processing)
async function processWithGroq(
  rawTranscript: string,
  preset: PromptPreset,
  settings: AppSettings
): Promise<LLMResult> {
  const { apiKey, llmModel } = settings.groq;
  if (!apiKey) {
    throw new Error('Groq API Key is required in Settings.');
  }

  const model = llmModel || 'llama-3.3-70b-versatile';
  const url = 'https://api.groq.com/openai/v1/chat/completions';

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: preset.systemPrompt },
        { role: 'user', content: rawTranscript },
      ],
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Groq LLM error (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as any;
  const text = data?.choices?.[0]?.message?.content?.trim() || rawTranscript;

  return { text, provider: 'groq', model };
}

// 4. OpenAI Chat Completions
async function processWithOpenAI(
  rawTranscript: string,
  preset: PromptPreset,
  settings: AppSettings
): Promise<LLMResult> {
  const { apiKey, baseUrl, llmModel } = settings.openai;
  if (!apiKey) {
    throw new Error('OpenAI API Key is required in Settings.');
  }

  const cleanBase = baseUrl ? baseUrl.replace(/\/$/, '') : 'https://api.openai.com/v1';
  const url = `${cleanBase}/chat/completions`;
  const model = llmModel || 'gpt-4o-mini';

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: preset.systemPrompt },
        { role: 'user', content: rawTranscript },
      ],
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI LLM error (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as any;
  const text = data?.choices?.[0]?.message?.content?.trim() || rawTranscript;

  return { text, provider: 'openai', model };
}

// 5. Anthropic Claude
async function processWithAnthropic(
  rawTranscript: string,
  preset: PromptPreset,
  settings: AppSettings
): Promise<LLMResult> {
  const { apiKey, model } = settings.anthropic;
  if (!apiKey) {
    throw new Error('Anthropic API Key is required in Settings.');
  }

  const claudeModel = model || 'claude-3-5-haiku-20241022';
  const url = 'https://api.anthropic.com/v1/messages';

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: claudeModel,
      max_tokens: 2048,
      system: preset.systemPrompt,
      messages: [{ role: 'user', content: rawTranscript }],
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic Claude error (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as any;
  const text = data?.content?.[0]?.text?.trim() || rawTranscript;

  return { text, provider: 'anthropic', model: claudeModel };
}

// 6. Google Gemini Text
async function processWithGemini(
  rawTranscript: string,
  preset: PromptPreset,
  settings: AppSettings
): Promise<LLMResult> {
  const { apiKey, model } = settings.gemini;
  if (!apiKey) {
    throw new Error('Google Gemini API Key is required in Settings.');
  }

  const geminiModel = model || 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`;

  const payload = {
    system_instruction: {
      parts: [{ text: preset.systemPrompt }],
    },
    contents: [
      {
        parts: [{ text: rawTranscript }],
      },
    ],
    generationConfig: {
      temperature: 0.3,
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini LLM error (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as any;
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || rawTranscript;

  return { text, provider: 'gemini', model: geminiModel };
}

// 7. OpenRouter
async function processWithOpenRouter(
  rawTranscript: string,
  preset: PromptPreset,
  settings: AppSettings
): Promise<LLMResult> {
  const { apiKey, model } = settings.openrouter;
  if (!apiKey) {
    throw new Error('OpenRouter API Key is required in Settings.');
  }

  const openRouterModel = model || 'anthropic/claude-3.5-sonnet';
  const url = 'https://openrouter.ai/api/v1/chat/completions';

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://github.com/open-handy',
      'X-Title': 'OpenHandy',
    },
    body: JSON.stringify({
      model: openRouterModel,
      messages: [
        { role: 'system', content: preset.systemPrompt },
        { role: 'user', content: rawTranscript },
      ],
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter LLM error (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as any;
  const text = data?.choices?.[0]?.message?.content?.trim() || rawTranscript;

  return { text, provider: 'openrouter', model: openRouterModel };
}

// 8. Custom OpenAI-Compatible LLM
async function processWithCustom(
  rawTranscript: string,
  preset: PromptPreset,
  settings: AppSettings
): Promise<LLMResult> {
  const { baseUrl, apiKey, llmModel, customHeaders } = settings.custom;
  if (!baseUrl) {
    throw new Error('Custom Provider Base URL is required in Settings.');
  }

  const cleanBase = baseUrl.replace(/\/$/, '');
  const url = `${cleanBase}/chat/completions`;
  const model = llmModel || 'llama3';

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(customHeaders || {}),
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: preset.systemPrompt },
        { role: 'user', content: rawTranscript },
      ],
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Custom LLM error (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as any;
  const text = data?.choices?.[0]?.message?.content?.trim() || rawTranscript;

  return { text, provider: 'custom', model };
}

// 9. Cloudflare Workers AI LLM (e.g. Llama 3.3, Mistral)
async function processWithCloudflare(
  rawTranscript: string,
  preset: PromptPreset,
  settings: AppSettings
): Promise<LLMResult> {
  const { accountId, apiToken, llmModel, gatewayUrl } = settings.cloudflare;
  if (!accountId || !apiToken) {
    throw new Error('Cloudflare Account ID and API Token are required in Settings.');
  }

  const model = llmModel || '@cf/meta/llama-3.3-70b-instruct';
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
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: preset.systemPrompt },
        { role: 'user', content: rawTranscript },
      ],
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Cloudflare LLM error (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as any;
  if (data.success === false && data.errors && data.errors.length > 0) {
    const errMsg = data.errors.map((e: any) => e.message || JSON.stringify(e)).join(', ');
    throw new Error(`Cloudflare error: ${errMsg}`);
  }

  // Cloudflare Workers AI returns { result: { response: "..." } }
  const text = data?.result?.response?.trim() || rawTranscript;
  return {
    text,
    provider: 'cloudflare',
    model,
  };
}
