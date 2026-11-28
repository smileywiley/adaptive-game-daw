import React from 'react';
import { Copy, Layers, Plus, Trash2, Zap } from 'lucide-react';
import { useDawStore } from '../store/useDawStore';
import { TRANSITION_RULE_LABELS } from '../adaptive/adaptiveLogic';
import { TransitionQuantization } from '../types/daw';

export const SectionTabsBar: React.FC = () => {
  const project = useDawStore((s) => s.project);
  const activeSection = useDawStore((s) => s.getActiveSection());
  const setActiveSection = useDawStore((s) => s.setActiveSection);
  const addSection = useDawStore((s) => s.addSection);
  const duplicateActiveSection = useDawStore((s) => s.duplicateActiveSection);
  const renameSection = useDawStore((s) => s.renameSection);
  const deleteSection = useDawStore((s) => s.deleteSection);
  const setSectionTransitionRule = useDawStore((s) => s.setSectionTransitionRule);

  const quant: TransitionQuantization = activeSection.transitionQuantization ?? 'next_bar';
  const useFill = Boolean(activeSection.useTransitionFill);
  const keepBeat = Boolean(activeSection.keepBeatPosition);

  const handleAddLoop = () => {
    const name = window.prompt('New Game State / Section name (e.g. Boss_Phase2, Stealth):', 'Chase');
    if (name && name.trim()) {
      addSection(name.trim(), 'loop');
    }
  };

  const handleAddStinger = () => {
    const name = window.prompt('New One-Shot Stinger name (e.g. Spotted_Stinger, Defeat):', 'Spotted_Stinger');
    if (name && name.trim()) {
      addSection(name.trim(), 'stinger');
    }
  };

  const handleRenameSection = (id: string, currentName: string) => {
    const next = window.prompt('Rename section:', currentName);
    if (next && next.trim()) {
      renameSection(id, next.trim());
    }
  };

  return (
    <div className="px-3 py-1.5 bg-zinc-950 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-2 select-none">
      {/* Left: Horizontal Section Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto">
        <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500 mr-1 shrink-0">
          <Layers className="w-3 h-3" />
          States
        </span>

        {project.sections.map((sec) => {
          const isActive = sec.id === activeSection.id;
          const isStinger = sec.role === 'stinger';
          return (
            <button
              key={sec.id}
              onClick={() => setActiveSection(sec.id)}
              onDoubleClick={() => handleRenameSection(sec.id, sec.name)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition cursor-pointer shrink-0 ${
                isActive
                  ? isStinger
                    ? 'bg-purple-500/20 border-purple-400/70 text-purple-200'
                    : 'bg-cyan-500/20 border-cyan-400/70 text-cyan-200'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
              }`}
              title={`${sec.name} (${sec.bars} bars · ${isStinger ? 'One-Shot Stinger' : 'Loopable State'}) — Double-click to rename`}
            >
              {isStinger && <Zap className="w-3 h-3 text-purple-400" />}
              <span>{sec.name}</span>
              <span className="text-[10px] font-mono opacity-60">{sec.bars}b</span>
            </button>
          );
        })}

        <button
          onClick={handleAddLoop}
          className="flex items-center gap-0.5 px-2 py-1 rounded-md bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[11px] text-zinc-400 hover:text-zinc-100 cursor-pointer shrink-0"
          title="Add a new loopable Game State section"
        >
          <Plus className="w-3 h-3" />
          State
        </button>

        <button
          onClick={handleAddStinger}
          className="flex items-center gap-0.5 px-2 py-1 rounded-md bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[11px] text-purple-300 hover:text-purple-200 cursor-pointer shrink-0"
          title="Add a one-shot Stinger cue (e.g. Victory, Spotted, Boss Intro)"
        >
          <Zap className="w-3 h-3" />
          Stinger
        </button>

        <button
          onClick={duplicateActiveSection}
          className="p-1 rounded-md bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-100 cursor-pointer shrink-0"
          title="Duplicate current section"
        >
          <Copy className="w-3 h-3" />
        </button>

        {project.sections.length > 1 && (
          <button
            onClick={() => deleteSection(activeSection.id)}
            className="p-1 rounded-md bg-zinc-900 hover:bg-rose-950/60 border border-zinc-800 text-zinc-500 hover:text-rose-300 cursor-pointer shrink-0"
            title="Delete current section"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Right: Transition Rule, Fill Bridge & Seamless Keep Beat */}
      <div className="flex items-center gap-2.5 text-[11px] shrink-0">
        <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded px-2 py-0.5">
          <span className="text-[10px] text-zinc-500 uppercase">Enter On</span>
          <select
            value={quant}
            onChange={(e) =>
              setSectionTransitionRule(
                activeSection.id,
                e.target.value as TransitionQuantization,
                useFill,
                keepBeat,
              )
            }
            className="bg-transparent text-zinc-200 text-[11px] focus:outline-none cursor-pointer"
            title={TRANSITION_RULE_LABELS[quant].hint}
          >
            {(Object.keys(TRANSITION_RULE_LABELS) as TransitionQuantization[]).map((key) => (
              <option key={key} value={key} className="bg-zinc-900">
                {TRANSITION_RULE_LABELS[key].label}
              </option>
            ))}
          </select>
        </div>

        {activeSection.role !== 'stinger' && (
          <>
            <label
              className="flex items-center gap-1 text-[10px] text-zinc-400 cursor-pointer"
              title="Play a punchy 1-bar drum fill bridge right before switching into this state"
            >
              <input
                type="checkbox"
                checked={useFill}
                onChange={(e) =>
                  setSectionTransitionRule(activeSection.id, quant, e.target.checked, keepBeat)
                }
                className="accent-amber-500"
              />
              Fill Bridge
            </label>

            <label
              className="flex items-center gap-1 text-[10px] text-cyan-300 cursor-pointer"
              title="Banjo-Kazooie style seamless location swap: keeps the exact current bar & beat instead of restarting at Bar 1"
            >
              <input
                type="checkbox"
                checked={keepBeat}
                onChange={(e) =>
                  setSectionTransitionRule(activeSection.id, quant, useFill, e.target.checked)
                }
                className="accent-cyan-400"
              />
              Keep Beat
            </label>
          </>
        )}
      </div>
    </div>
  );
};
