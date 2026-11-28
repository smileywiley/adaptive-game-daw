import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  Circle,
  Gamepad2,
  Play,
  Square,
  X,
  Zap,
} from 'lucide-react';
import { useDawStore } from '../store/useDawStore';
import { audioEngine, TransitionStatus } from '../audio/audioEngine';
import {
  BUILT_IN_SCENARIOS,
  evaluateScenarioAtTime,
} from '../adaptive/adaptiveLogic';
import { SimulationEvent, SimulationScenario, STEM_ORDER } from '../types/daw';

export const GameSimulatorPanel: React.FC = () => {
  const isOpen = useDawStore((s) => s.simulatorOpen);
  const project = useDawStore((s) => s.project);
  const activeSection = useDawStore((s) => s.getActiveSection());
  const isPlaying = useDawStore((s) => s.isPlaying);
  const simulatorEnabled = useDawStore((s) => s.simulatorEnabled);
  const simIntensity = useDawStore((s) => s.simIntensity);
  const recordedScenario = useDawStore((s) => s.recordedScenario);

  const setSimulatorOpen = useDawStore((s) => s.setSimulatorOpen);
  const setSimulatorEnabled = useDawStore((s) => s.setSimulatorEnabled);
  const setSimIntensity = useDawStore((s) => s.setSimIntensity);
  const requestStateTransition = useDawStore((s) => s.requestStateTransition);
  const requestStateTransitionByName = useDawStore((s) => s.requestStateTransitionByName);
  const triggerStinger = useDawStore((s) => s.triggerStinger);
  const togglePlay = useDawStore((s) => s.togglePlay);
  const setRecordedScenario = useDawStore((s) => s.setRecordedScenario);

  const [transitionStatus, setTransitionStatus] = useState<TransitionStatus | null>(null);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>(BUILT_IN_SCENARIOS[0].id);
  const [scenarioPlaying, setScenarioPlaying] = useState(false);
  const [scenarioTimeSec, setScenarioTimeSec] = useState(0);

  // Record custom simulation pass state
  const [recordingPass, setRecordingPass] = useState(false);
  const recordStartRef = useRef<number>(0);
  const recordedEventsRef = useRef<SimulationEvent[]>([]);

  // Scenario runner refs
  const scenarioStartRef = useRef<number>(0);
  const lastScenarioStateRef = useRef<string | null>(null);
  const firedStingerIndicesRef = useRef<Set<number>>(new Set());

  const allScenarios: SimulationScenario[] = recordedScenario
    ? [...BUILT_IN_SCENARIOS, recordedScenario]
    : BUILT_IN_SCENARIOS;
  const currentScenario =
    allScenarios.find((sc) => sc.id === selectedScenarioId) ?? BUILT_IN_SCENARIOS[0];

  // Poll transition countdown only while simulator is open and transport is playing
  useEffect(() => {
    if (!isOpen || !isPlaying) {
      setTransitionStatus(null);
      return;
    }
    const id = window.setInterval(() => {
      const next = audioEngine.getTransitionStatus();
      setTransitionStatus((prev) => (!next && !prev ? prev : next));
    }, 80);
    return () => window.clearInterval(id);
  }, [isOpen, isPlaying]);

  // Stop automated scenario & pass recording if simulator is closed or user hits Stop/Pause
  useEffect(() => {
    if (!isOpen || !isPlaying) {
      if (scenarioPlaying) setScenarioPlaying(false);
      if (recordingPass) setRecordingPass(false);
    }
  }, [isOpen, isPlaying, scenarioPlaying, recordingPass]);

  // Prerecorded scenario playback driver
  useEffect(() => {
    if (!scenarioPlaying) return;
    const intervalId = window.setInterval(() => {
      const elapsed = (performance.now() - scenarioStartRef.current) / 1000;
      if (elapsed >= currentScenario.durationSec) {
        setScenarioTimeSec(currentScenario.durationSec);
        setScenarioPlaying(false);
        return;
      }
      setScenarioTimeSec(elapsed);

      const snap = evaluateScenarioAtTime(currentScenario, elapsed);
      useDawStore.getState().setSimIntensity(snap.intensity);

      if (snap.stateName && snap.stateName !== lastScenarioStateRef.current) {
        lastScenarioStateRef.current = snap.stateName;
        useDawStore.getState().requestStateTransitionByName(snap.stateName);
      }

      // Trigger any stingers whose timestamp just passed
      currentScenario.events.forEach((ev, idx) => {
        if (
          ev.type === 'stinger' &&
          ev.timeSec <= elapsed &&
          !firedStingerIndicesRef.current.has(idx)
        ) {
          firedStingerIndicesRef.current.add(idx);
          void useDawStore.getState().triggerStinger(String(ev.value));
        }
      });
    }, 100);
    return () => window.clearInterval(intervalId);
  }, [scenarioPlaying, currentScenario]);

  if (!isOpen) return null;

  const loopSections = project.sections.filter((s) => s.role !== 'stinger');
  const stingerSections = project.sections.filter((s) => s.role === 'stinger');

  const logRecordedEvent = (type: SimulationEvent['type'], value: string | number) => {
    if (!recordingPass) return;
    const timeSec = Math.max(0, (performance.now() - recordStartRef.current) / 1000);
    recordedEventsRef.current.push({ timeSec, type, value });
  };

  const handleStateClick = (sectionId: string, name: string) => {
    logRecordedEvent('state', name);
    requestStateTransition(sectionId);
  };

  const handleIntensityChange = (val: number) => {
    if (!simulatorEnabled) setSimulatorEnabled(true);
    logRecordedEvent('intensity', val);
    setSimIntensity(val);
  };

  const handleTriggerStinger = (stingerName?: string) => {
    logRecordedEvent('stinger', stingerName ?? 'Victory_Stinger');
    void triggerStinger(stingerName);
  };

  const handleStartScenario = async () => {
    if (scenarioPlaying) {
      setScenarioPlaying(false);
      return;
    }
    setSimulatorEnabled(true);
    if (!isPlaying) {
      await togglePlay();
    }
    scenarioStartRef.current = performance.now();
    lastScenarioStateRef.current = null;
    firedStingerIndicesRef.current = new Set();
    setScenarioTimeSec(0);
    setScenarioPlaying(true);
  };

  const handleToggleRecordPass = async () => {
    if (recordingPass) {
      const durationSec = Math.max(4, Math.ceil((performance.now() - recordStartRef.current) / 1000));
      const customScenario: SimulationScenario = {
        id: 'custom_recorded_pass',
        name: `My Recorded Pass (${durationSec}s)`,
        description: 'Your captured manual state, intensity, and stinger test pass.',
        durationSec,
        events: [...recordedEventsRef.current],
      };
      setRecordedScenario(customScenario);
      setSelectedScenarioId(customScenario.id);
      setRecordingPass(false);
    } else {
      setSimulatorEnabled(true);
      if (!isPlaying) {
        await togglePlay();
      }
      recordStartRef.current = performance.now();
      recordedEventsRef.current = [
        { timeSec: 0, type: 'state', value: activeSection.name },
        { timeSec: 0, type: 'intensity', value: simIntensity },
      ];
      setRecordingPass(true);
    }
  };

  const handleScrubScenario = (timeSec: number) => {
    setScenarioTimeSec(timeSec);
    if (!simulatorEnabled) setSimulatorEnabled(true);
    const snap = evaluateScenarioAtTime(currentScenario, timeSec);
    setSimIntensity(snap.intensity);
    if (snap.stateName) {
      requestStateTransitionByName(snap.stateName);
    }
  };

  return (
    <aside className="w-80 shrink-0 studio-panel border-l flex flex-col overflow-y-auto select-none">
      {/* Header */}
      <div className="px-3.5 py-2.5 border-b border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Gamepad2 className="w-4 h-4 text-emerald-400" />
          <div>
            <h2 className="text-xs font-bold text-zinc-100">Game State Simulator</h2>
            <p className="text-[10px] text-zinc-400">Test adaptive states &amp; intensity live</p>
          </div>
        </div>
        <button
          onClick={() => setSimulatorOpen(false)}
          className="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-3.5 space-y-4 flex-1">
        {/* Adaptive Layering Master Switch */}
        <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-between gap-2">
          <div>
            <div className="text-xs font-semibold text-zinc-100">Vertical Intensity Layering</div>
            <div className="text-[10px] text-zinc-400">
              {simulatorEnabled
                ? 'Active — Intensity slider fades stems in/out'
                : 'Off — All unmuted stems play at full mix'}
            </div>
          </div>
          <button
            onClick={() => setSimulatorEnabled(!simulatorEnabled)}
            className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition cursor-pointer ${
              simulatorEnabled
                ? 'bg-emerald-500 text-zinc-950'
                : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {simulatorEnabled ? 'ON' : 'OFF'}
          </button>
        </div>

        {/* Live Transition Countdown Banner */}
        {transitionStatus && (
          <div className="p-2.5 rounded-lg bg-amber-500/15 border border-amber-500/50 text-amber-200 text-xs flex items-center justify-between animate-pulse">
            <span>
              {transitionStatus.inFillBridge ? 'Fill Bridge → ' : 'Switching to '}
              <strong>{transitionStatus.pendingSectionName}</strong>
            </span>
            <span className="font-mono font-bold">
              {transitionStatus.beatsRemaining.toFixed(1)} beats
            </span>
          </div>
        )}

        {/* Section 1: Live Manual Game State Controls */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
              1. Live Game State
            </h3>
            <span className="text-[10px] font-mono text-cyan-300">
              Active: {activeSection.name}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            {loopSections.map((sec) => {
              const isCurrent = sec.id === activeSection.id;
              const isPending = transitionStatus?.pendingSectionId === sec.id;
              return (
                <button
                  key={sec.id}
                  onClick={() => handleStateClick(sec.id, sec.name)}
                  className={`px-2.5 py-2 rounded-lg border text-xs font-semibold transition cursor-pointer ${
                    isCurrent
                      ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                      : isPending
                        ? 'bg-amber-500/20 border-amber-400 text-amber-200 animate-pulse'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-300 hover:border-zinc-600'
                  }`}
                >
                  {sec.name}
                </button>
              );
            })}
          </div>

          {/* Stinger Triggers */}
          <div className="flex flex-wrap gap-1.5">
            {stingerSections.length > 0 ? (
              stingerSections.map((st) => (
                <button
                  key={st.id}
                  onClick={() => handleTriggerStinger(st.name)}
                  className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/50 text-purple-200 text-xs font-semibold transition cursor-pointer"
                >
                  <Zap className="w-3.5 h-3.5" />
                  Trigger {st.name}
                </button>
              ))
            ) : (
              <div className="text-[10px] text-zinc-500">
                Add a Stinger section in the top States bar to trigger one-shot cues.
              </div>
            )}
          </div>
        </div>

        {/* Section 2: Intensity Slider + Live Animated Stem Volume Meters */}
        <div className="space-y-2 pt-2 border-t border-zinc-800/80">
          <div className="flex items-center justify-between">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
              2. Vertical Intensity
            </h3>
            <span className="text-xs font-mono font-bold text-amber-300">
              {Math.round(simIntensity * 100)}%
            </span>
          </div>

          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={simIntensity}
            onChange={(e) => handleIntensityChange(Number(e.target.value))}
            className="w-full accent-amber-500 cursor-pointer"
          />

          <div className="space-y-1.5 pt-1">
            {STEM_ORDER.map((sid) => {
              const stem = activeSection.stems[sid];
              const level = audioEngine.getStemEffectiveLevel(sid, activeSection);
              const pct = Math.round(level * 100);
              return (
                <div key={sid} className="space-y-0.5">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-zinc-300 font-medium">{stem.name}</span>
                    <span className="font-mono text-zinc-500">
                      ≥{Math.round(stem.intensityMin * 100)}% · {pct}%
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-zinc-900 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-150"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: stem.color,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Section 3: Prerecorded Gameplay Scenarios & Custom Pass Recorder */}
        <div className="space-y-2.5 pt-3 border-t border-zinc-800/80">
          <div className="flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
              3. Automated Gameplay Scenarios
            </h3>
          </div>

          <select
            value={selectedScenarioId}
            onChange={(e) => {
              setScenarioPlaying(false);
              setScenarioTimeSec(0);
              setSelectedScenarioId(e.target.value);
            }}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-cyan-500"
          >
            {allScenarios.map((sc) => (
              <option key={sc.id} value={sc.id}>
                {sc.name}
              </option>
            ))}
          </select>

          <p className="text-[10px] text-zinc-400 leading-relaxed">{currentScenario.description}</p>

          {/* Visual Scenario Timeline Scrubber */}
          <div className="p-2 rounded-lg bg-zinc-950 border border-zinc-800 space-y-1.5">
            <div className="relative h-6 rounded bg-zinc-900 overflow-hidden flex items-center">
              {currentScenario.events
                .filter((ev) => ev.type === 'state' || ev.type === 'stinger')
                .map((ev, idx) => {
                  const leftPct = (ev.timeSec / currentScenario.durationSec) * 100;
                  const isStinger = ev.type === 'stinger';
                  return (
                    <div
                      key={`${ev.type}_${idx}`}
                      style={{ left: `${leftPct}%` }}
                      title={`${ev.timeSec.toFixed(1)}s: ${ev.value}`}
                      className={`absolute top-0 bottom-0 flex items-center px-1 text-[9px] font-semibold border-l ${
                        isStinger
                          ? 'border-purple-400 text-purple-300 bg-purple-500/20'
                          : 'border-cyan-500/70 text-cyan-200 bg-cyan-500/10'
                      }`}
                    >
                      {isStinger ? '⚡' : String(ev.value).slice(0, 5)}
                    </div>
                  );
                })}
              {/* Playhead marker */}
              <div
                style={{ left: `${(scenarioTimeSec / currentScenario.durationSec) * 100}%` }}
                className="absolute top-0 bottom-0 w-0.5 bg-amber-400 z-10"
              />
            </div>

            <input
              type="range"
              min={0}
              max={currentScenario.durationSec}
              step={0.1}
              value={scenarioTimeSec}
              onChange={(e) => handleScrubScenario(Number(e.target.value))}
              className="w-full accent-cyan-400 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] font-mono text-zinc-500">
              <span>{scenarioTimeSec.toFixed(1)}s</span>
              <span>{currentScenario.durationSec}s</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => void handleStartScenario()}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                scenarioPlaying
                  ? 'bg-amber-500 text-zinc-950'
                  : 'bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/50 text-cyan-200'
              }`}
            >
              {scenarioPlaying ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              {scenarioPlaying ? 'Stop Scenario' : 'Run Scenario'}
            </button>

            <button
              onClick={() => void handleToggleRecordPass()}
              className={`flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer ${
                recordingPass
                  ? 'bg-rose-500 text-zinc-950 border-rose-400 animate-pulse'
                  : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-700 text-zinc-300'
              }`}
              title="Record your own manual State, Intensity & Stinger pass and replay it"
            >
              <Circle className="w-3 h-3 fill-current" />
              {recordingPass ? 'Save Pass' : 'Record Pass'}
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
};
