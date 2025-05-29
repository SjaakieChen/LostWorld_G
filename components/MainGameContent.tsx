// components/MainGameContent.tsx
import React from 'react'; // Removed useState, useEffect as form state moved
import Spinner from './Spinner';
import Alert from './Alert';
import GameInterface, { GameInterfaceProps } from './GameInterface';
import { CharacterData, FullLocationData, VisualStyleType } from '../services/gameTypes';
import NewGameForm from './NewGameForm'; // Import the new form component

interface MainGameContentProps {
  isGlobalBlockingLoad: boolean;
  loadingMessage: string | null;
  error: string | null;
  gameStarted: boolean;
  apiKeyMissing: boolean;
  characterData: CharacterData | null; 
  locationData: FullLocationData | null;
  gameInterfaceProps: GameInterfaceProps;
  // Props for custom start form - these are now passed to NewGameForm
  handleStartNewGame: () => void; // For quick start
  handleCustomStartGame: (settingType: 'Fictional' | 'Historical', userIdea: string, visualStyle: VisualStyleType) => void; // For custom start
}

const MainGameContent: React.FC<MainGameContentProps> = ({
  isGlobalBlockingLoad,
  loadingMessage,
  error,
  gameStarted,
  apiKeyMissing,
  characterData,
  locationData,
  gameInterfaceProps,
  handleStartNewGame,     // Prop for quick start
  handleCustomStartGame,  // Prop for custom start
}) => {

  // Removed: local state for form (settingType, userWorldAndCharacterIdea, visualStyle)
  // Removed: useEffect for placeholderText

  if (isGlobalBlockingLoad) {
    return (
      <div className="p-4 w-full max-w-7xl mx-auto mt-8 md:mt-12">
        <main>
          <div className="flex flex-col items-center justify-center p-10 bg-slate-800/70 rounded-lg shadow-xl">
            <Spinner className="w-16 h-16 text-sky-500" />
            <p className="mt-4 text-lg text-slate-300">{loadingMessage || "Loading..."}</p>
          </div>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 w-full max-w-7xl mx-auto mt-8 md:mt-12">
        <main>
          <div className="mb-6">
            <Alert type="error" message={error} />
            {!gameStarted && !apiKeyMissing && (
                <button
                    onClick={handleStartNewGame} 
                    className="mt-6 w-full bg-red-600 hover:bg-red-500 text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-opacity-75 flex items-center justify-center"
                    aria-label="Retry starting a new game"
                  >
                    Try Again
                </button>
            )}
          </div>
        </main>
      </div>
    );
  }

  if (!gameStarted) {
    return (
      <div className="p-4 w-full max-w-2xl mx-auto mt-8 md:mt-12">
        <main>
          <div className="bg-slate-800/70 shadow-2xl rounded-lg p-6 md:p-8 ring-1 ring-slate-700">
            <h2 className="text-3xl font-semibold mb-6 text-sky-300 text-center">Create Your World</h2>
            <NewGameForm 
              onCustomStart={handleCustomStartGame}
              onQuickStart={handleStartNewGame}
              isLoading={isGlobalBlockingLoad}
              apiKeyMissing={apiKeyMissing}
            />
             {apiKeyMissing && ( // Keep API key warning if relevant for the form too
                <Alert type="warning" message="API Key is missing. Game generation might not work." className="mt-6" />
            )}
          </div>
        </main>
      </div>
    );
  }

  if (characterData && locationData) {
    return (
      <section className="w-full bg-slate-800 py-4 md:py-6 px-4 sm:px-6 lg:px-8">
        <GameInterface {...gameInterfaceProps} />
      </section>
    );
  }

  return (
     <div className="p-4 w-full max-w-7xl mx-auto mt-8 md:mt-12">
        <main>
            <div className="flex flex-col items-center justify-center p-10 bg-slate-800/70 rounded-lg shadow-xl">
                <Spinner className="w-16 h-16 text-sky-500" />
                <p className="mt-4 text-lg text-slate-300">Preparing game world...</p>
            </div>
        </main>
    </div>
  );
};

export default MainGameContent;
