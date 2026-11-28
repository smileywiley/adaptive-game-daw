import {
  ChordEvent,
  ChordQuality,
  MidiNote,
  NoteRole,
  PitchClass,
  ScaleId,
  StemId,
  TensionLevel,
  TimeSignature,
} from '../types/daw';

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

export interface ScaleDefinition {
  id: ScaleId;
  name: string;
  vibe: string;
  description: string;
  intervals: number[]; // Semitones from root (length 7)
}

export const SCALES: Record<ScaleId, ScaleDefinition> = {
  major: {
    id: 'major',
    name: 'Major (Ionian)',
    vibe: 'Bright & Heroic',
    description: 'Classic uplifting RPG town, overworld, and victory feel.',
    intervals: [0, 2, 4, 5, 7, 9, 11],
  },
  natural_minor: {
    id: 'natural_minor',
    name: 'Natural Minor',
    vibe: 'Serious & Dramatic',
    description: 'Emotional, tense, and cinematic — the backbone of action and sci-fi scores.',
    intervals: [0, 2, 3, 5, 7, 8, 10],
  },
  dorian: {
    id: 'dorian',
    name: 'Dorian',
    vibe: 'Moody & Cool',
    description: 'Minor with a stylish raised 6th — signature sound of synthwave & neon exploration.',
    intervals: [0, 2, 3, 5, 7, 9, 10],
  },
  phrygian: {
    id: 'phrygian',
    name: 'Phrygian',
    vibe: 'Dark & Menacing',
    description: 'Half-step drop right above root (b2) creates instant Carpenter dystopian tension.',
    intervals: [0, 1, 3, 5, 7, 8, 10],
  },
  phrygian_dominant: {
    id: 'phrygian_dominant',
    name: 'Phrygian Dominant',
    vibe: 'Aggressive & Exotic',
    description: 'Gritty half-step tension with a sharp major 3rd — built for cyberpunk combat.',
    intervals: [0, 1, 4, 5, 7, 8, 10],
  },
  mixolydian: {
    id: 'mixolydian',
    name: 'Mixolydian',
    vibe: 'Adventurous & Bold',
    description: 'Major with a gritty flat-7th — great for retro adventure and open-world travel.',
    intervals: [0, 2, 4, 5, 7, 9, 10],
  },
  locrian: {
    id: 'locrian',
    name: 'Locrian',
    vibe: 'Unsettled & Stealthy',
    description: 'Flat-2nd and flat-5th remove any sense of safety — ideal for stealth & horror.',
    intervals: [0, 1, 3, 5, 6, 8, 10],
  },
  harmonic_minor: {
    id: 'harmonic_minor',
    name: 'Harmonic Minor',
    vibe: 'Dramatic Boss',
    description: 'Minor scale with a razor-sharp raised 7th that pulls intensely back to the root.',
    intervals: [0, 2, 3, 5, 7, 8, 11],
  },
};

export const CHORD_INTERVALS: Record<ChordQuality, number[]> = {
  maj: [0, 4, 7],
  min: [0, 3, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  dom7: [0, 4, 7, 10],
  min7: [0, 3, 7, 10],
  maj7: [0, 4, 7, 11],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  power: [0, 7],
};

export const CHORD_SUFFIX: Record<ChordQuality, string> = {
  maj: '',
  min: 'm',
  dim: 'dim',
  aug: 'aug',
  dom7: '7',
  min7: 'm7',
  maj7: 'maj7',
  sus2: 'sus2',
  sus4: 'sus4',
  power: '5',
};

export function mod12(n: number): PitchClass {
  return (((n % 12) + 12) % 12) as PitchClass;
}

export function pitchClassName(pc: PitchClass): string {
  return NOTE_NAMES[mod12(pc)];
}

export function midiToNoteName(midi: number): string {
  const pc = mod12(midi);
  const octave = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES[pc]}${octave}`;
}

export function noteNameToMidi(name: string): number {
  const match = /^([A-G]#?)(-?\d)$/.exec(name.trim());
  if (!match) return 60;
  const pc = NOTE_NAMES.indexOf(match[1] as (typeof NOTE_NAMES)[number]);
  const octave = parseInt(match[2], 10);
  return (octave + 1) * 12 + (pc >= 0 ? pc : 0);
}

export function getBeatsPerBar(timeSignature: TimeSignature): number {
  switch (timeSignature) {
    case '3/4':
      return 3;
    case '5/4':
      return 5;
    case '4/4':
    default:
      return 4;
  }
}

export function getScalePitchClasses(root: PitchClass, scaleId: ScaleId): PitchClass[] {
  return SCALES[scaleId].intervals.map((interval) => mod12(root + interval));
}

export function isPitchInScale(midi: number, root: PitchClass, scaleId: ScaleId): boolean {
  const pc = mod12(midi);
  return getScalePitchClasses(root, scaleId).includes(pc);
}

/** Snaps any MIDI pitch to the nearest note belonging to the active scale. */
export function snapMidiToScale(midi: number, root: PitchClass, scaleId: ScaleId): number {
  if (isPitchInScale(midi, root, scaleId)) return midi;
  for (let offset = 1; offset <= 6; offset++) {
    const down = midi - offset;
    const up = midi + offset;
    if (down >= 0 && isPitchInScale(down, root, scaleId)) return down;
    if (up <= 127 && isPitchInScale(up, root, scaleId)) return up;
  }
  return midi;
}

/** Returns all MIDI notes in [minMidi, maxMidi] that belong to the active scale (ascending). */
export function getScaleMidiNotes(
  root: PitchClass,
  scaleId: ScaleId,
  minMidi = 36,
  maxMidi = 84,
): number[] {
  const result: number[] = [];
  for (let m = minMidi; m <= maxMidi; m++) {
    if (isPitchInScale(m, root, scaleId)) {
      result.push(m);
    }
  }
  return result;
}

/**
 * Maps a scale degree index (0..N, can be negative) starting at a base octave
 * to an exact MIDI pitch in the active scale.
 */
export function scaleDegreeToMidi(
  degreeIndex: number,
  root: PitchClass,
  scaleId: ScaleId,
  baseOctave = 4,
): number {
  const intervals = SCALES[scaleId].intervals;
  const len = intervals.length;
  const octaveOffset = Math.floor(degreeIndex / len);
  const degreeInOctave = ((degreeIndex % len) + len) % len;
  const baseMidi = (baseOctave + 1) * 12 + root;
  const midi = baseMidi + octaveOffset * 12 + intervals[degreeInOctave];
  return Math.max(0, Math.min(127, midi));
}

const WHITE_KEY_PITCH_CLASSES = [0, 2, 4, 5, 7, 9, 11];

/**
 * Scale-Lock mapping for Mini USB MIDI keyboards:
 * White keys (C, D, E, F, G, A, B) map sequentially to degrees 1..7 of the active scale
 * starting from C3 (MIDI 48) as the anchor octave. Black keys snap cleanly to the nearest scale degree.
 */
export function mapMidiKeyWithScaleLock(
  incomingMidi: number,
  root: PitchClass,
  scaleId: ScaleId,
  anchorOctave = 3,
): number {
  const octave = Math.floor(incomingMidi / 12) - 1;
  const pc = mod12(incomingMidi);
  const whiteIdx = WHITE_KEY_PITCH_CLASSES.indexOf(pc);

  if (whiteIdx !== -1) {
    const degreeOffset = (octave - anchorOctave) * 7 + whiteIdx;
    return scaleDegreeToMidi(degreeOffset, root, scaleId, anchorOctave);
  }
  // If user presses a black key in Scale-Lock mode, snap to the nearest in-scale note
  return snapMidiToScale(incomingMidi, root, scaleId);
}

/** Returns the pitch classes belonging to a chord. */
export function getChordPitchClasses(chord: Pick<ChordEvent, 'root' | 'quality'>): PitchClass[] {
  return CHORD_INTERVALS[chord.quality].map((interval) => mod12(chord.root + interval));
}

/** Returns MIDI notes for voicing a chord around a given base octave (e.g. 3 or 4). */
export function getChordMidiVoicing(
  chord: Pick<ChordEvent, 'root' | 'quality'>,
  baseOctave = 3,
): number[] {
  const base = (baseOctave + 1) * 12 + chord.root;
  return CHORD_INTERVALS[chord.quality].map((interval) => Math.max(24, Math.min(108, base + interval)));
}

/** Human-readable chord symbol like "Am", "F#dim", "G7". */
export function formatChordName(chord: Pick<ChordEvent, 'root' | 'quality'>): string {
  return `${pitchClassName(chord.root)}${CHORD_SUFFIX[chord.quality]}`;
}

/** Classifies a MIDI pitch relative to the active bar's chord & scale for piano roll highlighting. */
export function getNoteRole(
  midi: number,
  root: PitchClass,
  scaleId: ScaleId,
  chord?: ChordEvent,
): NoteRole {
  const pc = mod12(midi);
  if (chord) {
    const chordPcs = getChordPitchClasses(chord);
    if (pc === chordPcs[0]) return 'root';
    if (chordPcs.length > 1 && pc === chordPcs[1]) return 'third';
    if (chordPcs.length > 2 && pc === chordPcs[2]) return 'fifth';
    if (chordPcs.length > 3 && pc === chordPcs[3]) return 'seventh';
  }
  if (isPitchInScale(midi, root, scaleId)) return 'scale';
  return 'outside';
}

export interface ChordOption {
  root: PitchClass;
  quality: ChordQuality;
  romanNumeral: string;
  tensionLevel: TensionLevel;
  vibeLabel: string;
  isBorrowed?: boolean;
}

const DEGREE_ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

function getDegreePrefix(semitoneFromRoot: number, degreeIdx: number): string {
  const majorReference = [0, 2, 4, 5, 7, 9, 11];
  const diff = semitoneFromRoot - majorReference[degreeIdx];
  if (diff === -1) return 'b';
  if (diff === 1) return '#';
  return '';
}

function inferBeginnerVibe(
  degreeIdx: number,
  quality: ChordQuality,
  semitone: number,
): { tension: TensionLevel; vibe: string } {
  if (degreeIdx === 0) {
    if (quality === 'dim') return { tension: 'high', vibe: 'Unstable Home' };
    return { tension: 'low', vibe: 'Home / Grounded' };
  }
  if (semitone === 1) return { tension: 'high', vibe: 'Dark Tension' };
  if (degreeIdx === 4) return { tension: 'high', vibe: 'Pulls Back Home' };
  if (degreeIdx === 3) return { tension: 'medium', vibe: 'Heavy / Moving' };
  if (degreeIdx === 5) return { tension: 'low', vibe: 'Emotional Lift' };
  if (degreeIdx === 6) return { tension: 'medium', vibe: 'Driving / Anthemic' };
  if (degreeIdx === 2) return { tension: 'low', vibe: 'Open / Storytelling' };
  return { tension: 'medium', vibe: 'Bridge / Color' };
}

/**
 * Generates the 7 diatonic chords for any scale plus 2 useful borrowed/color chords
 * (like bII Dark Tension or V7 Turnaround) with beginner-friendly plain-English labels.
 */
export function getScaleChordOptions(root: PitchClass, scaleId: ScaleId): ChordOption[] {
  const intervals = SCALES[scaleId].intervals;
  const options: ChordOption[] = intervals.map((semitone, deg) => {
    const thirdInterval = (intervals[(deg + 2) % 7] - semitone + 12) % 12;
    const fifthInterval = (intervals[(deg + 4) % 7] - semitone + 12) % 12;

    let quality: ChordQuality = 'maj';
    if (thirdInterval === 3 && fifthInterval === 7) quality = 'min';
    else if (thirdInterval === 3 && fifthInterval === 6) quality = 'dim';
    else if (thirdInterval === 4 && fifthInterval === 8) quality = 'aug';
    else if (thirdInterval === 4 && fifthInterval === 7) quality = 'maj';
    else quality = 'power';

    const prefix = getDegreePrefix(semitone, deg);
    const baseRoman = DEGREE_ROMAN[deg];
    const roman =
      quality === 'min'
        ? `${prefix}${baseRoman.toLowerCase()}`
        : quality === 'dim'
          ? `${prefix}${baseRoman.toLowerCase()}°`
          : quality === 'aug'
            ? `${prefix}${baseRoman}+`
            : `${prefix}${baseRoman}`;

    const { tension, vibe } = inferBeginnerVibe(deg, quality, semitone);

    return {
      root: mod12(root + semitone),
      quality,
      romanNumeral: roman,
      tensionLevel: tension,
      vibeLabel: vibe,
    };
  });

  // Add useful borrowed turnaround / tension chords if not already present
  const hasV7 = options.some((c) => c.root === mod12(root + 7) && c.quality === 'dom7');
  if (!hasV7) {
    options.push({
      root: mod12(root + 7),
      quality: 'dom7',
      romanNumeral: 'V7',
      tensionLevel: 'high',
      vibeLabel: 'Strong Turnaround',
      isBorrowed: true,
    });
  }

  const hasFlatII = options.some((c) => c.root === mod12(root + 1));
  if (!hasFlatII) {
    options.push({
      root: mod12(root + 1),
      quality: 'maj',
      romanNumeral: 'bII',
      tensionLevel: 'high',
      vibeLabel: 'Sci-Fi Tension',
      isBorrowed: true,
    });
  }

  return options;
}

/**
 * Final-Bar Cadence / Turnaround Helper:
 * Returns 3 curated final-bar chord choices that smoothly wrap a loop back to bar 1.
 */
export function getCadenceSuggestions(root: PitchClass, scaleId: ScaleId): ChordOption[] {
  const diatonic = getScaleChordOptions(root, scaleId);
  const v7: ChordOption = {
    root: mod12(root + 7),
    quality: 'dom7',
    romanNumeral: 'V7',
    tensionLevel: 'high',
    vibeLabel: 'Dramatic Pull to Bar 1',
  };
  const bVII: ChordOption = {
    root: mod12(root + 10),
    quality: 'maj',
    romanNumeral: 'bVII',
    tensionLevel: 'medium',
    vibeLabel: 'Smooth Loop Lift',
  };
  const bII: ChordOption = {
    root: mod12(root + 1),
    quality: 'maj',
    romanNumeral: 'bII',
    tensionLevel: 'high',
    vibeLabel: 'Dark Half-Step Drop',
  };
  const ivOrIV = diatonic[3] ?? bVII;

  if (scaleId === 'major' || scaleId === 'mixolydian') {
    return [v7, ivOrIV, bVII];
  }
  if (scaleId === 'phrygian' || scaleId === 'phrygian_dominant' || scaleId === 'locrian') {
    return [bII, bVII, v7];
  }
  return [v7, bVII, ivOrIV];
}

/**
 * Beginner Coaching Tips per Stem so non-musicians know what musical role each track plays.
 */
export const STEM_COACHING_TIPS: Record<StemId, { title: string; tip: string; autoLabel: string }> = {
  '01_Ambient_Pad': {
    title: 'Atmosphere & Harmony',
    tip: 'Hold long Gold chord tones across each bar to glue the whole track together.',
    autoLabel: 'Fill Pad Chords',
  },
  '02_Rhythm_Pulse': {
    title: 'Motion & Energy',
    tip: 'Use the Chord/Arp Brush or 8th/16th notes on Gold tones to add momentum.',
    autoLabel: 'Fill Chord Arp',
  },
  '03_Bass': {
    title: 'Low-End Anchor',
    tip: 'Hit the Gold "R" (Root) note on Beat 1 of every bar — it makes the chord changes unmistakable.',
    autoLabel: 'Fill Pulse Bass',
  },
  '04_Percussion': {
    title: 'Groove & Impact',
    tip: 'Put Kick on Beat 1, Snare on Beats 2 & 4, and Closed Hats on steady 8ths for an instant groove.',
    autoLabel: 'Fill Groove Beat',
  },
  '05_Lead_Melody': {
    title: 'Memorable Hook',
    tip: 'Start and end phrases on Gold chord tones; connect them with Teal scale notes and leave space!',
    autoLabel: 'Fill Motif Hook',
  },
};

let noteIdCounter = 1;
export function createNoteId(prefix = 'n'): string {
  noteIdCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${noteIdCounter}`;
}

/**
 * 1-Click "Auto-Follow Chords" Generator:
 * Generates a cohesive starter pattern for a given stem that follows the section's
 * current chord progression and time signature (4/4, 3/4, or 5/4).
 */
export function generateStemPatternForChords(
  stemId: StemId,
  chords: ChordEvent[],
  bars: number,
  timeSignature: TimeSignature,
  root: PitchClass,
  scaleId: ScaleId,
): MidiNote[] {
  const beatsPerBar = getBeatsPerBar(timeSignature);
  const notes: MidiNote[] = [];

  for (let bar = 0; bar < bars; bar++) {
    const barStart = bar * beatsPerBar;
    const chord = chords[bar] ?? chords[0] ?? {
      bar,
      root,
      quality: 'min' as ChordQuality,
      romanNumeral: 'i',
      tensionLevel: 'low' as TensionLevel,
      vibeLabel: 'Home / Grounded',
    };

    if (stemId === '01_Ambient_Pad') {
      const voicing = getChordMidiVoicing(chord, 3);
      for (const midi of voicing) {
        notes.push({
          id: createNoteId('pad'),
          midi,
          startBeat: barStart,
          durationBeats: beatsPerBar - 0.1,
          velocity: 0.65,
        });
      }
    } else if (stemId === '02_Rhythm_Pulse') {
      const voicing = getChordMidiVoicing(chord, 4);
      const arpSeq = [...voicing, voicing[0] + 12];
      const steps = beatsPerBar * 2; // 8th notes
      for (let s = 0; s < steps; s++) {
        notes.push({
          id: createNoteId('arp'),
          midi: arpSeq[s % arpSeq.length],
          startBeat: barStart + s * 0.5,
          durationBeats: 0.4,
          velocity: s % 2 === 0 ? 0.8 : 0.58,
        });
      }
    } else if (stemId === '03_Bass') {
      const bassRoot = 36 + chord.root; // C2..B2 range
      const steps = beatsPerBar * 4; // 16th-note pulse
      for (let s = 0; s < steps; s++) {
        const isDownbeat = s % 4 === 0;
        const isOctaveLift = s === steps - 2;
        notes.push({
          id: createNoteId('bass'),
          midi: isOctaveLift ? bassRoot + 12 : bassRoot,
          startBeat: barStart + s * 0.25,
          durationBeats: 0.22,
          velocity: isDownbeat ? 0.92 : 0.65,
        });
      }
    } else if (stemId === '04_Percussion') {
      // Kick (36), Snare (38), Closed Hat (42), Open Hat (46)
      for (let beat = 0; beat < beatsPerBar; beat++) {
        const b = barStart + beat;
        // Kick on beat 0 and syncopated beats
        if (beat === 0 || (beatsPerBar === 4 && beat === 2) || (beatsPerBar === 5 && beat === 3)) {
          notes.push({ id: createNoteId('drm'), midi: 36, startBeat: b, durationBeats: 0.25, velocity: 0.95 });
        }
        // Snare on backbeats
        if (
          (beatsPerBar === 4 && (beat === 1 || beat === 3)) ||
          (beatsPerBar === 5 && (beat === 2 || beat === 4)) ||
          (beatsPerBar === 3 && beat === 2)
        ) {
          notes.push({ id: createNoteId('drm'), midi: 38, startBeat: b, durationBeats: 0.25, velocity: 0.88 });
        }
        // Steady 8th closed hats
        notes.push({ id: createNoteId('drm'), midi: 42, startBeat: b, durationBeats: 0.2, velocity: 0.68 });
        notes.push({
          id: createNoteId('drm'),
          midi: beat === beatsPerBar - 1 ? 46 : 42,
          startBeat: b + 0.5,
          durationBeats: 0.2,
          velocity: 0.52,
        });
      }
    } else if (stemId === '05_Lead_Melody') {
      const voicing = getChordMidiVoicing(chord, 5);
      const r = voicing[0];
      const third = voicing[1] ?? snapMidiToScale(r + 3, root, scaleId);
      const fifth = voicing[2] ?? snapMidiToScale(r + 7, root, scaleId);
      // Sparse, musical motif anchored on chord tones
      notes.push({ id: createNoteId('lead'), midi: r, startBeat: barStart, durationBeats: 1, velocity: 0.85 });
      if (beatsPerBar >= 4) {
        notes.push({ id: createNoteId('lead'), midi: third, startBeat: barStart + 1.5, durationBeats: 0.5, velocity: 0.78 });
        notes.push({ id: createNoteId('lead'), midi: fifth, startBeat: barStart + 2, durationBeats: 1.5, velocity: 0.88 });
      } else {
        notes.push({ id: createNoteId('lead'), midi: fifth, startBeat: barStart + 1.5, durationBeats: 1, velocity: 0.82 });
      }
    }
  }

  return notes;
}

/**
 * Finds the 0..6 scale degree index of a pitch class in (root, scaleId).
 * If the pitch class is outside the scale, returns the nearest scale degree index.
 */
export function findScaleDegree(pc: PitchClass, root: PitchClass, scaleId: ScaleId): number {
  const interval = mod12(pc - root);
  const intervals = SCALES[scaleId].intervals;
  const exact = intervals.indexOf(interval);
  if (exact !== -1) return exact;

  let bestDeg = 0;
  let bestDist = 99;
  intervals.forEach((iv, idx) => {
    const dist = Math.min(Math.abs(iv - interval), 12 - Math.abs(iv - interval));
    if (dist < bestDist) {
      bestDist = dist;
      bestDeg = idx;
    }
  });
  return bestDeg;
}

/**
 * Lossless scale-degree remapping when switching key or scale:
 * Maps each note's exact scale degree (0..6) in (oldRoot, oldScaleId) to the
 * corresponding degree in (newRoot, newScaleId), so switching Scale A -> B -> A
 * returns the exact original melody without collapsing notes downward.
 */
export function remapNotesToScale(
  notes: MidiNote[],
  oldRoot: PitchClass,
  oldScaleId: ScaleId,
  newRoot: PitchClass,
  newScaleId: ScaleId,
): MidiNote[] {
  // Shortest semitone shift between roots (-6..+6)
  let delta = newRoot - oldRoot;
  if (delta > 6) delta -= 12;
  if (delta < -6) delta += 12;

  const newIntervals = SCALES[newScaleId].intervals;

  return notes.map((note) => {
    const semitonesAboveOldRoot = note.midi - oldRoot;
    const octave = Math.floor(semitonesAboveOldRoot / 12);
    const deg = findScaleDegree(mod12(note.midi), oldRoot, oldScaleId);
    const newRootAnchor = oldRoot + octave * 12 + delta;
    const mappedMidi = Math.max(24, Math.min(108, newRootAnchor + newIntervals[deg]));
    return { ...note, midi: mappedMidi };
  });
}
