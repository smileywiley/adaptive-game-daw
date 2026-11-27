import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDawStore } from '../store/useDawStore';
import { audioEngine } from '../audio/audioEngine';
import {
  getBeatsPerBar,
  getChordMidiVoicing,
  getNoteRole,
  getScaleMidiNotes,
  midiToNoteName,
  snapMidiToScale,
} from '../theory/musicTheory';
import { DRUM_LANES, MidiNote, STEM_ORDER } from '../types/daw';
import { ChordTrack } from './ChordTrack';

const KEY_GUTTER_WIDTH = 92;
const BEAT_WIDTH_PX = 64;
const MELODIC_ROW_HEIGHT = 20;
const DRUM_ROW_HEIGHT = 46;
const MIN_MIDI = 36; // C2
const MAX_MIDI = 84; // C6

type DragMode =
  | null
  | { type: 'draw'; midi: number; startBeat: number; endBeat: number }
  | { type: 'arp'; lastStepBeat: number; arpIndex: number }
  | { type: 'move'; noteId: string; offsetBeat: number; origDuration: number; origVelocity: number }
  | { type: 'resize'; noteId: string; startBeat: number }
  | { type: 'erase' };

export const PianoRollCanvas: React.FC = () => {
  const project = useDawStore((s) => s.project);
  const section = useDawStore((s) => s.getActiveSection());
  const activeStemId = useDawStore((s) => s.activeStemId);
  const tool = useDawStore((s) => s.tool);
  const quantizeGrid = useDawStore((s) => s.quantizeGrid);
  const scaleLock = useDawStore((s) => s.scaleLock);
  const foldToScale = useDawStore((s) => s.foldToScale);
  const activeLiveMidis = useDawStore((s) => s.activeLiveMidis);

  const addNotes = useDawStore((s) => s.addNotes);
  const updateNote = useDawStore((s) => s.updateNote);
  const removeNote = useDawStore((s) => s.removeNote);
  const markAudioUnlocked = useDawStore((s) => s.markAudioUnlocked);

  const activeStem = section.stems[activeStemId];
  const beatsPerBar = getBeatsPerBar(project.timeSignature);
  const totalBeats = section.bars * beatsPerBar;
  const barWidthPx = beatsPerBar * BEAT_WIDTH_PX;
  const gridWidthPx = totalBeats * BEAT_WIDTH_PX;

  // Displayed MIDI rows from top (high) to bottom (low)
  const displayedMidis = useMemo(() => {
    if (activeStem.isDrum) {
      return DRUM_LANES.map((l) => l.midi);
    }
    if (foldToScale) {
      return getScaleMidiNotes(section.root, section.scaleId, MIN_MIDI, MAX_MIDI).reverse();
    }
    const all: number[] = [];
    for (let m = MAX_MIDI; m >= MIN_MIDI; m--) all.push(m);
    return all;
  }, [activeStem.isDrum, foldToScale, section.root, section.scaleId]);

  const rowHeight = activeStem.isDrum ? DRUM_ROW_HEIGHT : MELODIC_ROW_HEIGHT;
  const contentHeight = displayedMidis.length * rowHeight;

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState({ width: 900, height: 420 });
  const dragRef = useRef<DragMode>(null);
  const hoverBarRef = useRef<number>(0);

  // Center vertically around C4 on initial mount or stem switch
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (activeStem.isDrum) {
      el.scrollTop = 0;
      setScrollTop(0);
    } else {
      const targetMidi = activeStemId === '03_Bass' ? 45 : 64;
      const idx = displayedMidis.findIndex((m) => m <= targetMidi);
      const y = Math.max(0, (idx >= 0 ? idx : 16) * rowHeight - el.clientHeight / 2);
      el.scrollTop = y;
      setScrollTop(y);
    }
  }, [activeStemId, activeStem.isDrum, foldToScale]);

  // Track container resize
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() => {
      setViewport({ width: el.clientWidth, height: el.clientHeight });
    });
    obs.observe(el);
    setViewport({ width: el.clientWidth, height: el.clientHeight });
    return () => obs.disconnect();
  }, []);

  const hitTestNote = useCallback(
    (beat: number, midi: number): { note: MidiNote; isRightEdge: boolean } | null => {
      for (let i = activeStem.notes.length - 1; i >= 0; i--) {
        const n = activeStem.notes[i];
        if (n.midi === midi && beat >= n.startBeat && beat <= n.startBeat + n.durationBeats) {
          const pxFromEnd = (n.startBeat + n.durationBeats - beat) * BEAT_WIDTH_PX;
          return { note: n, isRightEdge: pxFromEnd <= 9 };
        }
      }
      return null;
    },
    [activeStem.notes],
  );

  const clientToGrid = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const worldX = x - KEY_GUTTER_WIDTH + scrollLeft;
      const worldY = y + scrollTop;
      const rowIdx = Math.floor(worldY / rowHeight);
      const clampedIdx = Math.max(0, Math.min(displayedMidis.length - 1, rowIdx));
      const rawMidi = displayedMidis[clampedIdx];
      const beat = worldX / BEAT_WIDTH_PX;
      return { x, y, worldX, worldY, rawMidi, beat, inGutter: x < KEY_GUTTER_WIDTH };
    },
    [displayedMidis, rowHeight, scrollLeft, scrollTop],
  );

  // Main 60 FPS Canvas Render Loop
  useEffect(() => {
    let rafId = 0;

    const render = () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        rafId = requestAnimationFrame(render);
        return;
      }
      const dpr = window.devicePixelRatio || 1;
      const w = viewport.width;
      const h = viewport.height;
      if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.save();
      ctx.scale(dpr, dpr);

      // Background
      ctx.fillStyle = '#09090b';
      ctx.fillRect(0, 0, w, h);

      const playheadBeat = audioEngine.getCurrentBeat();
      const activeBarForBadges =
        playheadBeat > 0
          ? Math.min(section.bars - 1, Math.floor(playheadBeat / beatsPerBar))
          : hoverBarRef.current;

      // --- 1. GRID AREA (clipped to right of key gutter) ---
      ctx.save();
      ctx.beginPath();
      ctx.rect(KEY_GUTTER_WIDTH, 0, w - KEY_GUTTER_WIDTH, h);
      ctx.clip();

      const firstRow = Math.max(0, Math.floor(scrollTop / rowHeight));
      const lastRow = Math.min(displayedMidis.length - 1, Math.ceil((scrollTop + h) / rowHeight));

      // Draw per-bar theory-aware row backgrounds
      for (let r = firstRow; r <= lastRow; r++) {
        const midi = displayedMidis[r];
        const y = r * rowHeight - scrollTop;

        if (activeStem.isDrum) {
          ctx.fillStyle = r % 2 === 0 ? '#111114' : '#16161b';
          ctx.fillRect(KEY_GUTTER_WIDTH, y, w - KEY_GUTTER_WIDTH, rowHeight);
        } else {
          for (let bar = 0; bar < section.bars; bar++) {
            const barX = KEY_GUTTER_WIDTH + bar * barWidthPx - scrollLeft;
            if (barX + barWidthPx < KEY_GUTTER_WIDTH || barX > w) continue;

            const chord = section.chords[bar];
            const role = getNoteRole(midi, section.root, section.scaleId, chord);

            if (role === 'root') {
              ctx.fillStyle = 'rgba(245, 158, 11, 0.22)';
            } else if (role === 'third' || role === 'fifth' || role === 'seventh') {
              ctx.fillStyle = 'rgba(245, 158, 11, 0.11)';
            } else if (role === 'scale') {
              ctx.fillStyle = 'rgba(34, 211, 238, 0.06)';
            } else {
              ctx.fillStyle = 'rgba(9, 9, 11, 0.82)';
            }
            ctx.fillRect(barX, y, barWidthPx, rowHeight);
          }
        }

        // Row horizontal divider
        ctx.strokeStyle = 'rgba(63, 63, 70, 0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(KEY_GUTTER_WIDTH, y + rowHeight);
        ctx.lineTo(w, y + rowHeight);
        ctx.stroke();
      }

      // Vertical beat / subdivision / bar lines
      const stepsPerBeat = Math.round(1 / quantizeGrid);
      for (let step = 0; step <= totalBeats * stepsPerBeat; step++) {
        const beat = step / stepsPerBeat;
        const x = KEY_GUTTER_WIDTH + beat * BEAT_WIDTH_PX - scrollLeft;
        if (x < KEY_GUTTER_WIDTH || x > w) continue;

        const isBarLine = Math.abs(beat % beatsPerBar) < 0.001;
        const isBeatLine = Math.abs(beat % 1) < 0.001;

        ctx.strokeStyle = isBarLine
          ? 'rgba(161, 161, 170, 0.45)'
          : isBeatLine
            ? 'rgba(82, 82, 91, 0.42)'
            : 'rgba(63, 63, 70, 0.22)';
        ctx.lineWidth = isBarLine ? 1.5 : 1;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }

      // Ghost notes from other unmuted melodic stems (when editing a melodic stem)
      if (!activeStem.isDrum) {
        for (const sid of STEM_ORDER) {
          if (sid === activeStemId) continue;
          const other = section.stems[sid];
          if (other.isDrum || other.muted) continue;
          ctx.fillStyle = `${other.color}26`;
          for (const n of other.notes) {
            const rowIdx = displayedMidis.indexOf(n.midi);
            if (rowIdx === -1) continue;
            const nx = KEY_GUTTER_WIDTH + n.startBeat * BEAT_WIDTH_PX - scrollLeft;
            const ny = rowIdx * rowHeight - scrollTop + 2;
            const nw = Math.max(6, n.durationBeats * BEAT_WIDTH_PX - 2);
            ctx.fillRect(nx, ny, nw, rowHeight - 4);
          }
        }
      }

      // Active stem notes
      for (const n of activeStem.notes) {
        const rowIdx = displayedMidis.indexOf(n.midi);
        if (rowIdx === -1) continue;
        const nx = KEY_GUTTER_WIDTH + n.startBeat * BEAT_WIDTH_PX - scrollLeft;
        const ny = rowIdx * rowHeight - scrollTop + 2;
        const nw = Math.max(8, n.durationBeats * BEAT_WIDTH_PX - 2);
        const nh = rowHeight - 4;
        if (nx + nw < KEY_GUTTER_WIDTH || nx > w || ny + nh < 0 || ny > h) continue;

        const bar = Math.min(section.bars - 1, Math.floor(n.startBeat / beatsPerBar));
        const role = activeStem.isDrum
          ? 'root'
          : getNoteRole(n.midi, section.root, section.scaleId, section.chords[bar]);

        let fill = activeStem.color;
        if (activeStem.isDrum) {
          fill = DRUM_LANES[rowIdx]?.color ?? activeStem.color;
        } else if (role === 'outside') {
          fill = '#71717a';
        }

        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.roundRect(nx, ny, nw, nh, 4);
        ctx.fill();

        // Top highlight bevel
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        ctx.fillRect(nx + 2, ny + 1, Math.max(2, nw - 4), 2);

        // Note label inside wider notes
        if (nw >= 26 && !activeStem.isDrum) {
          ctx.fillStyle = '#09090b';
          ctx.font = 'bold 10px ui-monospace, SFMono-Regular, monospace';
          ctx.fillText(midiToNoteName(n.midi), nx + 4, ny + nh - 4);
        }
      }

      // Drag preview for Pen tool
      if (dragRef.current?.type === 'draw') {
        const d = dragRef.current;
        const rowIdx = displayedMidis.indexOf(d.midi);
        if (rowIdx !== -1) {
          const start = Math.min(d.startBeat, d.endBeat);
          const dur = Math.max(quantizeGrid, Math.abs(d.endBeat - d.startBeat) + quantizeGrid);
          const nx = KEY_GUTTER_WIDTH + start * BEAT_WIDTH_PX - scrollLeft;
          const ny = rowIdx * rowHeight - scrollTop + 2;
          ctx.fillStyle = 'rgba(245, 158, 11, 0.55)';
          ctx.strokeStyle = '#fbbf24';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.roundRect(nx, ny, dur * BEAT_WIDTH_PX - 2, rowHeight - 4, 4);
          ctx.fill();
          ctx.stroke();
        }
      }

      // 60 FPS Playhead line
      const playX = KEY_GUTTER_WIDTH + playheadBeat * BEAT_WIDTH_PX - scrollLeft;
      if (playX >= KEY_GUTTER_WIDTH && playX <= w) {
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(playX, 0);
        ctx.lineTo(playX, h);
        ctx.stroke();
      }

      ctx.restore();

      // --- 2. LEFT PIANO KEYS / DRUM LANE GUTTER ---
      ctx.fillStyle = '#121216';
      ctx.fillRect(0, 0, KEY_GUTTER_WIDTH, h);

      for (let r = firstRow; r <= lastRow; r++) {
        const midi = displayedMidis[r];
        const y = r * rowHeight - scrollTop;
        const isLive = activeLiveMidis.includes(midi);

        if (activeStem.isDrum) {
          const lane = DRUM_LANES[r];
          ctx.fillStyle = isLive ? `${lane.color}44` : '#18181b';
          ctx.fillRect(0, y, KEY_GUTTER_WIDTH - 1, rowHeight - 1);
          ctx.fillStyle = lane.color;
          ctx.fillRect(0, y, 4, rowHeight - 1);

          ctx.fillStyle = '#f4f4f5';
          ctx.font = 'bold 11px system-ui, sans-serif';
          ctx.fillText(lane.name, 10, y + 19);

          ctx.fillStyle = '#71717a';
          ctx.font = '9px system-ui, sans-serif';
          ctx.fillText(lane.shortName, 10, y + 34);
        } else {
          const pc = midi % 12;
          const isBlackKey = [1, 3, 6, 8, 10].includes(pc);
          const chord = section.chords[activeBarForBadges];
          const role = getNoteRole(midi, section.root, section.scaleId, chord);

          if (isLive) {
            ctx.fillStyle = '#f59e0b';
          } else if (role === 'outside') {
            ctx.fillStyle = isBlackKey ? '#0d0d10' : '#17171b';
          } else {
            ctx.fillStyle = isBlackKey ? '#1f1f26' : '#27272f';
          }
          ctx.fillRect(0, y, KEY_GUTTER_WIDTH - 1, rowHeight - 1);

          // Note name
          ctx.fillStyle = isLive
            ? '#09090b'
            : role === 'outside'
              ? '#52525b'
              : '#e4e4e7';
          ctx.font = '10px ui-monospace, SFMono-Regular, monospace';
          ctx.fillText(midiToNoteName(midi), 6, y + rowHeight - 6);

          // Chord-tone role badge (R, 3, 5, 7)
          const badge =
            role === 'root'
              ? 'R'
              : role === 'third'
                ? '3'
                : role === 'fifth'
                  ? '5'
                  : role === 'seventh'
                    ? '7'
                    : null;

          if (badge) {
            ctx.fillStyle = role === 'root' ? '#f59e0b' : 'rgba(245, 158, 11, 0.35)';
            ctx.beginPath();
            ctx.roundRect(KEY_GUTTER_WIDTH - 24, y + 3, 18, rowHeight - 6, 3);
            ctx.fill();
            ctx.fillStyle = role === 'root' ? '#09090b' : '#fde68a';
            ctx.font = 'bold 9px ui-monospace, SFMono-Regular, monospace';
            ctx.fillText(badge, KEY_GUTTER_WIDTH - 18, y + rowHeight - 6);
          }
        }
      }

      // Gutter right divider
      ctx.strokeStyle = '#3f3f46';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(KEY_GUTTER_WIDTH, 0);
      ctx.lineTo(KEY_GUTTER_WIDTH, h);
      ctx.stroke();

      ctx.restore();
      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, [
    viewport,
    scrollLeft,
    scrollTop,
    displayedMidis,
    rowHeight,
    section,
    activeStem,
    activeStemId,
    beatsPerBar,
    barWidthPx,
    totalBeats,
    quantizeGrid,
    activeLiveMidis,
  ]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pos = clientToGrid(e.clientX, e.clientY);
    if (!pos) return;
    markAudioUnlocked();

    // Left gutter click: audition pitch / drum hit
    if (pos.inGutter) {
      void audioEngine.auditionNote(activeStem.id, activeStem.instrumentId, pos.rawMidi, 0.3, 0.85);
      return;
    }

    if (pos.beat < 0 || pos.beat >= totalBeats) return;
    const bar = Math.min(section.bars - 1, Math.floor(pos.beat / beatsPerBar));
    hoverBarRef.current = bar;

    // Right-click always erases note under cursor
    if (e.button === 2) {
      const hit = hitTestNote(pos.beat, pos.rawMidi);
      if (hit) removeNote(activeStemId, hit.note.id);
      return;
    }

    const snappedBeat = Math.floor(pos.beat / quantizeGrid) * quantizeGrid;
    const hit = hitTestNote(pos.beat, pos.rawMidi);

    if (tool === 'erase') {
      if (hit) removeNote(activeStemId, hit.note.id);
      dragRef.current = { type: 'erase' };
      return;
    }

    if (tool === 'select') {
      if (hit) {
        if (hit.isRightEdge) {
          dragRef.current = { type: 'resize', noteId: hit.note.id, startBeat: hit.note.startBeat };
        } else {
          dragRef.current = {
            type: 'move',
            noteId: hit.note.id,
            offsetBeat: pos.beat - hit.note.startBeat,
            origDuration: hit.note.durationBeats,
            origVelocity: hit.note.velocity,
          };
        }
      }
      return;
    }

    if (tool === 'arp' && !activeStem.isDrum) {
      const chord = section.chords[bar];
      const baseOctave = Math.max(2, Math.min(5, Math.floor(pos.rawMidi / 12) - 1));
      const voicing = chord ? getChordMidiVoicing(chord, baseOctave) : [pos.rawMidi];
      const noteMidi = voicing[0];
      addNotes(activeStemId, [
        { midi: noteMidi, startBeat: snappedBeat, durationBeats: quantizeGrid, velocity: 0.8 },
      ]);
      void audioEngine.auditionNote(activeStem.id, activeStem.instrumentId, noteMidi, 0.18, 0.8);
      dragRef.current = { type: 'arp', lastStepBeat: snappedBeat, arpIndex: 1 };
      return;
    }

    // Pen tool: if clicking existing note right edge, resize; if clicking existing note body, delete on Alt or move; else draw
    if (hit) {
      if (hit.isRightEdge) {
        dragRef.current = { type: 'resize', noteId: hit.note.id, startBeat: hit.note.startBeat };
      } else {
        removeNote(activeStemId, hit.note.id);
      }
      return;
    }

    const finalMidi =
      !activeStem.isDrum && scaleLock && !e.altKey
        ? snapMidiToScale(pos.rawMidi, section.root, section.scaleId)
        : pos.rawMidi;

    void audioEngine.auditionNote(activeStem.id, activeStem.instrumentId, finalMidi, 0.22, 0.82);
    dragRef.current = {
      type: 'draw',
      midi: finalMidi,
      startBeat: snappedBeat,
      endBeat: snappedBeat,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pos = clientToGrid(e.clientX, e.clientY);
    if (!pos) return;
    if (!pos.inGutter && pos.beat >= 0 && pos.beat < totalBeats) {
      hoverBarRef.current = Math.min(section.bars - 1, Math.floor(pos.beat / beatsPerBar));
    }

    const drag = dragRef.current;
    if (!drag) return;

    const snappedBeat = Math.max(
      0,
      Math.min(totalBeats - quantizeGrid, Math.floor(pos.beat / quantizeGrid) * quantizeGrid),
    );

    if (drag.type === 'draw') {
      drag.endBeat = snappedBeat;
    } else if (drag.type === 'erase') {
      const hit = hitTestNote(pos.beat, pos.rawMidi);
      if (hit) removeNote(activeStemId, hit.note.id);
    } else if (drag.type === 'resize') {
      const nextDur = Math.max(
        quantizeGrid,
        Math.round((pos.beat - drag.startBeat) / quantizeGrid) * quantizeGrid,
      );
      updateNote(activeStemId, drag.noteId, { durationBeats: nextDur });
    } else if (drag.type === 'move') {
      const nextBeat = Math.max(
        0,
        Math.min(
          totalBeats - quantizeGrid,
          Math.round((pos.beat - drag.offsetBeat) / quantizeGrid) * quantizeGrid,
        ),
      );
      const nextMidi =
        !activeStem.isDrum && scaleLock && !e.altKey
          ? snapMidiToScale(pos.rawMidi, section.root, section.scaleId)
          : pos.rawMidi;
      updateNote(activeStemId, drag.noteId, { startBeat: nextBeat, midi: nextMidi });
    } else if (drag.type === 'arp' && !activeStem.isDrum) {
      if (snappedBeat !== drag.lastStepBeat) {
        const bar = Math.min(section.bars - 1, Math.floor(snappedBeat / beatsPerBar));
        const chord = section.chords[bar];
        const baseOctave = Math.max(2, Math.min(5, Math.floor(pos.rawMidi / 12) - 1));
        const voicing = chord ? getChordMidiVoicing(chord, baseOctave) : [pos.rawMidi];
        const arpPool = [...voicing, voicing[0] + 12];
        const noteMidi = arpPool[drag.arpIndex % arpPool.length];
        addNotes(activeStemId, [
          { midi: noteMidi, startBeat: snappedBeat, durationBeats: quantizeGrid, velocity: 0.78 },
        ]);
        void audioEngine.auditionNote(activeStem.id, activeStem.instrumentId, noteMidi, 0.14, 0.75);
        drag.lastStepBeat = snappedBeat;
        drag.arpIndex += 1;
      }
    }
  };

  const handlePointerUp = () => {
    const drag = dragRef.current;
    if (drag?.type === 'draw') {
      const startBeat = Math.min(drag.startBeat, drag.endBeat);
      const durationBeats = Math.max(
        quantizeGrid,
        Math.abs(drag.endBeat - drag.startBeat) + quantizeGrid,
      );
      addNotes(activeStemId, [
        {
          midi: drag.midi,
          startBeat,
          durationBeats,
          velocity: 0.85,
        },
      ]);
    }
    dragRef.current = null;
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 bg-zinc-950">
      <ChordTrack
        keyGutterWidth={KEY_GUTTER_WIDTH}
        barWidthPx={barWidthPx}
        scrollLeft={scrollLeft}
      />

      <div
        ref={containerRef}
        onScroll={(e) => {
          setScrollLeft(e.currentTarget.scrollLeft);
          setScrollTop(e.currentTarget.scrollTop);
        }}
        className="flex-1 relative overflow-auto min-h-0"
      >
        {/* Scrollable virtual spacer */}
        <div
          style={{
            width: KEY_GUTTER_WIDTH + gridWidthPx + 40,
            height: Math.max(contentHeight, viewport.height),
          }}
          className="relative"
        >
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            onContextMenu={(e) => e.preventDefault()}
            style={{
              width: viewport.width,
              height: viewport.height,
            }}
            className="sticky top-0 left-0 block cursor-crosshair touch-none"
          />
        </div>
      </div>
    </div>
  );
};
