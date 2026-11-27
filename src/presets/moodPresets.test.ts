import { describe, expect, it } from 'vitest';
import { MOOD_PRESETS } from './moodPresets';
import { INSTRUMENT_PRESETS } from '../audio/synthBank';
import { STEM_ORDER } from '../types/daw';
import { getBeatsPerBar } from '../theory/musicTheory';

describe('MOOD_PRESETS pack', () => {
  const validInstrumentIds = new Set(INSTRUMENT_PRESETS.map((i) => i.id));

  it('includes all 6 starter mood presets', () => {
    expect(MOOD_PRESETS.length).toBe(6);
  });

  for (const preset of MOOD_PRESETS) {
    it(`builds a valid project for "${preset.name}"`, () => {
      const project = preset.buildProject();
      expect(project.bpm).toBe(preset.bpm);
      expect(project.sections.length).toBeGreaterThanOrEqual(1);

      const section = project.sections[0];
      expect(section.chords.length).toBe(section.bars);

      const maxBeats = section.bars * getBeatsPerBar(project.timeSignature);
      for (const stemId of STEM_ORDER) {
        const stem = section.stems[stemId];
        expect(stem).toBeDefined();
        expect(validInstrumentIds.has(stem.instrumentId)).toBe(true);
        for (const note of stem.notes) {
          expect(note.startBeat).toBeGreaterThanOrEqual(0);
          expect(note.startBeat).toBeLessThan(maxBeats);
          expect(note.durationBeats).toBeGreaterThan(0);
        }
      }
    });
  }
});
