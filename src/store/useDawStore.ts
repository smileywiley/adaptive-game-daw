import { create } from 'zustand';
import {
  ChordEvent,
  DawProject,
  DrawingTool,
  InstrumentPresetId,
  MidiNote,
  PitchClass,
  QuantizeGrid,
  ScaleId,
  SongSection,
  STEM_ORDER,
  StemId,
  TimeSignature,
} from '../types/daw';
import { createDefaultProject, MOOD_PRESETS } from '../presets/moodPresets';
import {
  createNoteId,
  generateStemPatternForChords,
  getBeatsPerBar,
  getScaleChordOptions,
  remapNotesToScale,
} from '../theory/musicTheory';
import { audioEngine } from '../audio/audioEngine';

const STORAGE_KEY = 'theory_daw_project_v1';

function loadSavedProject(): DawProject {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultProject();
    const parsed = JSON.parse(raw) as DawProject;
    if (parsed && Array.isArray(parsed.sections) && parsed.sections.length > 0) {
      return parsed;
    }
  } catch {
    // ignore corrupted local storage
  }
  return createDefaultProject();
}

function saveProjectToStorage(project: DawProject): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
  } catch {
    // ignore quota errors
  }
}

export interface MidiDeviceInfo {
  id: string;
  name: string;
  manufacturer: string;
}

interface DawState {
  project: DawProject;
  activeStemId: StemId;
  isPlaying: boolean;
  isRecording: boolean;
  audioUnlocked: boolean;

  // Piano roll & theory tools
  tool: DrawingTool;
  quantizeGrid: QuantizeGrid;
  scaleLock: boolean;
  foldToScale: boolean;
  autoRemapOnKeyChange: boolean;
  qwertyOctave: number; // Base octave for QWERTY input (default 4)

  // Live pressed notes (for UI visual feedback on piano roll & input dock)
  activeLiveMidis: number[];

  // Mini USB MIDI keyboard state
  midiSupported: boolean;
  midiDevices: MidiDeviceInfo[];
  selectedMidiDeviceId: string | 'all';

  // UI modals
  presetModalOpen: boolean;

  // Undo stack (lightweight snapshots of sections)
  undoStack: SongSection[][];

  // Derived helper
  getActiveSection: () => SongSection;

  // Actions
  setPresetModalOpen: (open: boolean) => void;
  loadMoodPreset: (presetId: string) => void;
  importProjectJson: (jsonText: string) => { ok: boolean; error?: string };
  exportProjectJson: () => string;

  setActiveStem: (stemId: StemId) => void;
  setBpm: (bpm: number) => void;
  setTimeSignature: (ts: TimeSignature) => void;
  setSectionBars: (bars: number) => void;
  setKeyAndScale: (root: PitchClass, scaleId: ScaleId) => void;
  setAutoRemapOnKeyChange: (val: boolean) => void;

  setTool: (tool: DrawingTool) => void;
  setQuantizeGrid: (grid: QuantizeGrid) => void;
  setScaleLock: (locked: boolean) => void;
  setFoldToScale: (fold: boolean) => void;
  setQwertyOctave: (oct: number) => void;

  // Transport
  togglePlay: () => Promise<void>;
  stopPlayback: () => void;
  toggleRecord: () => void;
  markAudioUnlocked: () => void;

  // Chords & Beginner helpers
  setBarChord: (bar: number, chord: Omit<ChordEvent, 'bar'>) => void;
  autoFillStemFromChords: (stemId: StemId) => void;
  clearStemNotes: (stemId: StemId) => void;

  // Stem mixer
  setStemInstrument: (stemId: StemId, instrumentId: InstrumentPresetId) => void;
  setStemVolume: (stemId: StemId, volumeDb: number) => void;
  toggleStemMute: (stemId: StemId) => void;
  toggleStemSolo: (stemId: StemId) => void;

  // Notes
  addNotes: (stemId: StemId, notes: Omit<MidiNote, 'id'>[]) => void;
  updateNote: (stemId: StemId, noteId: string, patch: Partial<MidiNote>) => void;
  removeNote: (stemId: StemId, noteId: string) => void;
  undo: () => void;

  // Live input feedback
  addLiveMidi: (midi: number) => void;
  removeLiveMidi: (midi: number) => void;

  // MIDI hardware state
  setMidiStatus: (supported: boolean, devices: MidiDeviceInfo[]) => void;
  setSelectedMidiDeviceId: (id: string | 'all') => void;
}

function updateActiveSection(
  project: DawProject,
  updater: (section: SongSection) => SongSection,
): DawProject {
  const sections = project.sections.map((sec) =>
    sec.id === project.activeSectionId ? updater(sec) : sec,
  );
  return { ...project, sections };
}

function syncAudio(project: DawProject): void {
  const section = project.sections.find((s) => s.id === project.activeSectionId) ?? project.sections[0];
  if (section && audioEngine.isContextRunning()) {
    audioEngine.syncProject(project, section);
  }
}

export const useDawStore = create<DawState>((set, get) => ({
  project: loadSavedProject(),
  activeStemId: '05_Lead_Melody',
  isPlaying: false,
  isRecording: false,
  audioUnlocked: false,

  tool: 'pen',
  quantizeGrid: 0.25,
  scaleLock: true,
  foldToScale: false,
  autoRemapOnKeyChange: true,
  qwertyOctave: 4,

  activeLiveMidis: [],

  midiSupported: false,
  midiDevices: [],
  selectedMidiDeviceId: 'all',

  presetModalOpen: false,
  undoStack: [],

  getActiveSection: () => {
    const { project } = get();
    return project.sections.find((s) => s.id === project.activeSectionId) ?? project.sections[0];
  },

  setPresetModalOpen: (open) => set({ presetModalOpen: open }),

  loadMoodPreset: (presetId) => {
    const preset = MOOD_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    const nextProject = preset.buildProject();
    saveProjectToStorage(nextProject);
    set((state) => ({
      project: nextProject,
      undoStack: [...state.undoStack.slice(-19), state.project.sections],
      presetModalOpen: false,
    }));
    syncAudio(nextProject);
  },

  importProjectJson: (jsonText) => {
    try {
      const parsed = JSON.parse(jsonText) as DawProject;
      if (!parsed || !Array.isArray(parsed.sections) || parsed.sections.length === 0) {
        return { ok: false, error: 'Invalid project file: missing sections.' };
      }
      saveProjectToStorage(parsed);
      set({ project: parsed });
      syncAudio(parsed);
      return { ok: true };
    } catch {
      return { ok: false, error: 'Could not parse JSON file.' };
    }
  },

  exportProjectJson: () => JSON.stringify(get().project, null, 2),

  setActiveStem: (stemId) => set({ activeStemId: stemId }),

  setBpm: (bpm) => {
    const clamped = Math.max(50, Math.min(220, Math.round(bpm)));
    const nextProject = { ...get().project, bpm: clamped };
    saveProjectToStorage(nextProject);
    set({ project: nextProject });
    syncAudio(nextProject);
  },

  setTimeSignature: (timeSignature: TimeSignature) => {
    const nextProject = { ...get().project, timeSignature };
    saveProjectToStorage(nextProject);
    set({ project: nextProject });
    syncAudio(nextProject);
  },

  setSectionBars: (bars) => {
    const clamped = bars === 4 || bars === 8 || bars === 16 ? bars : 4;
    const prev = get().project;
    const nextProject = updateActiveSection(prev, (sec) => {
      const nextChords: ChordEvent[] = [];
      for (let b = 0; b < clamped; b++) {
        const existing = sec.chords[b] ?? sec.chords[b % sec.chords.length];
        nextChords.push({ ...existing, bar: b });
      }
      return { ...sec, bars: clamped, chords: nextChords };
    });
    saveProjectToStorage(nextProject);
    set({ project: nextProject });
    syncAudio(nextProject);
  },

  setKeyAndScale: (newRoot, newScaleId) => {
    const { project, autoRemapOnKeyChange } = get();
    const nextProject = updateActiveSection(project, (sec) => {
      const oldRoot = sec.root;
      const diatonic = getScaleChordOptions(newRoot, newScaleId);
      // Re-harmonize chords gently to the new key/scale
      const nextChords: ChordEvent[] = sec.chords.map((c, idx) => {
        if (idx === 0) {
          const home = diatonic[0];
          return { bar: c.bar, root: home.root, quality: home.quality, romanNumeral: home.romanNumeral, tensionLevel: home.tensionLevel, vibeLabel: home.vibeLabel };
        }
        // Keep relative degree if possible
        const oldInterval = (c.root - oldRoot + 12) % 12;
        const match =
          diatonic.find((opt) => ((opt.root - newRoot + 12) % 12) === oldInterval) ??
          diatonic[idx % diatonic.length];
        return {
          bar: c.bar,
          root: match.root,
          quality: match.quality,
          romanNumeral: match.romanNumeral,
          tensionLevel: match.tensionLevel,
          vibeLabel: match.vibeLabel,
        };
      });

      const nextStems = { ...sec.stems };
      if (autoRemapOnKeyChange) {
        for (const sid of STEM_ORDER) {
          const stem = sec.stems[sid];
          if (!stem.isDrum) {
            nextStems[sid] = {
              ...stem,
              notes: remapNotesToScale(stem.notes, oldRoot, newRoot, newScaleId),
            };
          }
        }
      }

      return { ...sec, root: newRoot, scaleId: newScaleId, chords: nextChords, stems: nextStems };
    });

    saveProjectToStorage(nextProject);
    set((state) => ({
      project: nextProject,
      undoStack: [...state.undoStack.slice(-19), state.project.sections],
    }));
    syncAudio(nextProject);
  },

  setAutoRemapOnKeyChange: (val) => set({ autoRemapOnKeyChange: val }),

  setTool: (tool) => set({ tool }),
  setQuantizeGrid: (quantizeGrid) => set({ quantizeGrid }),
  setScaleLock: (scaleLock) => set({ scaleLock }),
  setFoldToScale: (foldToScale) => set({ foldToScale }),
  setQwertyOctave: (oct) => set({ qwertyOctave: Math.max(2, Math.min(6, oct)) }),

  togglePlay: async () => {
    const { isPlaying, project } = get();
    const section = get().getActiveSection();
    if (isPlaying) {
      audioEngine.pause();
      set({ isPlaying: false });
    } else {
      await audioEngine.play(project, section);
      set({ isPlaying: true, audioUnlocked: true });
    }
  },

  stopPlayback: () => {
    audioEngine.stop();
    set({ isPlaying: false, isRecording: false });
  },

  toggleRecord: () => set((s) => ({ isRecording: !s.isRecording })),
  markAudioUnlocked: () => set({ audioUnlocked: true }),

  setBarChord: (bar, chord) => {
    const prev = get().project;
    const nextProject = updateActiveSection(prev, (sec) => ({
      ...sec,
      chords: sec.chords.map((c) => (c.bar === bar ? { ...chord, bar } : c)),
    }));
    saveProjectToStorage(nextProject);
    set((state) => ({
      project: nextProject,
      undoStack: [...state.undoStack.slice(-19), state.project.sections],
    }));
  },

  autoFillStemFromChords: (stemId) => {
    const prev = get().project;
    const nextProject = updateActiveSection(prev, (sec) => {
      const generated = generateStemPatternForChords(
        stemId,
        sec.chords,
        sec.bars,
        prev.timeSignature,
        sec.root,
        sec.scaleId,
      );
      return {
        ...sec,
        stems: {
          ...sec.stems,
          [stemId]: { ...sec.stems[stemId], notes: generated },
        },
      };
    });
    saveProjectToStorage(nextProject);
    set((state) => ({
      project: nextProject,
      undoStack: [...state.undoStack.slice(-19), state.project.sections],
    }));
    syncAudio(nextProject);
  },

  clearStemNotes: (stemId) => {
    const prev = get().project;
    const nextProject = updateActiveSection(prev, (sec) => ({
      ...sec,
      stems: {
        ...sec.stems,
        [stemId]: { ...sec.stems[stemId], notes: [] },
      },
    }));
    saveProjectToStorage(nextProject);
    set((state) => ({
      project: nextProject,
      undoStack: [...state.undoStack.slice(-19), state.project.sections],
    }));
    syncAudio(nextProject);
  },

  setStemInstrument: (stemId, instrumentId) => {
    const prev = get().project;
    const nextProject = updateActiveSection(prev, (sec) => ({
      ...sec,
      stems: {
        ...sec.stems,
        [stemId]: { ...sec.stems[stemId], instrumentId },
      },
    }));
    saveProjectToStorage(nextProject);
    set({ project: nextProject });
    syncAudio(nextProject);
  },

  setStemVolume: (stemId, volumeDb) => {
    const prev = get().project;
    const nextProject = updateActiveSection(prev, (sec) => ({
      ...sec,
      stems: {
        ...sec.stems,
        [stemId]: { ...sec.stems[stemId], volumeDb },
      },
    }));
    saveProjectToStorage(nextProject);
    set({ project: nextProject });
    syncAudio(nextProject);
  },

  toggleStemMute: (stemId) => {
    const prev = get().project;
    const nextProject = updateActiveSection(prev, (sec) => ({
      ...sec,
      stems: {
        ...sec.stems,
        [stemId]: { ...sec.stems[stemId], muted: !sec.stems[stemId].muted },
      },
    }));
    saveProjectToStorage(nextProject);
    set({ project: nextProject });
    syncAudio(nextProject);
  },

  toggleStemSolo: (stemId) => {
    const prev = get().project;
    const nextProject = updateActiveSection(prev, (sec) => ({
      ...sec,
      stems: {
        ...sec.stems,
        [stemId]: { ...sec.stems[stemId], solo: !sec.stems[stemId].solo },
      },
    }));
    saveProjectToStorage(nextProject);
    set({ project: nextProject });
    syncAudio(nextProject);
  },

  addNotes: (stemId, newNotes) => {
    if (newNotes.length === 0) return;
    const prev = get().project;
    const totalBeats = get().getActiveSection().bars * getBeatsPerBar(prev.timeSignature);
    const stamped: MidiNote[] = newNotes
      .filter((n) => n.startBeat >= 0 && n.startBeat < totalBeats)
      .map((n) => ({ ...n, id: createNoteId('n') }));

    const nextProject = updateActiveSection(prev, (sec) => {
      const existing = sec.stems[stemId].notes;
      // Avoid exact duplicate note at same pitch & startBeat
      const filtered = stamped.filter(
        (sn) =>
          !existing.some(
            (ex) => ex.midi === sn.midi && Math.abs(ex.startBeat - sn.startBeat) < 0.05,
          ),
      );
      return {
        ...sec,
        stems: {
          ...sec.stems,
          [stemId]: { ...sec.stems[stemId], notes: [...existing, ...filtered] },
        },
      };
    });
    saveProjectToStorage(nextProject);
    set((state) => ({
      project: nextProject,
      undoStack: [...state.undoStack.slice(-19), state.project.sections],
    }));
    syncAudio(nextProject);
  },

  updateNote: (stemId, noteId, patch) => {
    const prev = get().project;
    const nextProject = updateActiveSection(prev, (sec) => ({
      ...sec,
      stems: {
        ...sec.stems,
        [stemId]: {
          ...sec.stems[stemId],
          notes: sec.stems[stemId].notes.map((n) => (n.id === noteId ? { ...n, ...patch } : n)),
        },
      },
    }));
    saveProjectToStorage(nextProject);
    set({ project: nextProject });
    syncAudio(nextProject);
  },

  removeNote: (stemId, noteId) => {
    const prev = get().project;
    const nextProject = updateActiveSection(prev, (sec) => ({
      ...sec,
      stems: {
        ...sec.stems,
        [stemId]: {
          ...sec.stems[stemId],
          notes: sec.stems[stemId].notes.filter((n) => n.id !== noteId),
        },
      },
    }));
    saveProjectToStorage(nextProject);
    set((state) => ({
      project: nextProject,
      undoStack: [...state.undoStack.slice(-19), state.project.sections],
    }));
    syncAudio(nextProject);
  },

  undo: () => {
    const { undoStack, project } = get();
    if (undoStack.length === 0) return;
    const previousSections = undoStack[undoStack.length - 1];
    const nextProject = { ...project, sections: previousSections };
    saveProjectToStorage(nextProject);
    set({
      project: nextProject,
      undoStack: undoStack.slice(0, -1),
    });
    syncAudio(nextProject);
  },

  addLiveMidi: (midi) =>
    set((s) =>
      s.activeLiveMidis.includes(midi) ? s : { activeLiveMidis: [...s.activeLiveMidis, midi] },
    ),

  removeLiveMidi: (midi) =>
    set((s) => ({ activeLiveMidis: s.activeLiveMidis.filter((m) => m !== midi) })),

  setMidiStatus: (midiSupported, midiDevices) => set({ midiSupported, midiDevices }),
  setSelectedMidiDeviceId: (selectedMidiDeviceId) => set({ selectedMidiDeviceId }),
}));
