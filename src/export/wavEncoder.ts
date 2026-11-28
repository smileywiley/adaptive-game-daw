/**
 * Pure TypeScript 16-bit PCM WAV encoder.
 * Used both for exporting Tone.Offline stems and for decoding .sf2 SoundFont PCM samples into Tone.Sampler URLs.
 */

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}

/** Encodes raw mono 16-bit signed PCM samples into a valid RIFF WAVE byte array. */
export function encodeInt16PcmToWav(
  samples: Int16Array,
  sampleRate: number,
  numChannels = 1,
): Uint8Array {
  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
  view.setUint16(32, numChannels * bytesPerSample, true);
  view.setUint16(34, 16, true); // 16-bit
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    view.setInt16(offset, samples[i], true);
    offset += 2;
  }

  return new Uint8Array(buffer);
}

/**
 * Encodes an AudioBuffer (or a sub-slice [startSample, endSample) for seamless Pass-2 loop export)
 * into a standard stereo 16-bit PCM WAV byte array.
 */
export function encodeAudioBufferToWav(
  audioBuffer: AudioBuffer,
  startSample = 0,
  endSample = audioBuffer.length,
): Uint8Array {
  const numChannels = Math.min(2, audioBuffer.numberOfChannels);
  const sampleRate = audioBuffer.sampleRate;
  const clampedStart = Math.max(0, Math.min(audioBuffer.length, Math.floor(startSample)));
  const clampedEnd = Math.max(clampedStart, Math.min(audioBuffer.length, Math.floor(endSample)));
  const frameCount = clampedEnd - clampedStart;

  const channels: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channels.push(audioBuffer.getChannelData(ch));
  }

  const interleaved = new Int16Array(frameCount * numChannels);
  let outIdx = 0;
  for (let i = clampedStart; i < clampedEnd; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const s = Math.max(-1, Math.min(1, channels[ch][i] ?? 0));
      interleaved[outIdx++] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
    }
  }

  return encodeInt16PcmToWav(interleaved, sampleRate, numChannels);
}
