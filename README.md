# TheoryDAW — Theory-First Adaptive Game Music Web DAW

A browser-based React + TypeScript DAW built for game developers with limited musical background to compose cohesive, adaptive game music using **Mouse + QWERTY Computer Keyboard** or a **Mini USB MIDI Keyboard**.

## Phase 1 Highlights
- **Beginner-First Music Theory Guardrails:**
  - Plain-English scale vibes (`Phrygian — Dark & Menacing`, `Dorian — Moody & Cool`, etc.) and chord tension/mood labels (`Home / Grounded`, `Dark Tension`, `Pulls Back Home`).
  - Dynamic per-bar Canvas piano roll highlighting (**Gold `R/3/5`** chord anchors, **Teal** in-scale safe tones, **Dim** out-of-scale rows) plus **Fold to Scale** mode.
  - Contextual **Theory Coach** tip bar & **1-Click Auto-Follow Chords** pattern generators per stem.
  - **Scale-Snap Pen**, **Chord/Arp Brush**, **Final-Bar Turnaround Helper**, and **Auto-Remap** when switching key/scale.
- **Quick-Start Mood & Progression Pack (6 Presets):**
  - *Carpenter 5/4 Dystopian Pulse* (`110 BPM`, `5/4`, `A Phrygian`)
  - *Cyberpunk Street Combat* (`128 BPM`, `4/4`, `F Phrygian Dominant`)
  - *Neon Rain / Synthwave Exploration* (`96 BPM`, `4/4`, `D Dorian`)
  - *Retro 16-Bit RPG Overworld* (`105 BPM`, `4/4`, `C Major`)
  - *Tense Stealth Infiltration* (`85 BPM`, `4/4`, `E Locrian`)
  - *Heroic Boss Showdown* (`145 BPM`, `4/4`, `C Harmonic Minor`)
- **Hardware-Free + Mini USB MIDI Input:**
  - QWERTY keyboard (`A–;` Scale-Lock, `Z–M` / `Q–I` octaves, `1–8` one-finger chords, `Space` Play/Pause).
  - Auto-detected **Mini USB MIDI Keyboard** (`WebMidi.js`) with white-key Scale-Lock mapping and live quantized recording.
- **Starter Soundbanks (`Tone.js`):** Dark Analog & Cyberpunk Synth Bank + Retro 16-Bit Chiptune/FM Bank + Dedicated Drum Grid lane.

## Development

```bash
npm install
npm run dev
npm test
npm run build
```
