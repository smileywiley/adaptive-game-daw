import React from 'react';
import { FilePlus2, Sparkles, X } from 'lucide-react';
import { MOOD_PRESETS } from '../presets/moodPresets';
import { useDawStore } from '../store/useDawStore';
import { pitchClassName, SCALES } from '../theory/musicTheory';

export const MoodPresetModal: React.FC = () => {
  const isOpen = useDawStore((s) => s.presetModalOpen);
  const currentPresetId = useDawStore((s) => s.project.presetId);
  const setPresetModalOpen = useDawStore((s) => s.setPresetModalOpen);
  const loadMoodPreset = useDawStore((s) => s.loadMoodPreset);
  const createBlankSong = useDawStore((s) => s.createBlankSong);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl max-w-4xl w-full max-h-[88vh] flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-5 h-5 text-amber-400" />
            <div>
              <h2 className="text-base font-bold text-zinc-100">
                Quick-Start Mood &amp; Progression Pack
              </h2>
              <p className="text-xs text-zinc-400">
                Pick a game vibe — sets key, scale, BPM, chords, instruments &amp; starter stems in 1 click.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={createBlankSong}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 text-xs font-semibold text-zinc-100 transition cursor-pointer"
              title="Start from scratch with 0 notes across all 5 stems"
            >
              <FilePlus2 className="w-3.5 h-3.5 text-cyan-400" />
              Start Blank Song
            </button>
            <button
              onClick={() => setPresetModalOpen(false)}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-3.5 overflow-y-auto">
          {MOOD_PRESETS.map((preset) => {
            const active = preset.id === currentPresetId;
            const scale = SCALES[preset.scaleId];
            return (
              <button
                key={preset.id}
                onClick={() => loadMoodPreset(preset.id)}
                className={`text-left p-4 rounded-xl border transition group cursor-pointer ${
                  active
                    ? 'bg-zinc-800/90 border-amber-500/70 ring-1 ring-amber-500/30'
                    : 'bg-zinc-950/70 border-zinc-800 hover:border-zinc-600 hover:bg-zinc-900'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div>
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-zinc-400">
                      {preset.gameGenre}
                    </span>
                    <h3 className="text-sm font-bold text-zinc-100 group-hover:text-amber-300 transition">
                      {preset.name}
                    </h3>
                  </div>
                  <span
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0"
                    style={{
                      color: preset.accentColor,
                      borderColor: `${preset.accentColor}55`,
                      backgroundColor: `${preset.accentColor}15`,
                    }}
                  >
                    {preset.vibeBadge}
                  </span>
                </div>

                <p className="text-xs text-zinc-400 mb-3 leading-relaxed">{preset.subtitle}</p>

                <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono">
                  <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-amber-300">
                    {preset.bpm} BPM
                  </span>
                  <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300">
                    {preset.timeSignature}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-cyan-300">
                    {pitchClassName(preset.root)} {scale.name}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-emerald-300">
                    {preset.progressionLabel}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
