
import React from 'react';
import Alert from './Alert';
import { useGameContext } from '../contexts/GameContext'; // Import useGameContext

interface AppHeaderProps {
  isLoading: boolean;
  loadingMessage: string | null;
  currentPhaseTitle: string;
  apiKeyMissing: boolean;
  isGeneratingEvent?: boolean; 
  eventLoadingMessage?: string | null; 
}

const AppHeader: React.FC<AppHeaderProps> = ({ 
  isLoading, 
  loadingMessage, 
  currentPhaseTitle, 
  apiKeyMissing,
  isGeneratingEvent,
  eventLoadingMessage
}) => {
  // Event state is no longer used directly in AppHeader for image display
  // const { isEventActive, currentEventImageUrl, currentEventDetails } = useGameContext(); 

  let displayMessage = currentPhaseTitle;
  // Prioritize event generation message or global loading message
  if (isGeneratingEvent && eventLoadingMessage) {
    displayMessage = eventLoadingMessage;
  } else if (isLoading && loadingMessage) {
    displayMessage = loadingMessage;
  }


  return (
    <div className="w-full bg-slate-900/80 border-b border-slate-700/60 shadow-md relative">
      <div className="p-4 w-full max-w-7xl mx-auto">
        <header className="text-center">
          <h1 className="text-4xl font-bold text-sky-400 tracking-tight">LostWorld</h1>
          <p className={`text-xl text-slate-400 mt-2 min-h-[1.75rem] ${isGeneratingEvent ? 'italic text-purple-300' : (isLoading ? 'italic text-sky-300' : '')}`}>
            {displayMessage}
          </p>
        </header>
        {apiKeyMissing && (
          <div className="w-full max-w-xl mt-4 mb-2 mx-auto">
              <Alert type="error" message="API_KEY is not set. Please configure the API_KEY environment variable for the application to work." />
          </div>
        )}
      </div>
      {/* Event image display has been removed from here. It's handled by LocationImagePanel. */}
       <style>{`.pixelated-render { image-rendering: pixelated; image-rendering: -moz-crisp-edges; image-rendering: crisp-edges; }`}</style>
    </div>
  );
};

export default AppHeader;
