import React from 'react';
import { Keyboard, Minus, Plus, Usb } from 'lucide-react';
import { useDawStore } from '../store/useDawStore';
import { SCALE_LOCK_KEYS } from '../hooks/useQwertyInput';
import {
  formatChordName,
  getChordMidiVoicing,
  getScaleChordOptions,
  midiToNoteName,
  scaleDegreeToMidi,
} from '../theory/musicTheory';
import { audioEngine } from '../audio/audioEngine';
import { DRUM_LANES } from '../types/daw';

export const InputDock: React.FC = () => {
  const section = useDawStore((s) => s.getActiveSection());
  const activeStemId = useDawStore((s) => s.activeStemId);
  const scaleLock = useDawStore((s) => s.scaleLock);
  const qwertyOctave = useDawStore((s) => s.qwertyOctave);
  const activeLiveMidis = useDawStore((s) => s.activeLiveMidis);
  const midiDevices = useDawStore((s) => s.midiDevices);
  const setQwertyOctave = useDawStore((s) => s.setQwertyOctave);
  const markAudioUnlocked = useDawStore((s) => s.markAudioUnlocked);

  const activeStem = section.stems[activeStemId];
  const chords = getScaleChordOptions(section.root, section.scaleId).slice(0, 8);

  const triggerChord = (idx: number) => {
    const chord = chords[idx];
    if (!chord) return;
    markAudioUnlocked();
    const midis = getChordMidiVoicing(chord, Math.max(3, qwertyOctave - 1));
    void audioEngine.auditionChord(activeStem.id, activeStem.instrumentId, midis, 0.7);
  };

  const triggerKey = (midi: number) => {
    markAudioUnlocked();
    void audioEngine.auditionNote(activeStem.id, activeStem.instrumentId, midi, 0.35, 0.85);
  };

  return (
    <footer className="studio-panel border-t px-3 py-2 flex flex-wrap items-center justify-between gap-3 select-none">
      {/* Left: Input Status & Octave Control */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-xs text-zinc-300">
          <Keyboard className="w-4 h-4 text-amber-400" />
          <div>
            <div className="font-semibold leading-tight">
              {activeStem.isDrum
                ? 'Drum Pads (A–J)'
                : scaleLock
                  ? 'Scale-Lock Keys (A–;)'
                  : 'QWERTY Keys (Z–M / Q–I)'}
            </div>
            <div className="text-[10px] text-zinc-500">
              {midiDevices.length > 0 ? (
                <span className="text-emerald-400 flex items-center gap-1">
                  <Usb className="w-3 h-3" /> {midiDevices[0].name} active
                </span>
              ) : (
                'Space = Play · Plug in Mini MIDI anytime'
              )}
            </div>
          </div>
        </div>

        {!activeStem.isDrum && (
          <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded px-1.5 py-0.5 text-[11px]">
            <button
              onClick={() => setQwertyOctave(qwertyOctave - 1)}
              className="p-0.5 text-zinc-400 hover:text-zinc-100 cursor-pointer"
              title="Octave Down (-)"
            >
              <Minus className="w-3 h-3" />
            </button>
            <span className="font-mono text-zinc-200 px-1">Oct {qwertyOctave}</span>
            <button
              onClick={() => setQwertyOctave(qwertyOctave + 1)}
              className="p-0.5 text-zinc-400 hover:text-zinc-100 cursor-pointer"
              title="Octave Up (=)"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* Center: Interactive Scale-Lock / Drum Key Strip */}
      <div className="flex items-center gap-1 overflow-x-auto">
        {activeStem.isDrum
          ? DRUM_LANES.slice()
              .reverse()
              .map((lane, idx) => {
                const keyChar = SCALE_LOCK_KEYS[idx]?.toUpperCase() ?? '';
                const isLit = activeLiveMidis.includes(lane.midi);
                return (
                  <button
                    key={lane.midi}
                    onMouseDown={() => triggerKey(lane.midi)}
                    className={`px-2 py-1 rounded border text-center min-w-[54px] transition cursor-pointer ${
                      isLit
                        ? 'bg-amber-500 text-zinc-950 border-amber-300 scale-95'
                        : 'bg-zinc-950 border-zinc-800 hover:border-zinc-600 text-zinc-200'
                    }`}
                  >
                    <div className="text-[10px] font-mono text-zinc-500">{keyChar}</div>
                    <div className="text-[10px] font-bold">{lane.shortName}</div>
                  </button>
                );
              })
          : SCALE_LOCK_KEYS.slice(0, 8).map((k, idx) => {
              const midi = scaleDegreeToMidi(idx, section.root, section.scaleId, qwertyOctave);
              const isLit = activeLiveMidis.includes(midi);
              const isRoot = idx === 0 || idx === 7;
              return (
                <button
                  key={k}
                  onMouseDown={() => triggerKey(midi)}
                  className={`px-2 py-1 rounded border text-center min-w-[42px] transition cursor-pointer ${
                    isLit
                      ? 'bg-amber-400 text-zinc-950 border-amber-300 scale-95'
                      : isRoot
                        ? 'bg-amber-500/15 border-amber-500/40 text-amber-200 hover:bg-amber-500/25'
                        : 'bg-zinc-950 border-zinc-800 hover:border-zinc-600 text-zinc-200'
                  }`}
                >
                  <div className="text-[9px] font-mono opacity-60">{k.toUpperCase()}</div>
                  <div className="text-[11px] font-bold font-mono">{midiToNoteName(midi)}</div>
                </button>
              );
            })}
      </div>

      {/* Right: 1-8 Instant One-Finger Chord Triggers */}
      {!activeStem.isDrum && (
        <div className="flex items-center gap-1">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500 mr-1">
            Chords (1–8)
          </span>
          {chords.map((c, idx) => (
            <button
              key={`${c.romanNumeral}_${idx}`}
              onMouseDown={() => triggerChord(idx)}
              title={`${formatChordName(c)} (${c.romanNumeral}) — ${c.vibeLabel}`}
              className="px-2 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-cyan-500/50 text-center transition cursor-pointer"
            >
              <div className="text-[9px] font-mono text-zinc-500">{idx + 1}</div>
              <div className="text-[10px] font-bold text-cyan-300">{c.romanNumeral}</div>
            </button>
          ))}
        </div>
      )}
    </footer>
  );
};
