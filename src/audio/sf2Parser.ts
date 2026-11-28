import { encodeInt16PcmToWav } from '../export/wavEncoder';

/**
 * Pure TypeScript RIFF SoundFont 2 (.sf2) parser.
 * Extracts all internal bank/program presets and decodes 16-bit PCM sample zones
 * into WAV Blob URLs that load cleanly into Tone.Sampler (compatible with GitHub Pages & Tone.Offline).
 */

export interface Sf2PresetInfo {
  bank: number;
  preset: number;
  name: string;
  bagIndex: number;
  bagEnd: number;
}

interface Sf2SampleHeader {
  name: string;
  start: number;
  end: number;
  sampleRate: number;
  originalPitch: number;
}

interface Sf2Bag {
  genIndex: number;
  genEnd: number;
}

interface Sf2Gen {
  oper: number;
  amount: number;
}

interface Sf2Instrument {
  name: string;
  bagIndex: number;
  bagEnd: number;
}

export interface ParsedSf2File {
  fileName: string;
  presets: Sf2PresetInfo[];
  extractPresetSamples: (presetIndex: number) => Record<number, string>;
}

function readFourCC(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}

function readCString(bytes: Uint8Array, offset: number, maxLen: number): string {
  let out = '';
  for (let i = 0; i < maxLen; i++) {
    const c = bytes[offset + i];
    if (c === 0) break;
    out += String.fromCharCode(c);
  }
  return out.trim();
}

export function parseSf2Buffer(buffer: ArrayBuffer, fileName: string): ParsedSf2File {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  if (buffer.byteLength < 12 || readFourCC(view, 0) !== 'RIFF' || readFourCC(view, 8) !== 'sfbk') {
    throw new Error('Not a valid .sf2 SoundFont file (missing RIFF/sfbk header).');
  }

  let smplOffset = 0;
  let smplSize = 0;
  const pdtaChunks: Record<string, { offset: number; size: number }> = {};

  // Walk top-level LIST chunks inside RIFF
  let pos = 12;
  while (pos + 8 <= buffer.byteLength) {
    const id = readFourCC(view, pos);
    const size = view.getUint32(pos + 4, true);
    if (id === 'LIST' && pos + 12 <= buffer.byteLength) {
      const listType = readFourCC(view, pos + 8);
      let sub = pos + 12;
      const listEnd = Math.min(buffer.byteLength, pos + 8 + size);
      while (sub + 8 <= listEnd) {
        const subId = readFourCC(view, sub);
        const subSize = view.getUint32(sub + 4, true);
        if (listType === 'sdta' && subId === 'smpl') {
          smplOffset = sub + 8;
          smplSize = subSize;
        } else if (listType === 'pdta') {
          pdtaChunks[subId] = { offset: sub + 8, size: subSize };
        }
        sub += 8 + subSize + (subSize % 2);
      }
    }
    pos += 8 + size + (size % 2);
  }

  if (!smplOffset || !pdtaChunks.phdr || !pdtaChunks.shdr) {
    throw new Error('SoundFont .sf2 is missing required pdta/sdta chunks.');
  }

  // Parse phdr (38 bytes each; last record is EOP sentinel)
  const phdr = pdtaChunks.phdr;
  const presetCount = Math.max(0, Math.floor(phdr.size / 38) - 1);
  const presets: Sf2PresetInfo[] = [];
  for (let i = 0; i < presetCount; i++) {
    const o = phdr.offset + i * 38;
    const nextO = phdr.offset + (i + 1) * 38;
    presets.push({
      name: readCString(bytes, o, 20) || `Preset ${i}`,
      preset: view.getUint16(o + 20, true),
      bank: view.getUint16(o + 22, true),
      bagIndex: view.getUint16(o + 24, true),
      bagEnd: view.getUint16(nextO + 24, true),
    });
  }

  const parseBags = (chunk?: { offset: number; size: number }): Sf2Bag[] => {
    if (!chunk) return [];
    const count = Math.max(0, Math.floor(chunk.size / 4) - 1);
    const out: Sf2Bag[] = [];
    for (let i = 0; i < count; i++) {
      const o = chunk.offset + i * 4;
      const nextO = chunk.offset + (i + 1) * 4;
      out.push({
        genIndex: view.getUint16(o, true),
        genEnd: view.getUint16(nextO, true),
      });
    }
    return out;
  };

  const parseGens = (chunk?: { offset: number; size: number }): Sf2Gen[] => {
    if (!chunk) return [];
    const count = Math.floor(chunk.size / 4);
    const out: Sf2Gen[] = [];
    for (let i = 0; i < count; i++) {
      const o = chunk.offset + i * 4;
      out.push({
        oper: view.getUint16(o, true),
        amount: view.getInt16(o + 2, true),
      });
    }
    return out;
  };

  const pbags = parseBags(pdtaChunks.pbag);
  const pgens = parseGens(pdtaChunks.pgen);
  const ibags = parseBags(pdtaChunks.ibag);
  const igens = parseGens(pdtaChunks.igen);

  // Parse inst (22 bytes each)
  const instChunk = pdtaChunks.inst;
  const instruments: Sf2Instrument[] = [];
  if (instChunk) {
    const count = Math.max(0, Math.floor(instChunk.size / 22) - 1);
    for (let i = 0; i < count; i++) {
      const o = instChunk.offset + i * 22;
      const nextO = instChunk.offset + (i + 1) * 22;
      instruments.push({
        name: readCString(bytes, o, 20),
        bagIndex: view.getUint16(o + 20, true),
        bagEnd: view.getUint16(nextO + 20, true),
      });
    }
  }

  // Parse shdr (46 bytes each)
  const shdr = pdtaChunks.shdr;
  const sampleCount = Math.max(0, Math.floor(shdr.size / 46) - 1);
  const samples: Sf2SampleHeader[] = [];
  for (let i = 0; i < sampleCount; i++) {
    const o = shdr.offset + i * 46;
    samples.push({
      name: readCString(bytes, o, 20),
      start: view.getUint32(o + 20, true),
      end: view.getUint32(o + 24, true),
      sampleRate: view.getUint32(o + 36, true) || 44100,
      originalPitch: view.getUint8(o + 40),
    });
  }

  const smplInt16 = new Int16Array(buffer, smplOffset, Math.floor(smplSize / 2));

  /** Extracts up to 16 evenly distributed sample WAV blob URLs keyed by MIDI pitch for Tone.Sampler. */
  const extractPresetSamples = (presetIndex: number): Record<number, string> => {
    const preset = presets[presetIndex];
    if (!preset) return {};

    // Collect instrument indices referenced by preset zones (oper 41 = instrument)
    const instIndices = new Set<number>();
    for (let b = preset.bagIndex; b < preset.bagEnd && b < pbags.length; b++) {
      const bag = pbags[b];
      for (let g = bag.genIndex; g < bag.genEnd && g < pgens.length; g++) {
        if (pgens[g].oper === 41) {
          instIndices.add(pgens[g].amount);
        }
      }
    }

    const noteToSample = new Map<number, Sf2SampleHeader>();
    for (const instIdx of instIndices) {
      const inst = instruments[instIdx];
      if (!inst) continue;
      for (let b = inst.bagIndex; b < inst.bagEnd && b < ibags.length; b++) {
        const bag = ibags[b];
        let sampleId: number | null = null;
        let overridingRoot: number | null = null;
        for (let g = bag.genIndex; g < bag.genEnd && g < igens.length; g++) {
          const gen = igens[g];
          if (gen.oper === 53) sampleId = gen.amount; // sampleID
          if (gen.oper === 58 && gen.amount >= 0 && gen.amount <= 127) {
            overridingRoot = gen.amount; // overridingRootKey
          }
        }
        if (sampleId !== null && samples[sampleId]) {
          const sh = samples[sampleId];
          const pitch =
            overridingRoot ?? (sh.originalPitch <= 127 ? sh.originalPitch : 60);
          if (!noteToSample.has(pitch) && sh.end > sh.start + 64) {
            noteToSample.set(pitch, sh);
          }
        }
      }
    }

    // Cap to 16 zones for fast Tone.Sampler loading
    const entries = Array.from(noteToSample.entries()).sort((a, b) => a[0] - b[0]);
    const step = Math.max(1, Math.ceil(entries.length / 16));
    const urlMap: Record<number, string> = {};

    for (let i = 0; i < entries.length; i += step) {
      const [midi, sh] = entries[i];
      const maxLen = Math.min(sh.end - sh.start, sh.sampleRate * 4); // cap 4s per zone
      const slice = smplInt16.subarray(sh.start, sh.start + maxLen);
      const wavBytes = encodeInt16PcmToWav(slice, sh.sampleRate, 1);
      const blob = new Blob([wavBytes.buffer as ArrayBuffer], { type: 'audio/wav' });
      urlMap[midi] = URL.createObjectURL(blob);
    }

    return urlMap;
  };

  return { fileName, presets, extractPresetSamples };
}
