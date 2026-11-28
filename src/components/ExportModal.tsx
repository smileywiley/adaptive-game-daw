import React, { useState } from 'react';
import { CheckCircle2, Download, FileArchive, Loader2, X } from 'lucide-react';
import { useDawStore } from '../store/useDawStore';
import {
  exportAdaptiveMusicZip,
  ExportProgress,
} from '../export/exportBundle';
import { STEM_ORDER } from '../types/daw';

export const ExportModal: React.FC = () => {
  const isOpen = useDawStore((s) => s.exportModalOpen);
  const project = useDawStore((s) => s.project);
  const setExportModalOpen = useDawStore((s) => s.setExportModalOpen);

  const [includeWavStems, setIncludeWavStems] = useState(true);
  const [includeMidi, setIncludeMidi] = useState(true);
  const [includeUnityScripts, setIncludeUnityScripts] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const activeStemCount = project.sections.reduce(
    (sum, sec) =>
      sum + STEM_ORDER.filter((sid) => sec.stems[sid].notes.length > 0 && !sec.stems[sid].muted).length,
    0,
  );

  const handleExport = async () => {
    setExporting(true);
    setDoneMessage(null);
    setErrorMessage(null);
    setProgress({ current: 0, total: Math.max(1, activeStemCount), label: 'Starting offline render...' });

    try {
      const zipBlob = await exportAdaptiveMusicZip(
        project,
        { includeWavStems, includeMidi, includeUnityScripts },
        (p) => setProgress(p),
      );

      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      const safeName = project.name.toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'adaptive_music';
      a.download = `${safeName}_unity_pack.zip`;
      a.click();
      URL.revokeObjectURL(url);

      setDoneMessage(`Exported ${safeName}_unity_pack.zip successfully!`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setExporting(false);
    }
  };

  const pct =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.current / progress.total) * 100))
      : 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl max-w-lg w-full overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <FileArchive className="w-5 h-5 text-amber-400" />
            <div>
              <h2 className="text-base font-bold text-zinc-100">
                Export Game-Ready Unity Package (.zip)
              </h2>
              <p className="text-xs text-zinc-400">
                Seamless loop-tail-wrapped WAV stems + manifest + Unity C# player
              </p>
            </div>
          </div>
          <button
            onClick={() => !exporting && setExportModalOpen(false)}
            disabled={exporting}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 cursor-pointer disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Summary */}
          <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-zinc-400">Project:</span>
              <span className="font-semibold text-zinc-100">{project.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">Sections / States:</span>
              <span className="font-mono text-cyan-300">
                {project.sections.map((s) => s.name).join(', ')}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">Unmuted Stems to Render:</span>
              <span className="font-mono text-amber-300">{activeStemCount} .wav files</span>
            </div>
          </div>

          {/* Options */}
          <div className="space-y-2 text-xs">
            <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-zinc-950/70 border border-zinc-800 cursor-pointer">
              <input
                type="checkbox"
                checked={includeWavStems}
                onChange={(e) => setIncludeWavStems(e.target.checked)}
                disabled={exporting}
                className="mt-0.5 accent-amber-500"
              />
              <div>
                <div className="font-semibold text-zinc-100">
                  Seamless Loop `.wav` Stems (`AudioStems/`)
                </div>
                <div className="text-[11px] text-zinc-400">
                  Offline 2-pass render slices Pass 2 so reverb &amp; delay tails wrap cleanly back to Beat 1.
                </div>
              </div>
            </label>

            <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-zinc-950/70 border border-zinc-800 cursor-pointer">
              <input
                type="checkbox"
                checked={includeMidi}
                onChange={(e) => setIncludeMidi(e.target.checked)}
                disabled={exporting}
                className="mt-0.5 accent-amber-500"
              />
              <div>
                <div className="font-semibold text-zinc-100">
                  Multi-Track `.mid` Files (`MIDI/`)
                </div>
                <div className="text-[11px] text-zinc-400">
                  Standard MIDI export for every section so you can also open them in any desktop DAW.
                </div>
              </div>
            </label>

            <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-zinc-950/70 border border-zinc-800 cursor-pointer">
              <input
                type="checkbox"
                checked={includeUnityScripts}
                onChange={(e) => setIncludeUnityScripts(e.target.checked)}
                disabled={exporting}
                className="mt-0.5 accent-amber-500"
              />
              <div>
                <div className="font-semibold text-zinc-100">
                  Unity 2022 LTS / Unity 6 C# Scripts + `music_manifest.json`
                </div>
                <div className="text-[11px] text-zinc-400">
                  Includes `AdaptiveMusicManager.cs` (`PlayScheduled`, vertical crossfade, `keepBeatPosition`), `AdaptiveMusicTriggerZone.cs`, and `README_UnitySetup.md`.
                </div>
              </div>
            </label>
          </div>

          {/* Progress */}
          {exporting && progress && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-amber-300 flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {progress.label}
                </span>
                <span className="font-mono text-zinc-400">{pct}%</span>
              </div>
              <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className="h-full bg-amber-400 transition-all duration-150"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )}

          {doneMessage && (
            <div className="p-2.5 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-200 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{doneMessage}</span>
            </div>
          )}

          {errorMessage && (
            <div className="p-2.5 rounded-lg bg-rose-500/15 border border-rose-500/40 text-rose-200 text-xs">
              {errorMessage}
            </div>
          )}

          <button
            onClick={() => void handleExport()}
            disabled={exporting || (!includeWavStems && !includeMidi && !includeUnityScripts)}
            className="w-full py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-zinc-950 font-bold text-sm flex items-center justify-center gap-2 transition cursor-pointer"
          >
            {exporting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Rendering Audio Stems...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Export .zip Package
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
