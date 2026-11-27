import * as Tone from 'tone';
import { DawProject, InstrumentPresetId, SongSection, STEM_ORDER, StemId } from '../types/daw';
import { getBeatsPerBar } from '../theory/musicTheory';
import { createInstrumentVoice, SynthVoiceWrapper } from './synthBank';

/**
 * Singleton Web Audio / Tone.js engine.
 * Keeps high-frequency playback scheduling and playhead queries outside React state.
 */
class DawAudioEngine {
  private initialized = false;
  private masterLimiter: Tone.Limiter | null = null;
  private masterGain: Tone.Volume | null = null;
  private voices: Partial<Record<StemId, SynthVoiceWrapper>> = {};
  private scheduledEventIds: number[] = [];
  private loopBeats = 16;
  private currentBpm = 110;

  async ensureStarted(): Promise<boolean> {
    if (Tone.getContext().state !== 'running') {
      await Tone.start();
    }
    if (!this.initialized) {
      this.masterLimiter = new Tone.Limiter(-1.5).toDestination();
      this.masterGain = new Tone.Volume(-2).connect(this.masterLimiter);
      this.initialized = true;
    }
    return Tone.getContext().state === 'running';
  }

  isContextRunning(): boolean {
    return Tone.getContext().state === 'running';
  }

  private getOrCreateVoice(stemId: StemId, presetId: InstrumentPresetId): SynthVoiceWrapper {
    if (!this.initialized || !this.masterGain) {
      this.masterLimiter = new Tone.Limiter(-1.5).toDestination();
      this.masterGain = new Tone.Volume(-2).connect(this.masterLimiter);
      this.initialized = true;
    }
    const existing = this.voices[stemId];
    if (existing && existing.presetId === presetId) {
      return existing;
    }
    if (existing) {
      existing.releaseAll();
      existing.dispose();
    }
    const voice = createInstrumentVoice(presetId, this.masterGain);
    this.voices[stemId] = voice;
    return voice;
  }

  syncProject(project: DawProject, section: SongSection): void {
    this.currentBpm = project.bpm;
    const beatsPerBar = getBeatsPerBar(project.timeSignature);
    this.loopBeats = section.bars * beatsPerBar;

    const transport = Tone.getTransport();
    transport.bpm.value = project.bpm;
    transport.timeSignature = beatsPerBar;
    transport.loop = true;
    transport.loopStart = 0;
    const loopDurationSec = (this.loopBeats * 60) / project.bpm;
    transport.loopEnd = loopDurationSec;

    // Update stem voices & mixer levels
    const anySolo = STEM_ORDER.some((id) => section.stems[id].solo);
    for (const stemId of STEM_ORDER) {
      const stem = section.stems[stemId];
      const voice = this.getOrCreateVoice(stemId, stem.instrumentId);
      const audible = !stem.muted && (!anySolo || stem.solo);
      voice.output.mute = !audible;
      voice.output.volume.rampTo(stem.volumeDb, 0.04);
    }

    // Reschedule all MIDI events cleanly
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
          if (!voice) return;
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

  async play(project: DawProject, section: SongSection): Promise<void> {
    await this.ensureStarted();
    this.syncProject(project, section);
    const transport = Tone.getTransport();
    if (transport.state !== 'started') {
      transport.start('+0.02');
    }
  }

  stop(): void {
    const transport = Tone.getTransport();
    transport.stop();
    transport.seconds = 0;
    for (const stemId of STEM_ORDER) {
      this.voices[stemId]?.releaseAll();
    }
  }

  pause(): void {
    Tone.getTransport().pause();
    for (const stemId of STEM_ORDER) {
      this.voices[stemId]?.releaseAll();
    }
  }

  /** Returns current playhead position in quarter-note beats within the active loop. */
  getCurrentBeat(): number {
    const transport = Tone.getTransport();
    if (transport.state !== 'started') return 0;
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
}

export const audioEngine = new DawAudioEngine();
