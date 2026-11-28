import * as Tone from 'tone';
import JSZip from 'jszip';
import { Midi } from '@tonejs/midi';
import { DawProject, SongSection, STEM_ORDER, StemTrack } from '../types/daw';
import { getBeatsPerBar } from '../theory/musicTheory';
import { createInstrumentVoice } from '../audio/synthBank';
import { encodeAudioBufferToWav } from './wavEncoder';
import {
  ADAPTIVE_MUSIC_MANAGER_CS,
  ADAPTIVE_MUSIC_MANIFEST_CS,
  ADAPTIVE_MUSIC_TRIGGER_ZONE_CS,
  generateUnityReadme,
} from './unityScripts';

export interface ExportOptions {
  includeWavStems: boolean;
  includeMidi: boolean;
  includeUnityScripts: boolean;
}

export interface ExportProgress {
  current: number;
  total: number;
  label: string;
}

function sanitizeFileName(name: string): string {
  return name.trim().replace(/[^a-zA-Z0-9_-]+/g, '_') || 'Untitled';
}

/**
 * Renders a single stem offline via Tone.Offline.
 * - For looping sections: renders 2 passes and slices Pass 2 ([loopSec, 2*loopSec])
 *   so reverb & ping-pong delay tails wrap seamlessly back onto Beat 1!
 * - For stingers: renders 1 pass + 1.5s natural decay tail.
 */
async function renderStemToWav(
  project: DawProject,
  section: SongSection,
  stem: StemTrack,
): Promise<Uint8Array> {
  const beatsPerBar = getBeatsPerBar(project.timeSignature);
  const loopBeats = section.bars * beatsPerBar;
  const secPerBeat = 60 / project.bpm;
  const loopSec = loopBeats * secPerBeat;
  const isStinger = section.role === 'stinger';
  const renderDurationSec = isStinger ? loopSec + 1.5 : loopSec * 2;

  const toneBuffer = await Tone.Offline(({ transport }) => {
    transport.bpm.value = project.bpm;
    const limiter = new Tone.Limiter(-1).toDestination();
    const voice = createInstrumentVoice(stem.instrumentId, limiter);
    voice.output.volume.value = stem.volumeDb;

    const passes = isStinger ? 1 : 2;
    for (let pass = 0; pass < passes; pass++) {
      const passOffsetSec = pass * loopSec;
      for (const note of stem.notes) {
        if (note.startBeat < 0 || note.startBeat >= loopBeats) continue;
        const startSec = passOffsetSec + note.startBeat * secPerBeat;
        const durSec = Math.max(0.05, note.durationBeats * secPerBeat);
        voice.triggerAttackRelease(note.midi, durSec, startSec, note.velocity);
      }
    }
  }, renderDurationSec);

  const audioBuffer = toneBuffer.get();
  if (!audioBuffer) {
    throw new Error(`Offline render failed for ${section.name} / ${stem.name}.`);
  }
  if (isStinger) {
    return encodeAudioBufferToWav(audioBuffer, 0, audioBuffer.length);
  }
  // Slice Pass 2 so reverb/delay tails wrap seamlessly onto beat 1
  const startSample = Math.floor(loopSec * audioBuffer.sampleRate);
  const endSample = Math.min(audioBuffer.length, Math.floor(loopSec * 2 * audioBuffer.sampleRate));
  return encodeAudioBufferToWav(audioBuffer, startSample, endSample);
}

/** Generates a standard multi-track MIDI (.mid) file for a song section via @tonejs/midi. */
export function buildSectionMidiBytes(project: DawProject, section: SongSection): Uint8Array {
  const midi = new Midi();
  midi.name = `${project.name} - ${section.name}`;
  midi.header.setTempo(project.bpm);
  const secPerBeat = 60 / project.bpm;

  for (const stemId of STEM_ORDER) {
    const stem = section.stems[stemId];
    if (!stem || stem.notes.length === 0) continue;
    const track = midi.addTrack();
    track.name = stem.name;
    track.channel = stem.isDrum ? 9 : 0;
    for (const n of stem.notes) {
      track.addNote({
        midi: n.midi,
        time: n.startBeat * secPerBeat,
        duration: Math.max(0.05, n.durationBeats * secPerBeat),
        velocity: n.velocity,
      });
    }
  }
  return midi.toArray();
}

/** Builds the adaptive music_manifest.json structure consumed by Unity's AdaptiveMusicProfile. */
export function buildAdaptiveManifest(project: DawProject) {
  const beatsPerBar = getBeatsPerBar(project.timeSignature);
  return {
    projectName: project.name,
    bpm: project.bpm,
    timeSignature: project.timeSignature,
    beatsPerBar,
    sections: project.sections.map((section) => {
      const safeSec = sanitizeFileName(section.name);
      return {
        id: section.id,
        name: section.name,
        role: section.role ?? 'loop',
        bars: section.bars,
        transitionQuantization: section.transitionQuantization ?? 'next_bar',
        useTransitionFill: Boolean(section.useTransitionFill),
        keepBeatPosition: Boolean(section.keepBeatPosition),
        stems: STEM_ORDER.filter((sid) => section.stems[sid].notes.length > 0).map((sid) => {
          const stem = section.stems[sid];
          return {
            stemId: stem.id,
            name: stem.name,
            fileName: `${safeSec}_${stem.id}.wav`,
            intensityMin: stem.intensityMin,
            intensityMax: stem.intensityMax,
            volumeDb: stem.volumeDb,
          };
        }),
      };
    }),
  };
}

/**
 * Bundles rendered loop-ready .wav stems, .mid files, music_manifest.json,
 * and Unity C# Adaptive Music Player scripts into a downloadable .zip archive.
 */
export async function exportAdaptiveMusicZip(
  project: DawProject,
  options: ExportOptions,
  onProgress?: (progress: ExportProgress) => void,
): Promise<Blob> {
  const zip = new JSZip();

  // Count work units for progress bar
  const stemsToRender: { section: SongSection; stem: StemTrack }[] = [];
  if (options.includeWavStems) {
    for (const section of project.sections) {
      for (const sid of STEM_ORDER) {
        const stem = section.stems[sid];
        if (stem && stem.notes.length > 0 && !stem.muted) {
          stemsToRender.push({ section, stem });
        }
      }
    }
  }

  const totalSteps = stemsToRender.length + 1;
  let completed = 0;

  if (options.includeWavStems) {
    const audioFolder = zip.folder('AudioStems');
    for (const item of stemsToRender) {
      const fileName = `${sanitizeFileName(item.section.name)}_${item.stem.id}.wav`;
      onProgress?.({
        current: completed,
        total: totalSteps,
        label: `Rendering ${fileName}...`,
      });
      const wavBytes = await renderStemToWav(project, item.section, item.stem);
      audioFolder?.file(fileName, wavBytes);
      completed += 1;
    }
  }

  if (options.includeMidi) {
    const midiFolder = zip.folder('MIDI');
    for (const section of project.sections) {
      const midiBytes = buildSectionMidiBytes(project, section);
      midiFolder?.file(`${sanitizeFileName(section.name)}.mid`, midiBytes);
    }
  }

  // Always include music_manifest.json
  const manifest = buildAdaptiveManifest(project);
  zip.file('music_manifest.json', JSON.stringify(manifest, null, 2));

  if (options.includeUnityScripts) {
    const unityFolder = zip.folder('UnityScripts');
    unityFolder?.file('AdaptiveMusicManifest.cs', ADAPTIVE_MUSIC_MANIFEST_CS);
    unityFolder?.file('AdaptiveMusicManager.cs', ADAPTIVE_MUSIC_MANAGER_CS);
    unityFolder?.file('AdaptiveMusicTriggerZone.cs', ADAPTIVE_MUSIC_TRIGGER_ZONE_CS);
    zip.file('README_UnitySetup.md', generateUnityReadme(project.name));
  }

  onProgress?.({
    current: totalSteps,
    total: totalSteps,
    label: 'Compressing .zip package...',
  });

  return zip.generateAsync({ type: 'blob' });
}
