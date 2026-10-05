import React, { useState } from 'react';
import { Check, AlertCircle, Loader2, Eye, EyeOff, ExternalLink, Zap } from 'lucide-react';
import { AppSettings } from '../../electron/providers/types';

interface ProviderConfigProps {
  settings: AppSettings;
  onUpdate: (partial: Partial<AppSettings>) => void;
}

export const ProviderConfig: React.FC<ProviderConfigProps> = ({ settings, onUpdate }) => {
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({});
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});

  const toggleVisibility = (key: string) => {
    setVisibleKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const runTest = async (providerId: string) => {
    setTestingProvider(providerId);
    try {
      const result = await window.electronAPI.testProvider(providerId);
      setTestResults((prev) => ({ ...prev, [providerId]: result }));
    } catch (e: any) {
      setTestResults((prev) => ({
        ...prev,
        [providerId]: { success: false, message: e.message || 'Test failed' },
      }));
    } finally {
      setTestingProvider(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 flex items-start gap-3 text-blue-200 text-xs">
        <Zap size={18} className="text-blue-400 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold text-blue-300">Plug & Play Any Model:</span> Configure your API keys below.
          Once added, select your preferred Speech-to-Text and LLM Post-Processing providers in the <strong>Pipeline & Models</strong> tab.
        </div>
      </div>

      {/* 1. Microsoft Azure OpenAI */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center font-bold text-xs">
              AZ
            </div>
            <div>
              <h3 className="font-semibold text-sm text-neutral-100">Microsoft Azure OpenAI</h3>
              <p className="text-xs text-neutral-400">Enterprise Whisper STT and GPT-4o deployments</p>
            </div>
          </div>
          <button
            onClick={() => runTest('azure')}
            disabled={testingProvider === 'azure' || !settings.azure.apiKey}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-neutral-800 hover:bg-neutral-700 text-neutral-200 flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            {testingProvider === 'azure' ? <Loader2 size={13} className="animate-spin" /> : null}
            Test Connection
          </button>
        </div>

        {testResults.azure && (
          <div
            className={`p-2.5 rounded-lg text-xs flex items-center gap-2 ${
              testResults.azure.success
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
            }`}
          >
            {testResults.azure.success ? <Check size={14} /> : <AlertCircle size={14} />}
            <span>{testResults.azure.message}</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="col-span-2">
            <label className="block text-neutral-400 mb-1">Azure Endpoint URL</label>
            <input
              type="text"
              placeholder="https://my-resource.openai.azure.com"
              value={settings.azure.endpoint}
              onChange={(e) =>
                onUpdate({ azure: { ...settings.azure, endpoint: e.target.value } })
              }
              className="w-full px-3 py-2 rounded-lg bg-neutral-800/80 border border-neutral-700 focus:border-blue-500 focus:outline-none text-neutral-200"
            />
          </div>

          <div className="col-span-2">
            <label className="block text-neutral-400 mb-1">API Key</label>
            <div className="relative">
              <input
                type={visibleKeys.azure ? 'text' : 'password'}
                placeholder="Azure API Key"
                value={settings.azure.apiKey}
                onChange={(e) =>
                  onUpdate({ azure: { ...settings.azure, apiKey: e.target.value } })
                }
                className="w-full px-3 py-2 pr-9 rounded-lg bg-neutral-800/80 border border-neutral-700 focus:border-blue-500 focus:outline-none text-neutral-200"
              />
              <button
                type="button"
                onClick={() => toggleVisibility('azure')}
                className="absolute right-2.5 top-2.5 text-neutral-400 hover:text-neutral-200"
              >
                {visibleKeys.azure ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-neutral-400 mb-1">STT Deployment Name</label>
            <input
              type="text"
              placeholder="whisper"
              value={settings.azure.deployment}
              onChange={(e) =>
                onUpdate({ azure: { ...settings.azure, deployment: e.target.value } })
              }
              className="w-full px-3 py-2 rounded-lg bg-neutral-800/80 border border-neutral-700 focus:border-blue-500 focus:outline-none text-neutral-200"
            />
          </div>

          <div>
            <label className="block text-neutral-400 mb-1">LLM Deployment Name</label>
            <input
              type="text"
              placeholder="gpt-4o"
              value={settings.azure.llmDeployment}
              onChange={(e) =>
                onUpdate({ azure: { ...settings.azure, llmDeployment: e.target.value } })
              }
              className="w-full px-3 py-2 rounded-lg bg-neutral-800/80 border border-neutral-700 focus:border-blue-500 focus:outline-none text-neutral-200"
            />
          </div>
        </div>
      </div>

      {/* 2. Vercel AI Gateway / Versacell */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg bg-white/10 text-white flex items-center justify-center font-bold text-xs">
              ▲
            </div>
            <div>
              <h3 className="font-semibold text-sm text-neutral-100">Vercel AI Gateway / Versacell</h3>
              <p className="text-xs text-neutral-400">Universal model proxy and gateway routing</p>
            </div>
          </div>
          <button
            onClick={() => runTest('vercel')}
            disabled={testingProvider === 'vercel' || !settings.vercel.apiKey}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-neutral-800 hover:bg-neutral-700 text-neutral-200 flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            {testingProvider === 'vercel' ? <Loader2 size={13} className="animate-spin" /> : null}
            Test Connection
          </button>
        </div>

        {testResults.vercel && (
          <div
            className={`p-2.5 rounded-lg text-xs flex items-center gap-2 ${
              testResults.vercel.success
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
            }`}
          >
            {testResults.vercel.success ? <Check size={14} /> : <AlertCircle size={14} />}
            <span>{testResults.vercel.message}</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="col-span-2">
            <label className="block text-neutral-400 mb-1">Gateway Base URL</label>
            <input
              type="text"
              placeholder="https://ai-gateway.vercel.sh/v1"
              value={settings.vercel.baseUrl}
              onChange={(e) =>
                onUpdate({ vercel: { ...settings.vercel, baseUrl: e.target.value } })
              }
              className="w-full px-3 py-2 rounded-lg bg-neutral-800/80 border border-neutral-700 focus:border-blue-500 focus:outline-none text-neutral-200"
            />
          </div>

          <div className="col-span-2">
            <label className="block text-neutral-400 mb-1">Gateway API Key</label>
            <div className="relative">
              <input
                type={visibleKeys.vercel ? 'text' : 'password'}
                placeholder="Bearer token or API Key"
                value={settings.vercel.apiKey}
                onChange={(e) =>
                  onUpdate({ vercel: { ...settings.vercel, apiKey: e.target.value } })
                }
                className="w-full px-3 py-2 pr-9 rounded-lg bg-neutral-800/80 border border-neutral-700 focus:border-blue-500 focus:outline-none text-neutral-200"
              />
              <button
                type="button"
                onClick={() => toggleVisibility('vercel')}
                className="absolute right-2.5 top-2.5 text-neutral-400 hover:text-neutral-200"
              >
                {visibleKeys.vercel ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-neutral-400 mb-1">STT Model</label>
            <input
              type="text"
              placeholder="microsoft/mai-transcribe-2"
              value={settings.vercel.sttModel}
              onChange={(e) =>
                onUpdate({ vercel: { ...settings.vercel, sttModel: e.target.value } })
              }
              className="w-full px-3 py-2 rounded-lg bg-neutral-800/80 border border-neutral-700 focus:border-blue-500 focus:outline-none text-neutral-200"
            />
          </div>

          <div>
            <label className="block text-neutral-400 mb-1">LLM Model</label>
            <input
              type="text"
              placeholder="openai/gpt-4o"
              value={settings.vercel.llmModel}
              onChange={(e) =>
                onUpdate({ vercel: { ...settings.vercel, llmModel: e.target.value } })
              }
              className="w-full px-3 py-2 rounded-lg bg-neutral-800/80 border border-neutral-700 focus:border-blue-500 focus:outline-none text-neutral-200"
            />
          </div>
        </div>
      </div>

      {/* 3. Groq (Fastest Whisper) */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg bg-orange-600/20 text-orange-400 flex items-center justify-center font-bold text-xs">
              GQ
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-sm text-neutral-100">Groq</h3>
                <span className="px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400 text-[10px] font-medium">
                  Fastest STT (200ms)
                </span>
              </div>
              <p className="text-xs text-neutral-400">Whisper Large v3/Turbo and Llama 3.3 70B</p>
            </div>
          </div>
          <button
            onClick={() => runTest('groq')}
            disabled={testingProvider === 'groq' || !settings.groq.apiKey}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-neutral-800 hover:bg-neutral-700 text-neutral-200 flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            {testingProvider === 'groq' ? <Loader2 size={13} className="animate-spin" /> : null}
            Test Connection
          </button>
        </div>

        {testResults.groq && (
          <div
            className={`p-2.5 rounded-lg text-xs flex items-center gap-2 ${
              testResults.groq.success
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
            }`}
          >
            {testResults.groq.success ? <Check size={14} /> : <AlertCircle size={14} />}
            <span>{testResults.groq.message}</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="col-span-2">
            <div className="flex justify-between items-center mb-1">
              <label className="text-neutral-400">Groq API Key</label>
              <a
                href="https://console.groq.com/keys"
                target="_blank"
                rel="noreferrer"
                className="text-orange-400 hover:underline flex items-center gap-1 text-[11px]"
              >
                Get API Key <ExternalLink size={10} />
              </a>
            </div>
            <div className="relative">
              <input
                type={visibleKeys.groq ? 'text' : 'password'}
                placeholder="gsk_..."
                value={settings.groq.apiKey}
                onChange={(e) =>
                  onUpdate({ groq: { ...settings.groq, apiKey: e.target.value } })
                }
                className="w-full px-3 py-2 pr-9 rounded-lg bg-neutral-800/80 border border-neutral-700 focus:border-blue-500 focus:outline-none text-neutral-200"
              />
              <button
                type="button"
                onClick={() => toggleVisibility('groq')}
                className="absolute right-2.5 top-2.5 text-neutral-400 hover:text-neutral-200"
              >
                {visibleKeys.groq ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-neutral-400 mb-1">STT Model</label>
            <select
              value={settings.groq.sttModel}
              onChange={(e) =>
                onUpdate({ groq: { ...settings.groq, sttModel: e.target.value } })
              }
              className="w-full px-3 py-2 rounded-lg bg-neutral-800/80 border border-neutral-700 focus:border-blue-500 focus:outline-none text-neutral-200"
            >
              <option value="whisper-large-v3-turbo">whisper-large-v3-turbo (Ultra fast)</option>
              <option value="whisper-large-v3">whisper-large-v3 (Maximum accuracy)</option>
            </select>
          </div>

          <div>
            <label className="block text-neutral-400 mb-1">LLM Polish Model</label>
            <select
              value={settings.groq.llmModel}
              onChange={(e) =>
                onUpdate({ groq: { ...settings.groq, llmModel: e.target.value } })
              }
              className="w-full px-3 py-2 rounded-lg bg-neutral-800/80 border border-neutral-700 focus:border-blue-500 focus:outline-none text-neutral-200"
            >
              <option value="llama-3.3-70b-versatile">llama-3.3-70b-versatile</option>
              <option value="mixtral-8x7b-32768">mixtral-8x7b-32768</option>
            </select>
          </div>
        </div>
      </div>

      {/* 4. OpenAI */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg bg-emerald-600/20 text-emerald-400 flex items-center justify-center font-bold text-xs">
              OA
            </div>
            <div>
              <h3 className="font-semibold text-sm text-neutral-100">OpenAI</h3>
              <p className="text-xs text-neutral-400">Whisper-1 audio and GPT-4o models</p>
            </div>
          </div>
          <button
            onClick={() => runTest('openai')}
            disabled={testingProvider === 'openai' || !settings.openai.apiKey}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-neutral-800 hover:bg-neutral-700 text-neutral-200 flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            {testingProvider === 'openai' ? <Loader2 size={13} className="animate-spin" /> : null}
            Test Connection
          </button>
        </div>

        {testResults.openai && (
          <div
            className={`p-2.5 rounded-lg text-xs flex items-center gap-2 ${
              testResults.openai.success
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
            }`}
          >
            {testResults.openai.success ? <Check size={14} /> : <AlertCircle size={14} />}
            <span>{testResults.openai.message}</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="col-span-2">
            <div className="flex justify-between items-center mb-1">
              <label className="text-neutral-400">OpenAI API Key</label>
              <a
                href="https://platform.openai.com/api-keys"
                target="_blank"
                rel="noreferrer"
                className="text-emerald-400 hover:underline flex items-center gap-1 text-[11px]"
              >
                Get API Key <ExternalLink size={10} />
              </a>
            </div>
            <div className="relative">
              <input
                type={visibleKeys.openai ? 'text' : 'password'}
                placeholder="sk-..."
                value={settings.openai.apiKey}
                onChange={(e) =>
                  onUpdate({ openai: { ...settings.openai, apiKey: e.target.value } })
                }
                className="w-full px-3 py-2 pr-9 rounded-lg bg-neutral-800/80 border border-neutral-700 focus:border-blue-500 focus:outline-none text-neutral-200"
              />
              <button
                type="button"
                onClick={() => toggleVisibility('openai')}
                className="absolute right-2.5 top-2.5 text-neutral-400 hover:text-neutral-200"
              >
                {visibleKeys.openai ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-neutral-400 mb-1">Custom Base URL (Optional)</label>
            <input
              type="text"
              placeholder="https://api.openai.com/v1"
              value={settings.openai.baseUrl || ''}
              onChange={(e) =>
                onUpdate({ openai: { ...settings.openai, baseUrl: e.target.value } })
              }
              className="w-full px-3 py-2 rounded-lg bg-neutral-800/80 border border-neutral-700 focus:border-blue-500 focus:outline-none text-neutral-200"
            />
          </div>

          <div>
            <label className="block text-neutral-400 mb-1">LLM Polish Model</label>
            <input
              type="text"
              placeholder="gpt-4o-mini"
              value={settings.openai.llmModel}
              onChange={(e) =>
                onUpdate({ openai: { ...settings.openai, llmModel: e.target.value } })
              }
              className="w-full px-3 py-2 rounded-lg bg-neutral-800/80 border border-neutral-700 focus:border-blue-500 focus:outline-none text-neutral-200"
            />
          </div>
        </div>
      </div>

      {/* 5. Google Gemini */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg bg-sky-600/20 text-sky-400 flex items-center justify-center font-bold text-xs">
              GM
            </div>
            <div>
              <h3 className="font-semibold text-sm text-neutral-100">Google Gemini</h3>
              <p className="text-xs text-neutral-400">Direct Multimodal Audio & Gemini 2.0 Flash</p>
            </div>
          </div>
          <button
            onClick={() => runTest('gemini')}
            disabled={testingProvider === 'gemini' || !settings.gemini.apiKey}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-neutral-800 hover:bg-neutral-700 text-neutral-200 flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            {testingProvider === 'gemini' ? <Loader2 size={13} className="animate-spin" /> : null}
            Test Connection
          </button>
        </div>

        {testResults.gemini && (
          <div
            className={`p-2.5 rounded-lg text-xs flex items-center gap-2 ${
              testResults.gemini.success
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
            }`}
          >
            {testResults.gemini.success ? <Check size={14} /> : <AlertCircle size={14} />}
            <span>{testResults.gemini.message}</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-neutral-400">Gemini API Key</label>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-sky-400 hover:underline flex items-center gap-1 text-[11px]"
              >
                Get Free API Key <ExternalLink size={10} />
              </a>
            </div>
            <div className="relative">
              <input
                type={visibleKeys.gemini ? 'text' : 'password'}
                placeholder="AIza..."
                value={settings.gemini.apiKey}
                onChange={(e) =>
                  onUpdate({ gemini: { ...settings.gemini, apiKey: e.target.value } })
                }
                className="w-full px-3 py-2 pr-9 rounded-lg bg-neutral-800/80 border border-neutral-700 focus:border-blue-500 focus:outline-none text-neutral-200"
              />
              <button
                type="button"
                onClick={() => toggleVisibility('gemini')}
                className="absolute right-2.5 top-2.5 text-neutral-400 hover:text-neutral-200"
              >
                {visibleKeys.gemini ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-neutral-400 mb-1">Gemini Model</label>
            <select
              value={settings.gemini.model}
              onChange={(e) =>
                onUpdate({ gemini: { ...settings.gemini, model: e.target.value } })
              }
              className="w-full px-3 py-2 rounded-lg bg-neutral-800/80 border border-neutral-700 focus:border-blue-500 focus:outline-none text-neutral-200"
            >
              <option value="gemini-2.0-flash">gemini-2.0-flash (Recommended)</option>
              <option value="gemini-1.5-flash">gemini-1.5-flash</option>
              <option value="gemini-1.5-pro">gemini-1.5-pro</option>
            </select>
          </div>
        </div>
      </div>

      {/* 6. Anthropic Claude */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg bg-amber-600/20 text-amber-400 flex items-center justify-center font-bold text-xs">
              CL
            </div>
            <div>
              <h3 className="font-semibold text-sm text-neutral-100">Anthropic Claude</h3>
              <p className="text-xs text-neutral-400">Claude 3.5 Sonnet & Haiku for prompt transformations</p>
            </div>
          </div>
          <button
            onClick={() => runTest('anthropic')}
            disabled={testingProvider === 'anthropic' || !settings.anthropic.apiKey}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-neutral-800 hover:bg-neutral-700 text-neutral-200 flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            {testingProvider === 'anthropic' ? <Loader2 size={13} className="animate-spin" /> : null}
            Test Connection
          </button>
        </div>

        {testResults.anthropic && (
          <div
            className={`p-2.5 rounded-lg text-xs flex items-center gap-2 ${
              testResults.anthropic.success
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
            }`}
          >
            {testResults.anthropic.success ? <Check size={14} /> : <AlertCircle size={14} />}
            <span>{testResults.anthropic.message}</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-neutral-400">Anthropic API Key</label>
              <a
                href="https://console.anthropic.com/settings/keys"
                target="_blank"
                rel="noreferrer"
                className="text-amber-400 hover:underline flex items-center gap-1 text-[11px]"
              >
                Get API Key <ExternalLink size={10} />
              </a>
            </div>
            <div className="relative">
              <input
                type={visibleKeys.anthropic ? 'text' : 'password'}
                placeholder="sk-ant-..."
                value={settings.anthropic.apiKey}
                onChange={(e) =>
                  onUpdate({ anthropic: { ...settings.anthropic, apiKey: e.target.value } })
                }
                className="w-full px-3 py-2 pr-9 rounded-lg bg-neutral-800/80 border border-neutral-700 focus:border-blue-500 focus:outline-none text-neutral-200"
              />
              <button
                type="button"
                onClick={() => toggleVisibility('anthropic')}
                className="absolute right-2.5 top-2.5 text-neutral-400 hover:text-neutral-200"
              >
                {visibleKeys.anthropic ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-neutral-400 mb-1">Claude Model</label>
            <select
              value={settings.anthropic.model}
              onChange={(e) =>
                onUpdate({ anthropic: { ...settings.anthropic, model: e.target.value } })
              }
              className="w-full px-3 py-2 rounded-lg bg-neutral-800/80 border border-neutral-700 focus:border-blue-500 focus:outline-none text-neutral-200"
            >
              <option value="claude-3-5-haiku-20241022">claude-3-5-haiku (Fast & Cheap)</option>
              <option value="claude-3-5-sonnet-20241022">claude-3-5-sonnet (High intelligence)</option>
              <option value="claude-3-7-sonnet-20250219">claude-3-7-sonnet</option>
            </select>
          </div>
        </div>
      </div>

      {/* 7. Deepgram */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg bg-teal-600/20 text-teal-400 flex items-center justify-center font-bold text-xs">
              DG
            </div>
            <div>
              <h3 className="font-semibold text-sm text-neutral-100">Deepgram</h3>
              <p className="text-xs text-neutral-400">Nova-2 & Nova-3 dedicated speech-to-text</p>
            </div>
          </div>
          <button
            onClick={() => runTest('deepgram')}
            disabled={testingProvider === 'deepgram' || !settings.deepgram.apiKey}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-neutral-800 hover:bg-neutral-700 text-neutral-200 flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            {testingProvider === 'deepgram' ? <Loader2 size={13} className="animate-spin" /> : null}
            Test Connection
          </button>
        </div>

        {testResults.deepgram && (
          <div
            className={`p-2.5 rounded-lg text-xs flex items-center gap-2 ${
              testResults.deepgram.success
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
            }`}
          >
            {testResults.deepgram.success ? <Check size={14} /> : <AlertCircle size={14} />}
            <span>{testResults.deepgram.message}</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <label className="block text-neutral-400 mb-1">Deepgram API Key</label>
            <div className="relative">
              <input
                type={visibleKeys.deepgram ? 'text' : 'password'}
                placeholder="Token ..."
                value={settings.deepgram.apiKey}
                onChange={(e) =>
                  onUpdate({ deepgram: { ...settings.deepgram, apiKey: e.target.value } })
                }
                className="w-full px-3 py-2 pr-9 rounded-lg bg-neutral-800/80 border border-neutral-700 focus:border-blue-500 focus:outline-none text-neutral-200"
              />
              <button
                type="button"
                onClick={() => toggleVisibility('deepgram')}
                className="absolute right-2.5 top-2.5 text-neutral-400 hover:text-neutral-200"
              >
                {visibleKeys.deepgram ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-neutral-400 mb-1">Model</label>
            <select
              value={settings.deepgram.model}
              onChange={(e) =>
                onUpdate({ deepgram: { ...settings.deepgram, model: e.target.value } })
              }
              className="w-full px-3 py-2 rounded-lg bg-neutral-800/80 border border-neutral-700 focus:border-blue-500 focus:outline-none text-neutral-200"
            >
              <option value="nova-2">nova-2 (General)</option>
              <option value="nova-3">nova-3</option>
            </select>
          </div>
        </div>
      </div>

      {/* 8. OpenRouter */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg bg-purple-600/20 text-purple-400 flex items-center justify-center font-bold text-xs">
              OR
            </div>
            <div>
              <h3 className="font-semibold text-sm text-neutral-100">OpenRouter</h3>
              <p className="text-xs text-neutral-400">One key for 100+ AI models</p>
            </div>
          </div>
          <button
            onClick={() => runTest('openrouter')}
            disabled={testingProvider === 'openrouter' || !settings.openrouter.apiKey}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-neutral-800 hover:bg-neutral-700 text-neutral-200 flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            {testingProvider === 'openrouter' ? <Loader2 size={13} className="animate-spin" /> : null}
            Test Connection
          </button>
        </div>

        {testResults.openrouter && (
          <div
            className={`p-2.5 rounded-lg text-xs flex items-center gap-2 ${
              testResults.openrouter.success
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
            }`}
          >
            {testResults.openrouter.success ? <Check size={14} /> : <AlertCircle size={14} />}
            <span>{testResults.openrouter.message}</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <label className="block text-neutral-400 mb-1">OpenRouter API Key</label>
            <div className="relative">
              <input
                type={visibleKeys.openrouter ? 'text' : 'password'}
                placeholder="sk-or-..."
                value={settings.openrouter.apiKey}
                onChange={(e) =>
                  onUpdate({ openrouter: { ...settings.openrouter, apiKey: e.target.value } })
                }
                className="w-full px-3 py-2 pr-9 rounded-lg bg-neutral-800/80 border border-neutral-700 focus:border-blue-500 focus:outline-none text-neutral-200"
              />
              <button
                type="button"
                onClick={() => toggleVisibility('openrouter')}
                className="absolute right-2.5 top-2.5 text-neutral-400 hover:text-neutral-200"
              >
                {visibleKeys.openrouter ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-neutral-400 mb-1">Model Name</label>
            <input
              type="text"
              placeholder="anthropic/claude-3.5-sonnet"
              value={settings.openrouter.model}
              onChange={(e) =>
                onUpdate({ openrouter: { ...settings.openrouter, model: e.target.value } })
              }
              className="w-full px-3 py-2 rounded-lg bg-neutral-800/80 border border-neutral-700 focus:border-blue-500 focus:outline-none text-neutral-200"
            />
          </div>
        </div>
      </div>

      {/* 9. Cloudflare Workers AI & AI Gateway */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg bg-orange-500/20 text-orange-400 flex items-center justify-center font-bold text-xs">
              CF
            </div>
            <div>
              <h3 className="font-semibold text-sm text-neutral-100">Cloudflare Workers AI & Gateway</h3>
              <p className="text-xs text-neutral-400">Serverless Whisper (@cf/openai/whisper) & Llama 3.3 at the edge</p>
            </div>
          </div>
          <button
            onClick={() => runTest('cloudflare')}
            disabled={testingProvider === 'cloudflare' || !settings.cloudflare.accountId || !settings.cloudflare.apiToken}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-neutral-800 hover:bg-neutral-700 text-neutral-200 flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            {testingProvider === 'cloudflare' ? <Loader2 size={13} className="animate-spin" /> : null}
            Test Connection
          </button>
        </div>

        {testResults.cloudflare && (
          <div
            className={`p-2.5 rounded-lg text-xs flex items-center gap-2 ${
              testResults.cloudflare.success
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
            }`}
          >
            {testResults.cloudflare.success ? <Check size={14} /> : <AlertCircle size={14} />}
            <span>{testResults.cloudflare.message}</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <label className="block text-neutral-400 mb-1">Account ID</label>
            <input
              type="text"
              placeholder="e.g. 1a2b3c4d5e6f7g8h9i0j..."
              value={settings.cloudflare.accountId}
              onChange={(e) =>
                onUpdate({ cloudflare: { ...settings.cloudflare, accountId: e.target.value } })
              }
              className="w-full px-3 py-2 rounded-lg bg-neutral-800/80 border border-neutral-700 focus:border-blue-500 focus:outline-none text-neutral-200 font-mono"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-neutral-400">API Token</label>
              <button
                type="button"
                onClick={() => toggleVisibility('cloudflare')}
                className="text-neutral-500 hover:text-neutral-300"
              >
                {visibleKeys['cloudflare'] ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            </div>
            <input
              type={visibleKeys['cloudflare'] ? 'text' : 'password'}
              placeholder="Workers AI token"
              value={settings.cloudflare.apiToken}
              onChange={(e) =>
                onUpdate({ cloudflare: { ...settings.cloudflare, apiToken: e.target.value } })
              }
              className="w-full px-3 py-2 rounded-lg bg-neutral-800/80 border border-neutral-700 focus:border-blue-500 focus:outline-none text-neutral-200 font-mono"
            />
          </div>

          <div>
            <label className="block text-neutral-400 mb-1">STT Model (Whisper)</label>
            <input
              type="text"
              placeholder="@cf/openai/whisper"
              value={settings.cloudflare.sttModel}
              onChange={(e) =>
                onUpdate({ cloudflare: { ...settings.cloudflare, sttModel: e.target.value } })
              }
              className="w-full px-3 py-2 rounded-lg bg-neutral-800/80 border border-neutral-700 focus:border-blue-500 focus:outline-none text-neutral-200 font-mono"
            />
          </div>

          <div>
            <label className="block text-neutral-400 mb-1">LLM Model</label>
            <input
              type="text"
              placeholder="@cf/meta/llama-3.3-70b-instruct"
              value={settings.cloudflare.llmModel}
              onChange={(e) =>
                onUpdate({ cloudflare: { ...settings.cloudflare, llmModel: e.target.value } })
              }
              className="w-full px-3 py-2 rounded-lg bg-neutral-800/80 border border-neutral-700 focus:border-blue-500 focus:outline-none text-neutral-200 font-mono"
            />
          </div>

          <div className="col-span-2">
            <label className="block text-neutral-400 mb-1">Cloudflare AI Gateway URL (Optional)</label>
            <input
              type="text"
              placeholder="https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id}"
              value={settings.cloudflare.gatewayUrl || ''}
              onChange={(e) =>
                onUpdate({ cloudflare: { ...settings.cloudflare, gatewayUrl: e.target.value } })
              }
              className="w-full px-3 py-2 rounded-lg bg-neutral-800/80 border border-neutral-700 focus:border-blue-500 focus:outline-none text-neutral-200 font-mono"
            />
          </div>
        </div>
      </div>

      {/* 10. Custom OpenAI-Compatible Server (Ollama, vLLM, LM Studio, etc.) */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg bg-neutral-700 text-neutral-200 flex items-center justify-center font-bold text-xs">
              ⚡️
            </div>
            <div>
              <h3 className="font-semibold text-sm text-neutral-100">Custom / Local Server</h3>
              <p className="text-xs text-neutral-400">Ollama, LM Studio, vLLM, Together AI, or local Whisper server</p>
            </div>
          </div>
          <button
            onClick={() => runTest('custom')}
            disabled={testingProvider === 'custom' || !settings.custom.baseUrl}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-neutral-800 hover:bg-neutral-700 text-neutral-200 flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            {testingProvider === 'custom' ? <Loader2 size={13} className="animate-spin" /> : null}
            Test Connection
          </button>
        </div>

        {testResults.custom && (
          <div
            className={`p-2.5 rounded-lg text-xs flex items-center gap-2 ${
              testResults.custom.success
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
            }`}
          >
            {testResults.custom.success ? <Check size={14} /> : <AlertCircle size={14} />}
            <span>{testResults.custom.message}</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="col-span-2">
            <label className="block text-neutral-400 mb-1">Server Base URL</label>
            <input
              type="text"
              placeholder="http://localhost:11434/v1"
              value={settings.custom.baseUrl}
              onChange={(e) =>
                onUpdate({ custom: { ...settings.custom, baseUrl: e.target.value } })
              }
              className="w-full px-3 py-2 rounded-lg bg-neutral-800/80 border border-neutral-700 focus:border-blue-500 focus:outline-none text-neutral-200 font-mono"
            />
          </div>

          <div className="col-span-2">
            <label className="block text-neutral-400 mb-1">API Key (Optional)</label>
            <input
              type="password"
              placeholder="Optional Bearer token"
              value={settings.custom.apiKey}
              onChange={(e) =>
                onUpdate({ custom: { ...settings.custom, apiKey: e.target.value } })
              }
              className="w-full px-3 py-2 rounded-lg bg-neutral-800/80 border border-neutral-700 focus:border-blue-500 focus:outline-none text-neutral-200"
            />
          </div>

          <div>
            <label className="block text-neutral-400 mb-1">STT Model Name</label>
            <input
              type="text"
              placeholder="whisper"
              value={settings.custom.sttModel}
              onChange={(e) =>
                onUpdate({ custom: { ...settings.custom, sttModel: e.target.value } })
              }
              className="w-full px-3 py-2 rounded-lg bg-neutral-800/80 border border-neutral-700 focus:border-blue-500 focus:outline-none text-neutral-200"
            />
          </div>

          <div>
            <label className="block text-neutral-400 mb-1">LLM Model Name</label>
            <input
              type="text"
              placeholder="llama3"
              value={settings.custom.llmModel}
              onChange={(e) =>
                onUpdate({ custom: { ...settings.custom, llmModel: e.target.value } })
              }
              className="w-full px-3 py-2 rounded-lg bg-neutral-800/80 border border-neutral-700 focus:border-blue-500 focus:outline-none text-neutral-200"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
