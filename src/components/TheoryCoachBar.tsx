import React from 'react';
import { GraduationCap } from 'lucide-react';
import { useDawStore } from '../store/useDawStore';
import { STEM_COACHING_TIPS } from '../theory/musicTheory';

export const TheoryCoachBar: React.FC = () => {
  const activeStemId = useDawStore((s) => s.activeStemId);
  const activeStem = useDawStore((s) => s.getActiveSection().stems[s.activeStemId]);
  const coach = STEM_COACHING_TIPS[activeStemId];

  return (
    <div className="px-3 py-1.5 bg-zinc-950/90 border-b border-zinc-800/80 flex flex-wrap items-center justify-between gap-2 text-[11px] select-none">
      <div className="flex items-center gap-2 min-w-0">
        <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 font-semibold shrink-0">
          <GraduationCap className="w-3.5 h-3.5" />
          Theory Coach
        </span>
        <span className="font-semibold text-zinc-200 shrink-0">{coach.title}:</span>
        <span className="text-zinc-400 truncate">{coach.tip}</span>
      </div>

      {!activeStem.isDrum && (
        <div className="flex items-center gap-3 shrink-0 text-[10px] text-zinc-400">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-400/80 inline-block" />
            Gold (R/3/5) = Chord Anchor
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-cyan-500/45 border border-cyan-400/50 inline-block" />
            Teal = Safe Scale Note
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-zinc-900 border border-zinc-700 inline-block" />
            Dim = Out of Scale
          </span>
        </div>
      )}
    </div>
  );
};
