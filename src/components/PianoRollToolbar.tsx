import React from 'react';
import {
  Eraser,
  FoldVertical,
  Lock,
  MousePointer2,
  Pencil,
  Sparkles,
  Unlock,
} from 'lucide-react';
import { useDawStore } from '../store/useDawStore';
import { DrawingTool, QuantizeGrid } from '../types/daw';

export const PianoRollToolbar: React.FC = () => {
  const tool = useDawStore((s) => s.tool);
  const quantizeGrid = useDawStore((s) => s.quantizeGrid);
  const scaleLock = useDawStore((s) => s.scaleLock);
  const foldToScale = useDawStore((s) => s.foldToScale);
  const activeStem = useDawStore((s) => s.getActiveSection().stems[s.activeStemId]);

  const setTool = useDawStore((s) => s.setTool);
  const setQuantizeGrid = useDawStore((s) => s.setQuantizeGrid);
  const setScaleLock = useDawStore((s) => s.setScaleLock);
  const setFoldToScale = useDawStore((s) => s.setFoldToScale);

  const tools: { id: DrawingTool; label: string; icon: React.ReactNode; hint: string }[] = [
    {
      id: 'pen',
      label: 'Scale Pen',
      icon: <Pencil className="w-3.5 h-3.5" />,
      hint: 'Click/drag to draw notes (snaps to scale when Scale-Lock is ON; hold Alt to bypass)',
    },
    {
      id: 'arp',
      label: 'Chord / Arp Brush',
      icon: <Sparkles className="w-3.5 h-3.5" />,
      hint: 'Click/drag to paint chord-tone arpeggios automatically following each bar’s chord',
    },
    {
      id: 'select',
      label: 'Move / Resize',
      icon: <MousePointer2 className="w-3.5 h-3.5" />,
      hint: 'Drag notes to move, drag right edge to resize, right-click to delete',
    },
    {
      id: 'erase',
      label: 'Eraser',
      icon: <Eraser className="w-3.5 h-3.5" />,
      hint: 'Click or drag across notes to erase',
    },
  ];

  const grids: { value: QuantizeGrid; label: string }[] = [
    { value: 1, label: '1/4' },
    { value: 0.5, label: '1/8' },
    { value: 0.25, label: '1/16' },
  ];

  return (
    <div className="px-3 py-1.5 bg-zinc-900/90 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-2 select-none">
      {/* Drawing Tools */}
      <div className="flex items-center gap-1">
        {tools.map((t) => {
          const disabled = t.id === 'arp' && activeStem.isDrum;
          return (
            <button
              key={t.id}
              disabled={disabled}
              onClick={() => setTool(t.id)}
              title={t.hint}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                tool === t.id
                  ? 'bg-amber-500 text-zinc-950 font-semibold shadow-sm'
                  : 'bg-zinc-950 border border-zinc-800 text-zinc-300 hover:bg-zinc-800'
              }`}
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Right: Grid Snap + Beginner Guardrails */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 bg-zinc-950 border border-zinc-800 rounded px-1.5 py-0.5 text-xs">
          <span className="text-[10px] uppercase text-zinc-500 pr-1">Snap</span>
          {grids.map((g) => (
            <button
              key={g.value}
              onClick={() => setQuantizeGrid(g.value)}
              className={`px-1.5 py-0.5 rounded font-mono text-[11px] cursor-pointer transition ${
                quantizeGrid === g.value
                  ? 'bg-zinc-700 text-zinc-100 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>

        {!activeStem.isDrum && (
          <>
            <button
              onClick={() => setScaleLock(!scaleLock)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs font-medium transition cursor-pointer ${
                scaleLock
                  ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-300'
                  : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200'
              }`}
              title="Locks Pen drawing, QWERTY keys (A-K), and Mini USB MIDI white keys to the active scale so every note sounds in-key"
            >
              {scaleLock ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
              Scale-Lock {scaleLock ? 'ON' : 'OFF'}
            </button>

            <button
              onClick={() => setFoldToScale(!foldToScale)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs font-medium transition cursor-pointer ${
                foldToScale
                  ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
                  : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200'
              }`}
              title="Hide all out-of-scale piano rows so you only see valid notes in your key"
            >
              <FoldVertical className="w-3.5 h-3.5" />
              Fold to Scale
            </button>
          </>
        )}
      </div>
    </div>
  );
};
