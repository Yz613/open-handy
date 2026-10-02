import React from 'react';
import { Mic, Sparkles, Layers, Sliders } from 'lucide-react';
import { AppSettings, STTProviderId, LLMProviderId } from '../../electron/providers/types';

interface PipelineConfigProps {
  settings: AppSettings;
  onUpdate: (partial: Partial<AppSettings>) => void;
}

export const PipelineConfig: React.FC<PipelineConfigProps> = ({ settings, onUpdate }) => {
  const sttProviders: { id: STTProviderId; name: string; desc: string; badge?: string }[] = [
    { id: 'groq', name: 'Groq Whisper', desc: 'Whisper Large v3/Turbo — Sub-second transcription', badge: 'Ultra Fast' },
    { id: 'azure', name: 'Microsoft Azure OpenAI', desc: 'Enterprise Whisper deployment' },
    { id: 'vercel', name: 'Vercel AI Gateway', desc: 'Microsoft MAI Transcribe 2' },
    { id: 'openai', name: 'OpenAI Whisper', desc: 'Official OpenAI whisper-1 model' },
    { id: 'gemini', name: 'Google Gemini Audio', desc: 'Gemini 2.0 Flash multimodal audio ingestion' },
    { id: 'deepgram', name: 'Deepgram Nova', desc: 'Nova-2 / Nova-3 dedicated speech model' },
    { id: 'cloudflare', name: 'Cloudflare Workers AI', desc: 'Serverless Whisper on Cloudflare edge', badge: 'Serverless' },
    { id: 'custom', name: 'Custom / Local Server', desc: 'Local Whisper, vLLM, or self-hosted endpoint' },
  ];

  const llmProviders: { id: LLMProviderId; name: string; desc: string }[] = [
    { id: 'none', name: 'None (Raw Transcript Only)', desc: 'Directly output transcribed speech without AI modification' },
    { id: 'azure', name: 'Microsoft Azure OpenAI', desc: 'Azure GPT-4o / GPT-4o-mini' },
    { id: 'vercel', name: 'Vercel AI Gateway', desc: 'Vercel routed models (e.g. openai/gpt-4o)' },
    { id: 'groq', name: 'Groq Llama 3.3', desc: 'Near-instant text cleanup with Llama 3.3 70B' },
    { id: 'openai', name: 'OpenAI GPT-4o', desc: 'GPT-4o / GPT-4o-mini' },
    { id: 'anthropic', name: 'Anthropic Claude', desc: 'Claude 3.5 Sonnet / Claude 3.5 Haiku' },
    { id: 'gemini', name: 'Google Gemini', desc: 'Gemini 2.0 Flash' },
    { id: 'openrouter', name: 'OpenRouter', desc: 'Any model via OpenRouter' },
    { id: 'cloudflare', name: 'Cloudflare Workers AI', desc: 'Serverless Llama 3.3 on Cloudflare edge' },
    { id: 'custom', name: 'Custom / Local Server', desc: 'Local Ollama, LM Studio, or custom endpoint' },
  ];

  return (
    <div className="space-y-6">
      {/* 1. Speech to Text Selection */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Mic size={18} className="text-blue-400" />
          <h3 className="font-semibold text-sm text-neutral-100">1. Speech-to-Text (STT) Provider</h3>
        </div>
        <p className="text-xs text-neutral-400">
          This model converts your spoken audio into text. Groq is recommended for instantaneous speed.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1">
          {sttProviders.map((p) => {
            const isSelected = settings.activeSttProvider === p.id;
            return (
              <div
                key={p.id}
                onClick={() => onUpdate({ activeSttProvider: p.id })}
                className={`p-3 rounded-lg border cursor-pointer transition-all ${
                  isSelected
                    ? 'border-blue-500 bg-blue-500/10 text-neutral-100 ring-1 ring-blue-500/30'
                    : 'border-neutral-800 bg-neutral-800/40 hover:bg-neutral-800/80 text-neutral-300'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-xs text-neutral-100">{p.name}</span>
                  {p.badge && (
                    <span className="px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400 text-[10px] font-semibold">
                      {p.badge}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-neutral-400">{p.desc}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. LLM Post-Processing Selection */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-purple-400" />
          <h3 className="font-semibold text-sm text-neutral-100">2. AI Post-Processing & Cleanup (Optional)</h3>
        </div>
        <p className="text-xs text-neutral-400">
          Optionally pipes the transcript through an LLM to clean filler words (um, uh, like), fix grammar, format emails, or run custom prompts.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1">
          {llmProviders.map((p) => {
            const isSelected = settings.activeLlmProvider === p.id;
            return (
              <div
                key={p.id}
                onClick={() => onUpdate({ activeLlmProvider: p.id })}
                className={`p-3 rounded-lg border cursor-pointer transition-all ${
                  isSelected
                    ? 'border-purple-500 bg-purple-500/10 text-neutral-100 ring-1 ring-purple-500/30'
                    : 'border-neutral-800 bg-neutral-800/40 hover:bg-neutral-800/80 text-neutral-300'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-xs text-neutral-100">{p.name}</span>
                  {p.id === 'none' && (
                    <span className="px-1.5 py-0.5 rounded bg-neutral-700 text-neutral-300 text-[10px]">
                      Raw
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-neutral-400">{p.desc}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Active Preset Selection */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Layers size={18} className="text-emerald-400" />
          <h3 className="font-semibold text-sm text-neutral-100">3. Default Prompt Preset</h3>
        </div>
        <p className="text-xs text-neutral-400">
          The style and transformation applied to your dictated text when AI Post-Processing is active.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 pt-1">
          {settings.presets.map((preset) => {
            const isSelected = settings.activePresetId === preset.id;
            return (
              <div
                key={preset.id}
                onClick={() => onUpdate({ activePresetId: preset.id })}
                className={`p-3 rounded-lg border cursor-pointer transition-all ${
                  isSelected
                    ? 'border-emerald-500 bg-emerald-500/10 text-neutral-100 ring-1 ring-emerald-500/30'
                    : 'border-neutral-800 bg-neutral-800/40 hover:bg-neutral-800/80 text-neutral-300'
                }`}
              >
                <div className="font-medium text-xs text-neutral-100 mb-1">{preset.name}</div>
                <p className="text-[11px] text-neutral-400 line-clamp-2">{preset.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
