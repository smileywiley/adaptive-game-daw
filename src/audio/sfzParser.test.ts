import { describe, expect, it } from 'vitest';
import { parseSfz, parseSfzKey } from './sfzParser';

describe('sfzParser', () => {
  it('parses both numeric MIDI keys and note names', () => {
    expect(parseSfzKey('60')).toBe(60);
    expect(parseSfzKey('c4')).toBe(60);
    expect(parseSfzKey('A4')).toBe(69);
    expect(parseSfzKey('f#3')).toBe(54);
    expect(parseSfzKey('bb2')).toBe(46);
  });

  it('parses control, global, group, and region opcodes cleanly', () => {
    const sfz = `
      // Example Banjo SFZ
      <control>
      default_path=samples/

      <global>
      ampeg_attack=0.01
      ampeg_release=0.45

      <group>
      volume=-3

      <region>
      sample=banjo_c4.wav
      lokey=c3 hikey=f4 pitch_keycenter=c4

      <region>
      sample=banjo_a4.wav
      key=69
    `;
    const parsed = parseSfz(sfz, 'Banjo');
    expect(parsed.name).toBe('Banjo');
    expect(parsed.regions.length).toBe(2);

    expect(parsed.regions[0]).toEqual({
      sample: 'samples/banjo_c4.wav',
      lokey: 48,
      hikey: 65,
      pitchKeycenter: 60,
      ampegAttack: 0.01,
      ampegRelease: 0.45,
      volumeDb: -3,
    });

    expect(parsed.regions[1].sample).toBe('samples/banjo_a4.wav');
    expect(parsed.regions[1].pitchKeycenter).toBe(69);
  });
});
