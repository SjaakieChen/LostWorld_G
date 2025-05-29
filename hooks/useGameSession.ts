
// hooks/useGameSession.ts
import { useState, useCallback } from 'react';
import {
  FullLocationData,
  GameItem,
  GameNPC,
// Corrected import path for Coordinates and VisitedLocationEntry
} from '../services/gameTypes';
import { Coordinates, VisitedLocationEntry } from '../contexts/GameContext';

export interface UseGameSessionReturn {
  gameStarted: boolean;
  setGameStarted: React.Dispatch<React.SetStateAction<boolean>>;
  locationData: FullLocationData | null;
  setLocationData: React.Dispatch<React.SetStateAction<FullLocationData | null>>;
  playerInventory: GameItem[];
  setPlayerInventory: React.Dispatch<React.SetStateAction<GameItem[]>>;
  currentCoordinates: Coordinates;
  setCurrentCoordinates: React.Dispatch<React.SetStateAction<Coordinates>>;
  visitedLocations: Map<string, VisitedLocationEntry>;
  setVisitedLocations: React.Dispatch<React.SetStateAction<Map<string, VisitedLocationEntry>>>;

  isLoading: boolean;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  loadingMessage: string;
  setLoadingMessage: React.Dispatch<React.SetStateAction<string>>;
  isConsoleBusy: boolean;
  setIsConsoleBusy: React.Dispatch<React.SetStateAction<boolean>>;
  error: string | null;
  setError: React.Dispatch<React.SetStateAction<string | null>>;

  locationItems: GameItem[] | null;
  setLocationItems: React.Dispatch<React.SetStateAction<GameItem[] | null>>;
  locationNPCs: GameNPC[] | null;
  setLocationNPCs: React.Dispatch<React.SetStateAction<GameNPC[] | null>>;
  talkingToNPC: GameNPC | null;
  setTalkingToNPC: React.Dispatch<React.SetStateAction<GameNPC | null>>;

  isGeneratingEvent: boolean;
  setIsGeneratingEvent: React.Dispatch<React.SetStateAction<boolean>>;
  eventLoadingMessage: string | null;
  setEventLoadingMessage: React.Dispatch<React.SetStateAction<string | null>>;
  lastEventTimestamp: number | null;
  setLastEventTimestamp: React.Dispatch<React.SetStateAction<number | null>>;

  elaboratingEntityIds: ReadonlySet<string>;
  addElaboratingEntityId: (entityId: string) => void;
  removeElaboratingEntityId: (entityId: string) => void;

  // Modal States & Handlers are REMOVED from here
}

export const useGameSession = (): UseGameSessionReturn => {
  const [gameStarted, setGameStarted] = useState<boolean>(false);
  const [locationData, setLocationData] = useState<FullLocationData | null>(null);
  const [playerInventory, setPlayerInventory] = useState<GameItem[]>([]);
  const [currentCoordinates, setCurrentCoordinates] = useState<Coordinates>({ x: 0, y: 0 });
  const [visitedLocations, setVisitedLocations] = useState<Map<string, VisitedLocationEntry>>(new Map());

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingMessage, setLoadingMessage] = useState<string>('');
  const [isConsoleBusy, setIsConsoleBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [locationItems, setLocationItems] = useState<GameItem[] | null>(null);
  const [locationNPCs, setLocationNPCs] = useState<GameNPC[] | null>(null);
  const [talkingToNPC, setTalkingToNPC] = useState<GameNPC | null>(null);

  const [isGeneratingEvent, setIsGeneratingEvent] = useState<boolean>(false);
  const [eventLoadingMessage, setEventLoadingMessage] = useState<string | null>(null);
  const [lastEventTimestamp, setLastEventTimestamp] = useState<number | null>(null);

  const [elaboratingEntityIdsInternal, setElaboratingEntityIdsInternal] = useState<Set<string>>(new Set());

  // Modal States & Handlers are REMOVED from here

  const addElaboratingEntityId = useCallback((entityId: string) => {
    setElaboratingEntityIdsInternal(prev => new Set(prev).add(entityId));
  }, []);

  const removeElaboratingEntityId = useCallback((entityId: string) => {
    setElaboratingEntityIdsInternal(prev => {
      const newSet = new Set(prev);
      newSet.delete(entityId);
      return newSet;
    });
  }, []);

  return {
    gameStarted, setGameStarted,
    locationData, setLocationData,
    playerInventory, setPlayerInventory,
    currentCoordinates, setCurrentCoordinates,
    visitedLocations, setVisitedLocations,
    isLoading, setIsLoading,
    loadingMessage, setLoadingMessage,
    isConsoleBusy, setIsConsoleBusy,
    error, setError,
    locationItems, setLocationItems,
    locationNPCs, setLocationNPCs,
    talkingToNPC, setTalkingToNPC,
    isGeneratingEvent, setIsGeneratingEvent,
    eventLoadingMessage, setEventLoadingMessage,
    lastEventTimestamp, setLastEventTimestamp,
    elaboratingEntityIds: elaboratingEntityIdsInternal,
    addElaboratingEntityId,
    removeElaboratingEntityId,

    // Modal state and handlers are REMOVED from here
  };
};
