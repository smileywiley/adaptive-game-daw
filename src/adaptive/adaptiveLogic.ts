import { SimulationScenario, TransitionQuantization } from '../types/daw';

/**
 * Computes a smooth 0..1 vertical stem crossfade multiplier based on global intensity (0..1)
 * and the stem's [intensityMin, intensityMax] active window.
 */
export function computeStemIntensityGain(
  intensity: number,
  intensityMin: number,
  intensityMax = 1.0,
  fadeWidth = 0.14,
): number {
  const clamped = Math.max(0, Math.min(1, intensity));
  if (intensityMin <= 0 && intensityMax >= 1) return 1;

  // Fade in around intensityMin
  let inGain = 1;
  if (intensityMin > 0) {
    if (clamped < intensityMin - fadeWidth * 0.5) {
      inGain = 0;
    } else if (clamped < intensityMin + fadeWidth * 0.5) {
      inGain = (clamped - (intensityMin - fadeWidth * 0.5)) / fadeWidth;
    }
  }

  // Fade out around intensityMax (if < 1)
  let outGain = 1;
  if (intensityMax < 1) {
    if (clamped > intensityMax + fadeWidth * 0.5) {
      outGain = 0;
    } else if (clamped > intensityMax - fadeWidth * 0.5) {
      outGain = (intensityMax + fadeWidth * 0.5 - clamped) / fadeWidth;
    }
  }

  return Math.max(0, Math.min(1, inGain * outGain));
}

/** Converts a 0..1 linear gain multiplier to a dB offset (capped at -60 dB for silence). */
export function gainToDbOffset(gain: number): number {
  if (gain <= 0.001) return -60;
  return 20 * Math.log10(gain);
}

/**
 * Computes the number of quarter-note beats until the next quantized transition point.
 * Always returns > 0.05 beats so a transition scheduled right on a boundary waits cleanly.
 */
export function computeBeatsUntilTransition(
  currentBeat: number,
  totalBeats: number,
  beatsPerBar: number,
  quantization: TransitionQuantization,
): number {
  const safeTotal = Math.max(beatsPerBar, totalBeats);
  const pos = ((currentBeat % safeTotal) + safeTotal) % safeTotal;
  const eps = 0.05;

  let interval = beatsPerBar;
  if (quantization === 'next_beat') {
    interval = 1;
  } else if (quantization === 'next_bar') {
    interval = beatsPerBar;
  } else if (quantization === 'phrase_4') {
    interval = Math.min(safeTotal, beatsPerBar * 4);
  } else if (quantization === 'end_of_loop') {
    interval = safeTotal;
  }

  const nextBoundary = Math.ceil((pos + eps) / interval) * interval;
  const remaining = nextBoundary - pos;
  return Math.max(eps, remaining);
}

export const TRANSITION_RULE_LABELS: Record<TransitionQuantization, { label: string; hint: string }> = {
  next_beat: { label: 'Next Beat', hint: 'Fastest response — snaps on the very next beat' },
  next_bar: { label: 'Next Bar', hint: 'Musical & responsive — switches cleanly on Bar start' },
  phrase_4: { label: 'End of 4-Bar Phrase', hint: 'Classic game score pacing — finishes the 4-bar phrase' },
  end_of_loop: { label: 'End of Loop', hint: 'Completes the full section loop before switching' },
};

/**
 * Built-in prerecorded gameplay scenarios for testing adaptive transitions & vertical intensity.
 */
export const BUILT_IN_SCENARIOS: SimulationScenario[] = [
  {
    id: 'night_city_heist',
    name: 'Night City: Stealth → Spotted → Boss Fight → Victory',
    description: 'Low-intensity infiltration escalates into Alert, full Combat, and a Victory Stinger.',
    durationSec: 32,
    events: [
      { timeSec: 0, type: 'state', value: 'Exploration' },
      { timeSec: 0, type: 'intensity', value: 0.2 },
      { timeSec: 5, type: 'intensity', value: 0.45 },
      { timeSec: 9, type: 'state', value: 'Alert' },
      { timeSec: 9, type: 'intensity', value: 0.65 },
      { timeSec: 15, type: 'state', value: 'Combat' },
      { timeSec: 15, type: 'intensity', value: 0.85 },
      { timeSec: 20, type: 'intensity', value: 1.0 },
      { timeSec: 27, type: 'stinger', value: 'Victory_Stinger' },
      { timeSec: 28, type: 'state', value: 'Exploration' },
      { timeSec: 28, type: 'intensity', value: 0.25 },
    ],
  },
  {
    id: 'escape_new_york',
    name: 'Escape From New York: Perimeter Breach → Chase → Safe Zone',
    description: 'Tense perimeter creep spikes into an all-out chase before cooling off in a safe zone.',
    durationSec: 28,
    events: [
      { timeSec: 0, type: 'state', value: 'Exploration' },
      { timeSec: 0, type: 'intensity', value: 0.3 },
      { timeSec: 6, type: 'state', value: 'Alert' },
      { timeSec: 6, type: 'intensity', value: 0.6 },
      { timeSec: 12, type: 'state', value: 'Combat' },
      { timeSec: 12, type: 'intensity', value: 0.95 },
      { timeSec: 21, type: 'state', value: 'Exploration' },
      { timeSec: 21, type: 'intensity', value: 0.2 },
    ],
  },
  {
    id: 'rpg_ambush',
    name: 'RPG Dungeon: Calm Crawl → Ambush → Victory Fanfare',
    description: 'Ambient pad exploration interrupted by a sudden combat ambush and victory cue.',
    durationSec: 24,
    events: [
      { timeSec: 0, type: 'state', value: 'Exploration' },
      { timeSec: 0, type: 'intensity', value: 0.15 },
      { timeSec: 7, type: 'state', value: 'Combat' },
      { timeSec: 7, type: 'intensity', value: 0.9 },
      { timeSec: 17, type: 'stinger', value: 'Victory_Stinger' },
      { timeSec: 19, type: 'state', value: 'Exploration' },
      { timeSec: 19, type: 'intensity', value: 0.3 },
    ],
  },
];

export interface ScenarioSnapshot {
  stateName: string | null;
  intensity: number;
}

/** Evaluates the active state and smoothly interpolated intensity at timeSec in a scenario. */
export function evaluateScenarioAtTime(
  scenario: SimulationScenario,
  timeSec: number,
): ScenarioSnapshot {
  const sorted = [...scenario.events].sort((a, b) => a.timeSec - b.timeSec);
  let stateName: string | null = null;
  let lastIntTime = 0;
  let lastIntVal = 0.3;
  let nextIntTime: number | null = null;
  let nextIntVal: number | null = null;

  for (const ev of sorted) {
    if (ev.timeSec <= timeSec) {
      if (ev.type === 'state' && typeof ev.value === 'string') {
        stateName = ev.value;
      } else if (ev.type === 'intensity' && typeof ev.value === 'number') {
        lastIntTime = ev.timeSec;
        lastIntVal = ev.value;
      }
    } else if (ev.type === 'intensity' && typeof ev.value === 'number' && nextIntTime === null) {
      nextIntTime = ev.timeSec;
      nextIntVal = ev.value;
    }
  }

  let intensity = lastIntVal;
  if (nextIntTime !== null && nextIntVal !== null && nextIntTime > lastIntTime) {
    const t = Math.max(0, Math.min(1, (timeSec - lastIntTime) / (nextIntTime - lastIntTime)));
    intensity = lastIntVal + (nextIntVal - lastIntVal) * t;
  }

  return { stateName, intensity };
}
