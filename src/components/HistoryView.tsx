import React, { useEffect, useState } from 'react';
import { Search, Copy, Check, Trash2, Clock, FileText, ArrowRight } from 'lucide-react';
import { DictationRecord } from '../../electron/providers/types';

export const HistoryView: React.FC = () => {
  const [history, setHistory] = useState<DictationRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadHistory = async () => {
    try {
      const records = await window.electronAPI.getHistory();
      setHistory(records);
    } catch (e) {
      console.error('Failed to load history:', e);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleDelete = async (id: string) => {
    await window.electronAPI.deleteHistoryRecord(id);
    setHistory((prev) => prev.filter((item) => item.id !== id));
  };

  const handleClearAll = async () => {
    if (window.confirm('Are you sure you want to clear all dictation history?')) {
      await window.electronAPI.clearHistory();
      setHistory([]);
    }
  };

  const filteredHistory = history.filter((item) => {
    const term = searchTerm.toLowerCase();
    return (
      item.finalOutput.toLowerCase().includes(term) ||
      item.rawTranscript.toLowerCase().includes(term) ||
      item.sttProvider.toLowerCase().includes(term) ||
      item.presetName.toLowerCase().includes(term)
    );
  });

  const formatDate = (timestamp: number) => {
    const d = new Date(timestamp);
    return d.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-4">
      {/* Header and Search */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-2.5 text-neutral-400" />
          <input
            type="text"
            placeholder="Search past dictations..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg bg-neutral-900 border border-neutral-800 text-xs text-neutral-200 focus:border-blue-500 focus:outline-none"
          />
        </div>

        {history.length > 0 && (
          <button
            onClick={handleClearAll}
            className="px-3 py-2 rounded-lg text-xs font-medium text-neutral-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors flex items-center gap-1.5"
          >
            <Trash2 size={13} />
            Clear All
          </button>
        )}
      </div>

      {/* List */}
      {filteredHistory.length === 0 ? (
        <div className="py-16 text-center text-neutral-500 space-y-2">
          <FileText size={32} className="mx-auto opacity-40" />
          <p className="text-sm font-medium">No dictations recorded yet</p>
          <p className="text-xs">Press your global shortcut anywhere on your Mac to start dictating.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredHistory.map((item) => (
            <div
              key={item.id}
              className="p-4 rounded-xl bg-neutral-900/80 border border-neutral-800/80 hover:border-neutral-700 transition-all space-y-3"
            >
              {/* Meta Top Bar */}
              <div className="flex items-center justify-between text-[11px] text-neutral-400 border-b border-neutral-800 pb-2">
                <div className="flex items-center gap-2">
                  <Clock size={12} />
                  <span>{formatDate(item.timestamp)}</span>
                  <span>•</span>
                  <span>{item.durationSeconds}s audio</span>
                  <span>•</span>
                  <span>{item.wordCount} words</span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 uppercase font-mono text-[10px]">
                    {item.sttProvider}
                  </span>
                  {item.llmProvider && item.llmProvider !== 'none' && (
                    <>
                      <ArrowRight size={10} className="text-neutral-500" />
                      <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 text-[10px] font-medium">
                        {item.presetName}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Main Content */}
              <div className="text-xs text-neutral-200 leading-relaxed whitespace-pre-wrap select-text">
                {item.finalOutput}
              </div>

              {/* Raw vs Final diff if LLM modified it */}
              {item.rawTranscript !== item.finalOutput && (
                <details className="text-[11px] text-neutral-500 pt-1">
                  <summary className="cursor-pointer hover:text-neutral-400 transition-colors">
                    View raw transcription before AI polish
                  </summary>
                  <p className="mt-1.5 p-2.5 rounded bg-neutral-950/70 border border-neutral-800/80 font-mono text-[10px] text-neutral-400 select-text">
                    {item.rawTranscript}
                  </p>
                </details>
              )}

              {/* Actions Footer */}
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  onClick={() => handleCopy(item.finalOutput, item.id)}
                  className="px-2.5 py-1 rounded-lg text-xs bg-neutral-800 hover:bg-neutral-700 text-neutral-200 flex items-center gap-1.5 transition-colors"
                >
                  {copiedId === item.id ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                  <span>{copiedId === item.id ? 'Copied!' : 'Copy'}</span>
                </button>
                <button
                  onClick={() => handleDelete(item.id)}
                  className="p-1 rounded-lg text-neutral-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                  title="Delete Entry"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
