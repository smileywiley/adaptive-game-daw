/**
 * Lightweight TypeScript SFZ (.sfz) parser.
 * Supports <global>, <group>, and <region> sections with core opcodes:
 * sample, lokey, hikey, pitch_keycenter, key, ampeg_attack, ampeg_release, volume.
 */

export interface SfzRegion {
  sample: string;
  lokey: number;
  hikey: number;
  pitchKeycenter: number;
  ampegAttack: number;
  ampegRelease: number;
  volumeDb: number;
}

export interface ParsedSfzInstrument {
  name: string;
  regions: SfzRegion[];
}

const NOTE_MAP: Record<string, number> = {
  c: 0,
  'c#': 1,
  db: 1,
  d: 2,
  'd#': 3,
  eb: 3,
  e: 4,
  f: 5,
  'f#': 6,
  gb: 6,
  g: 7,
  'g#': 8,
  ab: 8,
  a: 9,
  'a#': 10,
  bb: 10,
  b: 11,
};

/** Parses either a numeric MIDI key ("60") or a note name ("c4", "f#3") to MIDI 0..127. */
export function parseSfzKey(value: string): number {
  const trimmed = value.trim().toLowerCase();
  if (/^\d+$/.test(trimmed)) {
    return Math.max(0, Math.min(127, parseInt(trimmed, 10)));
  }
  const match = /^([a-g][#b]?)(-?\d)$/.exec(trimmed);
  if (!match) return 60;
  const pc = NOTE_MAP[match[1]] ?? 0;
  const oct = parseInt(match[2], 10);
  return Math.max(0, Math.min(127, (oct + 1) * 12 + pc));
}

function parseOpcodes(blockText: string): Record<string, string> {
  const opcodes: Record<string, string> = {};
  // Strip // comments
  const cleaned = blockText.replace(/\/\/[^\n\r]*/g, ' ');
  // Match opcode=value (handling sample paths that may contain spaces up to next opcode= or end)
  const regex = /([a-zA-Z0-9_]+)=([^\n\r]+?)(?=\s+[a-zA-Z0-9_]+=|$)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(cleaned)) !== null) {
    opcodes[match[1].toLowerCase()] = match[2].trim();
  }
  return opcodes;
}

export function parseSfz(sfzText: string, instrumentName = 'SFZ Instrument'): ParsedSfzInstrument {
  const regions: SfzRegion[] = [];
  let globalOps: Record<string, string> = {};
  let groupOps: Record<string, string> = {};

  // Split by <header> tags while preserving header names
  const tokenRegex = /<(global|group|region|control)>([\s\S]*?)(?=<(?:global|group|region|control)>|$)/gi;
  let match: RegExpExecArray | null;
  let defaultPath = '';

  while ((match = tokenRegex.exec(sfzText)) !== null) {
    const header = match[1].toLowerCase();
    const body = match[2];
    const ops = parseOpcodes(body);

    if (header === 'control') {
      if (ops.default_path) {
        defaultPath = ops.default_path.replace(/\\/g, '/');
      }
    } else if (header === 'global') {
      globalOps = { ...globalOps, ...ops };
    } else if (header === 'group') {
      groupOps = { ...ops };
    } else if (header === 'region') {
      const merged = { ...globalOps, ...groupOps, ...ops };
      if (!merged.sample) continue;

      const normalizedSample = `${defaultPath}${merged.sample.replace(/\\/g, '/')}`.replace(/^\.\//, '');
      const keyVal = merged.key !== undefined ? parseSfzKey(merged.key) : undefined;
      const lokey = merged.lokey !== undefined ? parseSfzKey(merged.lokey) : keyVal ?? 0;
      const hikey = merged.hikey !== undefined ? parseSfzKey(merged.hikey) : keyVal ?? 127;
      const pitchKeycenter =
        merged.pitch_keycenter !== undefined
          ? parseSfzKey(merged.pitch_keycenter)
          : keyVal ?? Math.round((lokey + hikey) / 2);

      regions.push({
        sample: normalizedSample,
        lokey,
        hikey,
        pitchKeycenter,
        ampegAttack: merged.ampeg_attack !== undefined ? parseFloat(merged.ampeg_attack) || 0.005 : 0.005,
        ampegRelease: merged.ampeg_release !== undefined ? parseFloat(merged.ampeg_release) || 0.35 : 0.35,
        volumeDb: merged.volume !== undefined ? parseFloat(merged.volume) || 0 : 0,
      });
    }
  }

  return { name: instrumentName, regions };
}
