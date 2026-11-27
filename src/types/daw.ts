export type PitchClass = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;

export type ScaleId =
  | 'major'
  | 'natural_minor'
  | 'dorian'
  | 'phrygian'
  | 'phrygian_dominant'
  | 'mixolydian'
  | 'locrian'
  | 'harmonic_minor';

export type TimeSignature = '4/4' | '3/4' | '5/4';

export type ChordQuality = 'maj' | 'min' | 'dim' | 'aug' | 'dom7' | 'min7' | 'maj7' | 'sus2' | 'sus4' | 'power';

export type TensionLevel = 'low' | 'medium' | 'high';

export type NoteRole = 'root' | 'third' | 'fifth' | 'seventh' | 'scale' | 'outside';

export type StemId =
  | '01_Ambient_Pad'
  | '02_Rhythm_Pulse'
  | '03_Bass'
  | '04_Percussion'
  | '05_Lead_Melody';

export type InstrumentPresetId =
  // Dark Analog & Cyberpunk Synth Bank
  | 'carpenter_pulse_bass'
  | 'dystopian_brass_lead'
  | 'cyberpunk_reese_bass'
  | 'neon_arp_pluck'
  | 'dark_analog_pad'
  | 'industrial_drum_kit'
  // Retro / 16-Bit Chiptune & FM Bank (Phase 1 procedural; Phase 3 adds .sf2/.sfz)
  | 'retro_chiptune_lead'
  | 'retro_fm_bass'
  | 'retro_rpg_strings'
  | 'retro_harp_pluck'
  | 'retro_arcade_drums';

export type DrawingTool = 'pen' | 'arp' | 'select' | 'erase';

export type QuantizeGrid = 1 | 0.5 | 0.25; // Quarter, Eighth, Sixteenth (in beats)

export interface ChordEvent {
  bar: number; // 0-indexed bar number
  root: PitchClass;
  quality: ChordQuality;
  romanNumeral: string;
  tensionLevel: TensionLevel;
  vibeLabel: string; // Beginner-friendly plain-English meaning, e.g. "Home / Stable"
}

export interface MidiNote {
  id: string;
  midi: number; // 0..127 (for percussion, maps to DRUM_LANES midi key)
  startBeat: number; // In quarter-note beats from start of section
  durationBeats: number; // In quarter-note beats
  velocity: number; // 0..1
}

export interface StemTrack {
  id: StemId;
  name: string;
  shortLabel: string;
  color: string; // Tailwind/hex accent
  instrumentId: InstrumentPresetId;
  volumeDb: number; // -48..+6
  muted: boolean;
  solo: boolean;
  /** Vertical intensity range (0..1) used in Phase 2 adaptive layering */
  intensityMin: number;
  intensityMax: number;
  isDrum: boolean;
  notes: MidiNote[];
}

export interface SongSection {
  id: string;
  name: string;
  bars: number; // 4, 8, or 16
  root: PitchClass;
  scaleId: ScaleId;
  chords: ChordEvent[];
  stems: Record<StemId, StemTrack>;
}

export interface DawProject {
  id: string;
  name: string;
  presetId: string | null;
  bpm: number;
  timeSignature: TimeSignature;
  activeSectionId: string;
  sections: SongSection[];
}

export interface DrumLane {
  midi: number;
  name: string;
  shortName: string;
  color: string;
  hint: string;
}

export const DRUM_LANES: DrumLane[] = [
  { midi: 49, name: 'Crash / FX', shortName: 'FX', color: '#a855f7', hint: 'Bar 1 impact or transition swell' },
  { midi: 46, name: 'Open Hat', shortName: 'OH', color: '#06b6d4', hint: 'Off-beat lift before snare' },
  { midi: 42, name: 'Closed Hat', shortName: 'CH', color: '#22d3ee', hint: 'Steady 8th or 16th groove' },
  { midi: 45, name: 'Industrial Perc', shortName: 'PRC', color: '#f97316', hint: 'Syncopated metallic accent' },
  { midi: 39, name: 'Clap / Rim', shortName: 'CLP', color: '#ec4899', hint: 'Layer with snare or off-beats' },
  { midi: 38, name: 'Gated Snare', shortName: 'SNR', color: '#f59e0b', hint: 'Backbeat (beats 2 & 4)' },
  { midi: 36, name: 'Analog Kick', shortName: 'KCK', color: '#ef4444', hint: 'Anchor beat 1 & driving pulse' },
];

export const STEM_ORDER: StemId[] = [
  '01_Ambient_Pad',
  '02_Rhythm_Pulse',
  '03_Bass',
  '04_Percussion',
  '05_Lead_Melody',
];
