import React, { useEffect, useState } from 'react';
import {
  Sliders,
  KeyRound,
  Layers,
  Sparkles,
  History,
  Mic,
  Save,
  Check,
  Zap,
} from 'lucide-react';
import { AppSettings, DEFAULT_SETTINGS } from '../../electron/providers/types';
import { GeneralSettings } from './GeneralSettings';
import { ProviderConfig } from './ProviderConfig';
import { PipelineConfig } from './PipelineConfig';
import { PromptsManager } from './PromptsManager';
import { HistoryView } from './HistoryView';

export const Settings: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [activeTab, setActiveTab] = useState<'general' | 'providers' | 'pipeline' | 'prompts' | 'history'>('general');
  const [savedBadge, setSavedBadge] = useState(false);

  useEffect(() => {
    if (!window.electronAPI) return;

    window.electronAPI.getSettings().then((s) => {
      setSettings(s);
    });

    // Listen for tab switch requests from Tray menu
    (window as any).ipcRenderer?.on?.('switch-tab', (_event: any, tab: any) => {
      if (tab) setActiveTab(tab);
    });
  }, []);

  const handleUpdate = async (partial: Partial<AppSettings>) => {
    if (!settings || !window.electronAPI) return;
    const updated = await window.electronAPI.updateSettings(partial);
    setSettings(updated);
    setSavedBadge(true);
    setTimeout(() => setSavedBadge(false), 1200);
  };

  if (!settings) {
    return (
      <div className="flex items-center justify-center h-screen bg-neutral-950 text-neutral-400">
        Loading OpenHandy...
      </div>
    );
  }

  const navItems = [
    { id: 'general', label: 'General & Hotkeys', icon: Sliders },
    { id: 'providers', label: 'API Keys & Providers', icon: KeyRound },
    { id: 'pipeline', label: 'Pipeline & Models', icon: Layers },
    { id: 'prompts', label: 'Prompt Presets', icon: Sparkles },
    { id: 'history', label: 'Dictation History', icon: History },
  ] as const;

  return (
    <div className="flex h-screen bg-neutral-950 text-neutral-100 select-none overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 bg-neutral-900/70 border-r border-neutral-800/80 flex flex-col justify-between p-3 shrink-0">
        <div className="space-y-4">
          {/* Logo / Title */}
          <div className="flex items-center gap-2.5 px-3 pt-2">
            <div className="h-8 w-8 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 text-white flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Mic size={18} strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="font-bold text-sm tracking-tight text-white">OpenHandy</h1>
              <span className="text-[10px] text-neutral-400">Speech-to-Text & AI</span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/60'
                  }`}
                >
                  <Icon size={15} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Footer info & saved indicator */}
        <div className="px-3 py-2 border-t border-neutral-800/80 flex items-center justify-between text-[11px] text-neutral-500">
          <span>v1.0.0</span>
          {savedBadge && (
            <span className="flex items-center gap-1 text-emerald-400 font-medium animate-fade-in">
              <Check size={12} /> Saved
            </span>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-8 max-w-3xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-white">
              {navItems.find((n) => n.id === activeTab)?.label}
            </h2>
            <p className="text-xs text-neutral-400 mt-0.5">
              {activeTab === 'general' && 'Manage keyboard shortcuts, paste behavior, and permissions.'}
              {activeTab === 'providers' && 'Configure API keys and connection parameters for each model provider.'}
              {activeTab === 'pipeline' && 'Select your active Speech-to-Text model and AI post-processing pipeline.'}
              {activeTab === 'prompts' && 'Customize prompts to polish, summarize, or reformat your speech.'}
              {activeTab === 'history' && 'Search and copy previous dictations.'}
            </p>
          </div>

          {savedBadge && (
            <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-medium flex items-center gap-1">
              <Check size={12} /> Settings Updated
            </span>
          )}
        </div>

        {activeTab === 'general' && (
          <GeneralSettings settings={settings} onUpdate={handleUpdate} />
        )}
        {activeTab === 'providers' && (
          <ProviderConfig settings={settings} onUpdate={handleUpdate} />
        )}
        {activeTab === 'pipeline' && (
          <PipelineConfig settings={settings} onUpdate={handleUpdate} />
        )}
        {activeTab === 'prompts' && (
          <PromptsManager settings={settings} onUpdate={handleUpdate} />
        )}
        {activeTab === 'history' && <HistoryView />}
      </main>
    </div>
  );
};
