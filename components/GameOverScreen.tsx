
// components/GameOverScreen.tsx
import React from 'react';
import { CharacterData, GameLogEntry } from '../services/gameTypes';
import AppFooter from './AppFooter'; // Assuming AppFooter is relatively simple and can be included

interface GameOverScreenProps {
  characterData: CharacterData;
  gameLog: GameLogEntry[];
  onTryAgain: () => void;
}

const GameOverScreen: React.FC<GameOverScreenProps> = ({ characterData, gameLog, onTryAgain }) => {
  const imageRenderingStyle: React.CSSProperties = {
    imageRendering: characterData.visualStyle === 'Pixel Art' ? 'pixelated' : 'auto',
  };

  return (
    <div className="min-h-screen bg-slate-900 text-red-400 flex flex-col items-center justify-center p-8">
      <h1 className="text-6xl font-bold mb-4">GAME OVER</h1>
      <p className="text-2xl mb-8 text-slate-300">
        {characterData.characterName} - {characterData.characterConcept} has fallen.
      </p>
      <img
        src={characterData.characterImageUrl || ''}
        alt="Defeated Character"
        className="w-48 h-48 object-contain rounded-lg mb-8 opacity-70 grayscale"
        style={imageRenderingStyle} // Apply dynamic style
      />
      <div className="mb-6 max-h-60 overflow-y-auto p-4 bg-slate-800 rounded-md w-full max-w-2xl scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-slate-700/50">
        <h2 className="text-xl text-slate-200 mb-2 text-center">Final Log Entries:</h2>
        {gameLog.slice(-10).map(entry => (
          <div
            key={entry.id}
            className={`text-sm ${
              entry.type === 'error' ? 'text-red-400' :
              entry.type === 'game_event' ? 'text-emerald-400' :
              entry.type === 'combat' ? 'text-orange-400' :
              entry.type === 'system' ? 'text-sky-400' :
              'text-slate-400'
            } mb-1`}
          >
            <span className="text-slate-500 mr-2">[{new Date(entry.timestamp).toLocaleTimeString()}]</span>
            {entry.text}
          </div>
        ))}
      </div>
      <button
        onClick={onTryAgain}
        className="bg-sky-600 hover:bg-sky-500 text-white font-bold py-3 px-8 rounded-lg text-xl transition-colors"
        aria-label="Start a new game"
      >
        Try Again?
      </button>
      <AppFooter />
    </div>
  );
};

export default GameOverScreen;
