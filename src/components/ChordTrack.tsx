import React, { useState } from 'react';
import { RefreshCw, Volume2 } from 'lucide-react';
import { useDawStore } from '../store/useDawStore';
import {
  ChordOption,
  formatChordName,
  getCadenceSuggestions,
  getChordMidiVoicing,
  getScaleChordOptions,
} from '../theory/musicTheory';
import { audioEngine } from '../audio/audioEngine';

interface ChordTrackProps {
  keyGutterWidth: number;
  barWidthPx: number;
  scrollLeft: number;
}

const TENSION_STYLES = {
  low: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  medium: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
  high: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
};

export const ChordTrack: React.FC<ChordTrackProps> = ({
  keyGutterWidth,
  barWidthPx,
  scrollLeft,
}) => {
  const section = useDawStore((s) => s.getActiveSection());
  const setBarChord = useDawStore((s) => s.setBarChord);
  const [editingBar, setEditingBar] = useState<number | null>(null);
  const [showCadenceHelper, setShowCadenceHelper] = useState(false);

  const chordOptions = getScaleChordOptions(section.root, section.scaleId);
  const cadenceOptions = getCadenceSuggestions(section.root, section.scaleId);
  const padStem = section.stems['01_Ambient_Pad'];

  const audition = (opt: Pick<ChordOption, 'root' | 'quality'>) => {
    const midis = getChordMidiVoicing(opt, 3);
    void audioEngine.auditionChord(padStem.id, padStem.instrumentId, midis, 0.7);
  };

  const applyChord = (bar: number, opt: ChordOption) => {
    setBarChord(bar, {
      root: opt.root,
      quality: opt.quality,
      romanNumeral: opt.romanNumeral,
      tensionLevel: opt.tensionLevel,
      vibeLabel: opt.vibeLabel,
    });
    audition(opt);
    setEditingBar(null);
    setShowCadenceHelper(false);
  };

  const lastBarIdx = section.bars - 1;

  return (
    <div className="relative bg-zinc-900 border-b border-zinc-800 flex items-stretch h-14 select-none">
      {/* Left Gutter Label */}
      <div
        style={{ width: keyGutterWidth }}
        className="shrink-0 border-r border-zinc-800 px-2 flex flex-col justify-center bg-zinc-950/90"
      >
        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
          Chords
        </span>
        <span className="text-[9px] text-zinc-500">Click bar to edit</span>
      </div>

      {/* Scroll-synced Bar Cells */}
      <div className="flex-1 overflow-hidden relative">
        <div
          className="flex h-full"
          style={{
            transform: `translateX(${-scrollLeft}px)`,
            width: section.bars * barWidthPx,
          }}
        >
          {section.chords.slice(0, section.bars).map((chord) => {
            const isLastBar = chord.bar === lastBarIdx;
            const isSelected = editingBar === chord.bar;

            return (
              <div
                key={chord.bar}
                style={{ width: barWidthPx }}
                onClick={() => {
                  setShowCadenceHelper(false);
                  setEditingBar(isSelected ? null : chord.bar);
                  audition(chord);
                }}
                className={`shrink-0 h-full border-r border-zinc-800 px-2.5 py-1 flex flex-col justify-between cursor-pointer transition ${
                  isSelected
                    ? 'bg-amber-500/15 ring-1 ring-inset ring-amber-400/70'
                    : 'hover:bg-zinc-800/70'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono text-zinc-500">B{chord.bar + 1}</span>
                    <span className="text-sm font-bold text-zinc-100">
                      {formatChordName(chord)}
                    </span>
                    <span className="text-[11px] font-mono font-semibold text-amber-300">
                      {chord.romanNumeral}
                    </span>
                  </div>

                  {isLastBar ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingBar(null);
                        setShowCadenceHelper(!showCadenceHelper);
                      }}
                      className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-500/20 hover:bg-rose-500/35 border border-rose-500/40 text-rose-200 text-[9px] font-semibold cursor-pointer"
                      title="Final-Bar Cadence / Turnaround Helper: smoothly pull the loop back to Bar 1"
                    >
                      <RefreshCw className="w-2.5 h-2.5" />
                      Turnaround
                    </button>
                  ) : (
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded-full border ${TENSION_STYLES[chord.tensionLevel]}`}
                    >
                      {chord.tensionLevel === 'low'
                        ? 'Stable'
                        : chord.tensionLevel === 'medium'
                          ? 'Moving'
                          : 'Tense'}
                    </span>
                  )}
                </div>

                <div className="text-[10px] text-zinc-400 truncate">{chord.vibeLabel}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Diatonic & Borrowed Chord Picker Popover */}
      {editingBar !== null && (
        <div
          className="absolute top-14 left-20 z-40 w-[440px] max-w-[92vw] bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl p-3"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-2">
            <div>
              <h4 className="text-xs font-bold text-zinc-100">
                Choose Chord for Bar {editingBar + 1}
              </h4>
              <p className="text-[10px] text-zinc-400">
                All diatonic chords stay in-key. Click to hear &amp; apply.
              </p>
            </div>
            <button
              onClick={() => setEditingBar(null)}
              className="text-[11px] text-zinc-400 hover:text-zinc-100 px-2 py-0.5 rounded bg-zinc-800 cursor-pointer"
            >
              Done
            </button>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            {chordOptions.map((opt, idx) => (
              <button
                key={`${opt.romanNumeral}_${idx}`}
                onClick={() => applyChord(editingBar, opt)}
                className="text-left p-2 rounded-lg bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 hover:border-amber-500/60 transition cursor-pointer group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-100 group-hover:text-amber-300">
                    {formatChordName(opt)}
                  </span>
                  <span className="text-[11px] font-mono text-amber-400">{opt.romanNumeral}</span>
                </div>
                <div className="text-[10px] text-zinc-400 truncate mt-0.5">{opt.vibeLabel}</div>
                {opt.isBorrowed && (
                  <span className="inline-block mt-1 text-[9px] px-1 py-0.2 rounded bg-purple-500/20 text-purple-300">
                    Color / Borrowed
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Final-Bar Cadence / Turnaround Helper Popover */}
      {showCadenceHelper && (
        <div
          className="absolute top-14 right-4 z-40 w-80 bg-zinc-900 border border-rose-500/50 rounded-xl shadow-2xl p-3"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-2">
            <div>
              <h4 className="text-xs font-bold text-rose-200">
                Final-Bar Turnaround Helper (Bar {lastBarIdx + 1})
              </h4>
              <p className="text-[10px] text-zinc-400">
                Pick how your loop resolves back into Bar 1:
              </p>
            </div>
            <button
              onClick={() => setShowCadenceHelper(false)}
              className="text-[10px] text-zinc-400 hover:text-zinc-100 cursor-pointer"
            >
              ✕
            </button>
          </div>

          <div className="space-y-1.5">
            {cadenceOptions.map((opt, idx) => (
              <button
                key={`${opt.romanNumeral}_${idx}`}
                onClick={() => applyChord(lastBarIdx, opt)}
                className="w-full flex items-center justify-between p-2 rounded-lg bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 hover:border-rose-400/60 transition cursor-pointer"
              >
                <div className="text-left">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-zinc-100">
                      {formatChordName(opt)}
                    </span>
                    <span className="text-xs font-mono text-amber-300">{opt.romanNumeral}</span>
                  </div>
                  <div className="text-[10px] text-zinc-400">{opt.vibeLabel}</div>
                </div>
                <Volume2 className="w-3.5 h-3.5 text-zinc-500" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
