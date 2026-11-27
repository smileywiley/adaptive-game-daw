import React from 'react';
import { TransportBar } from './components/TransportBar';
import { StemSidebar } from './components/StemSidebar';
import { SectionTabsBar } from './components/SectionTabsBar';
import { PianoRollToolbar } from './components/PianoRollToolbar';
import { TheoryCoachBar } from './components/TheoryCoachBar';
import { PianoRollCanvas } from './components/PianoRollCanvas';
import { GameSimulatorPanel } from './components/GameSimulatorPanel';
import { InputDock } from './components/InputDock';
import { MoodPresetModal } from './components/MoodPresetModal';
import { useQwertyInput } from './hooks/useQwertyInput';
import { useMidiInput } from './hooks/useMidiInput';

export const App: React.FC = () => {
  // Mount hardware-free QWERTY controller & Mini USB MIDI keyboard listener
  useQwertyInput();
  useMidiInput();

  return (
    <div className="h-screen w-screen flex flex-col bg-zinc-950 text-zinc-100 overflow-hidden">
      <TransportBar />

      <div className="flex-1 flex min-h-0 overflow-hidden">
        <StemSidebar />

        <main className="flex-1 flex flex-col min-w-0 min-h-0">
          <SectionTabsBar />
          <PianoRollToolbar />
          <TheoryCoachBar />
          <PianoRollCanvas />
        </main>

        <GameSimulatorPanel />
      </div>

      <InputDock />
      <MoodPresetModal />
    </div>
  );
};

export default App;
