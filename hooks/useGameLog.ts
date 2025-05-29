// hooks/useGameLog.ts
import { useState, useCallback } from 'react';
import { GameLogEntry } from '../services/gameTypes'; // Import from centralized types

export const useGameLog = () => {
  const [gameLog, setGameLog] = useState<GameLogEntry[]>([]);

  const addLogEntry = useCallback((type: GameLogEntry['type'], text: string, processedText?: string) => {
    setGameLog(prevLog => [
      ...prevLog,
      { id: crypto.randomUUID(), type, text, processedText, timestamp: new Date() }
    ]);
  }, []);

  return { gameLog, addLogEntry, setGameLog }; // Expose setGameLog for resetGameState
};
