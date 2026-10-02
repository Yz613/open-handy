export interface Env {
  AI: any;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    // Health check
    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response(
        JSON.stringify({
          status: 'ok',
          service: 'OpenHandy Cloudflare Workers AI Endpoint',
          version: '1.0.0',
          models: {
            stt: '@cf/openai/whisper',
            llm: '@cf/meta/llama-3.3-70b-instruct',
          },
        }),
        {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        }
      );
    }

    // 1. Audio Transcription (STT) via Cloudflare Workers AI Whisper
    if (url.pathname === '/transcribe' && request.method === 'POST') {
      try {
        const contentType = request.headers.get('content-type') || '';
        let audioBytes: number[];

        if (contentType.includes('multipart/form-data')) {
          const formData = await request.formData();
          const file = formData.get('file') as File | null;
          if (!file) {
            return new Response(JSON.stringify({ error: 'No audio file provided' }), {
              status: 400,
              headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
            });
          }
          const arrayBuffer = await file.arrayBuffer();
          audioBytes = [...new Uint8Array(arrayBuffer)];
        } else {
          // Direct binary stream
          const arrayBuffer = await request.arrayBuffer();
          audioBytes = [...new Uint8Array(arrayBuffer)];
        }

        const model = url.searchParams.get('model') || '@cf/openai/whisper';
        const response = await env.AI.run(model, {
          audio: audioBytes,
        });

        return new Response(
          JSON.stringify({
            text: response.text || '',
            vtt: response.vtt || '',
            word_count: response.word_count || 0,
          }),
          {
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          }
        );
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message || 'Transcription error' }), {
          status: 500,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }
    }

    // 2. LLM Post-Processing (Polish, Format, Notes, Code) via Llama 3.3
    if (url.pathname === '/process' && request.method === 'POST') {
      try {
        const body = (await request.json()) as {
          text: string;
          systemPrompt?: string;
          model?: string;
        };

        if (!body.text) {
          return new Response(JSON.stringify({ error: 'Missing text in request body' }), {
            status: 400,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }

        const model = body.model || '@cf/meta/llama-3.3-70b-instruct';
        const messages = [];

        if (body.systemPrompt) {
          messages.push({ role: 'system', content: body.systemPrompt });
        }
        messages.push({ role: 'user', content: body.text });

        const response = await env.AI.run(model, {
          messages,
          temperature: 0.3,
        });

        return new Response(
          JSON.stringify({
            text: response.response || body.text,
          }),
          {
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          }
        );
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message || 'LLM error' }), {
          status: 500,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response(JSON.stringify({ error: 'Not Found' }), {
      status: 404,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  },
};
