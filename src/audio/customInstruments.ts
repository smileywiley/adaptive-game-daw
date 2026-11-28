import * as Tone from 'tone';
import JSZip from 'jszip';
import { InstrumentPresetId } from '../types/daw';
import { midiToNoteName } from '../theory/musicTheory';
import { parseSfz } from './sfzParser';
import { parseSf2Buffer, Sf2PresetInfo } from './sf2Parser';
import { SynthVoiceWrapper } from './synthBank';

export interface CustomInstrumentEntry {
  id: `custom:${string}`;
  name: string;
  sourceType: 'sf2' | 'sfz' | 'wav';
  description: string;
  /** Map of note name (e.g. "C4") -> Blob URL for Tone.Sampler */
  sampleUrls: Record<string, string>;
  attackSec: number;
  releaseSec: number;
}

export interface LoadedSf2Bank {
  id: string;
  fileName: string;
  presets: Sf2PresetInfo[];
  loadPreset: (presetIndex: number) => CustomInstrumentEntry | null;
}

const customInstruments = new Map<string, CustomInstrumentEntry>();
const loadedSf2Banks: LoadedSf2Bank[] = [];
const listeners = new Set<() => void>();

function notifyListeners(): void {
  listeners.forEach((fn) => fn());
}

export function subscribeCustomInstruments(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getCustomInstruments(): CustomInstrumentEntry[] {
  return Array.from(customInstruments.values());
}

export function getCustomInstrumentById(id: string): CustomInstrumentEntry | undefined {
  return customInstruments.get(id);
}

export function getLoadedSf2Banks(): LoadedSf2Bank[] {
  return [...loadedSf2Banks];
}

/** Imports a single .wav / .ogg / .mp3 one-shot audio file as a pitched Sampler mapped at C4. */
export function importOneShotSampleFile(file: File, rootMidi = 60): CustomInstrumentEntry {
  const url = URL.createObjectURL(file);
  const cleanName = file.name.replace(/\.[^.]+$/, '');
  const id: `custom:${string}` = `custom:wav_${Date.now().toString(36)}`;
  const entry: CustomInstrumentEntry = {
    id,
    name: cleanName,
    sourceType: 'wav',
    description: `Imported audio sample (${file.name})`,
    sampleUrls: { [midiToNoteName(rootMidi)]: url },
    attackSec: 0.005,
    releaseSec: 0.35,
  };
  customInstruments.set(id, entry);
  notifyListeners();
  return entry;
}

/** Imports an .sfz instrument from a .zip archive containing the .sfz file and its audio samples. */
export async function importSfzZipFile(zipFile: File): Promise<CustomInstrumentEntry> {
  const zip = await JSZip.loadAsync(zipFile);
  let sfzEntry: JSZip.JSZipObject | null = null;
  let sfzBaseDir = '';

  zip.forEach((relativePath, entry) => {
    if (!entry.dir && relativePath.toLowerCase().endsWith('.sfz') && !sfzEntry) {
      sfzEntry = entry;
      const lastSlash = relativePath.lastIndexOf('/');
      sfzBaseDir = lastSlash >= 0 ? relativePath.slice(0, lastSlash + 1) : '';
    }
  });

  if (!sfzEntry) {
    throw new Error('No .sfz definition file found inside the .zip archive.');
  }

  const sfzText = await (sfzEntry as JSZip.JSZipObject).async('string');
  const cleanName = zipFile.name.replace(/\.zip$/i, '');
  const parsed = parseSfz(sfzText, cleanName);

  if (parsed.regions.length === 0) {
    throw new Error('The .sfz file did not contain any valid <region> sample definitions.');
  }

  // Build lowercase path lookup for zip entries
  const zipLookup = new Map<string, JSZip.JSZipObject>();
  zip.forEach((path, entry) => {
    if (!entry.dir) {
      zipLookup.set(path.toLowerCase(), entry);
    }
  });

  const sampleUrls: Record<string, string> = {};
  const step = Math.max(1, Math.ceil(parsed.regions.length / 16));
  for (let i = 0; i < parsed.regions.length; i += step) {
    const region = parsed.regions[i];
    const targetPath = `${sfzBaseDir}${region.sample}`.toLowerCase();
    const audioEntry =
      zipLookup.get(targetPath) ??
      zipLookup.get(region.sample.toLowerCase()) ??
      Array.from(zipLookup.entries()).find(([k]) => k.endsWith(region.sample.toLowerCase()))?.[1];

    if (audioEntry) {
      const blob = await audioEntry.async('blob');
      sampleUrls[midiToNoteName(region.pitchKeycenter)] = URL.createObjectURL(blob);
    }
  }

  if (Object.keys(sampleUrls).length === 0) {
    throw new Error('Could not match any audio sample files referenced by the .sfz regions.');
  }

  const id: `custom:${string}` = `custom:sfz_${Date.now().toString(36)}`;
  const entry: CustomInstrumentEntry = {
    id,
    name: parsed.name,
    sourceType: 'sfz',
    description: `SFZ (${Object.keys(sampleUrls).length} sample zones)`,
    sampleUrls,
    attackSec: parsed.regions[0]?.ampegAttack ?? 0.005,
    releaseSec: parsed.regions[0]?.ampegRelease ?? 0.35,
  };
  customInstruments.set(id, entry);
  notifyListeners();
  return entry;
}

/** Imports an .sf2 SoundFont file, exposing all internal bank/program presets for 1-click loading. */
export async function importSf2File(file: File): Promise<LoadedSf2Bank> {
  const buffer = await file.arrayBuffer();
  const parsed = parseSf2Buffer(buffer, file.name);
  const bankId = `sf2_${Date.now().toString(36)}`;

  const bank: LoadedSf2Bank = {
    id: bankId,
    fileName: file.name,
    presets: parsed.presets,
    loadPreset: (presetIndex: number) => {
      const preset = parsed.presets[presetIndex];
      if (!preset) return null;
      const id: `custom:${string}` = `custom:${bankId}_p${presetIndex}`;
      const existing = customInstruments.get(id);
      if (existing) return existing;

      const midiUrlMap = parsed.extractPresetSamples(presetIndex);
      const sampleUrls: Record<string, string> = {};
      for (const [midiStr, url] of Object.entries(midiUrlMap)) {
        sampleUrls[midiToNoteName(Number(midiStr))] = url;
      }
      if (Object.keys(sampleUrls).length === 0) return null;

      const entry: CustomInstrumentEntry = {
        id,
        name: `${preset.name} (SF2)`,
        sourceType: 'sf2',
        description: `${file.name} · Bank ${preset.bank} Prog ${preset.preset}`,
        sampleUrls,
        attackSec: 0.005,
        releaseSec: 0.35,
      };
      customInstruments.set(id, entry);
      notifyListeners();
      return entry;
    },
  };

  loadedSf2Banks.push(bank);
  // Auto-load the first preset so it's immediately selectable
  if (parsed.presets.length > 0) {
    bank.loadPreset(0);
  }
  notifyListeners();
  return bank;
}

/** Creates a Tone.Sampler SynthVoiceWrapper for any custom imported instrument. */
export function createCustomSamplerVoice(
  presetId: InstrumentPresetId,
  entry: CustomInstrumentEntry,
  destination: Tone.ToneAudioNode,
): SynthVoiceWrapper {
  const output = new Tone.Volume(0).connect(destination);
  const sampler = new Tone.Sampler({
    urls: entry.sampleUrls,
    attack: entry.attackSec,
    release: entry.releaseSec,
  }).connect(output);

  return {
    presetId,
    isDrum: false,
    output,
    triggerAttackRelease: (midi, durationSec, time, velocity = 0.8) => {
      if (!sampler.loaded) return;
      sampler.triggerAttackRelease(midiToNoteName(midi), Math.max(0.04, durationSec), time, velocity);
    },
    triggerAttack: (midi, time, velocity = 0.8) => {
      if (!sampler.loaded) return;
      sampler.triggerAttack(midiToNoteName(midi), time, velocity);
    },
    triggerRelease: (midi, time) => {
      if (!sampler.loaded) return;
      sampler.triggerRelease(midiToNoteName(midi), time);
    },
    releaseAll: () => {
      try {
        sampler.releaseAll();
      } catch {
        // ignore
      }
    },
    dispose: () => {
      try {
        sampler.dispose();
        output.dispose();
      } catch {
        // ignore
      }
    },
  };
}
