// components/InteractiveConsole.tsx
import React from 'react';
import PlayerCommandInput from './PlayerCommandInput';
import GameLog from './GameLog';
import { GameNPC, GameLogEntry, EventEffects } from '../services/gameTypes';
import Spinner from './Spinner'; 
import { useGameContext } from '../contexts/GameContext'; 

interface InteractiveConsoleProps {
  gameStarted: boolean;
  talkingToNPC: GameNPC | null;
  handleEndConversation: () => void;
  processPlayerCommand: (command: string) => void;
  isProcessing: boolean; 
  gameLog: GameLogEntry[];
  isConsoleMinimized: boolean; 
  onToggleMinimize: () => void;  
}

const InteractiveConsole: React.FC<InteractiveConsoleProps> = ({
  gameStarted,
  talkingToNPC,
  handleEndConversation,
  processPlayerCommand,
  isProcessing, 
  gameLog,
  isConsoleMinimized,
  onToggleMinimize,
}) => {
  const { isEventActive, currentEventDetails, currentDirectives } = useGameContext(); 

  if (!gameStarted) {
    return null;
  }

  let contextLabel = "Context: World Interaction";
  let contextColor = "text-indigo-400";

  if (isEventActive && currentEventDetails?.requiresPlayerActionToResolve) {
    contextLabel = `Context: Event - ${currentEventDetails.eventTitle || 'Active Event'}`;
    contextColor = "text-purple-400";
  } else if (talkingToNPC) {
    contextLabel = `Context: Talking to ${talkingToNPC.name}`;
    contextColor = "text-sky-400";
  }
  
  const directorReasoning = currentDirectives?.reasoning || "Game Director's current strategic focus.";
  const directorFocusText = currentDirectives 
    ? `${currentDirectives.currentGameFocus}${currentDirectives.currentGameFocus === 'CustomScenario' && currentDirectives.gameplayParameterSuggestions.customFocusDescription ? ` (${currentDirectives.gameplayParameterSuggestions.customFocusDescription.substring(0, 30)}...)` : ''}`
    : "No specific focus";

  return (
    <section
      aria-labelledby="interactive-console-heading"
      className="w-full mt-auto sticky bottom-0 py-3 md:py-4 pointer-events-none z-30" 
    >
      <div className="p-3 md:p-4 w-full max-w-7xl mx-auto bg-slate-800 rounded-lg shadow-2xl ring-1 ring-slate-600/70 pointer-events-auto relative"> 
        <button
          onClick={onToggleMinimize}
          className="absolute top-2 right-2 z-40 p-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-slate-100 rounded-md transition-colors"
          aria-label={isConsoleMinimized ? "Show console" : "Hide console"}
          aria-expanded={!isConsoleMinimized}
          title={isConsoleMinimized ? "Show console" : "Hide console"}
        >
          {isConsoleMinimized ? (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" /> 
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /> 
            </svg>
          )}
        </button>
        
        <h2 id="interactive-console-heading" className="text-xl font-semibold mb-1 text-indigo-300 sr-only">Console</h2>
        
        {!isConsoleMinimized && (
          <>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mb-2 items-center text-xs">
              {talkingToNPC && (!isEventActive || !currentEventDetails?.requiresPlayerActionToResolve) && ( 
                  <button
                      onClick={handleEndConversation} 
                      disabled={isProcessing} 
                      className="bg-orange-600 hover:bg-orange-500 text-white font-semibold py-1.5 px-3 rounded-md transition-colors duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-orange-400 focus:ring-opacity-75 disabled:opacity-50 disabled:cursor-not-allowed"
                      aria-label={`End conversation with ${talkingToNPC.name}`}
                  >
                      End Conversation
                  </button>
              )}
               {currentDirectives && (
                <div 
                  className="font-medium px-2 py-1 rounded-md text-purple-300 bg-slate-700/50" 
                  title={directorReasoning}
                  aria-label={`Game Director Focus: ${directorFocusText}. Reasoning: ${directorReasoning}`}
                >
                  Director Focus: <span className="font-semibold">{directorFocusText}</span>
                </div>
              )}
               <div className={`font-medium px-2 py-1 rounded-md ${contextColor} bg-slate-700/50 ml-auto`}>
                {contextLabel}
              </div>
            </div>

            <PlayerCommandInput
              onSubmit={processPlayerCommand} 
              isProcessing={isProcessing} 
            />
            <div className="mt-3">
              <GameLog entries={gameLog} />
            </div>
          </>
        )}
        {isConsoleMinimized && (
             <div className="text-sm text-center text-slate-400 py-2 h-10 flex items-center justify-center gap-x-3"> 
                <span>Console Minimized.</span>
                {currentDirectives && (
                  <span 
                    className="text-xs text-purple-300" 
                    title={directorReasoning}
                    aria-label={`Current Game Director Focus: ${directorFocusText}. Reasoning: ${directorReasoning}`}
                  >
                    (Focus: {directorFocusText})
                  </span>
                )}
                <span className={`text-xs ${contextColor}`}>
                  (Context: {contextLabel.split(': ')[1]})
                </span>
            </div>
        )}
      </div>
    </section>
  );
};

export default InteractiveConsole;
