import { describe, expect, it } from 'vitest';
import { encodeInt16PcmToWav } from './wavEncoder';

describe('wavEncoder', () => {
  it('encodes 16-bit PCM samples into a valid RIFF WAVE header and payload', () => {
    const samples = new Int16Array([0, 16384, -16384, 32767]);
    const wav = encodeInt16PcmToWav(samples, 44100, 1);

    expect(wav.byteLength).toBe(44 + samples.length * 2);
    const view = new DataView(wav.buffer);
    const riff = String.fromCharCode(wav[0], wav[1], wav[2], wav[3]);
    const wave = String.fromCharCode(wav[8], wav[9], wav[10], wav[11]);
    expect(riff).toBe('RIFF');
    expect(wave).toBe('WAVE');
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(44100); // sampleRate
    expect(view.getUint16(34, true)).toBe(16); // bitsPerSample
    expect(view.getUint32(40, true)).toBe(8); // data chunk bytes
    expect(view.getInt16(46, true)).toBe(16384);
  });
});
