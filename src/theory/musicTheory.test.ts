import { describe, expect, it } from 'vitest';
import {
  formatChordName,
  generateStemPatternForChords,
  getBeatsPerBar,
  getCadenceSuggestions,
  getNoteRole,
  getScaleChordOptions,
  getScaleMidiNotes,
  isPitchInScale,
  mapMidiKeyWithScaleLock,
  midiToNoteName,
  remapNotesToScale,
  snapMidiToScale,
} from './musicTheory';

describe('musicTheory engine', () => {
  it('computes beats per bar for 4/4, 3/4, and 5/4', () => {
    expect(getBeatsPerBar('4/4')).toBe(4);
    expect(getBeatsPerBar('3/4')).toBe(3);
    expect(getBeatsPerBar('5/4')).toBe(5);
  });

  it('validates A Phrygian scale tones and snaps out-of-scale pitches cleanly', () => {
    // A Phrygian: A, Bb, C, D, E, F, G (pitch classes 9, 10, 0, 2, 4, 5, 7)
    expect(isPitchInScale(69, 9, 'phrygian')).toBe(true); // A4
    expect(isPitchInScale(70, 9, 'phrygian')).toBe(true); // A#4 / Bb4
    expect(isPitchInScale(71, 9, 'phrygian')).toBe(false); // B4 (out of scale)

    const snapped = snapMidiToScale(71, 9, 'phrygian');
    expect(isPitchInScale(snapped, 9, 'phrygian')).toBe(true);
    expect(Math.abs(snapped - 71)).toBe(1);
  });

  it('classifies chord tones (Root, 3rd, 5th), in-scale, and outside roles accurately', () => {
    const amChord = {
      bar: 0,
      root: 9 as const,
      quality: 'min' as const,
      romanNumeral: 'i',
      tensionLevel: 'low' as const,
      vibeLabel: 'Home',
    };
    expect(getNoteRole(69, 9, 'phrygian', amChord)).toBe('root'); // A4
    expect(getNoteRole(72, 9, 'phrygian', amChord)).toBe('third'); // C5
    expect(getNoteRole(76, 9, 'phrygian', amChord)).toBe('fifth'); // E5
    expect(getNoteRole(70, 9, 'phrygian', amChord)).toBe('scale'); // Bb4
    expect(getNoteRole(71, 9, 'phrygian', amChord)).toBe('outside'); // B4
  });

  it('maps Mini USB MIDI white keys directly to active scale degrees in Scale-Lock mode', () => {
    // Anchor C3 (MIDI 48) -> degree 0 = F3 (MIDI 53) in F Phrygian Dominant
    const c3Mapped = mapMidiKeyWithScaleLock(48, 5, 'phrygian_dominant', 3);
    const d3Mapped = mapMidiKeyWithScaleLock(50, 5, 'phrygian_dominant', 3);
    const e3Mapped = mapMidiKeyWithScaleLock(52, 5, 'phrygian_dominant', 3);

    expect(c3Mapped).toBe(53); // F3
    expect(d3Mapped).toBe(54); // F#3 (b2)
    expect(e3Mapped).toBe(57); // A3 (major 3rd of Phrygian Dominant)
    expect(isPitchInScale(c3Mapped, 5, 'phrygian_dominant')).toBe(true);
    expect(isPitchInScale(d3Mapped, 5, 'phrygian_dominant')).toBe(true);
    expect(isPitchInScale(e3Mapped, 5, 'phrygian_dominant')).toBe(true);
  });

  it('generates Fold-to-Scale rows containing only valid scale notes', () => {
    const rows = getScaleMidiNotes(2, 'dorian', 48, 60);
    expect(rows.length).toBeGreaterThan(5);
    expect(rows.every((m) => isPitchInScale(m, 2, 'dorian'))).toBe(true);
  });

  it('generates diatonic chord options with plain-English vibe labels and cadence suggestions', () => {
    const opts = getScaleChordOptions(0, 'major');
    expect(opts.length).toBeGreaterThanOrEqual(7);
    expect(formatChordName(opts[0])).toBe('C');
    expect(opts[0].vibeLabel).toContain('Home');

    const cadences = getCadenceSuggestions(0, 'harmonic_minor');
    expect(cadences.length).toBe(3);
    expect(cadences[0].romanNumeral).toBe('V7');
  });

  it('generates Auto-Follow Chords patterns respecting 5/4 time signature', () => {
    const chords = getScaleChordOptions(9, 'phrygian')
      .slice(0, 4)
      .map((c, bar) => ({ ...c, bar }));
    const bass = generateStemPatternForChords('03_Bass', chords, 4, '5/4', 9, 'phrygian');
    // 4 bars * 5 beats * 4 sixteenths = 80 pulse notes
    expect(bass.length).toBe(80);
    expect(Math.max(...bass.map((n) => n.startBeat))).toBeLessThan(20);
  });

  it('remaps notes losslessly by scale degree so switching Scale A -> B -> A restores the exact song', () => {
    // C Major melody: C4 (60), D4 (62), E4 (64), G4 (67), B4 (71)
    const original = [
      { id: '1', midi: 60, startBeat: 0, durationBeats: 1, velocity: 0.8 },
      { id: '2', midi: 62, startBeat: 1, durationBeats: 1, velocity: 0.8 },
      { id: '3', midi: 64, startBeat: 2, durationBeats: 1, velocity: 0.8 },
      { id: '4', midi: 67, startBeat: 3, durationBeats: 1, velocity: 0.8 },
      { id: '5', midi: 71, startBeat: 4, durationBeats: 1, velocity: 0.8 },
    ];
    const toPhrygian = remapNotesToScale(original, 0, 'major', 9, 'phrygian');
    expect(toPhrygian.every((n) => isPitchInScale(n.midi, 9, 'phrygian'))).toBe(true);
    expect(midiToNoteName(toPhrygian[0].midi)).toBe('A3');

    // Switch back from A Phrygian to C Major: must return exact original MIDI notes!
    const backToMajor = remapNotesToScale(toPhrygian, 9, 'phrygian', 0, 'major');
    expect(backToMajor.map((n) => n.midi)).toEqual(original.map((n) => n.midi));
  });
});
