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
  SectionRole,
  SimulationScenario,
  SongSection,
  STEM_ORDER,
  StemId,
  TimeSignature,
  TransitionQuantization,
} from '../types/daw';
import { createBlankProject, createDefaultProject, MOOD_PRESETS } from '../presets/moodPresets';
import {
  createNoteId,
  findScaleDegree,
  generateStemPatternForChords,
  getBeatsPerBar,
  getScaleChordOptions,
  remapNotesToScale,
} from '../theory/musicTheory';
import { audioEngine } from '../audio/audioEngine';

const STORAGE_KEY = 'theory_daw_project_v1';

function isValidDawProject(value: unknown): value is DawProject {
  if (!value || typeof value !== 'object') return false;
  const p = value as Partial<DawProject>;
  if (typeof p.bpm !== 'number' || !Number.isFinite(p.bpm)) return false;
  if (p.timeSignature !== '4/4' && p.timeSignature !== '3/4' && p.timeSignature !== '5/4') {
    return false;
  }
  if (typeof p.activeSectionId !== 'string' || !Array.isArray(p.sections) || p.sections.length === 0) {
    return false;
  }
  return p.sections.every((sec) => {
    if (!sec || typeof sec !== 'object') return false;
    if (typeof sec.bars !== 'number' || sec.bars < 1 || !Array.isArray(sec.chords) || !sec.stems) {
      return false;
    }
    return STEM_ORDER.every((sid) => {
      const stem = sec.stems[sid];
      return Boolean(stem && Array.isArray(stem.notes) && typeof stem.instrumentId === 'string');
    });
  });
}

function loadSavedProject(): DawProject {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultProject();
    const parsed: unknown = JSON.parse(raw);
    if (isValidDawProject(parsed)) {
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

  // UI modals & drawers
  presetModalOpen: boolean;
  simulatorOpen: boolean;

  // Adaptive Game State Simulator
  simulatorEnabled: boolean; // When true, simIntensity drives vertical stem crossfading
  simIntensity: number; // 0..1
  recordedScenario: SimulationScenario | null;

  // Undo stack (lightweight snapshots of sections)
  undoStack: SongSection[][];

  // Derived helper
  getActiveSection: () => SongSection;

  // Actions
  setPresetModalOpen: (open: boolean) => void;
  setSimulatorOpen: (open: boolean) => void;
  setSimulatorEnabled: (enabled: boolean) => void;
  setSimIntensity: (intensity: number) => void;
  setRecordedScenario: (scenario: SimulationScenario | null) => void;
  loadMoodPreset: (presetId: string) => void;
  createBlankSong: () => void;
  importProjectJson: (jsonText: string) => { ok: boolean; error?: string };
  exportProjectJson: () => string;

  // Horizontal Sections (Game States)
  setActiveSection: (sectionId: string) => void;
  addSection: (name: string, role?: SectionRole) => void;
  duplicateActiveSection: () => void;
  renameSection: (sectionId: string, name: string) => void;
  deleteSection: (sectionId: string) => void;
  setSectionTransitionRule: (
    sectionId: string,
    quantization: TransitionQuantization,
    useTransitionFill: boolean,
  ) => void;
  requestStateTransition: (targetSectionId: string) => void;
  requestStateTransitionByName: (name: string) => void;
  triggerStinger: (sectionIdOrName?: string) => Promise<void>;

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

  // Stem mixer & vertical intensity
  setStemInstrument: (stemId: StemId, instrumentId: InstrumentPresetId) => void;
  setStemVolume: (stemId: StemId, volumeDb: number) => void;
  setStemIntensityRange: (stemId: StemId, intensityMin: number, intensityMax?: number) => void;
  toggleStemMute: (stemId: StemId) => void;
  toggleStemSolo: (stemId: StemId) => void;

  // Notes
  addNotes: (stemId: StemId, notes: Omit<MidiNote, 'id'>[]) => void;
  updateNote: (stemId: StemId, noteId: string, patch: Partial<MidiNote>, commit?: boolean) => void;
  removeNote: (stemId: StemId, noteId: string) => void;
  pushUndoSnapshot: () => void;
  commitProjectChanges: () => void;
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

function syncMixer(project: DawProject): void {
  const section = project.sections.find((s) => s.id === project.activeSectionId) ?? project.sections[0];
  if (section && audioEngine.isContextRunning()) {
    audioEngine.updateMixer(section);
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
  simulatorOpen: false,
  simulatorEnabled: false,
  simIntensity: 0.75,
  recordedScenario: null,
  undoStack: [],

  getActiveSection: () => {
    const { project } = get();
    return project.sections.find((s) => s.id === project.activeSectionId) ?? project.sections[0];
  },

  setPresetModalOpen: (open) => set({ presetModalOpen: open }),

  setSimulatorOpen: (open) => set({ simulatorOpen: open }),

  setSimulatorEnabled: (enabled) => {
    const { simIntensity } = get();
    const section = get().getActiveSection();
    audioEngine.setSimulationIntensity(enabled ? simIntensity : null, section);
    set({ simulatorEnabled: enabled });
  },

  setSimIntensity: (intensity) => {
    const clamped = Math.max(0, Math.min(1, intensity));
    const { simulatorEnabled } = get();
    const section = get().getActiveSection();
    set({ simIntensity: clamped });
    if (simulatorEnabled) {
      audioEngine.setSimulationIntensity(clamped, section);
    }
  },

  setRecordedScenario: (recordedScenario) => set({ recordedScenario }),

  setActiveSection: (sectionId) => {
    const prev = get().project;
    if (!prev.sections.some((s) => s.id === sectionId)) return;
    audioEngine.cancelPendingTransition();
    const nextProject = { ...prev, activeSectionId: sectionId };
    saveProjectToStorage(nextProject);
    set({ project: nextProject });
    syncAudio(nextProject);
  },

  addSection: (name, role = 'loop') => {
    const prev = get().project;
    const base = get().getActiveSection();
    const bars = role === 'stinger' ? 2 : 4;
    const id = `sec_${Date.now().toString(36)}`;
    const newChords = base.chords.slice(0, bars).map((c, idx) => ({ ...c, bar: idx }));
    while (newChords.length < bars) {
      newChords.push({ ...base.chords[0], bar: newChords.length });
    }
    const emptyStems = Object.fromEntries(
      STEM_ORDER.map((sid) => [sid, { ...base.stems[sid], notes: [] }]),
    ) as SongSection['stems'];

    const newSection: SongSection = {
      id,
      name: name.trim() || `Section ${prev.sections.length + 1}`,
      role,
      bars,
      root: base.root,
      scaleId: base.scaleId,
      transitionQuantization: role === 'stinger' ? 'next_beat' : 'next_bar',
      useTransitionFill: role === 'loop',
      chords: newChords,
      stems: emptyStems,
    };

    const nextProject: DawProject = {
      ...prev,
      activeSectionId: id,
      sections: [...prev.sections, newSection],
    };
    saveProjectToStorage(nextProject);
    set((state) => ({
      project: nextProject,
      undoStack: [...state.undoStack.slice(-19), state.project.sections],
    }));
    syncAudio(nextProject);
  },

  duplicateActiveSection: () => {
    const prev = get().project;
    const base = get().getActiveSection();
    const id = `sec_${Date.now().toString(36)}`;
    const clonedStems = Object.fromEntries(
      STEM_ORDER.map((sid) => [
        sid,
        {
          ...base.stems[sid],
          notes: base.stems[sid].notes.map((n) => ({ ...n, id: createNoteId('dup') })),
        },
      ]),
    ) as SongSection['stems'];

    const clone: SongSection = {
      ...base,
      id,
      name: `${base.name} Copy`,
      chords: base.chords.map((c) => ({ ...c })),
      stems: clonedStems,
    };
    const nextProject: DawProject = {
      ...prev,
      activeSectionId: id,
      sections: [...prev.sections, clone],
    };
    saveProjectToStorage(nextProject);
    set((state) => ({
      project: nextProject,
      undoStack: [...state.undoStack.slice(-19), state.project.sections],
    }));
    syncAudio(nextProject);
  },

  renameSection: (sectionId, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const prev = get().project;
    const nextProject: DawProject = {
      ...prev,
      sections: prev.sections.map((s) => (s.id === sectionId ? { ...s, name: trimmed } : s)),
    };
    saveProjectToStorage(nextProject);
    set({ project: nextProject });
  },

  deleteSection: (sectionId) => {
    const prev = get().project;
    if (prev.sections.length <= 1) return;
    const remaining = prev.sections.filter((s) => s.id !== sectionId);
    const nextActiveId =
      prev.activeSectionId === sectionId ? remaining[0].id : prev.activeSectionId;
    const nextProject: DawProject = {
      ...prev,
      activeSectionId: nextActiveId,
      sections: remaining,
    };
    saveProjectToStorage(nextProject);
    set((state) => ({
      project: nextProject,
      undoStack: [...state.undoStack.slice(-19), state.project.sections],
    }));
    syncAudio(nextProject);
  },

  setSectionTransitionRule: (sectionId, quantization, useTransitionFill) => {
    const prev = get().project;
    const nextProject: DawProject = {
      ...prev,
      sections: prev.sections.map((s) =>
        s.id === sectionId
          ? { ...s, transitionQuantization: quantization, useTransitionFill }
          : s,
      ),
    };
    saveProjectToStorage(nextProject);
    set({ project: nextProject });
  },

  requestStateTransition: (targetSectionId) => {
    const { project, isPlaying } = get();
    const currentSection = get().getActiveSection();
    const targetSection = project.sections.find((s) => s.id === targetSectionId);
    if (!targetSection || targetSection.id === currentSection.id) return;

    if (!isPlaying) {
      get().setActiveSection(targetSectionId);
      return;
    }

    audioEngine.queueSectionTransition(project, currentSection, targetSection, () => {
      const latest = get().project;
      const freshTarget = latest.sections.find((s) => s.id === targetSectionId);
      if (!freshTarget) return null;
      const nextProject = { ...latest, activeSectionId: targetSectionId };
      saveProjectToStorage(nextProject);
      set({ project: nextProject });
      return { project: nextProject, section: freshTarget };
    });
  },

  requestStateTransitionByName: (name) => {
    const { project } = get();
    const lower = name.toLowerCase();
    const target =
      project.sections.find((s) => s.name.toLowerCase() === lower) ??
      project.sections.find((s) => s.name.toLowerCase().includes(lower));
    if (target) {
      get().requestStateTransition(target.id);
    }
  },

  triggerStinger: async (sectionIdOrName) => {
    const { project } = get();
    let stinger: SongSection | undefined;
    if (sectionIdOrName) {
      stinger =
        project.sections.find((s) => s.id === sectionIdOrName) ??
        project.sections.find((s) => s.name.toLowerCase() === sectionIdOrName.toLowerCase());
    }
    if (!stinger) {
      stinger = project.sections.find((s) => s.role === 'stinger');
    }
    if (stinger) {
      await audioEngine.playStinger(stinger, project.bpm);
      set({ audioUnlocked: true });
    }
  },

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

  createBlankSong: () => {
    const nextProject = createBlankProject();
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
      const parsed: unknown = JSON.parse(jsonText);
      if (!isValidDawProject(parsed)) {
        return {
          ok: false,
          error: 'Invalid project file: missing required sections, chords, or stems.',
        };
      }
      saveProjectToStorage(parsed);
      set((state) => ({
        project: parsed,
        undoStack: [...state.undoStack.slice(-19), state.project.sections],
      }));
      syncAudio(parsed);
      return { ok: true };
    } catch {
      return { ok: false, error: 'Could not parse JSON file.' };
    }
  },

  exportProjectJson: () => JSON.stringify(get().project, null, 2),

  setActiveStem: (stemId) =>
    set((state) => {
      const section = state.getActiveSection();
      const targetStem = section.stems[stemId];
      const nextTool = targetStem?.isDrum && state.tool === 'arp' ? 'pen' : state.tool;
      return { activeStemId: stemId, tool: nextTool };
    }),

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
    const clamped = bars === 2 || bars === 4 || bars === 8 || bars === 16 ? bars : 4;
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
      const oldScaleId = sec.scaleId;
      const diatonic = getScaleChordOptions(newRoot, newScaleId);

      // Remap each bar's chord by its exact scale degree (0..6) so switching A -> B -> A is lossless
      const nextChords: ChordEvent[] = sec.chords.map((c) => {
        const deg = findScaleDegree(c.root, oldRoot, oldScaleId);
        const match = diatonic[deg] ?? diatonic[0];
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
              notes: remapNotesToScale(stem.notes, oldRoot, oldScaleId, newRoot, newScaleId),
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
    syncMixer(nextProject);
  },

  setStemIntensityRange: (stemId, intensityMin, intensityMax = 1.0) => {
    const clampedMin = Math.max(0, Math.min(0.95, intensityMin));
    const clampedMax = Math.max(clampedMin + 0.05, Math.min(1, intensityMax));
    const prev = get().project;
    const nextProject = updateActiveSection(prev, (sec) => ({
      ...sec,
      stems: {
        ...sec.stems,
        [stemId]: {
          ...sec.stems[stemId],
          intensityMin: clampedMin,
          intensityMax: clampedMax,
        },
      },
    }));
    saveProjectToStorage(nextProject);
    set({ project: nextProject });
    syncMixer(nextProject);
  },

  toggleStemMute: (stemId) => {
    const prev = get().project;
    const nextProject = updateActiveSection(prev, (sec) => {
      const target = sec.stems[stemId];
      const nextMuted = !target.muted;
      return {
        ...sec,
        stems: {
          ...sec.stems,
          [stemId]: {
            ...target,
            muted: nextMuted,
            solo: nextMuted ? false : target.solo,
          },
        },
      };
    });
    saveProjectToStorage(nextProject);
    set({ project: nextProject });
    syncMixer(nextProject);
  },

  toggleStemSolo: (stemId) => {
    const prev = get().project;
    const nextProject = updateActiveSection(prev, (sec) => {
      const target = sec.stems[stemId];
      const nextSolo = !target.solo;
      return {
        ...sec,
        stems: {
          ...sec.stems,
          [stemId]: {
            ...target,
            solo: nextSolo,
            muted: nextSolo ? false : target.muted,
          },
        },
      };
    });
    saveProjectToStorage(nextProject);
    set({ project: nextProject });
    syncMixer(nextProject);
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

  updateNote: (stemId, noteId, patch, commit = true) => {
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
    set({ project: nextProject });
    if (commit) {
      saveProjectToStorage(nextProject);
      syncAudio(nextProject);
    }
  },

  pushUndoSnapshot: () =>
    set((state) => ({
      undoStack: [...state.undoStack.slice(-19), state.project.sections],
    })),

  commitProjectChanges: () => {
    const project = get().project;
    saveProjectToStorage(project);
    syncAudio(project);
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
