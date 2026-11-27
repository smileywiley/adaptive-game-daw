import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_SCENARIOS,
  computeBeatsUntilTransition,
  computeStemIntensityGain,
  evaluateScenarioAtTime,
  gainToDbOffset,
} from './adaptiveLogic';

describe('adaptiveLogic', () => {
  it('computes smooth vertical stem intensity crossfades', () => {
    // Stem always active (0..1)
    expect(computeStemIntensityGain(0, 0, 1)).toBe(1);
    expect(computeStemIntensityGain(0.5, 0, 1)).toBe(1);

    // Percussion starts around 0.45
    expect(computeStemIntensityGain(0.1, 0.45, 1)).toBe(0);
    expect(computeStemIntensityGain(0.45, 0.45, 1)).toBeCloseTo(0.5, 2);
    expect(computeStemIntensityGain(0.8, 0.45, 1)).toBe(1);

    // Silence converts to -60 dB floor
    expect(gainToDbOffset(0)).toBe(-60);
    expect(gainToDbOffset(1)).toBeCloseTo(0, 4);
  });

  it('computes quantized transition countdowns accurately for 4/4 and 5/4', () => {
    // 4/4, 4 bars = 16 beats
    expect(computeBeatsUntilTransition(1.25, 16, 4, 'next_beat')).toBeCloseTo(0.75, 4);
    expect(computeBeatsUntilTransition(1.25, 16, 4, 'next_bar')).toBeCloseTo(2.75, 4);
    expect(computeBeatsUntilTransition(5.0, 16, 4, 'phrase_4')).toBeCloseTo(11.0, 4);
    expect(computeBeatsUntilTransition(12.5, 16, 4, 'end_of_loop')).toBeCloseTo(3.5, 4);

    // 5/4, 4 bars = 20 beats
    expect(computeBeatsUntilTransition(6.0, 20, 5, 'next_bar')).toBeCloseTo(4.0, 4);
  });

  it('evaluates built-in gameplay scenarios with state changes and interpolated intensity', () => {
    const nightCity = BUILT_IN_SCENARIOS[0];
    const start = evaluateScenarioAtTime(nightCity, 0);
    expect(start.stateName).toBe('Exploration');
    expect(start.intensity).toBeCloseTo(0.2, 2);

    const midRamp = evaluateScenarioAtTime(nightCity, 2.5);
    expect(midRamp.intensity).toBeGreaterThan(0.2);
    expect(midRamp.intensity).toBeLessThan(0.45);

    const combat = evaluateScenarioAtTime(nightCity, 16);
    expect(combat.stateName).toBe('Combat');
    expect(combat.intensity).toBeGreaterThanOrEqual(0.85);
  });
});
