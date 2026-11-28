import * as Tone from 'tone';
import { InstrumentPresetId } from '../types/daw';
import { createCustomSamplerVoice, getCustomInstrumentById } from './customInstruments';

export interface InstrumentPresetMeta {
  id: InstrumentPresetId;
  name: string;
  bank: 'Dark Analog / Cyberpunk' | 'Retro 16-Bit / GM' | 'Acoustic / Plucked' | 'Custom Imported';
  isDrum: boolean;
  description: string;
}

export const INSTRUMENT_PRESETS: InstrumentPresetMeta[] = [
  // Starter Bank 2: Dark Analog & Cyberpunk Synth Bank
  {
    id: 'carpenter_pulse_bass',
    name: 'Carpenter Pulse Bass',
    bank: 'Dark Analog / Cyberpunk',
    isDrum: false,
    description: 'Driving filtered analog 16th-note saw/square bassline',
  },
  {
    id: 'dystopian_brass_lead',
    name: 'Dystopian Brass Lead',
    bank: 'Dark Analog / Cyberpunk',
    isDrum: false,
    description: 'Detuned warm brassy analog lead with filter swell & chorus',
  },
  {
    id: 'cyberpunk_reese_bass',
    name: 'Cyberpunk Mid-Bass / Reese',
    bank: 'Dark Analog / Cyberpunk',
    isDrum: false,
    description: 'Saturated gritty sub-and-mid bass with distortion & filter',
  },
  {
    id: 'neon_arp_pluck',
    name: 'Neon Arpeggiator Pluck',
    bank: 'Dark Analog / Cyberpunk',
    isDrum: false,
    description: 'Crisp resonant analog pluck with stereo ping-pong delay',
  },
  {
    id: 'dark_analog_pad',
    name: 'Dark Analog Pad',
    bank: 'Dark Analog / Cyberpunk',
    isDrum: false,
    description: 'Lush ominous minor-key string/choir pad with hall reverb',
  },
  {
    id: 'industrial_drum_kit',
    name: 'Industrial / Retro Drum Kit',
    bank: 'Dark Analog / Cyberpunk',
    isDrum: true,
    description: 'Punchy analog kick, gated snare, metallic hi-hats & perc',
  },
  // Starter Bank 1: Retro 16-Bit / GM
  {
    id: 'retro_chiptune_lead',
    name: 'Retro Chiptune Lead',
    bank: 'Retro 16-Bit / GM',
    isDrum: false,
    description: 'Crisp 16-bit pulse-wave arcade melody lead',
  },
  {
    id: 'retro_fm_bass',
    name: 'Retro FM Bass',
    bank: 'Retro 16-Bit / GM',
    isDrum: false,
    description: 'Punchy Genesis/SNES style FM synth bass',
  },
  {
    id: 'retro_rpg_strings',
    name: 'Retro RPG Strings',
    bank: 'Retro 16-Bit / GM',
    isDrum: false,
    description: 'Warm 16-bit orchestral string pad',
  },
  {
    id: 'retro_harp_pluck',
    name: 'Retro Harp / Bell Pluck',
    bank: 'Retro 16-Bit / GM',
    isDrum: false,
    description: 'Sparkling fantasy RPG arpeggio pluck',
  },
  {
    id: 'retro_arcade_drums',
    name: 'Retro Arcade Drums',
    bank: 'Retro 16-Bit / GM',
    isDrum: true,
    description: 'Tight lo-fi 16-bit drum kit',
  },
  // Acoustic / Plucked Bank (ideal for seamless location instrument swaps!)
  {
    id: 'acoustic_guitar',
    name: 'Acoustic Guitar',
    bank: 'Acoustic / Plucked',
    isDrum: false,
    description: 'Warm nylon/steel plucked acoustic guitar',
  },
  {
    id: 'banjo_pluck',
    name: 'Banjo Twang',
    bank: 'Acoustic / Plucked',
    isDrum: false,
    description: 'Bright, snappy resonant shack banjo pluck',
  },
  {
    id: 'ukulele_pluck',
    name: 'Island Ukulele',
    bank: 'Acoustic / Plucked',
    isDrum: false,
    description: 'Light, breezy tropical tiki-bar ukulele pluck',
  },
];

export interface SynthVoiceWrapper {
  presetId: InstrumentPresetId;
  isDrum: boolean;
  output: Tone.Volume;
  triggerAttackRelease: (midi: number, durationSec: number, time?: number, velocity?: number) => void;
  triggerAttack: (midi: number, time?: number, velocity?: number) => void;
  triggerRelease: (midi: number, time?: number) => void;
  releaseAll: () => void;
  dispose: () => void;
}

function createDrumKitWrapper(presetId: InstrumentPresetId, destination: Tone.ToneAudioNode): SynthVoiceWrapper {
  const output = new Tone.Volume(0).connect(destination);
  const isIndustrial = presetId === 'industrial_drum_kit';

  const kick = new Tone.MembraneSynth({
    pitchDecay: isIndustrial ? 0.045 : 0.03,
    octaves: isIndustrial ? 7 : 5,
    oscillator: { type: isIndustrial ? 'sine' : 'triangle' },
    envelope: { attack: 0.002, decay: isIndustrial ? 0.28 : 0.16, sustain: 0.01, release: 0.2 },
  }).connect(output);

  const snareFilter = new Tone.Filter(isIndustrial ? 1800 : 2800, 'bandpass').connect(output);
  const snare = new Tone.NoiseSynth({
    noise: { type: isIndustrial ? 'pink' : 'white' },
    envelope: { attack: 0.002, decay: isIndustrial ? 0.2 : 0.11, sustain: 0, release: 0.08 },
  }).connect(snareFilter);

  const clapFilter = new Tone.Filter(2400, 'highpass').connect(output);
  const clap = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.005, decay: 0.09, sustain: 0, release: 0.05 },
  }).connect(clapFilter);

  const hatFilter = new Tone.Filter(7500, 'highpass').connect(output);
  const closedHat = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.045, sustain: 0, release: 0.02 },
  }).connect(hatFilter);

  const openHat = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.002, decay: 0.22, sustain: 0, release: 0.1 },
  }).connect(hatFilter);

  const perc = new Tone.MetalSynth({
    envelope: { attack: 0.001, decay: 0.14, release: 0.06 },
    harmonicity: 5.1,
    modulationIndex: 28,
    resonance: 3200,
    octaves: 1.2,
  }).connect(output);
  perc.volume.value = -10;

  const crashFilter = new Tone.Filter(5200, 'highpass').connect(output);
  const crash = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.005, decay: 0.65, sustain: 0, release: 0.3 },
  }).connect(crashFilter);
  crash.volume.value = -8;

  const triggerHit = (midi: number, time?: number, velocity = 0.8) => {
    const t = time ?? Tone.now();
    const vel = Math.max(0.05, Math.min(1, velocity));
    if (midi <= 37) {
      kick.triggerAttackRelease(isIndustrial ? 'C1' : 'E1', '8n', t, vel);
    } else if (midi === 38) {
      snare.triggerAttackRelease('16n', t, vel);
    } else if (midi === 39) {
      clap.triggerAttackRelease('32n', t, vel * 0.85);
    } else if (midi === 42 || midi === 44) {
      closedHat.triggerAttackRelease('32n', t, vel * 0.65);
    } else if (midi === 46) {
      openHat.triggerAttackRelease('8n', t, vel * 0.6);
    } else if (midi === 49 || midi >= 48) {
      crash.triggerAttackRelease('4n', t, vel * 0.55);
    } else {
      perc.triggerAttackRelease('C5', '16n', t, vel * 0.7);
    }
  };

  return {
    presetId,
    isDrum: true,
    output,
    triggerAttackRelease: (midi, _dur, time, velocity) => triggerHit(midi, time, velocity),
    triggerAttack: (midi, time, velocity) => triggerHit(midi, time, velocity),
    triggerRelease: () => {},
    releaseAll: () => {},
    dispose: () => {
      kick.dispose();
      snare.dispose();
      snareFilter.dispose();
      clap.dispose();
      clapFilter.dispose();
      closedHat.dispose();
      openHat.dispose();
      hatFilter.dispose();
      perc.dispose();
      crash.dispose();
      crashFilter.dispose();
      output.dispose();
    },
  };
}

export function createInstrumentVoice(
  presetId: InstrumentPresetId,
  destination: Tone.ToneAudioNode,
): SynthVoiceWrapper {
  if (presetId.startsWith('custom:')) {
    const custom = getCustomInstrumentById(presetId);
    if (custom) {
      return createCustomSamplerVoice(presetId, custom, destination);
    }
  }

  if (presetId === 'industrial_drum_kit' || presetId === 'retro_arcade_drums') {
    return createDrumKitWrapper(presetId, destination);
  }

  const output = new Tone.Volume(0).connect(destination);
  const disposables: Tone.ToneAudioNode[] = [output];
  let synth: Tone.PolySynth;

  switch (presetId) {
    case 'carpenter_pulse_bass': {
      const filter = new Tone.Filter(950, 'lowpass').connect(output);
      disposables.push(filter);
      synth = new Tone.PolySynth(Tone.MonoSynth, {
        oscillator: { type: 'sawtooth' },
        filter: { Q: 3, type: 'lowpass', rolloff: -24 },
        envelope: { attack: 0.005, decay: 0.16, sustain: 0.35, release: 0.12 },
        filterEnvelope: {
          attack: 0.005,
          decay: 0.14,
          sustain: 0.2,
          release: 0.1,
          baseFrequency: 120,
          octaves: 3.2,
        },
      }).connect(filter);
      break;
    }

    case 'cyberpunk_reese_bass': {
      const dist = new Tone.Distortion(0.42).connect(output);
      const filter = new Tone.Filter(720, 'lowpass').connect(dist);
      disposables.push(dist, filter);
      synth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'fatsawtooth', count: 3, spread: 24 },
        envelope: { attack: 0.01, decay: 0.25, sustain: 0.7, release: 0.18 },
      }).connect(filter);
      break;
    }

    case 'dystopian_brass_lead': {
      const chorus = new Tone.Chorus(2.5, 2.2, 0.35).connect(output).start();
      const filter = new Tone.Filter(2400, 'lowpass').connect(chorus);
      disposables.push(chorus, filter);
      synth = new Tone.PolySynth(Tone.MonoSynth, {
        oscillator: { type: 'fatsawtooth', count: 2, spread: 16 },
        filter: { Q: 2, type: 'lowpass', rolloff: -12 },
        envelope: { attack: 0.06, decay: 0.3, sustain: 0.65, release: 0.35 },
        filterEnvelope: {
          attack: 0.12,
          decay: 0.35,
          sustain: 0.5,
          release: 0.4,
          baseFrequency: 420,
          octaves: 2.8,
        },
      }).connect(filter);
      break;
    }

    case 'neon_arp_pluck': {
      const delay = new Tone.PingPongDelay('8n.', 0.28).connect(output);
      delay.wet.value = 0.26;
      const filter = new Tone.Filter(3400, 'lowpass').connect(delay);
      disposables.push(delay, filter);
      synth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'triangle8' },
        envelope: { attack: 0.004, decay: 0.22, sustain: 0.12, release: 0.28 },
      }).connect(filter);
      break;
    }

    case 'dark_analog_pad': {
      const reverb = new Tone.Reverb({ decay: 3.4, wet: 0.45 }).connect(output);
      const filter = new Tone.Filter(1450, 'lowpass').connect(reverb);
      disposables.push(reverb, filter);
      synth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'fatsawtooth', count: 3, spread: 28 },
        envelope: { attack: 0.45, decay: 0.5, sustain: 0.72, release: 1.1 },
      }).connect(filter);
      break;
    }

    case 'retro_chiptune_lead': {
      synth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'square' },
        envelope: { attack: 0.005, decay: 0.15, sustain: 0.5, release: 0.08 },
      }).connect(output);
      break;
    }

    case 'retro_fm_bass': {
      synth = new Tone.PolySynth(Tone.FMSynth, {
        harmonicity: 2,
        modulationIndex: 4.5,
        oscillator: { type: 'sine' },
        envelope: { attack: 0.004, decay: 0.2, sustain: 0.45, release: 0.1 },
      }).connect(output);
      break;
    }

    case 'retro_rpg_strings': {
      const filter = new Tone.Filter(2600, 'lowpass').connect(output);
      disposables.push(filter);
      synth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'sawtooth' },
        envelope: { attack: 0.25, decay: 0.3, sustain: 0.65, release: 0.6 },
      }).connect(filter);
      break;
    }

    case 'acoustic_guitar': {
      const bodyFilter = new Tone.Filter(2100, 'lowpass').connect(output);
      disposables.push(bodyFilter);
      synth = new Tone.PolySynth(Tone.FMSynth, {
        harmonicity: 1,
        modulationIndex: 2.2,
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.004, decay: 0.55, sustain: 0.08, release: 0.45 },
        modulationEnvelope: { attack: 0.002, decay: 0.18, sustain: 0, release: 0.1 },
      }).connect(bodyFilter);
      break;
    }

    case 'banjo_pluck': {
      const twang = new Tone.Filter({ frequency: 1950, type: 'peaking', Q: 3.5, gain: 7 }).connect(output);
      disposables.push(twang);
      synth = new Tone.PolySynth(Tone.FMSynth, {
        harmonicity: 3.0,
        modulationIndex: 6.5,
        oscillator: { type: 'sawtooth' },
        envelope: { attack: 0.002, decay: 0.24, sustain: 0.02, release: 0.16 },
        modulationEnvelope: { attack: 0.001, decay: 0.09, sustain: 0, release: 0.05 },
      }).connect(twang);
      break;
    }

    case 'ukulele_pluck': {
      const bright = new Tone.Filter(3600, 'lowpass').connect(output);
      disposables.push(bright);
      synth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'triangle4' },
        envelope: { attack: 0.003, decay: 0.28, sustain: 0.04, release: 0.22 },
      }).connect(bright);
      break;
    }

    case 'retro_harp_pluck':
    default: {
      const delay = new Tone.PingPongDelay('8n', 0.2).connect(output);
      delay.wet.value = 0.22;
      disposables.push(delay);
      synth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.004, decay: 0.32, sustain: 0.08, release: 0.3 },
      }).connect(delay);
      break;
    }
  }

  synth.maxPolyphony = 12;
  disposables.push(synth);

  return {
    presetId,
    isDrum: false,
    output,
    triggerAttackRelease: (midi, durationSec, time, velocity = 0.8) => {
      const freq = Tone.Frequency(midi, 'midi').toFrequency();
      synth.triggerAttackRelease(freq, Math.max(0.03, durationSec), time, velocity);
    },
    triggerAttack: (midi, time, velocity = 0.8) => {
      const freq = Tone.Frequency(midi, 'midi').toFrequency();
      synth.triggerAttack(freq, time, velocity);
    },
    triggerRelease: (midi, time) => {
      const freq = Tone.Frequency(midi, 'midi').toFrequency();
      synth.triggerRelease(freq, time);
    },
    releaseAll: () => synth.releaseAll(),
    dispose: () => {
      for (const node of disposables) {
        try {
          node.dispose();
        } catch {
          // ignore disposal races
        }
      }
    },
  };
}
