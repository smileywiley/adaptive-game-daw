import React, { useRef } from 'react';
import {
  Circle,
  Download,
  Gamepad2,
  Music,
  Pause,
  Play,
  Sparkles,
  Square,
  Undo2,
  Upload,
  Usb,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useDawStore } from '../store/useDawStore';
import { NOTE_NAMES, SCALES } from '../theory/musicTheory';
import { PitchClass, ScaleId, TimeSignature } from '../types/daw';

export const TransportBar: React.FC = () => {
  const project = useDawStore((s) => s.project);
  const section = useDawStore((s) => s.getActiveSection());
  const isPlaying = useDawStore((s) => s.isPlaying);
  const isRecording = useDawStore((s) => s.isRecording);
  const masterVolumeDb = useDawStore((s) => s.masterVolumeDb);
  const masterMuted = useDawStore((s) => s.masterMuted);
  const autoRemap = useDawStore((s) => s.autoRemapOnKeyChange);
  const undoCount = useDawStore((s) => s.undoStack.length);
  const midiSupported = useDawStore((s) => s.midiSupported);
  const midiDevices = useDawStore((s) => s.midiDevices);
  const selectedMidiDeviceId = useDawStore((s) => s.selectedMidiDeviceId);
  const simulatorOpen = useDawStore((s) => s.simulatorOpen);
  const simulatorEnabled = useDawStore((s) => s.simulatorEnabled);

  const togglePlay = useDawStore((s) => s.togglePlay);
  const stopPlayback = useDawStore((s) => s.stopPlayback);
  const toggleRecord = useDawStore((s) => s.toggleRecord);
  const setMasterVolume = useDawStore((s) => s.setMasterVolume);
  const toggleMasterMute = useDawStore((s) => s.toggleMasterMute);
  const setBpm = useDawStore((s) => s.setBpm);
  const setTimeSignature = useDawStore((s) => s.setTimeSignature);
  const setSectionBars = useDawStore((s) => s.setSectionBars);
  const setKeyAndScale = useDawStore((s) => s.setKeyAndScale);
  const setAutoRemap = useDawStore((s) => s.setAutoRemapOnKeyChange);
  const setPresetModalOpen = useDawStore((s) => s.setPresetModalOpen);
  const setSimulatorOpen = useDawStore((s) => s.setSimulatorOpen);
  const setSelectedMidiDeviceId = useDawStore((s) => s.setSelectedMidiDeviceId);
  const undo = useDawStore((s) => s.undo);
  const exportProjectJson = useDawStore((s) => s.exportProjectJson);
  const importProjectJson = useDawStore((s) => s.importProjectJson);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExportJson = () => {
    const json = exportProjectJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const res = importProjectJson(text);
    if (!res.ok && res.error) {
      alert(res.error);
    }
    e.target.value = '';
  };

  const scaleInfo = SCALES[section.scaleId];

  return (
    <header className="studio-panel border-b px-3 py-2 flex flex-wrap items-center justify-between gap-2 select-none">
      {/* Left: Brand & Quick-Start Mood Presets */}
      <div className="flex items-center gap-2.5">
        <div className="flex items-center gap-2 pr-2 border-r border-zinc-800">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500 to-rose-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
            <Music className="w-4 h-4 text-zinc-950" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-bold tracking-tight text-zinc-100">TheoryDAW</div>
            <div className="text-[10px] text-zinc-400">Adaptive Game Studio</div>
          </div>
        </div>

        <button
          onClick={() => setPresetModalOpen(true)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 text-xs font-medium transition cursor-pointer"
          title="Load a 1-click Mood & Progression Starter Template"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span className="max-w-[170px] truncate">{project.name}</span>
        </button>
      </div>

      {/* Center: Transport + Tempo + Key/Scale */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Play / Stop / Record */}
        <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-md p-0.5">
          <button
            onClick={() => void togglePlay()}
            className={`px-2.5 py-1 rounded flex items-center gap-1 text-xs font-semibold transition cursor-pointer ${
              isPlaying
                ? 'bg-emerald-500 text-zinc-950'
                : 'text-zinc-200 hover:bg-zinc-800'
            }`}
            title="Play / Pause (Spacebar)"
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            {isPlaying ? 'Pause' : 'Play'}
          </button>
          <button
            onClick={stopPlayback}
            className="p-1.5 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition cursor-pointer"
            title="Stop & Rewind"
          >
            <Square className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={toggleRecord}
            className={`px-2 py-1 rounded flex items-center gap-1 text-xs font-semibold transition cursor-pointer ${
              isRecording
                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/50 animate-pulse'
                : 'text-zinc-400 hover:text-rose-300 hover:bg-zinc-800'
            }`}
            title="Arm Live Quantized Recording (Play + QWERTY or Mini MIDI keyboard)"
          >
            <Circle className="w-3 h-3 fill-current" />
            Rec
          </button>
        </div>

        {/* BPM & Time Signature & Bars */}
        <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-md px-2 py-1 text-xs">
          <label className="text-zinc-400 text-[10px] uppercase">BPM</label>
          <input
            type="number"
            min={50}
            max={220}
            value={project.bpm}
            onChange={(e) => setBpm(Number(e.target.value))}
            className="w-12 bg-zinc-950 border border-zinc-700 rounded px-1.5 py-0.5 text-center font-mono text-amber-300 focus:outline-none focus:border-amber-500"
          />
          <span className="text-zinc-700">|</span>
          <select
            value={project.timeSignature}
            onChange={(e) => setTimeSignature(e.target.value as TimeSignature)}
            className="bg-zinc-950 border border-zinc-700 rounded px-1.5 py-0.5 font-mono text-zinc-200 focus:outline-none focus:border-amber-500"
            title="Time Signature"
          >
            <option value="4/4">4/4</option>
            <option value="3/4">3/4</option>
            <option value="5/4">5/4</option>
          </select>
          <select
            value={section.bars}
            onChange={(e) => setSectionBars(Number(e.target.value))}
            className="bg-zinc-950 border border-zinc-700 rounded px-1.5 py-0.5 text-zinc-200 focus:outline-none focus:border-amber-500"
            title="Loop Length in Bars"
          >
            <option value={2}>2 Bars</option>
            <option value={4}>4 Bars</option>
            <option value={8}>8 Bars</option>
            <option value={16}>16 Bars</option>
          </select>
        </div>

        {/* Key & Scale with Beginner Vibe */}
        <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-md px-2 py-1 text-xs">
          <span className="text-zinc-400 text-[10px] uppercase">Key</span>
          <select
            value={section.root}
            onChange={(e) => setKeyAndScale(Number(e.target.value) as PitchClass, section.scaleId)}
            className="bg-zinc-950 border border-zinc-700 rounded px-1.5 py-0.5 font-semibold text-cyan-300 focus:outline-none focus:border-cyan-500"
          >
            {NOTE_NAMES.map((name, idx) => (
              <option key={name} value={idx}>
                {name}
              </option>
            ))}
          </select>
          <select
            value={section.scaleId}
            onChange={(e) => setKeyAndScale(section.root, e.target.value as ScaleId)}
            className="bg-zinc-950 border border-zinc-700 rounded px-1.5 py-0.5 text-zinc-200 focus:outline-none focus:border-cyan-500 max-w-[195px]"
            title={scaleInfo.description}
          >
            {Object.values(SCALES).map((sc) => (
              <option key={sc.id} value={sc.id}>
                {sc.name} — {sc.vibe}
              </option>
            ))}
          </select>
          <label
            className="flex items-center gap-1 text-[10px] text-zinc-400 cursor-pointer pl-1 border-l border-zinc-800"
            title="Automatically transpose & snap existing notes when you switch Key or Scale"
          >
            <input
              type="checkbox"
              checked={autoRemap}
              onChange={(e) => setAutoRemap(e.target.checked)}
              className="accent-cyan-500"
            />
            Auto-Remap
          </label>
        </div>
      </div>

      {/* Right: Main Volume + Simulator Toggle + Mini USB MIDI Status + Undo + JSON Save/Load */}
      <div className="flex items-center gap-1.5">
        {/* Main / Master Volume */}
        <div
          className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-md px-2 py-1"
          title="Main Output Volume (click speaker to mute)"
        >
          <button
            onClick={toggleMasterMute}
            className={`cursor-pointer transition ${
              masterMuted ? 'text-rose-400 hover:text-rose-300' : 'text-zinc-300 hover:text-amber-300'
            }`}
            title={masterMuted ? 'Unmute Main Output' : 'Mute Main Output'}
          >
            {masterMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          </button>
          <input
            type="range"
            min={-40}
            max={4}
            step={1}
            value={masterMuted ? -40 : masterVolumeDb}
            onChange={(e) => setMasterVolume(Number(e.target.value))}
            className="w-20 h-1 accent-amber-500 cursor-pointer"
            aria-label="Main Volume"
          />
          <span className="text-[10px] font-mono text-zinc-400 w-9 text-right">
            {masterMuted ? 'MUTE' : `${masterVolumeDb}dB`}
          </span>
        </div>

        <button
          onClick={() => setSimulatorOpen(!simulatorOpen)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-semibold transition cursor-pointer ${
            simulatorOpen || simulatorEnabled
              ? 'bg-emerald-500/20 border-emerald-400/70 text-emerald-200'
              : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800'
          }`}
          title="Open Game State Simulator to test live state transitions, intensity layering & gameplay scenarios"
        >
          <Gamepad2 className="w-3.5 h-3.5" />
          <span>Simulator</span>
          {simulatorEnabled && (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          )}
        </button>

        {/* Mini USB MIDI Keyboard Indicator */}
        <div
          className={`flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs ${
            midiDevices.length > 0
              ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
              : 'bg-zinc-900 border-zinc-800 text-zinc-400'
          }`}
          title={
            !midiSupported
              ? 'Web MIDI not supported in this browser (use Chrome/Edge for USB MIDI keyboards)'
              : midiDevices.length > 0
                ? 'Mini USB MIDI keyboard connected! White keys auto-map to scale when Scale-Lock is ON.'
                : 'Plug in a mini USB MIDI keyboard — it will auto-detect here.'
          }
        >
          <Usb className="w-3.5 h-3.5" />
          {midiDevices.length > 0 ? (
            <select
              value={selectedMidiDeviceId}
              onChange={(e) => setSelectedMidiDeviceId(e.target.value)}
              className="bg-transparent text-emerald-300 text-xs focus:outline-none max-w-[125px] truncate"
            >
              <option value="all" className="bg-zinc-900">
                All MIDI ({midiDevices.length})
              </option>
              {midiDevices.map((d) => (
                <option key={d.id} value={d.id} className="bg-zinc-900">
                  {d.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-[11px]">{midiSupported ? 'MIDI Ready' : 'No MIDI'}</span>
          )}
        </div>

        <button
          onClick={undo}
          disabled={undoCount === 0}
          className="p-1.5 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer"
          title="Undo last edit"
        >
          <Undo2 className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={handleExportJson}
          className="p-1.5 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 cursor-pointer"
          title="Save Project (.json)"
        >
          <Download className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={() => fileInputRef.current?.click()}
          className="p-1.5 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 cursor-pointer"
          title="Load Project (.json)"
        >
          <Upload className="w-3.5 h-3.5" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={(e) => void handleImportJson(e)}
        />
      </div>
    </header>
  );
};
