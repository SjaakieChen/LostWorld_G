// components/GameLog.tsx

import React, { useRef, useEffect } from 'react';
import { GameLogEntry } from '../services/gameTypes'; 

interface GameLogProps {
  entries: GameLogEntry[];
}

// Utility to parse [lore] tags into styled spans
const parseLoreTags = (text: string): React.ReactNode[] => {
  const parts = [];
  let lastIndex = 0;
  const regex = /\[lore entity_type="([^"]*)" entity_name="([^"]*)"\](.*?)\[\/lore\]/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    const [fullMatch, entityType, entityName, content] = match;
    parts.push(
      <span 
        key={`${match.index}-${entityName}`} 
        className="text-yellow-400 hover:text-yellow-300 font-medium" // Lore highlight style
        title={`Lore: ${entityName} (${entityType})`}
      >
        {content}
      </span>
    );
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }
  return parts;
};


const GameLog: React.FC<GameLogProps> = ({ entries }) => {
  const scrollableLogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollableLogRef.current) {
      scrollableLogRef.current.scrollTop = scrollableLogRef.current.scrollHeight;
    }
  }, [entries]); 

  const getEntryStyle = (type: GameLogEntry['type']): string => {
    switch (type) {
      case 'command':
        return 'text-indigo-300 italic';
      case 'narration':
        return 'text-slate-300';
      case 'error':
        return 'text-red-400';
      case 'system':
        return 'text-sky-400';
      case 'game_event':
        return 'text-emerald-400';
      case 'combat': // Added combat style
        return 'text-orange-400 font-medium';
      default:
        return 'text-slate-400';
    }
  };

  const formatTime = (date: Date): string => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  return (
    <div 
        ref={scrollableLogRef}
        className="h-64 bg-slate-800/70 p-4 rounded-lg shadow-inner ring-1 ring-slate-700 overflow-y-auto space-y-2 scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-slate-700/50 overscroll-contain"
        aria-live="polite" 
        aria-atomic="false" 
        role="log" 
        aria-label="Game log and narrative"
    >
      {entries.length === 0 && (
        <p className="text-slate-500 italic text-center py-4">Your adventure begins here...</p>
      )}
      {entries.map((entry) => (
        <div key={entry.id} className={`text-sm ${getEntryStyle(entry.type)}`}>
          <span className="text-slate-500 mr-2 select-none" aria-hidden="true">[{formatTime(entry.timestamp)}]</span>
          {entry.type === 'command' && <span className="font-medium mr-1 select-none" aria-hidden="true">&gt;</span>}
          <span>
            {entry.processedText ? parseLoreTags(entry.processedText) : entry.text}
          </span>
        </div>
      ))}
    </div>
  );
};

export default GameLog;
