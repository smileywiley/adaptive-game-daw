import React, { useEffect, useState } from 'react';
import { Trash2, Volume2, VolumeX, Wand2 } from 'lucide-react';
import { useDawStore } from '../store/useDawStore';
import { InstrumentPresetId, STEM_ORDER } from '../types/daw';
import { INSTRUMENT_PRESETS } from '../audio/synthBank';
import {
  CustomInstrumentEntry,
  getCustomInstruments,
  subscribeCustomInstruments,
} from '../audio/customInstruments';
import { STEM_COACHING_TIPS } from '../theory/musicTheory';

export const StemSidebar: React.FC = () => {
  const project = useDawStore((s) => s.project);
  const section = useDawStore((s) => s.getActiveSection());
  const activeStemId = useDawStore((s) => s.activeStemId);
  const setActiveStem = useDawStore((s) => s.setActiveStem);
  const setStemInstrument = useDawStore((s) => s.setStemInstrument);
  const setStemVolume = useDawStore((s) => s.setStemVolume);
  const setStemIntensityRange = useDawStore((s) => s.setStemIntensityRange);
  const toggleStemMute = useDawStore((s) => s.toggleStemMute);
  const toggleStemSolo = useDawStore((s) => s.toggleStemSolo);
  const autoFillStemFromChords = useDawStore((s) => s.autoFillStemFromChords);
  const clearStemNotes = useDawStore((s) => s.clearStemNotes);

  const [applyAllStates, setApplyAllStates] = useState(false);
  const [customInstruments, setCustomInstruments] = useState<CustomInstrumentEntry[]>(() =>
    getCustomInstruments(),
  );

  useEffect(() => {
    return subscribeCustomInstruments(() => {
      setCustomInstruments(getCustomInstruments());
    });
  }, []);

  const analogInstruments = INSTRUMENT_PRESETS.filter((i) => i.bank === 'Dark Analog / Cyberpunk');
  const retroInstruments = INSTRUMENT_PRESETS.filter((i) => i.bank === 'Retro 16-Bit / GM');
  const acousticInstruments = INSTRUMENT_PRESETS.filter((i) => i.bank === 'Acoustic / Plucked');

  return (
    <aside className="w-64 shrink-0 studio-panel border-r flex flex-col overflow-y-auto select-none">
      <div className="px-3 py-2 border-b border-zinc-800/80 space-y-1.5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-300">
              Vertical Stems
            </h2>
            <p className="text-[10px] text-zinc-500">Click a stem to edit &amp; play live</p>
          </div>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400">
            5 Layers
          </span>
        </div>

        {project.sections.length > 1 && (
          <label
            className="flex items-center gap-1.5 text-[10px] text-zinc-400 hover:text-zinc-200 cursor-pointer"
            title="When checked, changing a stem’s instrument applies it to all game states at once"
          >
            <input
              type="checkbox"
              checked={applyAllStates}
              onChange={(e) => setApplyAllStates(e.target.checked)}
              className="accent-amber-500"
            />
            Apply instrument changes to all states
          </label>
        )}
      </div>

      <div className="p-2 space-y-2 flex-1">
        {STEM_ORDER.map((stemId) => {
          const stem = section.stems[stemId];
          const isActive = activeStemId === stemId;
          const coaching = STEM_COACHING_TIPS[stemId];

          return (
            <div
              key={stemId}
              onClick={() => setActiveStem(stemId)}
              className={`rounded-lg border p-2.5 transition cursor-pointer ${
                isActive
                  ? 'bg-zinc-800/85 border-zinc-500 shadow-md'
                  : 'bg-zinc-950/60 border-zinc-800/90 hover:border-zinc-700'
              }`}
            >
              {/* Header Row */}
              <div className="flex items-center justify-between gap-1.5 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: stem.color }}
                  />
                  <div className="truncate">
                    <div className="text-xs font-semibold text-zinc-100 truncate">
                      {stem.name}
                    </div>
                    <div className="text-[10px] text-zinc-500 font-mono">
                      {stem.notes.length} notes · Int ≥{Math.round(stem.intensityMin * 100)}%
                    </div>
                  </div>
                </div>

                {/* Mute / Solo */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleStemMute(stemId);
                    }}
                    className={`w-6 h-6 rounded text-[10px] font-bold flex items-center justify-center border transition cursor-pointer ${
                      stem.muted
                        ? 'bg-rose-500/20 border-rose-500/60 text-rose-300'
                        : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-zinc-200'
                    }`}
                    title="Mute stem"
                  >
                    M
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleStemSolo(stemId);
                    }}
                    className={`w-6 h-6 rounded text-[10px] font-bold flex items-center justify-center border transition cursor-pointer ${
                      stem.solo
                        ? 'bg-amber-500/25 border-amber-500/70 text-amber-300'
                        : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-zinc-200'
                    }`}
                    title="Solo stem"
                  >
                    S
                  </button>
                </div>
              </div>

              {/* Instrument Selector */}
              <select
                value={stem.instrumentId}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) =>
                  setStemInstrument(stemId, e.target.value as InstrumentPresetId, applyAllStates)
                }
                className="w-full mb-2 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-[11px] text-zinc-200 focus:outline-none focus:border-amber-500"
              >
                <optgroup label="Dark Analog / Cyberpunk">
                  {analogInstruments
                    .filter((i) => i.isDrum === stem.isDrum)
                    .map((inst) => (
                      <option key={inst.id} value={inst.id}>
                        {inst.name}
                      </option>
                    ))}
                </optgroup>
                <optgroup label="Retro 16-Bit / GM">
                  {retroInstruments
                    .filter((i) => i.isDrum === stem.isDrum)
                    .map((inst) => (
                      <option key={inst.id} value={inst.id}>
                        {inst.name}
                      </option>
                    ))}
                </optgroup>
                {!stem.isDrum && (
                  <optgroup label="Acoustic / Plucked">
                    {acousticInstruments.map((inst) => (
                      <option key={inst.id} value={inst.id}>
                        {inst.name}
                      </option>
                    ))}
                  </optgroup>
                )}
                {customInstruments.some((inst) => inst.isDrum === stem.isDrum) && (
                  <optgroup label="Custom Imported (.sf2 / .sfz / .wav)">
                    {customInstruments
                      .filter((inst) => inst.isDrum === stem.isDrum)
                      .map((inst) => (
                        <option key={inst.id} value={inst.id}>
                          {inst.name}
                        </option>
                      ))}
                  </optgroup>
                )}
              </select>

              {/* Volume Slider */}
              <div
                className="flex items-center gap-2 mb-1.5"
                onClick={(e) => e.stopPropagation()}
              >
                {stem.muted ? (
                  <VolumeX className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                )}
                <input
                  type="range"
                  min={-30}
                  max={4}
                  step={1}
                  value={stem.volumeDb}
                  onChange={(e) => setStemVolume(stemId, Number(e.target.value))}
                  className="w-full h-1 accent-amber-500 cursor-pointer"
                />
                <span className="text-[10px] font-mono text-zinc-400 w-8 text-right">
                  {stem.volumeDb}dB
                </span>
              </div>

              {/* Vertical Intensity Entry Threshold */}
              <div
                className="flex items-center gap-2 mb-2"
                onClick={(e) => e.stopPropagation()}
                title="Intensity threshold where this stem fades in during Game State Simulation"
              >
                <span className="text-[9px] uppercase text-zinc-500 w-7 shrink-0">Int≥</span>
                <input
                  type="range"
                  min={0}
                  max={0.9}
                  step={0.05}
                  value={stem.intensityMin}
                  onChange={(e) => setStemIntensityRange(stemId, Number(e.target.value), stem.intensityMax)}
                  className="w-full h-1 accent-emerald-500 cursor-pointer"
                />
                <span className="text-[10px] font-mono text-emerald-400 w-8 text-right">
                  {Math.round(stem.intensityMin * 100)}%
                </span>
              </div>

              {/* Beginner 1-Click Auto-Follow Chords + Clear */}
              <div
                className="flex items-center gap-1.5"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => autoFillStemFromChords(stemId)}
                  className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 text-[10px] font-medium text-cyan-300 transition cursor-pointer"
                  title="Generate a starter pattern for this stem that matches your current Chord Progression"
                >
                  <Wand2 className="w-3 h-3" />
                  {coaching.autoLabel}
                </button>
                <button
                  onClick={() => clearStemNotes(stemId)}
                  className="p-1 rounded bg-zinc-900 hover:bg-rose-950/60 border border-zinc-800 text-zinc-500 hover:text-rose-300 transition cursor-pointer"
                  title="Clear all notes in this stem"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
};
