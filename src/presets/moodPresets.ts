import {
  ChordEvent,
  DawProject,
  InstrumentPresetId,
  PitchClass,
  ScaleId,
  SongSection,
  StemId,
  StemTrack,
  TimeSignature,
} from '../types/daw';
import {
  createNoteId,
  generateStemPatternForChords,
  getBeatsPerBar,
  getChordMidiVoicing,
  mod12,
} from '../theory/musicTheory';

export interface MoodPresetDefinition {
  id: string;
  name: string;
  subtitle: string;
  gameGenre: string;
  vibeBadge: string;
  accentColor: string;
  bpm: number;
  timeSignature: TimeSignature;
  root: PitchClass;
  scaleId: ScaleId;
  bars: number;
  progressionLabel: string;
  chords: ChordEvent[];
  instruments: Record<StemId, InstrumentPresetId>;
  buildProject: () => DawProject;
}

function makeDefaultStems(
  instruments: Record<StemId, InstrumentPresetId>,
  notesByStem: Partial<Record<StemId, StemTrack['notes']>>,
): Record<StemId, StemTrack> {
  return {
    '01_Ambient_Pad': {
      id: '01_Ambient_Pad',
      name: 'Ambient Pad',
      shortLabel: 'PAD',
      color: '#818cf8',
      instrumentId: instruments['01_Ambient_Pad'],
      volumeDb: -8,
      muted: false,
      solo: false,
      intensityMin: 0.0,
      intensityMax: 1.0,
      isDrum: false,
      notes: notesByStem['01_Ambient_Pad'] ?? [],
    },
    '02_Rhythm_Pulse': {
      id: '02_Rhythm_Pulse',
      name: 'Rhythm Pulse',
      shortLabel: 'ARP',
      color: '#22d3ee',
      instrumentId: instruments['02_Rhythm_Pulse'],
      volumeDb: -6,
      muted: false,
      solo: false,
      intensityMin: 0.25,
      intensityMax: 1.0,
      isDrum: false,
      notes: notesByStem['02_Rhythm_Pulse'] ?? [],
    },
    '03_Bass': {
      id: '03_Bass',
      name: 'Bass',
      shortLabel: 'BAS',
      color: '#f59e0b',
      instrumentId: instruments['03_Bass'],
      volumeDb: -4,
      muted: false,
      solo: false,
      intensityMin: 0.15,
      intensityMax: 1.0,
      isDrum: false,
      notes: notesByStem['03_Bass'] ?? [],
    },
    '04_Percussion': {
      id: '04_Percussion',
      name: 'Percussion',
      shortLabel: 'DRM',
      color: '#f43f5e',
      instrumentId: instruments['04_Percussion'],
      volumeDb: -4,
      muted: false,
      solo: false,
      intensityMin: 0.45,
      intensityMax: 1.0,
      isDrum: true,
      notes: notesByStem['04_Percussion'] ?? [],
    },
    '05_Lead_Melody': {
      id: '05_Lead_Melody',
      name: 'Lead Melody',
      shortLabel: 'LED',
      color: '#34d399',
      instrumentId: instruments['05_Lead_Melody'],
      volumeDb: -5,
      muted: false,
      solo: false,
      intensityMin: 0.65,
      intensityMax: 1.0,
      isDrum: false,
      notes: notesByStem['05_Lead_Melody'] ?? [],
    },
  };
}

function buildSectionFromPreset(
  preset: Omit<MoodPresetDefinition, 'buildProject'>,
  customNotes?: Partial<Record<StemId, StemTrack['notes']>>,
): SongSection {
  const stemIds: StemId[] = [
    '01_Ambient_Pad',
    '02_Rhythm_Pulse',
    '03_Bass',
    '04_Percussion',
    '05_Lead_Melody',
  ];
  const notesByStem: Partial<Record<StemId, StemTrack['notes']>> = {};
  for (const sid of stemIds) {
    notesByStem[sid] =
      customNotes?.[sid] ??
      generateStemPatternForChords(
        sid,
        preset.chords,
        preset.bars,
        preset.timeSignature,
        preset.root,
        preset.scaleId,
      );
  }
  return {
    id: 'sec_exploration',
    name: 'Exploration',
    role: 'loop',
    bars: preset.bars,
    root: preset.root,
    scaleId: preset.scaleId,
    transitionQuantization: 'next_bar',
    useTransitionFill: false,
    chords: preset.chords.map((c) => ({ ...c })),
    stems: makeDefaultStems(preset.instruments, notesByStem),
  };
}

function buildAdaptiveSuite(
  preset: Omit<MoodPresetDefinition, 'buildProject'>,
  customExplorationNotes?: Partial<Record<StemId, StemTrack['notes']>>,
): SongSection[] {
  const exploration = buildSectionFromPreset(preset, customExplorationNotes);
  const bpb = getBeatsPerBar(preset.timeSignature);

  // Alert section: heightened tension chords (emphasize bII / iv / V7)
  const alertChords: ChordEvent[] = [
    { bar: 0, root: preset.root, quality: 'min', romanNumeral: 'i', tensionLevel: 'medium', vibeLabel: 'Tense Watch' },
    { bar: 1, root: mod12(preset.root + 1), quality: 'maj', romanNumeral: 'bII', tensionLevel: 'high', vibeLabel: 'Dark Tension' },
    { bar: 2, root: mod12(preset.root + 5), quality: 'min', romanNumeral: 'iv', tensionLevel: 'medium', vibeLabel: 'Closing In' },
    { bar: 3, root: mod12(preset.root + 7), quality: 'dom7', romanNumeral: 'V7', tensionLevel: 'high', vibeLabel: 'Pulls to Combat' },
  ];
  const alert: SongSection = {
    id: 'sec_alert',
    name: 'Alert',
    role: 'loop',
    bars: 4,
    root: preset.root,
    scaleId: preset.scaleId,
    transitionQuantization: 'next_bar',
    useTransitionFill: true,
    chords: alertChords,
    stems: makeDefaultStems(preset.instruments, {
      '01_Ambient_Pad': generateStemPatternForChords('01_Ambient_Pad', alertChords, 4, preset.timeSignature, preset.root, preset.scaleId),
      '02_Rhythm_Pulse': generateStemPatternForChords('02_Rhythm_Pulse', alertChords, 4, preset.timeSignature, preset.root, preset.scaleId),
      '03_Bass': generateStemPatternForChords('03_Bass', alertChords, 4, preset.timeSignature, preset.root, preset.scaleId),
      '04_Percussion': generateStemPatternForChords('04_Percussion', alertChords, 4, preset.timeSignature, preset.root, preset.scaleId),
      '05_Lead_Melody': [],
    }),
  };

  // Combat section: full-intensity driving progression
  const combatChords: ChordEvent[] = [
    { bar: 0, root: preset.root, quality: 'power', romanNumeral: 'i5', tensionLevel: 'medium', vibeLabel: 'Heavy Impact' },
    { bar: 1, root: mod12(preset.root + 8), quality: 'maj', romanNumeral: 'bVI', tensionLevel: 'medium', vibeLabel: 'Epic Surge' },
    { bar: 2, root: mod12(preset.root + 10), quality: 'maj', romanNumeral: 'bVII', tensionLevel: 'high', vibeLabel: 'Driving Push' },
    { bar: 3, root: mod12(preset.root + 7), quality: 'dom7', romanNumeral: 'V7', tensionLevel: 'high', vibeLabel: 'Boss Turnaround' },
  ];
  const combat: SongSection = {
    id: 'sec_combat',
    name: 'Combat',
    role: 'loop',
    bars: 4,
    root: preset.root,
    scaleId: preset.scaleId,
    transitionQuantization: 'next_bar',
    useTransitionFill: true,
    chords: combatChords,
    stems: makeDefaultStems(preset.instruments, {
      '01_Ambient_Pad': generateStemPatternForChords('01_Ambient_Pad', combatChords, 4, preset.timeSignature, preset.root, preset.scaleId),
      '02_Rhythm_Pulse': generateStemPatternForChords('02_Rhythm_Pulse', combatChords, 4, preset.timeSignature, preset.root, preset.scaleId),
      '03_Bass': generateStemPatternForChords('03_Bass', combatChords, 4, preset.timeSignature, preset.root, preset.scaleId),
      '04_Percussion': generateStemPatternForChords('04_Percussion', combatChords, 4, preset.timeSignature, preset.root, preset.scaleId),
      '05_Lead_Melody': generateStemPatternForChords('05_Lead_Melody', combatChords, 4, preset.timeSignature, preset.root, preset.scaleId),
    }),
  };

  // Victory_Stinger: 2-bar one-shot resolving cue
  const stingerChords: ChordEvent[] = [
    { bar: 0, root: mod12(preset.root + 7), quality: 'maj', romanNumeral: 'V', tensionLevel: 'high', vibeLabel: 'Build Up' },
    { bar: 1, root: preset.root, quality: 'maj', romanNumeral: 'I', tensionLevel: 'low', vibeLabel: 'Triumphant Resolve' },
  ];
  const stingerLeadRoot = 60 + preset.root;
  const stinger: SongSection = {
    id: 'sec_victory_stinger',
    name: 'Victory_Stinger',
    role: 'stinger',
    bars: 2,
    root: preset.root,
    scaleId: 'major',
    transitionQuantization: 'next_beat',
    useTransitionFill: false,
    chords: stingerChords,
    stems: makeDefaultStems(preset.instruments, {
      '01_Ambient_Pad': generateStemPatternForChords('01_Ambient_Pad', stingerChords, 2, preset.timeSignature, preset.root, 'major'),
      '02_Rhythm_Pulse': [],
      '03_Bass': [
        { id: createNoteId('st'), midi: 36 + mod12(preset.root + 7), startBeat: 0, durationBeats: bpb, velocity: 0.9 },
        { id: createNoteId('st'), midi: 36 + preset.root, startBeat: bpb, durationBeats: bpb, velocity: 0.95 },
      ],
      '04_Percussion': [
        { id: createNoteId('st'), midi: 38, startBeat: bpb - 1, durationBeats: 0.25, velocity: 0.85 },
        { id: createNoteId('st'), midi: 38, startBeat: bpb - 0.5, durationBeats: 0.25, velocity: 0.92 },
        { id: createNoteId('st'), midi: 49, startBeat: bpb, durationBeats: 0.5, velocity: 0.95 },
        { id: createNoteId('st'), midi: 36, startBeat: bpb, durationBeats: 0.25, velocity: 1.0 },
      ],
      '05_Lead_Melody': [
        { id: createNoteId('st'), midi: stingerLeadRoot + 7, startBeat: 0, durationBeats: 0.75, velocity: 0.88 },
        { id: createNoteId('st'), midi: stingerLeadRoot + 11, startBeat: 1, durationBeats: 0.75, velocity: 0.9 },
        { id: createNoteId('st'), midi: stingerLeadRoot + 12, startBeat: bpb, durationBeats: bpb - 0.25, velocity: 0.96 },
      ],
    }),
  };

  return [exploration, alert, combat, stinger];
}

const DARK_ANALOG_INSTRUMENTS: Record<StemId, InstrumentPresetId> = {
  '01_Ambient_Pad': 'dark_analog_pad',
  '02_Rhythm_Pulse': 'neon_arp_pluck',
  '03_Bass': 'carpenter_pulse_bass',
  '04_Percussion': 'industrial_drum_kit',
  '05_Lead_Melody': 'dystopian_brass_lead',
};

const CYBERPUNK_INSTRUMENTS: Record<StemId, InstrumentPresetId> = {
  '01_Ambient_Pad': 'dark_analog_pad',
  '02_Rhythm_Pulse': 'neon_arp_pluck',
  '03_Bass': 'cyberpunk_reese_bass',
  '04_Percussion': 'industrial_drum_kit',
  '05_Lead_Melody': 'dystopian_brass_lead',
};

const RETRO_INSTRUMENTS: Record<StemId, InstrumentPresetId> = {
  '01_Ambient_Pad': 'retro_rpg_strings',
  '02_Rhythm_Pulse': 'retro_harp_pluck',
  '03_Bass': 'retro_fm_bass',
  '04_Percussion': 'retro_arcade_drums',
  '05_Lead_Melody': 'retro_chiptune_lead',
};

// 1. Carpenter 5/4 Dystopian Pulse (A Phrygian: A=9)
const carpenterBase: Omit<MoodPresetDefinition, 'buildProject'> = {
  id: 'carpenter_5_4',
  name: 'Carpenter 5/4 Dystopian Pulse',
  subtitle: 'Escape From New York vibe — hypnotic 5/4 analog pulse & tense synth motifs',
  gameGenre: 'Sci-Fi / Thriller',
  vibeBadge: '5/4 Hypnotic Tension',
  accentColor: '#f59e0b',
  bpm: 110,
  timeSignature: '5/4',
  root: 9, // A
  scaleId: 'phrygian',
  bars: 4,
  progressionLabel: 'i → bII → i → bVII',
  instruments: DARK_ANALOG_INSTRUMENTS,
  chords: [
    { bar: 0, root: 9, quality: 'min', romanNumeral: 'i', tensionLevel: 'low', vibeLabel: 'Home / Grounded' },
    { bar: 1, root: 10, quality: 'maj', romanNumeral: 'bII', tensionLevel: 'high', vibeLabel: 'Dark Tension' },
    { bar: 2, root: 9, quality: 'min', romanNumeral: 'i', tensionLevel: 'low', vibeLabel: 'Home / Grounded' },
    { bar: 3, root: 7, quality: 'maj', romanNumeral: 'bVII', tensionLevel: 'medium', vibeLabel: 'Driving / Anthemic' },
  ],
};

// 2. Cyberpunk Street Combat (F Phrygian Dominant: F=5)
const cyberpunkBase: Omit<MoodPresetDefinition, 'buildProject'> = {
  id: 'cyberpunk_combat',
  name: 'Cyberpunk Street Combat',
  subtitle: 'Heavy Reese mid-bass, aggressive half-step riffs & industrial percussion',
  gameGenre: 'Action / Combat',
  vibeBadge: 'High-Energy Grit',
  accentColor: '#ef4444',
  bpm: 128,
  timeSignature: '4/4',
  root: 5, // F
  scaleId: 'phrygian_dominant',
  bars: 4,
  progressionLabel: 'I → bII → iv → bIII',
  instruments: CYBERPUNK_INSTRUMENTS,
  chords: [
    { bar: 0, root: 5, quality: 'maj', romanNumeral: 'I', tensionLevel: 'low', vibeLabel: 'Home / Aggressive' },
    { bar: 1, root: 6, quality: 'maj', romanNumeral: 'bII', tensionLevel: 'high', vibeLabel: 'Dark Tension' },
    { bar: 2, root: 10, quality: 'min', romanNumeral: 'iv', tensionLevel: 'medium', vibeLabel: 'Heavy / Moving' },
    { bar: 3, root: 8, quality: 'maj', romanNumeral: 'bIII', tensionLevel: 'medium', vibeLabel: 'Gritty Turn' },
  ],
};

// 3. Neon Rain / Synthwave Exploration (D Dorian: D=2)
const neonRainBase: Omit<MoodPresetDefinition, 'buildProject'> = {
  id: 'neon_rain_synthwave',
  name: 'Neon Rain / Synthwave Exploration',
  subtitle: 'Nocturnal moody analog pads with stereo ping-pong arpeggios',
  gameGenre: 'Exploration / Hub',
  vibeBadge: 'Nocturnal Cool',
  accentColor: '#22d3ee',
  bpm: 96,
  timeSignature: '4/4',
  root: 2, // D
  scaleId: 'dorian',
  bars: 4,
  progressionLabel: 'i → IV → bVII → i',
  instruments: DARK_ANALOG_INSTRUMENTS,
  chords: [
    { bar: 0, root: 2, quality: 'min', romanNumeral: 'i', tensionLevel: 'low', vibeLabel: 'Home / Grounded' },
    { bar: 1, root: 7, quality: 'maj', romanNumeral: 'IV', tensionLevel: 'medium', vibeLabel: 'Neon Lift' },
    { bar: 2, root: 0, quality: 'maj', romanNumeral: 'bVII', tensionLevel: 'medium', vibeLabel: 'Driving / Open' },
    { bar: 3, root: 2, quality: 'min', romanNumeral: 'i', tensionLevel: 'low', vibeLabel: 'Home / Grounded' },
  ],
};

// 4. Retro 16-Bit RPG Overworld / Town (C Major: C=0)
const retroRpgBase: Omit<MoodPresetDefinition, 'buildProject'> = {
  id: 'retro_rpg_overworld',
  name: 'Retro 16-Bit RPG Overworld',
  subtitle: 'Uplifting classic adventure progression with chiptune lead & FM bass',
  gameGenre: 'RPG / Adventure',
  vibeBadge: 'Heroic 16-Bit',
  accentColor: '#34d399',
  bpm: 105,
  timeSignature: '4/4',
  root: 0, // C
  scaleId: 'major',
  bars: 4,
  progressionLabel: 'I → V → vi → IV',
  instruments: RETRO_INSTRUMENTS,
  chords: [
    { bar: 0, root: 0, quality: 'maj', romanNumeral: 'I', tensionLevel: 'low', vibeLabel: 'Home / Bright' },
    { bar: 1, root: 7, quality: 'maj', romanNumeral: 'V', tensionLevel: 'high', vibeLabel: 'Pulls Back Home' },
    { bar: 2, root: 9, quality: 'min', romanNumeral: 'vi', tensionLevel: 'low', vibeLabel: 'Emotional Lift' },
    { bar: 3, root: 5, quality: 'maj', romanNumeral: 'IV', tensionLevel: 'medium', vibeLabel: 'Heroic Journey' },
  ],
};

// 5. Tense Stealth Infiltration (E Locrian: E=4)
const stealthBase: Omit<MoodPresetDefinition, 'buildProject'> = {
  id: 'tense_stealth',
  name: 'Tense Stealth Infiltration',
  subtitle: 'Suspenseful half-step drone, minimal sub-pulse & shadowy atmosphere',
  gameGenre: 'Stealth / Horror',
  vibeBadge: 'Shadowy Suspense',
  accentColor: '#a855f7',
  bpm: 85,
  timeSignature: '4/4',
  root: 4, // E
  scaleId: 'locrian',
  bars: 4,
  progressionLabel: 'i° → bV → i° → bII',
  instruments: CYBERPUNK_INSTRUMENTS,
  chords: [
    { bar: 0, root: 4, quality: 'power', romanNumeral: 'i5', tensionLevel: 'medium', vibeLabel: 'Hollow Drone' },
    { bar: 1, root: 10, quality: 'maj', romanNumeral: 'bV', tensionLevel: 'high', vibeLabel: 'Tritone Danger' },
    { bar: 2, root: 4, quality: 'power', romanNumeral: 'i5', tensionLevel: 'medium', vibeLabel: 'Hollow Drone' },
    { bar: 3, root: 5, quality: 'maj', romanNumeral: 'bII', tensionLevel: 'high', vibeLabel: 'Dark Tension' },
  ],
};

// 6. Heroic Boss Showdown (C Harmonic Minor: C=0)
const bossBase: Omit<MoodPresetDefinition, 'buildProject'> = {
  id: 'heroic_boss',
  name: 'Heroic Boss Showdown',
  subtitle: 'Fast dramatic minor turnaround built for full vertical intensity layering',
  gameGenre: 'Boss Battle',
  vibeBadge: '145 BPM Epic',
  accentColor: '#f43f5e',
  bpm: 145,
  timeSignature: '4/4',
  root: 0, // C
  scaleId: 'harmonic_minor',
  bars: 4,
  progressionLabel: 'i → VI → iv → V7',
  instruments: DARK_ANALOG_INSTRUMENTS,
  chords: [
    { bar: 0, root: 0, quality: 'min', romanNumeral: 'i', tensionLevel: 'low', vibeLabel: 'Home / Dramatic' },
    { bar: 1, root: 8, quality: 'maj', romanNumeral: 'VI', tensionLevel: 'medium', vibeLabel: 'Epic Scale' },
    { bar: 2, root: 5, quality: 'min', romanNumeral: 'iv', tensionLevel: 'medium', vibeLabel: 'Heavy / Moving' },
    { bar: 3, root: 7, quality: 'dom7', romanNumeral: 'V7', tensionLevel: 'high', vibeLabel: 'Pulls Back Home' },
  ],
};

function buildCarpenterCustomLead(): StemTrack['notes'] {
  // Sparse, eerie high motif over 5/4 (20 beats total)
  return [
    { id: createNoteId('cl'), midi: 69, startBeat: 0, durationBeats: 2, velocity: 0.8 }, // A4
    { id: createNoteId('cl'), midi: 76, startBeat: 2.5, durationBeats: 1.5, velocity: 0.72 }, // E5
    { id: createNoteId('cl'), midi: 70, startBeat: 5, durationBeats: 2.5, velocity: 0.85 }, // Bb4 (bII tension)
    { id: createNoteId('cl'), midi: 69, startBeat: 10, durationBeats: 2, velocity: 0.8 }, // A4
    { id: createNoteId('cl'), midi: 72, startBeat: 12.5, durationBeats: 1.5, velocity: 0.75 }, // C5
    { id: createNoteId('cl'), midi: 74, startBeat: 15, durationBeats: 2, velocity: 0.82 }, // D5
    { id: createNoteId('cl'), midi: 71, startBeat: 17.5, durationBeats: 2, velocity: 0.78 }, // B4/G-chord tone -> actually G4/D5
  ].map((n) => (n.midi === 71 ? { ...n, midi: 67 } : n)); // keep G4 strictly in A Phrygian!
}

function buildStealthCustomStems(): Partial<Record<StemId, StemTrack['notes']>> {
  const bpb = getBeatsPerBar('4/4');
  const bassNotes: StemTrack['notes'] = [];
  const drumNotes: StemTrack['notes'] = [];
  for (let bar = 0; bar < 4; bar++) {
    const start = bar * bpb;
    const chord = stealthBase.chords[bar];
    const bassMidi = 36 + mod12(chord.root);
    bassNotes.push({ id: createNoteId('sb'), midi: bassMidi, startBeat: start, durationBeats: 1.5, velocity: 0.75 });
    bassNotes.push({ id: createNoteId('sb'), midi: bassMidi, startBeat: start + 2.5, durationBeats: 0.75, velocity: 0.55 });
    // Minimal stealth pulse percussion
    drumNotes.push({ id: createNoteId('sd'), midi: 36, startBeat: start, durationBeats: 0.25, velocity: 0.7 });
    drumNotes.push({ id: createNoteId('sd'), midi: 45, startBeat: start + 3, durationBeats: 0.25, velocity: 0.5 });
  }
  const padNotes = stealthBase.chords.flatMap((chord, bar) =>
    getChordMidiVoicing(chord, 3).map((midi) => ({
      id: createNoteId('sp'),
      midi,
      startBeat: bar * bpb,
      durationBeats: bpb - 0.1,
      velocity: 0.52,
    })),
  );
  return {
    '01_Ambient_Pad': padNotes,
    '02_Rhythm_Pulse': [],
    '03_Bass': bassNotes,
    '04_Percussion': drumNotes,
    '05_Lead_Melody': [],
  };
}

export const MOOD_PRESETS: MoodPresetDefinition[] = [
  {
    ...carpenterBase,
    buildProject: () => ({
      id: `proj_${carpenterBase.id}`,
      name: carpenterBase.name,
      presetId: carpenterBase.id,
      bpm: carpenterBase.bpm,
      timeSignature: carpenterBase.timeSignature,
      activeSectionId: 'sec_exploration',
      sections: buildAdaptiveSuite(carpenterBase, { '05_Lead_Melody': buildCarpenterCustomLead() }),
    }),
  },
  {
    ...cyberpunkBase,
    buildProject: () => ({
      id: `proj_${cyberpunkBase.id}`,
      name: cyberpunkBase.name,
      presetId: cyberpunkBase.id,
      bpm: cyberpunkBase.bpm,
      timeSignature: cyberpunkBase.timeSignature,
      activeSectionId: 'sec_exploration',
      sections: buildAdaptiveSuite(cyberpunkBase),
    }),
  },
  {
    ...neonRainBase,
    buildProject: () => ({
      id: `proj_${neonRainBase.id}`,
      name: neonRainBase.name,
      presetId: neonRainBase.id,
      bpm: neonRainBase.bpm,
      timeSignature: neonRainBase.timeSignature,
      activeSectionId: 'sec_exploration',
      sections: buildAdaptiveSuite(neonRainBase),
    }),
  },
  {
    ...retroRpgBase,
    buildProject: () => ({
      id: `proj_${retroRpgBase.id}`,
      name: retroRpgBase.name,
      presetId: retroRpgBase.id,
      bpm: retroRpgBase.bpm,
      timeSignature: retroRpgBase.timeSignature,
      activeSectionId: 'sec_exploration',
      sections: buildAdaptiveSuite(retroRpgBase),
    }),
  },
  {
    ...stealthBase,
    buildProject: () => ({
      id: `proj_${stealthBase.id}`,
      name: stealthBase.name,
      presetId: stealthBase.id,
      bpm: stealthBase.bpm,
      timeSignature: stealthBase.timeSignature,
      activeSectionId: 'sec_exploration',
      sections: buildAdaptiveSuite(stealthBase, buildStealthCustomStems()),
    }),
  },
  {
    ...bossBase,
    buildProject: () => ({
      id: `proj_${bossBase.id}`,
      name: bossBase.name,
      presetId: bossBase.id,
      bpm: bossBase.bpm,
      timeSignature: bossBase.timeSignature,
      activeSectionId: 'sec_exploration',
      sections: buildAdaptiveSuite(bossBase),
    }),
  },
];

export function createDefaultProject(): DawProject {
  return MOOD_PRESETS[0].buildProject();
}

export function createBlankProject(): DawProject {
  const blankChords: ChordEvent[] = [
    { bar: 0, root: 0, quality: 'min', romanNumeral: 'i', tensionLevel: 'low', vibeLabel: 'Home / Grounded' },
    { bar: 1, root: 8, quality: 'maj', romanNumeral: 'VI', tensionLevel: 'low', vibeLabel: 'Emotional Lift' },
    { bar: 2, root: 3, quality: 'maj', romanNumeral: 'III', tensionLevel: 'low', vibeLabel: 'Open / Storytelling' },
    { bar: 3, root: 10, quality: 'maj', romanNumeral: 'VII', tensionLevel: 'medium', vibeLabel: 'Driving / Anthemic' },
  ];
  return {
    id: `proj_blank_${Date.now().toString(36)}`,
    name: 'Untitled Blank Song',
    presetId: 'blank',
    bpm: 110,
    timeSignature: '4/4',
    activeSectionId: 'sec_exploration',
    sections: [
      {
        id: 'sec_exploration',
        name: 'Exploration',
        role: 'loop',
        bars: 4,
        root: 0, // C
        scaleId: 'natural_minor',
        transitionQuantization: 'next_bar',
        useTransitionFill: false,
        chords: blankChords,
        stems: makeDefaultStems(DARK_ANALOG_INSTRUMENTS, {}),
      },
    ],
  };
}
