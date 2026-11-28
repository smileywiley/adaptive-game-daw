import React, { useEffect, useState } from 'react';
import { Check, FolderUp, Music2, Upload, X } from 'lucide-react';
import { useDawStore } from '../store/useDawStore';
import {
  CustomInstrumentEntry,
  getCustomInstruments,
  getLoadedSf2Banks,
  importOneShotSampleFile,
  importSf2File,
  importSfzZipFile,
  LoadedSf2Bank,
  subscribeCustomInstruments,
} from '../audio/customInstruments';

export const InstrumentImportModal: React.FC = () => {
  const isOpen = useDawStore((s) => s.instrumentModalOpen);
  const activeStemId = useDawStore((s) => s.activeStemId);
  const activeStem = useDawStore((s) => s.getActiveSection().stems[s.activeStemId]);
  const setInstrumentModalOpen = useDawStore((s) => s.setInstrumentModalOpen);
  const setStemInstrument = useDawStore((s) => s.setStemInstrument);

  const [customList, setCustomList] = useState<CustomInstrumentEntry[]>(() => getCustomInstruments());
  const [sf2Banks, setSf2Banks] = useState<LoadedSf2Bank[]>(() => getLoadedSf2Banks());
  const [selectedPresets, setSelectedPresets] = useState<Record<string, number>>({});
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    return subscribeCustomInstruments(() => {
      setCustomList(getCustomInstruments());
      setSf2Banks(getLoadedSf2Banks());
    });
  }, []);

  if (!isOpen) return null;

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
            `Loaded SoundFont "${file.name}" (${bank.presets.length} presets available below).`,
          );
        } else if (lower.endsWith('.zip')) {
          const entry = await importSfzZipFile(file);
          if (!activeStem.isDrum) {
            setStemInstrument(activeStemId, entry.id);
          }
          setStatusMsg(`Imported SFZ "${entry.name}" and assigned to ${activeStem.name}.`);
        } else if (lower.endsWith('.wav') || lower.endsWith('.ogg') || lower.endsWith('.mp3')) {
          const entry = importOneShotSampleFile(file);
          if (!activeStem.isDrum) {
            setStemInstrument(activeStemId, entry.id);
          }
          setStatusMsg(`Imported sample "${entry.name}" (mapped at C4).`);
        } else {
          setErrorMsg(`Unsupported file "${file.name}". Please upload .sf2, .zip (SFZ), .wav, or .ogg.`);
        }
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to import instrument file.');
    } finally {
      setBusy(false);
    }
  };

  const handleLoadSf2Preset = (bank: LoadedSf2Bank) => {
    const idx = selectedPresets[bank.id] ?? 0;
    const entry = bank.loadPreset(idx);
    if (!entry) {
      setErrorMsg('Could not extract samples for that SoundFont preset.');
      return;
    }
    if (!activeStem.isDrum) {
      setStemInstrument(activeStemId, entry.id);
      setStatusMsg(`Loaded "${entry.name}" onto ${activeStem.name}.`);
    } else {
      setStatusMsg(`Loaded "${entry.name}" into Custom Imported instruments.`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Music2 className="w-5 h-5 text-cyan-400" />
            <div>
              <h2 className="text-base font-bold text-zinc-100">
                Custom Instruments (.sf2, .sfz, .wav)
              </h2>
              <p className="text-xs text-zinc-400">
                Import General MIDI SoundFonts, SFZ sample packs (.zip), or audio one-shots.
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
            className="flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed border-zinc-700 hover:border-cyan-500/70 bg-zinc-950/70 cursor-pointer transition"
          >
            <FolderUp className="w-7 h-7 text-cyan-400" />
            <div className="text-sm font-semibold text-zinc-200">
              {busy ? 'Loading instrument...' : 'Drop .sf2, .zip (SFZ), .wav, or .ogg files here'}
            </div>
            <div className="text-xs text-zinc-500">
              or click to browse — all SoundFont presets appear immediately in the stem dropdown
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

          {/* Loaded .sf2 SoundFont Banks */}
          {sf2Banks.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                Loaded SoundFont (.sf2) Banks
              </h3>
              {sf2Banks.map((bank) => (
                <div
                  key={bank.id}
                  className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 space-y-2"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-zinc-100">{bank.fileName}</span>
                    <span className="text-[10px] font-mono text-zinc-500">
                      {bank.presets.length} presets
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={selectedPresets[bank.id] ?? 0}
                      onChange={(e) =>
                        setSelectedPresets((prev) => ({
                          ...prev,
                          [bank.id]: Number(e.target.value),
                        }))
                      }
                      className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-200"
                    >
                      {bank.presets.map((p, idx) => (
                        <option key={`${p.bank}_${p.preset}_${idx}`} value={idx}>
                          [B{p.bank}:P{p.preset}] {p.name}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => handleLoadSf2Preset(bank)}
                      className="px-3 py-1.5 rounded bg-cyan-500 hover:bg-cyan-400 text-zinc-950 text-xs font-semibold cursor-pointer shrink-0"
                    >
                      Load onto {activeStem.shortLabel}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Imported Custom Instruments List */}
          {customList.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                Ready Custom Instruments ({customList.length})
              </h3>
              <div className="space-y-1.5">
                {customList.map((inst) => (
                  <div
                    key={inst.id}
                    className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-between gap-2"
                  >
                    <div>
                      <div className="text-xs font-semibold text-zinc-100">{inst.name}</div>
                      <div className="text-[10px] text-zinc-500">{inst.description}</div>
                    </div>
                    {!activeStem.isDrum && (
                      <button
                        onClick={() => {
                          setStemInstrument(activeStemId, inst.id);
                          setStatusMsg(`Assigned "${inst.name}" to ${activeStem.name}.`);
                        }}
                        className="flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-[11px] text-amber-300 font-medium cursor-pointer"
                      >
                        <Upload className="w-3 h-3" />
                        Assign to {activeStem.shortLabel}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
