import React, { useState } from 'react';
import { Plus, Trash2, Edit2, Check, Sparkles, AlertCircle } from 'lucide-react';
import { AppSettings, PromptPreset } from '../../electron/providers/types';

interface PromptsManagerProps {
  settings: AppSettings;
  onUpdate: (partial: Partial<AppSettings>) => void;
}

export const PromptsManager: React.FC<PromptsManagerProps> = ({ settings, onUpdate }) => {
  const [editingPreset, setEditingPreset] = useState<PromptPreset | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formPrompt, setFormPrompt] = useState('');

  const startCreate = () => {
    setFormName('');
    setFormDesc('');
    setFormPrompt('');
    setIsCreating(true);
    setEditingPreset(null);
  };

  const startEdit = (preset: PromptPreset) => {
    setFormName(preset.name);
    setFormDesc(preset.description);
    setFormPrompt(preset.systemPrompt);
    setEditingPreset(preset);
    setIsCreating(false);
  };

  const cancelForm = () => {
    setIsCreating(false);
    setEditingPreset(null);
  };

  const savePreset = () => {
    if (!formName.trim()) return;

    if (isCreating) {
      const newPreset: PromptPreset = {
        id: `custom_${Date.now()}`,
        name: formName.trim(),
        description: formDesc.trim() || 'Custom prompt preset',
        systemPrompt: formPrompt.trim(),
        isBuiltIn: false,
      };
      onUpdate({ presets: [...settings.presets, newPreset] });
    } else if (editingPreset) {
      const updated = settings.presets.map((p) =>
        p.id === editingPreset.id
          ? {
              ...p,
              name: formName.trim(),
              description: formDesc.trim(),
              systemPrompt: formPrompt.trim(),
            }
          : p
      );
      onUpdate({ presets: updated });
    }

    cancelForm();
  };

  const deletePreset = (id: string) => {
    const updated = settings.presets.filter((p) => p.id !== id);
    let newActive = settings.activePresetId;
    if (newActive === id) {
      newActive = updated[0]?.id || 'clean';
    }
    onUpdate({ presets: updated, activePresetId: newActive });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-sm text-neutral-100">Prompt Presets & Transformations</h3>
          <p className="text-xs text-neutral-400">
            Define system instructions for how LLMs format, clean, or transform your speech.
          </p>
        </div>
        {!isCreating && !editingPreset && (
          <button
            onClick={startCreate}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white flex items-center gap-1.5 transition-colors"
          >
            <Plus size={14} />
            New Preset
          </button>
        )}
      </div>

      {/* Editor Modal / Card */}
      {(isCreating || editingPreset) && (
        <div className="bg-neutral-900 border border-neutral-700 rounded-xl p-5 space-y-4 animate-fade-in">
          <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
            <h4 className="font-semibold text-sm text-neutral-100 flex items-center gap-2">
              <Sparkles size={16} className="text-purple-400" />
              {isCreating ? 'Create New Preset' : `Edit "${editingPreset?.name}"`}
            </h4>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <label className="block text-neutral-400 mb-1">Preset Name</label>
              <input
                type="text"
                placeholder="e.g. Slack Message, Spanish Translation, Sales Pitch"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 focus:border-blue-500 focus:outline-none text-neutral-100"
              />
            </div>

            <div>
              <label className="block text-neutral-400 mb-1">Brief Description</label>
              <input
                type="text"
                placeholder="What this preset does..."
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 focus:border-blue-500 focus:outline-none text-neutral-100"
              />
            </div>

            <div>
              <label className="block text-neutral-400 mb-1">System Instructions (Prompt)</label>
              <textarea
                rows={6}
                placeholder="You are an assistant... Format the user dictation as..."
                value={formPrompt}
                onChange={(e) => setFormPrompt(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 focus:border-blue-500 focus:outline-none text-neutral-100 font-mono text-[11px]"
              />
              <p className="text-[11px] text-neutral-500 mt-1">
                Tip: Instruct the model to output ONLY the final text without preambles or chat conversational replies.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              onClick={cancelForm}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-neutral-400 hover:text-neutral-200"
            >
              Cancel
            </button>
            <button
              onClick={savePreset}
              disabled={!formName.trim()}
              className="px-4 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50"
            >
              Save Preset
            </button>
          </div>
        </div>
      )}

      {/* Preset List */}
      <div className="grid grid-cols-1 gap-3">
        {settings.presets.map((preset) => {
          const isActive = settings.activePresetId === preset.id;
          return (
            <div
              key={preset.id}
              className={`p-4 rounded-xl border transition-all ${
                isActive
                  ? 'border-emerald-500/50 bg-emerald-500/5'
                  : 'border-neutral-800 bg-neutral-900/60 hover:border-neutral-700'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-neutral-100">{preset.name}</span>
                    {preset.isBuiltIn && (
                      <span className="px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 text-[10px]">
                        Built-in
                      </span>
                    )}
                    {isActive && (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-semibold flex items-center gap-1">
                        <Check size={10} /> Active
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-neutral-400">{preset.description}</p>
                  {preset.systemPrompt && (
                    <div className="mt-2 text-[11px] font-mono bg-neutral-950/60 p-2.5 rounded-lg text-neutral-400 border border-neutral-800/80 whitespace-pre-wrap max-h-24 overflow-y-auto">
                      {preset.systemPrompt}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {!isActive && (
                    <button
                      onClick={() => onUpdate({ activePresetId: preset.id })}
                      className="px-2.5 py-1 rounded-lg text-xs bg-neutral-800 hover:bg-neutral-700 text-neutral-200 transition-colors"
                    >
                      Use
                    </button>
                  )}
                  <button
                    onClick={() => startEdit(preset)}
                    className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
                    title="Edit Preset"
                  >
                    <Edit2 size={13} />
                  </button>
                  {!preset.isBuiltIn && (
                    <button
                      onClick={() => deletePreset(preset.id)}
                      className="p-1.5 rounded-lg text-neutral-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                      title="Delete Preset"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
