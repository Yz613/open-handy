import React, { useState } from 'react';
import { Gauge, Clock, FileText, Zap, TrendingUp, RotateCcw, Sparkles } from 'lucide-react';
import { UsageStats } from '../../electron/providers/types';

interface UsageMeterProps {
  stats: UsageStats;
  onReset?: () => void;
  compact?: boolean;
}

export const UsageMeter: React.FC<UsageMeterProps> = ({ stats, onReset, compact = false }) => {
  const [showConfirmReset, setShowConfirmReset] = useState(false);

  const formatAudioTime = (seconds: number) => {
    if (!seconds || seconds <= 0) return '0s';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hrs > 0) {
      return `${hrs}h ${mins}m ${secs}s`;
    }
    if (mins > 0) {
      return `${mins}m ${secs}s`;
    }
    return `${secs}s`;
  };

  const avgSeconds = stats.totalDictations > 0
    ? (stats.totalSeconds / stats.totalDictations).toFixed(1)
    : '0';

  const avgWords = stats.totalDictations > 0
    ? Math.round(stats.totalWords / stats.totalDictations)
    : 0;

  // Milestone calculation: 10m, 30m, 1h (60m), 2h (120m), 5h (300m), 10h (600m), 50h
  const milestonesMinutes = [10, 30, 60, 120, 300, 600, 3000];
  const currentTotalMins = stats.totalSeconds / 60;
  const nextMilestoneMins = milestonesMinutes.find((m) => m > currentTotalMins) || (Math.ceil(currentTotalMins / 60) + 1) * 60;
  const prevMilestoneMins = [...milestonesMinutes].reverse().find((m) => m <= currentTotalMins) || 0;
  const milestoneProgress = Math.min(
    100,
    Math.max(0, Math.round(((currentTotalMins - prevMilestoneMins) / (nextMilestoneMins - prevMilestoneMins)) * 100))
  );

  const providerEntries = Object.entries(stats.byProvider || {}).filter(
    ([, prov]) => prov.seconds > 0 || prov.dictations > 0
  );

  const getProviderColor = (providerName: string) => {
    switch (providerName.toLowerCase()) {
      case 'vercel':
        return 'from-blue-500 to-cyan-400';
      case 'deepgram':
        return 'from-emerald-500 to-teal-400';
      case 'groq':
        return 'from-orange-500 to-amber-400';
      case 'openai':
        return 'from-green-500 to-emerald-400';
      case 'azure':
        return 'from-sky-500 to-blue-600';
      case 'gemini':
        return 'from-purple-500 to-pink-500';
      case 'anthropic':
        return 'from-amber-600 to-orange-500';
      default:
        return 'from-neutral-500 to-neutral-400';
    }
  };

  if (compact) {
    return (
      <div className="bg-neutral-900/90 border border-neutral-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Gauge size={16} className="text-cyan-400" />
            <span className="font-semibold text-xs text-neutral-200">Usage Meter</span>
          </div>
          <span className="font-mono text-xs font-semibold text-cyan-300">
            {formatAudioTime(stats.totalSeconds)}
          </span>
        </div>

        {/* Progress bar */}
        <div className="space-y-1">
          <div className="w-full bg-neutral-800 h-2 rounded-full overflow-hidden">
            <div
              className="bg-gradient-to-r from-cyan-500 to-blue-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(5, (currentTotalMins / nextMilestoneMins) * 100))}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-neutral-400">
            <span>{stats.totalWords.toLocaleString()} words dictated</span>
            <span>Next goal: {nextMilestoneMins >= 60 ? `${nextMilestoneMins / 60}h` : `${nextMilestoneMins}m`}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
            <Gauge size={18} />
          </div>
          <div>
            <h3 className="font-semibold text-sm text-neutral-100 flex items-center gap-2">
              Transcription Usage Meter
              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                Live Stats
              </span>
            </h3>
            <p className="text-xs text-neutral-400">
              Total audio processed, words generated, and estimated typing time saved.
            </p>
          </div>
        </div>

        {onReset && (
          <div>
            {showConfirmReset ? (
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-rose-400">Reset meter?</span>
                <button
                  onClick={() => {
                    onReset();
                    setShowConfirmReset(false);
                  }}
                  className="px-2 py-1 text-[11px] rounded bg-rose-600 hover:bg-rose-500 text-white font-medium transition-colors"
                >
                  Yes, Reset
                </button>
                <button
                  onClick={() => setShowConfirmReset(false)}
                  className="px-2 py-1 text-[11px] rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowConfirmReset(true)}
                className="px-2.5 py-1.5 rounded-lg text-[11px] text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/80 border border-neutral-800 flex items-center gap-1.5 transition-colors"
                title="Reset usage counter"
              >
                <RotateCcw size={12} />
                <span>Reset Meter</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Primary Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Metric 1: Audio Transcribed */}
        <div className="p-3.5 rounded-xl bg-neutral-950/70 border border-neutral-800/80 space-y-1">
          <div className="flex items-center justify-between text-neutral-400">
            <span className="text-[11px] font-medium">Audio Transcribed</span>
            <Clock size={14} className="text-cyan-400" />
          </div>
          <div className="font-mono text-xl font-bold tracking-tight text-cyan-300">
            {formatAudioTime(stats.totalSeconds)}
          </div>
          <div className="text-[10px] text-neutral-400">
            {stats.totalSeconds.toLocaleString()} seconds total
          </div>
        </div>

        {/* Metric 2: Total Words */}
        <div className="p-3.5 rounded-xl bg-neutral-950/70 border border-neutral-800/80 space-y-1">
          <div className="flex items-center justify-between text-neutral-400">
            <span className="text-[11px] font-medium">Words Dictated</span>
            <FileText size={14} className="text-emerald-400" />
          </div>
          <div className="font-mono text-xl font-bold tracking-tight text-emerald-300">
            {stats.totalWords.toLocaleString()}
          </div>
          <div className="text-[10px] text-neutral-400">
            {stats.totalCharacters.toLocaleString()} characters
          </div>
        </div>

        {/* Metric 3: Time Saved vs Typing */}
        <div className="p-3.5 rounded-xl bg-neutral-950/70 border border-neutral-800/80 space-y-1">
          <div className="flex items-center justify-between text-neutral-400">
            <span className="text-[11px] font-medium">Typing Time Saved</span>
            <Zap size={14} className="text-amber-400" />
          </div>
          <div className="font-mono text-xl font-bold tracking-tight text-amber-300">
            ~{stats.estimatedTypingMinutesSaved} min
          </div>
          <div className="text-[10px] text-neutral-400">
            vs 40 WPM average typing
          </div>
        </div>

        {/* Metric 4: Total Sessions */}
        <div className="p-3.5 rounded-xl bg-neutral-950/70 border border-neutral-800/80 space-y-1">
          <div className="flex items-center justify-between text-neutral-400">
            <span className="text-[11px] font-medium">Dictation Sessions</span>
            <TrendingUp size={14} className="text-purple-400" />
          </div>
          <div className="font-mono text-xl font-bold tracking-tight text-purple-300">
            {stats.totalDictations}
          </div>
          <div className="text-[10px] text-neutral-400">
            avg {avgSeconds}s ({avgWords} words)
          </div>
        </div>
      </div>

      {/* Visual Meter Bar with Next Milestone */}
      <div className="p-3.5 rounded-xl bg-neutral-950/50 border border-neutral-800/80 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 text-neutral-300 font-medium">
            <Sparkles size={13} className="text-cyan-400" />
            <span>Usage Milestone Progress</span>
          </div>
          <span className="font-mono text-[11px] text-neutral-400">
            {currentTotalMins.toFixed(1)}m / {nextMilestoneMins >= 60 ? `${(nextMilestoneMins / 60).toFixed(0)}h (${nextMilestoneMins}m)` : `${nextMilestoneMins}m`} ({milestoneProgress}%)
          </span>
        </div>

        {/* Meter Bar */}
        <div className="relative w-full bg-neutral-800/80 h-2.5 rounded-full overflow-hidden">
          <div
            className="bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-500 h-full rounded-full transition-all duration-700 ease-out shadow-sm shadow-cyan-500/40"
            style={{ width: `${Math.max(3, milestoneProgress)}%` }}
          />
        </div>

        <div className="flex justify-between text-[10px] text-neutral-400">
          <span>{prevMilestoneMins > 0 ? `${prevMilestoneMins}m milestone reached` : 'Started'}</span>
          <span>Next target: {nextMilestoneMins >= 60 ? `${nextMilestoneMins / 60}h` : `${nextMilestoneMins}m`}</span>
        </div>
      </div>

      {/* Provider Breakdown */}
      {providerEntries.length > 0 && (
        <div className="space-y-2.5 pt-1">
          <div className="flex items-center justify-between text-xs font-medium text-neutral-300">
            <span>Usage by Speech-to-Text Provider</span>
            <span className="text-[11px] text-neutral-400">{providerEntries.length} provider{providerEntries.length > 1 ? 's' : ''} used</span>
          </div>

          <div className="space-y-2">
            {providerEntries.map(([provName, provData]) => {
              const provPercentage = stats.totalSeconds > 0
                ? Math.round((provData.seconds / stats.totalSeconds) * 100)
                : 0;

              return (
                <div
                  key={provName}
                  className="p-2.5 rounded-lg bg-neutral-950/40 border border-neutral-800/60 flex flex-col gap-1.5"
                >
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold uppercase tracking-wider text-[11px] text-neutral-200">
                        {provName}
                      </span>
                      <span className="text-[11px] text-neutral-400 font-mono">
                        {formatAudioTime(provData.seconds)} ({provData.dictations} dictation{provData.dictations !== 1 ? 's' : ''})
                      </span>
                    </div>
                    <span className="font-mono text-xs text-neutral-300 font-medium">
                      {provPercentage}%
                    </span>
                  </div>

                  {/* Percentage mini-bar */}
                  <div className="w-full bg-neutral-800/80 h-1.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${getProviderColor(provName)}`}
                      style={{ width: `${Math.max(2, provPercentage)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
