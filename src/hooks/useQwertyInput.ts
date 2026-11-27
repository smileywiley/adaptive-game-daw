import { useEffect, useRef } from 'react';
import { useDawStore } from '../store/useDawStore';
import { audioEngine } from '../audio/audioEngine';
import {
  getBeatsPerBar,
  getChordMidiVoicing,
  getScaleChordOptions,
  scaleDegreeToMidi,
} from '../theory/musicTheory';
import { DRUM_LANES } from '../types/daw';

// Scale-Lock row: A S D F G H J K L ; maps directly to degrees 1..10 of the active scale
export const SCALE_LOCK_KEYS = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';'] as const;

// Two-row chromatic layout when Scale-Lock is OFF
const LOWER_ROW_KEYS = ['z', 'x', 'c', 'v', 'b', 'n', 'm'] as const;
const UPPER_ROW_KEYS = ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i'] as const;

export function useQwertyInput(): void {
  const heldKeyToMidis = useRef<Map<string, number[]>>(new Map());

  useEffect(() => {
    const isTypingInInput = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
    };

    const recordNotesIfArmed = (midis: number[], velocity = 0.82) => {
      const state = useDawStore.getState();
      if (!state.isPlaying || !state.isRecording) return;
      const section = state.getActiveSection();
      const totalBeats = section.bars * getBeatsPerBar(state.project.timeSignature);
      const rawBeat = audioEngine.getCurrentBeat();
      const grid = state.quantizeGrid;
      const quantized = Math.round(rawBeat / grid) * grid;
      const startBeat = quantized >= totalBeats ? 0 : quantized;
      const durationBeats = Math.max(grid, 0.5);

      state.addNotes(
        state.activeStemId,
        midis.map((midi) => ({
          midi,
          startBeat,
          durationBeats,
          velocity,
        })),
      );
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingInInput(e.target)) return;

      const key = e.key.toLowerCase();
      const state = useDawStore.getState();

      // Transport & utility shortcuts
      if (e.code === 'Space') {
        e.preventDefault();
        void state.togglePlay();
        return;
      }
      if (key === '-') {
        state.setQwertyOctave(state.qwertyOctave - 1);
        return;
      }
      if (key === '=' || key === '+') {
        state.setQwertyOctave(state.qwertyOctave + 1);
        return;
      }

      const section = state.getActiveSection();
      const stem = section.stems[state.activeStemId];

      // 1-8 Instant Diatonic Chord Triggers
      if (/^[1-8]$/.test(key) && !stem.isDrum) {
        const idx = parseInt(key, 10) - 1;
        const chords = getScaleChordOptions(section.root, section.scaleId);
        const chord = chords[idx % chords.length];
        if (!chord) return;
        const midis = getChordMidiVoicing(chord, Math.max(3, state.qwertyOctave - 1));
        heldKeyToMidis.current.set(key, midis);
        for (const m of midis) {
          void audioEngine.noteOn(stem.id, stem.instrumentId, m, 0.72);
          state.addLiveMidi(m);
        }
        state.markAudioUnlocked();
        recordNotesIfArmed(midis, 0.72);
        return;
      }

      // Drum kit mapping when Percussion stem is active
      if (stem.isDrum) {
        const drumIdx = SCALE_LOCK_KEYS.indexOf(key as (typeof SCALE_LOCK_KEYS)[number]);
        if (drumIdx !== -1 && drumIdx < DRUM_LANES.length) {
          // Reverse so A = Kick, S = Snare, D = Clap, etc.
          const lane = DRUM_LANES[DRUM_LANES.length - 1 - drumIdx];
          heldKeyToMidis.current.set(key, [lane.midi]);
          void audioEngine.noteOn(stem.id, stem.instrumentId, lane.midi, 0.9);
          state.addLiveMidi(lane.midi);
          state.markAudioUnlocked();
          recordNotesIfArmed([lane.midi], 0.9);
        }
        return;
      }

      let resolvedMidi: number | null = null;

      if (state.scaleLock) {
        // Primary Scale-Lock home row (A-;)
        const scaleIdx = SCALE_LOCK_KEYS.indexOf(key as (typeof SCALE_LOCK_KEYS)[number]);
        if (scaleIdx !== -1) {
          resolvedMidi = scaleDegreeToMidi(scaleIdx, section.root, section.scaleId, state.qwertyOctave);
        } else {
          // Z-M = lower octave scale degrees, Q-I = upper octave scale degrees
          const lowerIdx = LOWER_ROW_KEYS.indexOf(key as (typeof LOWER_ROW_KEYS)[number]);
          const upperIdx = UPPER_ROW_KEYS.indexOf(key as (typeof UPPER_ROW_KEYS)[number]);
          if (lowerIdx !== -1) {
            resolvedMidi = scaleDegreeToMidi(lowerIdx, section.root, section.scaleId, state.qwertyOctave - 1);
          } else if (upperIdx !== -1) {
            resolvedMidi = scaleDegreeToMidi(upperIdx, section.root, section.scaleId, state.qwertyOctave + 1);
          }
        }
      } else {
        // Chromatic white-key style mapping on Z-M (lower) & Q-I (upper)
        const whiteOffsets = [0, 2, 4, 5, 7, 9, 11, 12];
        const lowerIdx = LOWER_ROW_KEYS.indexOf(key as (typeof LOWER_ROW_KEYS)[number]);
        const upperIdx = UPPER_ROW_KEYS.indexOf(key as (typeof UPPER_ROW_KEYS)[number]);
        const homeIdx = SCALE_LOCK_KEYS.indexOf(key as (typeof SCALE_LOCK_KEYS)[number]);
        if (lowerIdx !== -1) {
          resolvedMidi = (state.qwertyOctave) * 12 + whiteOffsets[lowerIdx];
        } else if (upperIdx !== -1) {
          resolvedMidi = (state.qwertyOctave + 2) * 12 + whiteOffsets[upperIdx];
        } else if (homeIdx !== -1) {
          resolvedMidi = (state.qwertyOctave + 1) * 12 + (whiteOffsets[homeIdx] ?? homeIdx);
        }
      }

      if (resolvedMidi !== null) {
        heldKeyToMidis.current.set(key, [resolvedMidi]);
        void audioEngine.noteOn(stem.id, stem.instrumentId, resolvedMidi, 0.85);
        state.addLiveMidi(resolvedMidi);
        state.markAudioUnlocked();
        recordNotesIfArmed([resolvedMidi], 0.85);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const midis = heldKeyToMidis.current.get(key);
      if (!midis) return;
      heldKeyToMidis.current.delete(key);
      const state = useDawStore.getState();
      for (const m of midis) {
        audioEngine.noteOff(state.activeStemId, m);
        state.removeLiveMidi(m);
      }
    };

    const handleBlur = () => {
      const state = useDawStore.getState();
      for (const midis of heldKeyToMidis.current.values()) {
        for (const m of midis) {
          audioEngine.noteOff(state.activeStemId, m);
          state.removeLiveMidi(m);
        }
      }
      heldKeyToMidis.current.clear();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);
}
