import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  FolderUp,
  Loader2,
  Music2,
  Play,
  Search,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { useDawStore } from '../store/useDawStore';
import { audioEngine } from '../audio/audioEngine';
import {
  CustomInstrumentEntry,
  getCustomInstruments,
  getLoadedSf2Banks,
  getStemCompatibility,
  importOneShotSampleFile,
  importSf2File,
  importSfzZipFile,
  isDrumPresetMeta,
  LoadedSf2Bank,
  StemCompatibility,
  subscribeCustomInstruments,
} from '../audio/customInstruments';

const COMPAT_BADGE: Record<
  StemCompatibility,
  { label: string; className: string; icon: React.ReactNode; title: string }
> = {
  ideal: {
    label: 'Great Fit',
    className: 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300',
    icon: <Sparkles className="w-3 h-3" />,
    title: 'Matches this stem’s type and musical role',
  },
  compatible: {
    label: 'Compatible',
    className: 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300',
    icon: <CheckCircle2 className="w-3 h-3" />,
    title: 'Compatible with the currently selected stem',
  },
  incompatible: {
    label: 'Mismatch',
    className: 'bg-amber-500/15 border-amber-500/40 text-amber-300',
    icon: <AlertTriangle className="w-3 h-3" />,
    title: 'Drum kits match Percussion; melodic instruments match melodic stems',
  },
};

export const InstrumentImportModal: React.FC = () => {
  const isOpen = useDawStore((s) => s.instrumentModalOpen);
  const project = useDawStore((s) => s.project);
  const section = useDawStore((s) => s.getActiveSection());
  const activeStemId = useDawStore((s) => s.activeStemId);
  const activeStem = section.stems[activeStemId];
  const setInstrumentModalOpen = useDawStore((s) => s.setInstrumentModalOpen);
  const setStemInstrument = useDawStore((s) => s.setStemInstrument);

  const [customList, setCustomList] = useState<CustomInstrumentEntry[]>(() => getCustomInstruments());
  const [sf2Banks, setSf2Banks] = useState<LoadedSf2Bank[]>(() => getLoadedSf2Banks());
  const [searchQuery, setSearchQuery] = useState('');
  const [onlyCompatible, setOnlyCompatible] = useState(false);
  const [applyToAllStates, setApplyToAllStates] = useState(true);
  const [previewingKey, setPreviewingKey] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    return subscribeCustomInstruments(() => {
      setCustomList(getCustomInstruments());
      setSf2Banks(getLoadedSf2Banks());
    });
  }, []);

  useEffect(() => {
    if (!isOpen) {
      audioEngine.stopInstrumentPreview();
      setPreviewingKey(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const query = searchQuery.trim().toLowerCase();
  const stateScopeLabel =
    applyToAllStates && project.sections.length > 1
      ? `all ${project.sections.length} states`
      : section.name;

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    setErrorMsg(null);
    setStatusMsg(null);

    try {
      for (const file of Array.from(files)) {
        const lower = file.name.toLowerCase();
        if (lower.endsWith('.sf2')) {
          const bank = await importSf2File(file);
          setStatusMsg(
            `Loaded SoundFont "${file.name}" (${bank.presets.length} presets — search & preview below).`,
          );
        } else if (lower.endsWith('.zip')) {
          const entry = await importSfzZipFile(file);
          if (entry.isDrum === activeStem.isDrum) {
            setStemInstrument(activeStemId, entry.id, applyToAllStates);
            setStatusMsg(
              `Imported SFZ "${entry.name}" and assigned to ${activeStem.name} (${stateScopeLabel}).`,
            );
          } else {
            setStatusMsg(`Imported SFZ "${entry.name}" into Custom Instruments.`);
          }
        } else if (lower.endsWith('.wav') || lower.endsWith('.ogg') || lower.endsWith('.mp3')) {
          const entry = importOneShotSampleFile(file);
          if (entry.isDrum === activeStem.isDrum) {
            setStemInstrument(activeStemId, entry.id, applyToAllStates);
            setStatusMsg(
              `Imported sample "${entry.name}" and assigned to ${activeStem.name} (${stateScopeLabel}).`,
            );
          } else {
            setStatusMsg(`Imported sample "${entry.name}" (mapped at C4).`);
          }
        } else {
          setErrorMsg(
            `Unsupported file "${file.name}". Please upload .sf2, .zip (SFZ), .wav, or .ogg.`,
          );
        }
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to import instrument file.');
    } finally {
      setBusy(false);
    }
  };

  const handlePreviewEntry = async (key: string, entry: CustomInstrumentEntry) => {
    setErrorMsg(null);
    setPreviewingKey(key);
    try {
      const res = await audioEngine.previewCustomInstrument(
        entry,
        section,
        activeStem,
        project.bpm,
        project.timeSignature,
      );
      setStatusMsg(
        res.mode === 'bar'
          ? `Previewing "${entry.name}" on ${activeStem.name} (Bar ${res.barNumber}).`
          : `Previewing "${entry.name}" (stem is empty — playing sample notes).`,
      );
    } catch {
      setErrorMsg(`Could not decode audio samples for "${entry.name}".`);
    } finally {
      setPreviewingKey((curr) => (curr === key ? null : curr));
    }
  };

  const handlePreviewSf2Preset = async (bank: LoadedSf2Bank, presetIndex: number) => {
    const entry = bank.loadPreset(presetIndex);
    if (!entry) {
      setErrorMsg('Could not extract samples for that SoundFont preset.');
      return;
    }
    await handlePreviewEntry(`${bank.id}_${presetIndex}`, entry);
  };

  const handleLoadSf2Preset = (bank: LoadedSf2Bank, presetIndex: number) => {
    setErrorMsg(null);
    const entry = bank.loadPreset(presetIndex);
    if (!entry) {
      setErrorMsg('Could not extract samples for that SoundFont preset.');
      return;
    }
    if (entry.isDrum === activeStem.isDrum) {
      setStemInstrument(activeStemId, entry.id, applyToAllStates);
      setStatusMsg(`Loaded "${entry.name}" onto ${activeStem.name} (${stateScopeLabel}).`);
    } else {
      setStatusMsg(
        `Loaded "${entry.name}" (switch to a ${entry.isDrum ? 'Percussion' : 'melodic'} stem to assign it).`,
      );
    }
  };

  const filteredCustomList = customList.filter((inst) => {
    const compat = getStemCompatibility(inst.name, inst.isDrum, activeStemId, activeStem.isDrum);
    if (onlyCompatible && compat === 'incompatible') return false;
    if (!query) return true;
    return (
      inst.name.toLowerCase().includes(query) || inst.description.toLowerCase().includes(query)
    );
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl max-w-2xl w-full max-h-[86vh] flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <Music2 className="w-5 h-5 text-cyan-400" />
            <div>
              <h2 className="text-base font-bold text-zinc-100">
                Custom Instruments (.sf2, .sfz, .wav)
              </h2>
              <p className="text-xs text-zinc-400">
                Active Stem:{' '}
                <span className="font-semibold text-amber-300">
                  {activeStem.name} ({activeStem.isDrum ? 'Drum / Percussion' : 'Melodic'})
                </span>
              </p>
            </div>
          </div>
          <button
            onClick={() => setInstrumentModalOpen(false)}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Dropzone */}
          <label
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void handleFiles(e.dataTransfer.files);
            }}
            className="flex flex-col items-center justify-center gap-1.5 p-5 rounded-xl border-2 border-dashed border-zinc-700 hover:border-cyan-500/70 bg-zinc-950/70 cursor-pointer transition"
          >
            <FolderUp className="w-6 h-6 text-cyan-400" />
            <div className="text-sm font-semibold text-zinc-200">
              {busy ? 'Loading instrument...' : 'Drop .sf2, .zip (SFZ), .wav, or .ogg files here'}
            </div>
            <div className="text-xs text-zinc-500">
              or click to browse — search &amp; filter all SoundFont presets below
            </div>
            <input
              type="file"
              accept=".sf2,.zip,.wav,.ogg,.mp3"
              multiple
              disabled={busy}
              onChange={(e) => {
                void handleFiles(e.target.files);
                e.target.value = '';
              }}
              className="hidden"
            />
          </label>

          {statusMsg && (
            <div className="p-2.5 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-200 text-xs flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" />
              <span>{statusMsg}</span>
            </div>
          )}

          {errorMsg && (
            <div className="p-2.5 rounded-lg bg-rose-500/15 border border-rose-500/40 text-rose-200 text-xs">
              {errorMsg}
            </div>
          )}

          {/* Search & Compatibility Filter Bar */}
          {(sf2Banks.length > 0 || customList.length > 0) && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search instruments (e.g. banjo, guitar, bass, drum)..."
                  className="w-full pl-8 pr-7 py-1.5 rounded-lg bg-zinc-950 border border-zinc-700 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-cyan-500"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-200 cursor-pointer"
                    title="Clear search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <label className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={onlyCompatible}
                  onChange={(e) => setOnlyCompatible(e.target.checked)}
                  className="accent-emerald-500"
                />
                Only compatible
              </label>

              {project.sections.length > 1 && (
                <label
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-amber-200 cursor-pointer shrink-0"
                  title="Apply the assigned instrument to this stem across all game states (uncheck for location-specific swaps like Shack Banjo)"
                >
                  <input
                    type="checkbox"
                    checked={applyToAllStates}
                    onChange={(e) => setApplyToAllStates(e.target.checked)}
                    className="accent-amber-500"
                  />
                  Apply to all states ({project.sections.length})
                </label>
              )}
            </div>
          )}

          {/* Loaded .sf2 SoundFont Banks */}
          {sf2Banks.map((bank) => {
            const indexedPresets = bank.presets
              .map((p, idx) => {
                const isDrum = isDrumPresetMeta(p.name, p.bank);
                const compat = getStemCompatibility(p.name, isDrum, activeStemId, activeStem.isDrum);
                return { preset: p, idx, isDrum, compat };
              })
              .filter(({ preset, compat }) => {
                if (onlyCompatible && compat === 'incompatible') return false;
                if (!query) return true;
                return (
                  preset.name.toLowerCase().includes(query) ||
                  `b${preset.bank}`.includes(query) ||
                  `p${preset.preset}`.includes(query) ||
                  String(preset.preset).includes(query)
                );
              });

            return (
              <div
                key={bank.id}
                className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 space-y-2"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-zinc-100">{bank.fileName}</span>
                  <span className="text-[10px] font-mono text-zinc-400">
                    Showing {indexedPresets.length} of {bank.presets.length} presets
                  </span>
                </div>

                <div className="max-h-56 overflow-y-auto divide-y divide-zinc-900 rounded-md border border-zinc-800/80 bg-zinc-900/40">
                  {indexedPresets.length === 0 ? (
                    <div className="p-3 text-xs text-zinc-500 text-center">
                      No matching presets found.
                    </div>
                  ) : (
                    indexedPresets.map(({ preset, idx, isDrum, compat }) => {
                      const badge = COMPAT_BADGE[compat];
                      const mismatch = compat === 'incompatible';
                      return (
                        <div
                          key={`${preset.bank}_${preset.preset}_${idx}`}
                          className="px-2.5 py-1.5 flex items-center justify-between gap-2 hover:bg-zinc-800/60 transition"
                        >
                          <div className="min-w-0 flex items-center gap-2">
                            <span className="text-[10px] font-mono text-zinc-500 shrink-0">
                              B{preset.bank}:P{preset.preset}
                            </span>
                            <span className="text-xs font-medium text-zinc-100 truncate">
                              {preset.name}
                            </span>
                            <span
                              title={
                                mismatch
                                  ? isDrum
                                    ? 'Drum Kit (Bank 128) — switch to Percussion stem to use'
                                    : 'Melodic instrument — switch to a melodic stem to use'
                                  : badge.title
                              }
                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-medium shrink-0 ${badge.className}`}
                            >
                              {badge.icon}
                              <span>
                                {mismatch ? (isDrum ? 'Drum Kit' : 'Melodic') : badge.label}
                              </span>
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => void handlePreviewSf2Preset(bank, idx)}
                              disabled={previewingKey === `${bank.id}_${idx}`}
                              className="flex items-center gap-1 px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-[11px] font-medium cursor-pointer transition disabled:opacity-50"
                              title="Preview 1 non-empty bar of your current stem (or 3 sample notes if empty)"
                            >
                              {previewingKey === `${bank.id}_${idx}` ? (
                                <Loader2 className="w-3 h-3 animate-spin text-amber-400" />
                              ) : (
                                <Play className="w-3 h-3 text-amber-400" />
                              )}
                              <span>Preview</span>
                            </button>
                            <button
                              onClick={() => handleLoadSf2Preset(bank, idx)}
                              disabled={mismatch}
                              className="px-2.5 py-1 rounded bg-cyan-500/20 hover:bg-cyan-500/35 disabled:opacity-35 disabled:cursor-not-allowed border border-cyan-500/40 text-cyan-200 text-[11px] font-semibold cursor-pointer shrink-0 transition"
                              title={
                                mismatch
                                  ? `Switch to a ${isDrum ? 'Percussion' : 'melodic'} stem to assign`
                                  : `Load onto ${activeStem.name}`
                              }
                            >
                              Use on {activeStem.shortLabel}
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}

          {/* Ready Custom Instruments List */}
          {filteredCustomList.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                Loaded Custom Instruments ({filteredCustomList.length})
              </h3>
              <div className="space-y-1.5">
                {filteredCustomList.map((inst) => {
                  const compat = getStemCompatibility(
                    inst.name,
                    inst.isDrum,
                    activeStemId,
                    activeStem.isDrum,
                  );
                  const badge = COMPAT_BADGE[compat];
                  const mismatch = compat === 'incompatible';
                  return (
                    <div
                      key={inst.id}
                      className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-zinc-100 truncate">
                            {inst.name}
                          </span>
                          <span
                            title={badge.title}
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-medium shrink-0 ${badge.className}`}
                          >
                            {badge.icon}
                            <span>
                              {mismatch ? (inst.isDrum ? 'Drum Kit' : 'Melodic') : badge.label}
                            </span>
                          </span>
                        </div>
                        <div className="text-[10px] text-zinc-500">{inst.description}</div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => void handlePreviewEntry(inst.id, inst)}
                          disabled={previewingKey === inst.id}
                          className="flex items-center gap-1 px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-[11px] font-medium cursor-pointer transition disabled:opacity-50"
                          title="Preview 1 non-empty bar of your current stem (or 3 sample notes if empty)"
                        >
                          {previewingKey === inst.id ? (
                            <Loader2 className="w-3 h-3 animate-spin text-amber-400" />
                          ) : (
                            <Play className="w-3 h-3 text-amber-400" />
                          )}
                          <span>Preview</span>
                        </button>
                        <button
                          disabled={mismatch}
                          onClick={() => {
                            setStemInstrument(activeStemId, inst.id, applyToAllStates);
                            setStatusMsg(
                              `Assigned "${inst.name}" to ${activeStem.name} (${stateScopeLabel}).`,
                            );
                          }}
                          className="flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-35 disabled:cursor-not-allowed border border-zinc-700 text-[11px] text-amber-300 font-medium cursor-pointer shrink-0"
                        >
                          <Upload className="w-3 h-3" />
                          Assign to {activeStem.shortLabel}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
