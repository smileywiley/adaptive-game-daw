import { useEffect, useRef } from 'react';
import { WebMidi, Input, NoteMessageEvent } from 'webmidi';
import { useDawStore } from '../store/useDawStore';
import { audioEngine } from '../audio/audioEngine';
import { getBeatsPerBar, mapMidiKeyWithScaleLock } from '../theory/musicTheory';
import { StemId } from '../types/daw';

/**
 * Mini USB MIDI Keyboard integration via WebMidi.js.
 * - Auto-detects plugged-in 25/32/49-key USB MIDI keyboards (hot-plug aware).
 * - When Scale-Lock is ON, maps white keys directly to active scale degrees so every key sounds in-key.
 * - Supports velocity-sensitive live audition and real-time quantized recording when armed.
 */
export function useMidiInput(): void {
  const activeHardwareNotes = useRef<Map<number, { stemId: StemId; midi: number }>>(new Map());

  useEffect(() => {
    let mounted = true;

    const refreshDevices = () => {
      if (!mounted) return;
      const devices = WebMidi.inputs.map((inp) => ({
        id: inp.id,
        name: inp.name,
        manufacturer: inp.manufacturer || 'USB MIDI',
      }));
      useDawStore.getState().setMidiStatus(true, devices);
    };

    const attachInputListeners = (input: Input) => {
      input.removeListener('noteon');
      input.removeListener('noteoff');

      input.addListener('noteon', (e: NoteMessageEvent) => {
        const state = useDawStore.getState();
        if (state.selectedMidiDeviceId !== 'all' && state.selectedMidiDeviceId !== input.id) {
          return;
        }
        const section = state.getActiveSection();
        const stem = section.stems[state.activeStemId];
        const rawMidi = e.note.number;
        const velocity = Math.max(0.15, Math.min(1, e.note.attack || 0.8));

        const resolvedMidi =
          !stem.isDrum && state.scaleLock
            ? mapMidiKeyWithScaleLock(rawMidi, section.root, section.scaleId, 3)
            : rawMidi;

        activeHardwareNotes.current.set(rawMidi, { stemId: stem.id, midi: resolvedMidi });
        void audioEngine.noteOn(stem.id, stem.instrumentId, resolvedMidi, velocity);
        state.addLiveMidi(resolvedMidi);
        state.markAudioUnlocked();

        if (state.isPlaying && state.isRecording) {
          const totalBeats = section.bars * getBeatsPerBar(state.project.timeSignature);
          const rawBeat = audioEngine.getCurrentBeat();
          const grid = state.quantizeGrid;
          const quantized = Math.round(rawBeat / grid) * grid;
          const startBeat = quantized >= totalBeats ? 0 : quantized;
          state.addNotes(stem.id, [
            {
              midi: resolvedMidi,
              startBeat,
              durationBeats: Math.max(grid, 0.5),
              velocity,
            },
          ]);
        }
      });

      input.addListener('noteoff', (e: NoteMessageEvent) => {
        const rawMidi = e.note.number;
        const entry = activeHardwareNotes.current.get(rawMidi);
        if (!entry) return;
        activeHardwareNotes.current.delete(rawMidi);
        const state = useDawStore.getState();
        audioEngine.noteOff(entry.stemId, entry.midi);
        state.removeLiveMidi(entry.midi);
      });
    };

    const initWebMidi = async () => {
      if (typeof navigator === 'undefined' || !('requestMIDIAccess' in navigator)) {
        useDawStore.getState().setMidiStatus(false, []);
        return;
      }
      try {
        await WebMidi.enable();
        if (!mounted) return;
        refreshDevices();
        for (const input of WebMidi.inputs) {
          attachInputListeners(input);
        }

        WebMidi.addListener('connected', (ev) => {
          if (ev.port.type === 'input') {
            attachInputListeners(ev.port as Input);
          }
          refreshDevices();
        });
        WebMidi.addListener('disconnected', () => {
          refreshDevices();
        });
      } catch {
        if (mounted) {
          useDawStore.getState().setMidiStatus(false, []);
        }
      }
    };

    void initWebMidi();

    return () => {
      mounted = false;
      if (WebMidi.enabled) {
        for (const input of WebMidi.inputs) {
          input.removeListener('noteon');
          input.removeListener('noteoff');
        }
        WebMidi.removeListener('connected');
        WebMidi.removeListener('disconnected');
      }
    };
  }, []);
}
