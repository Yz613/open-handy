import { AppSettings, STTProviderId, LLMProviderId } from './types';
import { normalizeVercelBaseUrl } from '../store';

export interface TestResult {
  success: boolean;
  message: string;
}

export async function testProviderConnection(
  provider: string,
  settings: AppSettings
): Promise<TestResult> {
  try {
    switch (provider) {
      case 'azure': {
        const { endpoint, apiKey, deployment, apiVersion } = settings.azure;
        if (!endpoint || !apiKey) {
          return { success: false, message: 'Azure Endpoint and API Key are required.' };
        }
        const cleanEndpoint = endpoint.replace(/\/$/, '');
        // Test lightweight endpoint call
        const url = `${cleanEndpoint}/openai/deployments?api-version=${apiVersion || '2024-06-01'}`;
        const res = await fetch(url, {
          method: 'GET',
          headers: { 'api-key': apiKey },
        });
        if (res.ok) {
          return { success: true, message: 'Connected to Azure OpenAI successfully!' };
        } else if (res.status === 401 || res.status === 403) {
          return { success: false, message: `Authentication failed (${res.status}). Check your API Key.` };
        } else {
          // If deployments listing is restricted, test chat completion
          const chatUrl = `${cleanEndpoint}/openai/deployments/${settings.azure.llmDeployment || deployment}/chat/completions?api-version=${apiVersion || '2024-06-01'}`;
          const chatRes = await fetch(chatUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
            body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }], max_tokens: 1 }),
          });
          if (chatRes.ok) {
            return { success: true, message: 'Connected to Azure OpenAI successfully!' };
          }
          const text = await chatRes.text();
          return { success: false, message: `Azure test returned ${chatRes.status}: ${text.slice(0, 120)}` };
        }
      }

      case 'vercel': {
        const { baseUrl, apiKey, llmModel } = settings.vercel;
        if (!apiKey) {
          return { success: false, message: 'Vercel API Key is required.' };
        }
        const cleanBase = normalizeVercelBaseUrl(baseUrl);
        const res = await fetch(`${cleanBase}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: llmModel || 'openai/gpt-4o-mini',
            messages: [{ role: 'user', content: 'ping' }],
            max_tokens: 1,
          }),
        });
        if (res.ok) {
          return { success: true, message: 'Connected to Vercel AI Gateway successfully!' };
        }
        const text = await res.text();
        return { success: false, message: `Vercel Gateway returned ${res.status}: ${text.slice(0, 120)}` };
      }

      case 'groq': {
        const { apiKey } = settings.groq;
        if (!apiKey) {
          return { success: false, message: 'Groq API Key is required.' };
        }
        const res = await fetch('https://api.groq.com/openai/v1/models', {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (res.ok) {
          return { success: true, message: 'Connected to Groq successfully!' };
        }
        return { success: false, message: `Groq authentication failed (${res.status}).` };
      }

      case 'openai': {
        const { apiKey, baseUrl } = settings.openai;
        if (!apiKey) {
          return { success: false, message: 'OpenAI API Key is required.' };
        }
        const cleanBase = baseUrl ? baseUrl.replace(/\/$/, '') : 'https://api.openai.com/v1';
        const res = await fetch(`${cleanBase}/models`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (res.ok) {
          return { success: true, message: 'Connected to OpenAI successfully!' };
        }
        return { success: false, message: `OpenAI authentication failed (${res.status}).` };
      }

      case 'gemini': {
        const { apiKey } = settings.gemini;
        if (!apiKey) {
          return { success: false, message: 'Google Gemini API Key is required.' };
        }
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        if (res.ok) {
          return { success: true, message: 'Connected to Google Gemini successfully!' };
        }
        return { success: false, message: `Gemini authentication failed (${res.status}).` };
      }

      case 'anthropic': {
        const { apiKey, model } = settings.anthropic;
        if (!apiKey) {
          return { success: false, message: 'Anthropic API Key is required.' };
        }
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: model || 'claude-3-5-haiku-20241022',
            max_tokens: 1,
            messages: [{ role: 'user', content: 'hi' }],
          }),
        });
        if (res.ok) {
          return { success: true, message: 'Connected to Anthropic Claude successfully!' };
        }
        return { success: false, message: `Anthropic authentication failed (${res.status}).` };
      }

      case 'deepgram': {
        const { apiKey } = settings.deepgram;
        if (!apiKey) {
          return { success: false, message: 'Deepgram API Key is required.' };
        }
        const res = await fetch('https://api.deepgram.com/v1/projects', {
          headers: { Authorization: `Token ${apiKey}` },
        });
        if (res.ok) {
          return { success: true, message: 'Connected to Deepgram successfully!' };
        }
        return { success: false, message: `Deepgram authentication failed (${res.status}).` };
      }

      case 'openrouter': {
        const { apiKey } = settings.openrouter;
        if (!apiKey) {
          return { success: false, message: 'OpenRouter API Key is required.' };
        }
        const res = await fetch('https://openrouter.ai/api/v1/models', {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (res.ok) {
          return { success: true, message: 'Connected to OpenRouter successfully!' };
        }
        return { success: false, message: `OpenRouter authentication failed (${res.status}).` };
      }

      case 'custom': {
        const { baseUrl, apiKey, customHeaders } = settings.custom;
        if (!baseUrl) {
          return { success: false, message: 'Custom Base URL is required.' };
        }
        const cleanBase = baseUrl.replace(/\/$/, '');
        const headers: Record<string, string> = { ...(customHeaders || {}) };
        if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

        const res = await fetch(`${cleanBase}/models`, { headers });
        if (res.ok) {
          return { success: true, message: 'Connected to Custom endpoint successfully!' };
        }
        return { success: false, message: `Endpoint returned ${res.status}.` };
      }

      case 'cloudflare': {
        const { accountId, apiToken } = settings.cloudflare;
        if (!accountId || !apiToken) {
          return { success: false, message: 'Cloudflare Account ID and API Token are required.' };
        }
        const res = await fetch('https://api.cloudflare.com/client/v4/user/tokens/verify', {
          headers: { Authorization: `Bearer ${apiToken}` },
        });
        if (res.ok) {
          return { success: true, message: 'Cloudflare API Token verified successfully!' };
        }
        const text = await res.text();
        return { success: false, message: `Cloudflare returned ${res.status}: ${text.slice(0, 100)}` };
      }

      default:
        return { success: false, message: `Unknown provider: ${provider}` };
    }
  } catch (err: any) {
    return { success: false, message: err.message || 'Connection failed' };
  }
}
