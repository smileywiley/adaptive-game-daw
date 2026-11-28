import * as Tone from 'tone';
import {
  DawProject,
  InstrumentPresetId,
  SongSection,
  STEM_ORDER,
  StemId,
  TransitionQuantization,
} from '../types/daw';
import { getBeatsPerBar } from '../theory/musicTheory';
import {
  computeBeatsUntilTransition,
  computeStemIntensityGain,
  gainToDbOffset,
} from '../adaptive/adaptiveLogic';
import { createInstrumentVoice, SynthVoiceWrapper } from './synthBank';

export interface TransitionStatus {
  pendingSectionId: string;
  pendingSectionName: string;
  beatsRemaining: number;
  inFillBridge: boolean;
}

/**
 * Singleton Web Audio / Tone.js engine.
 * Supports vertical intensity crossfading, quantized horizontal section transitions
 * with optional 1-bar fill bridges, and one-shot stinger playback.
 */
class DawAudioEngine {
  private initialized = false;
  private masterLimiter: Tone.Limiter | null = null;
  private masterGain: Tone.Volume | null = null;
  private voices: Partial<Record<StemId, SynthVoiceWrapper>> = {};
  private stingerVoices: Partial<Record<StemId, SynthVoiceWrapper>> = {};
  private previewVoice: Tone.PolySynth | null = null;
  private scheduledEventIds: number[] = [];
  private loopBeats = 16;
  private currentBpm = 110;
  private currentBeatsPerBar = 4;
  private masterVolumeDb = -2;
  private masterMuted = false;

  // Adaptive vertical intensity (null = simulator off, 0..1 = active vertical layering)
  private simulationIntensity: number | null = null;

  // Pending horizontal transition state
  private pendingTransition: {
    targetSectionId: string;
    targetSectionName: string;
    targetTimeMs: number;
    timerId: number;
    inFillBridge: boolean;
  } | null = null;

  private ensureMasterBus(): Tone.Volume {
    if (!this.initialized || !this.masterGain) {
      this.masterLimiter = new Tone.Limiter(-1.5).toDestination();
      this.masterGain = new Tone.Volume(this.masterVolumeDb).connect(this.masterLimiter);
      this.masterGain.mute = this.masterMuted;
      this.initialized = true;
    }
    return this.masterGain;
  }

  setMasterVolume(volumeDb: number, muted: boolean): void {
    this.masterVolumeDb = volumeDb;
    this.masterMuted = muted;
    if (!this.masterGain) return;
    if (muted || volumeDb <= -40) {
      this.masterGain.mute = true;
    } else {
      this.masterGain.mute = false;
      this.masterGain.volume.rampTo(volumeDb, 0.03);
    }
  }

  async ensureStarted(): Promise<boolean> {
    if (Tone.getContext().state !== 'running') {
      await Tone.start();
    }
    this.ensureMasterBus();
    return Tone.getContext().state === 'running';
  }

  isContextRunning(): boolean {
    return Tone.getContext().state === 'running';
  }

  private getOrCreateVoice(stemId: StemId, presetId: InstrumentPresetId): SynthVoiceWrapper {
    const master = this.ensureMasterBus();
    const existing = this.voices[stemId];
    if (existing && existing.presetId === presetId) {
      return existing;
    }
    if (existing) {
      existing.releaseAll();
      existing.dispose();
    }
    const voice = createInstrumentVoice(presetId, master);
    this.voices[stemId] = voice;
    return voice;
  }

  /** Dedicated one-shot voice pool for Stingers & 1-Bar Fill Bridges (never muted by loop mixer). */
  private getOrCreateStingerVoice(stemId: StemId, presetId: InstrumentPresetId): SynthVoiceWrapper {
    const master = this.ensureMasterBus();
    const existing = this.stingerVoices[stemId];
    if (existing && existing.presetId === presetId) {
      return existing;
    }
    if (existing) {
      existing.releaseAll();
      existing.dispose();
    }
    const voice = createInstrumentVoice(presetId, master);
    this.stingerVoices[stemId] = voice;
    return voice;
  }

  private getOrCreatePreviewVoice(): Tone.PolySynth {
    const master = this.ensureMasterBus();
    if (!this.previewVoice) {
      this.previewVoice = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.015, decay: 0.25, sustain: 0.35, release: 0.4 },
      }).connect(master);
      this.previewVoice.volume.value = -8;
      this.previewVoice.maxPolyphony = 12;
    }
    return this.previewVoice;
  }

  setSimulationIntensity(intensity: number | null, section?: SongSection): void {
    this.simulationIntensity = intensity;
    if (section && this.isContextRunning()) {
      this.updateMixer(section);
    }
  }

  /** Returns 0..1 effective loudness for a stem (used for animated simulator volume meters). */
  getStemEffectiveLevel(stemId: StemId, section: SongSection): number {
    const anySolo = STEM_ORDER.some((id) => section.stems[id].solo);
    const stem = section.stems[stemId];
    const audible = anySolo ? stem.solo : !stem.muted;
    if (!audible) return 0;
    const baseLinear = Math.max(0, Math.min(1, (stem.volumeDb + 30) / 34));
    if (this.simulationIntensity === null) return baseLinear;
    const intensityGain = computeStemIntensityGain(
      this.simulationIntensity,
      stem.intensityMin,
      stem.intensityMax,
    );
    return baseLinear * intensityGain;
  }

  /**
   * Updates stem mute/solo/volume & vertical intensity crossfade in-place without rescheduling MIDI.
   */
  updateMixer(section: SongSection): void {
    const anySolo = STEM_ORDER.some((id) => section.stems[id].solo);
    for (const stemId of STEM_ORDER) {
      const stem = section.stems[stemId];
      const voice = this.getOrCreateVoice(stemId, stem.instrumentId);
      const audible = anySolo ? stem.solo : !stem.muted;

      let intensityGain = 1;
      if (this.simulationIntensity !== null) {
        intensityGain = computeStemIntensityGain(
          this.simulationIntensity,
          stem.intensityMin,
          stem.intensityMax,
        );
      }

      if (!audible || intensityGain <= 0.005) {
        voice.output.mute = true;
        voice.releaseAll();
      } else {
        voice.output.mute = false;
        const targetDb = stem.volumeDb + gainToDbOffset(intensityGain);
        voice.output.volume.rampTo(targetDb, 0.08);
      }
    }
  }

  syncProject(project: DawProject, section: SongSection): void {
    this.currentBpm = project.bpm;
    const beatsPerBar = getBeatsPerBar(project.timeSignature);
    this.currentBeatsPerBar = beatsPerBar;
    this.loopBeats = section.bars * beatsPerBar;

    const transport = Tone.getTransport();
    transport.bpm.value = project.bpm;
    transport.timeSignature = beatsPerBar;
    transport.loop = true;
    transport.loopStart = 0;
    const loopDurationSec = (this.loopBeats * 60) / project.bpm;
    transport.loopEnd = loopDurationSec;

    this.updateMixer(section);

    this.clearScheduledEvents();
    const secPerBeat = 60 / project.bpm;

    for (const stemId of STEM_ORDER) {
      const stem = section.stems[stemId];
      for (const note of stem.notes) {
        if (note.startBeat < 0 || note.startBeat >= this.loopBeats) continue;
        const startTimeSec = note.startBeat * secPerBeat;
        const durationSec = Math.max(0.05, note.durationBeats * secPerBeat);

        const eventId = transport.schedule((time) => {
          const voice = this.voices[stemId];
          if (!voice || voice.output.mute) return;
          voice.triggerAttackRelease(note.midi, durationSec, time, note.velocity);
        }, startTimeSec);
        this.scheduledEventIds.push(eventId);
      }
    }
  }

  private clearScheduledEvents(): void {
    const transport = Tone.getTransport();
    for (const id of this.scheduledEventIds) {
      transport.clear(id);
    }
    this.scheduledEventIds = [];
  }

  cancelPendingTransition(): void {
    if (this.pendingTransition) {
      window.clearTimeout(this.pendingTransition.timerId);
      this.pendingTransition = null;
    }
  }

  getTransitionStatus(): TransitionStatus | null {
    if (!this.pendingTransition) return null;
    const msLeft = Math.max(0, this.pendingTransition.targetTimeMs - performance.now());
    const beatsRemaining = (msLeft / 1000) * (this.currentBpm / 60);
    return {
      pendingSectionId: this.pendingTransition.targetSectionId,
      pendingSectionName: this.pendingTransition.targetSectionName,
      beatsRemaining,
      inFillBridge: this.pendingTransition.inFillBridge,
    };
  }

  /**
   * Queues a quantized horizontal transition to targetSection using its quantization rule
   * and optional 1-bar fill bridge. Reads fresh project/section state from onCommit when firing.
   */
  queueSectionTransition(
    project: DawProject,
    currentSection: SongSection,
    targetSection: SongSection,
    onCommit: () => { project: DawProject; section: SongSection } | null,
  ): void {
    this.cancelPendingTransition();
    const transport = Tone.getTransport();
    if (transport.state !== 'started') {
      onCommit();
      return;
    }

    const quant: TransitionQuantization = targetSection.transitionQuantization ?? 'next_bar';
    const currentBeat = this.getCurrentBeat();
    const beatsUntilBoundary = computeBeatsUntilTransition(
      currentBeat,
      this.loopBeats,
      this.currentBeatsPerBar,
      quant,
    );

    const secPerBeat = 60 / project.bpm;
    const delaySec = beatsUntilBoundary * secPerBeat;
    const useFill = Boolean(targetSection.useTransitionFill);

    // Optional 1-bar fill bridge: fire on dedicated stinger drum voice so it punches through even at low intensity
    if (useFill && beatsUntilBoundary >= 1) {
      const drumStem = currentSection.stems['04_Percussion'];
      const fillVoice = this.getOrCreateStingerVoice('04_Percussion', drumStem.instrumentId);
      fillVoice.output.volume.value = drumStem.volumeDb;
      const fillStart = Tone.now() + Math.max(0.02, delaySec - Math.min(delaySec, secPerBeat * 2));
      const steps = 4;
      for (let i = 0; i < steps; i++) {
        fillVoice.triggerAttackRelease(
          i === steps - 1 ? 49 : 38,
          0.12,
          fillStart + i * (secPerBeat * 0.5),
          0.65 + i * 0.08,
        );
      }
    }

    const delayMs = Math.max(20, Math.round(delaySec * 1000));
    const timerId = window.setTimeout(() => {
      this.pendingTransition = null;
      const fresh = onCommit();
      if (!fresh) return;
      for (const stemId of STEM_ORDER) {
        this.voices[stemId]?.releaseAll();
      }
      const nextLoopSec =
        (fresh.section.bars * getBeatsPerBar(fresh.project.timeSignature) * 60) /
        fresh.project.bpm;
      if (fresh.section.keepBeatPosition && nextLoopSec > 0) {
        // Phase-locked Banjo-Kazooie style swap: stay on the exact same beat!
        transport.seconds = ((transport.seconds % nextLoopSec) + nextLoopSec) % nextLoopSec;
      } else {
        transport.seconds = 0;
      }
      this.syncProject(fresh.project, fresh.section);
    }, delayMs);

    this.pendingTransition = {
      targetSectionId: targetSection.id,
      targetSectionName: targetSection.name,
      targetTimeMs: performance.now() + delayMs,
      timerId,
      inFillBridge: useFill,
    };
  }

  /** Plays a one-shot stinger section on dedicated voices without touching the loop's stem mixer. */
  async playStinger(stingerSection: SongSection, bpm: number): Promise<void> {
    await this.ensureStarted();
    const secPerBeat = 60 / bpm;
    const now = Tone.now() + 0.02;

    for (const stemId of STEM_ORDER) {
      const stem = stingerSection.stems[stemId];
      if (!stem || stem.notes.length === 0) continue;
      const voice = this.getOrCreateStingerVoice(stemId, stem.instrumentId);
      voice.output.mute = false;
      voice.output.volume.value = stem.volumeDb;
      for (const note of stem.notes) {
        const startTime = now + note.startBeat * secPerBeat;
        const durSec = Math.max(0.08, note.durationBeats * secPerBeat);
        voice.triggerAttackRelease(note.midi, durSec, startTime, note.velocity);
      }
    }
  }

  async play(project: DawProject, section: SongSection): Promise<void> {
    await this.ensureStarted();
    this.syncProject(project, section);
    const transport = Tone.getTransport();
    if (transport.state !== 'started') {
      transport.start('+0.02');
    }
  }

  stop(): void {
    this.cancelPendingTransition();
    const transport = Tone.getTransport();
    transport.stop();
    transport.seconds = 0;
    for (const stemId of STEM_ORDER) {
      this.voices[stemId]?.releaseAll();
      this.stingerVoices[stemId]?.releaseAll();
    }
  }

  pause(): void {
    this.cancelPendingTransition();
    Tone.getTransport().pause();
    for (const stemId of STEM_ORDER) {
      this.voices[stemId]?.releaseAll();
    }
  }

  /** Returns current playhead position in quarter-note beats within the active loop. */
  getCurrentBeat(): number {
    const transport = Tone.getTransport();
    if (transport.state === 'stopped') return 0;
    const sec = transport.seconds;
    const beats = (sec * this.currentBpm) / 60;
    if (this.loopBeats <= 0) return 0;
    return ((beats % this.loopBeats) + this.loopBeats) % this.loopBeats;
  }

  async noteOn(stemId: StemId, presetId: InstrumentPresetId, midi: number, velocity = 0.8): Promise<void> {
    await this.ensureStarted();
    const voice = this.getOrCreateVoice(stemId, presetId);
    voice.triggerAttack(midi, undefined, velocity);
  }

  noteOff(stemId: StemId, midi: number): void {
    const voice = this.voices[stemId];
    voice?.triggerRelease(midi);
  }

  async auditionNote(
    stemId: StemId,
    presetId: InstrumentPresetId,
    midi: number,
    durationSec = 0.25,
    velocity = 0.8,
  ): Promise<void> {
    await this.ensureStarted();
    const voice = this.getOrCreateVoice(stemId, presetId);
    voice.triggerAttackRelease(midi, durationSec, undefined, velocity);
  }

  async auditionChord(
    stemId: StemId,
    presetId: InstrumentPresetId,
    midis: number[],
    durationSec = 0.65,
  ): Promise<void> {
    await this.ensureStarted();
    const voice = this.getOrCreateVoice(stemId, presetId);
    const now = Tone.now();
    for (const midi of midis) {
      voice.triggerAttackRelease(midi, durationSec, now, 0.65);
    }
  }

  /** Plays a clean neutral chord preview (used when editing chords on Percussion or a muted stem). */
  async auditionPreviewChord(midis: number[], durationSec = 0.6): Promise<void> {
    await this.ensureStarted();
    const preview = this.getOrCreatePreviewVoice();
    const freqs = midis.map((m) => Tone.Frequency(m, 'midi').toFrequency());
    preview.triggerAttackRelease(freqs, durationSec, Tone.now(), 0.6);
  }
}

export const audioEngine = new DawAudioEngine();
