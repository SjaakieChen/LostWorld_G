// contexts/GameContext.tsx
import React, { createContext, useState, useContext, useCallback, ReactNode } from 'react';
import {
  CharacterData, FullLocationData, GameItem, GameNPC, GameLogEntry, Skill,
  MemorableEntity, MajorPlotPoint, MemorableEntityType, MemorableEntityRarity,
  EventEffects, PlayerInitiatedActionEventDetails, PotentialDiscovery,
  GameDirectorDirective // Added GameDirectorDirective
} from '../services/gameTypes';
import { useGameLog as useGameLogHook } from '../hooks/useGameLog';
import { useMemorySystem, UseMemorySystemReturn } from '../hooks/useMemorySystem';
import { useCharacterSystem, UseCharacterSystemReturn } from '../hooks/useCharacterSystem';
import { useGameSession, UseGameSessionReturn } from '../hooks/useGameSession';
import { useEventSystem, UseEventSystemDeps } from '../hooks/useEventSystem';
// Removed: useGameDirector import from here, will be used internally by GameProvider

export interface Coordinates {
  x: number;
  y: number;
}
export interface VisitedLocationEntry {
  location: FullLocationData;
  items: GameItem[] | null;
  npcs: GameNPC[] | null;
}

interface GameContextState extends UseMemorySystemReturn, UseCharacterSystemReturn, Omit<UseGameSessionReturn,
  never
> {
  gameLog: GameLogEntry[];
  addLogEntry: (type: GameLogEntry['type'], text: string, processedText?: string) => void;
  setGameLog: React.Dispatch<React.SetStateAction<GameLogEntry[]>>;

  _consumeEnergy: (amount: number, relevantSkillName?: string) => void;
  _gainSkillExperience: (skillName: string, amount: number) => void;

  attemptToTriggerUnexpectedEvent: (triggerContext: string) => Promise<void>;
  handlePlayerInitiatedSignificantAction: (actionDetails: PlayerInitiatedActionEventDetails) => Promise<void>;
  applyEventEffects: (effects: EventEffects) => Promise<void>;

  addMemorableEntity: (
    entityId: string, name: string, type: MemorableEntityType, rarity: MemorableEntityRarity,
    descriptionHint: string, firstEncounteredContext: string
  ) => void;
  addMajorPlotPoint: (
    summary: string, involvedEntityIds?: string[], locationName?: string
  ) => void;
  clearMemorySystem: () => void;
  addPotentialDiscovery: (
    discoveryData: Omit<PotentialDiscovery, 'id' | 'status' | 'firstMentionedTimestamp' | 'firstMentionedLocationKey' | 'fulfilledById'>,
    baseId: string,
    locationKey: string
  ) => Promise<void>;
  markPotentialDiscoveryFound: (id: string, actualGeneratedEntityId?: string) => void;

  isEventActive: boolean;
  setIsEventActive: React.Dispatch<React.SetStateAction<boolean>>;
  currentEventImageUrl: string | null;
  setCurrentEventImageUrl: React.Dispatch<React.SetStateAction<string | null>>;
  currentEventDetails: EventEffects | null;
  setCurrentEventDetails: React.Dispatch<React.SetStateAction<EventEffects | null>>;

  setItemToViewInModal: React.Dispatch<React.SetStateAction<GameItem | null>>;
  setNpcToViewInModal: React.Dispatch<React.SetStateAction<GameNPC | null>>;
  setLocationToViewInModal: React.Dispatch<React.SetStateAction<FullLocationData | null>>;
  setSelectedLocationCoordinateKeyForModal: React.Dispatch<React.SetStateAction<string | null>>;

  // Game Director State
  currentDirectives: GameDirectorDirective | null;
  setCurrentDirectives: React.Dispatch<React.SetStateAction<GameDirectorDirective | null>>;
  triggerGameDirectorAnalysis: (forceAnalysis?: boolean) => Promise<void>; // Expose trigger for manual calls
  playerCommandCount: number; // Track player commands
  incrementPlayerCommandCount: () => void; // To increment command count
}

const GameContext = createContext<GameContextState | undefined>(undefined);

export const GameProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { gameLog, addLogEntry: addLogEntryHook, setGameLog } = useGameLogHook();
  const memorySystem = useMemorySystem();
  const characterSystem = useCharacterSystem();
  const gameSession = useGameSession();

  const [itemToViewInModal, setItemToViewInModal] = useState<GameItem | null>(null);
  const [npcToViewInModal, setNpcToViewInModal] = useState<GameNPC | null>(null);
  const [locationToViewInModal, setLocationToViewInModal] = useState<FullLocationData | null>(null);
  const [selectedLocationCoordinateKeyForModal, setSelectedLocationCoordinateKeyForModal] = useState<string | null>(null);

  const [isEventActive, setIsEventActive] = useState<boolean>(false);
  const [currentEventImageUrl, setCurrentEventImageUrl] = useState<string | null>(null);
  const [currentEventDetails, setCurrentEventDetails] = useState<EventEffects | null>(null);

  // Game Director State
  const [currentDirectives, setCurrentDirectives] = useState<GameDirectorDirective | null>(null);
  const [playerCommandCount, setPlayerCommandCount] = useState<number>(0);

  const incrementPlayerCommandCount = useCallback(() => {
    setPlayerCommandCount(prev => prev + 1);
  }, []);

  // --- Internal setup for useGameDirector hook ---
  // This is a conceptual placement. `useGameDirector` itself needs access to the full context.
  // So, we define its core logic (trigger function) here and pass it, or restructure `useGameDirector`
  // to be initialized with a `getGameContext` function or by being a direct part of GameProvider.
  // For simplicity in this step, we'll make `triggerGameDirectorAnalysis` available via context.
  // Actual `useGameDirector` hook's state like `lastAnalysisTimestamp` would be managed by it.
  // The hook itself would likely be instantiated within `AppContent` or similar, or `GameProvider` directly.

  // Placeholder for actual useGameDirector trigger - real one will be more complex
  const internalTriggerGameDirectorAnalysis = useCallback(async (forceAnalysis: boolean = false) => {
    // This is where the actual call to `analyzeAndSuggestGameDirectives` would happen,
    // managed by the `useGameDirector` hook's logic (checking intervals, etc.).
    // For now, it's a placeholder. The real `useGameDirector` hook will be set up
    // to be callable and to update `currentDirectives`.
    console.log(`GameContext: Placeholder for triggerGameDirectorAnalysis (force: ${forceAnalysis}) called. Command count: ${playerCommandCount}`);
    // In a full setup, this would call a function from an instantiated `useGameDirector` hook.
  }, [playerCommandCount]);


  const addLogEntry = useCallback((type: GameLogEntry['type'], text: string, processedText?: string) => {
    addLogEntryHook(type, text, processedText);
  }, [addLogEntryHook]);

  const _consumeEnergy = useCallback((amount: number, relevantSkillName?: string) => {
    const { wasDefeated } = characterSystem.consumeEnergyLogic(amount, addLogEntry, relevantSkillName);
    if (wasDefeated) {
      // Defeat message now handled by consumeEnergyLogic if it needs to addLogEntry directly or handled by caller
    }
  }, [characterSystem.consumeEnergyLogic, addLogEntry]);

  const _gainSkillExperience = useCallback((skillName: string, amount: number) => {
    const oldLevel = characterSystem.characterData?.skills.find(s => s.name === skillName)?.level;
    characterSystem.gainSkillExperienceLogic(skillName, amount, addLogEntry);
    const newCharData = characterSystem.characterData;
    const newLevel = newCharData?.skills.find(s => s.name === skillName)?.level;
    if (amount > 0) addLogEntry('system', `Gained ${amount}XP in ${skillName}.`);
    if (oldLevel !== undefined && newLevel !== undefined && newLevel > oldLevel) {
        if (newLevel === 1 && oldLevel === 0) addLogEntry('game_event', `You learned ${skillName} (Level ${newLevel})!`);
        else addLogEntry('game_event', `${skillName} increased to Level ${newLevel}!`);
    }
  }, [characterSystem.gainSkillExperienceLogic, characterSystem.characterData, addLogEntry]);

  const addMemorableEntity = useCallback((
    entityId: string, name: string, type: MemorableEntityType, rarity: MemorableEntityRarity,
    descriptionHint: string, firstEncounteredContext: string
  ) => {
    const { entityAddedOrUpdated, newEntity } = memorySystem.addMemorableEntityLogic(entityId, name, type, rarity, descriptionHint, firstEncounteredContext);
    if (entityAddedOrUpdated && newEntity && newEntity.type !== 'lore_hint') {
      addLogEntry('system', `Key entity noted: ${newEntity.name} (${newEntity.type}, ${newEntity.rarity}).`);
    }
  }, [memorySystem.addMemorableEntityLogic, addLogEntry]);

  const addMajorPlotPoint = useCallback((
    summary: string, involvedEntityIds?: string[], locationName?: string
  ) => {
    const { plotPointAdded, newPlotPoint } = memorySystem.addMajorPlotPointLogic(summary, involvedEntityIds, locationName);
    if (plotPointAdded && newPlotPoint) {
      addLogEntry('game_event', `PLOT UPDATE: ${newPlotPoint.summary}`);
      // Consider triggering Game Director analysis after major plot points
      // internalTriggerGameDirectorAnalysis(true); // force analysis
    }
  }, [memorySystem.addMajorPlotPointLogic, addLogEntry /*, internalTriggerGameDirectorAnalysis*/]);

  const addPotentialDiscovery = useCallback(async (
    discoveryData: Omit<PotentialDiscovery, 'id' | 'status' | 'firstMentionedTimestamp' | 'firstMentionedLocationKey' | 'fulfilledById'>,
    baseId: string,
    locationKey: string
  ): Promise<void> => {
    const { newDiscovery, duplicatePrevented, preConfirmedLead } = await memorySystem.addPotentialDiscoveryLogic(
        discoveryData, baseId, locationKey, memorySystem.getMemoryContextString, memorySystem.memorableEntities
    );
    if (preConfirmedLead) {
        addLogEntry('system', `Hint for '${preConfirmedLead.name}' already known and confirmed.`);
    } else if (newDiscovery) {
      addLogEntry('system', `Lore hint: Heard of a ${newDiscovery.type} named '${newDiscovery.name}'.`);
    } else if (duplicatePrevented) {
      addLogEntry('system', `A similar hint about '${discoveryData.name}' already exists.`);
    }
  }, [memorySystem.addPotentialDiscoveryLogic, memorySystem.getMemoryContextString, memorySystem.memorableEntities, addLogEntry]);

  const markPotentialDiscoveryFound = useCallback((id: string, actualGeneratedEntityId?: string) => {
    const { updatedDiscovery } = memorySystem.markPotentialDiscoveryFoundLogic(id, actualGeneratedEntityId);
    if (updatedDiscovery) {
      addLogEntry('game_event', `Discovered: ${updatedDiscovery.name} (previously hinted at)!`);
    }
  }, [memorySystem.markPotentialDiscoveryFoundLogic, addLogEntry]);

  const clearMemorySystem = useCallback(() => {
    memorySystem.clearMemorySystemLogic();
    addLogEntry('system', "Memory systems cleared for new game.");
  }, [memorySystem.clearMemorySystemLogic, addLogEntry]);

  const eventSystemDeps: UseEventSystemDeps = {
    characterData: characterSystem.characterData,
    locationData: gameSession.locationData,
    playerInventory: gameSession.playerInventory,
    gameLog: gameLog,
    currentCoordinates: gameSession.currentCoordinates,
    talkingToNPC: gameSession.talkingToNPC,
    locationNPCs: gameSession.locationNPCs,
    potentialDiscoveries: memorySystem.potentialDiscoveries,
    isGeneratingEvent: gameSession.isGeneratingEvent,
    lastEventTimestamp: gameSession.lastEventTimestamp,

    setCharacterData: characterSystem.setCharacterData,
    setLocationData: gameSession.setLocationData,
    setPlayerInventory: gameSession.setPlayerInventory,
    setVisitedLocations: gameSession.setVisitedLocations,
    setLocationItems: gameSession.setLocationItems,
    setLocationNPCs: gameSession.setLocationNPCs,
    setTalkingToNPC: gameSession.setTalkingToNPC,
    setIsGeneratingEvent: gameSession.setIsGeneratingEvent,
    setEventLoadingMessage: gameSession.setEventLoadingMessage,
    setLastEventTimestamp: gameSession.setLastEventTimestamp,

    addLogEntry,
    gainSkillExperienceLogic: characterSystem.gainSkillExperienceLogic,
    addMajorPlotPointLogic: memorySystem.addMajorPlotPointLogic,
    addMemorableEntityLogic: memorySystem.addMemorableEntityLogic,
    getMemoryContextString: memorySystem.getMemoryContextString,
    markPotentialDiscoveryFoundLogic: memorySystem.markPotentialDiscoveryFoundLogic,
    consumeEnergyLogic: characterSystem.consumeEnergyLogic,
    addPotentialDiscovery,

    isEventActive,
    setIsEventActive,
    currentEventImageUrl,
    setCurrentEventImageUrl,
    currentEventDetails,
    setCurrentEventDetails,
    // Game Director context for event service
    currentDirectives,
  };

  const {
    applyEventEffects,
    attemptToTriggerUnexpectedEvent,
    handlePlayerInitiatedSignificantAction,
  } = useEventSystem(eventSystemDeps);


  const contextValue: GameContextState = {
    ...memorySystem,
    ...characterSystem,
    ...gameSession,
    gameLog, addLogEntry, setGameLog,
    addMemorableEntity,
    addMajorPlotPoint,
    addPotentialDiscovery,
    markPotentialDiscoveryFound,
    clearMemorySystem,
    _consumeEnergy,
    _gainSkillExperience,
    applyEventEffects,
    attemptToTriggerUnexpectedEvent,
    handlePlayerInitiatedSignificantAction,
    isEventActive,
    setIsEventActive,
    currentEventImageUrl,
    setCurrentEventImageUrl,
    currentEventDetails,
    setCurrentEventDetails,
    setItemToViewInModal,
    setNpcToViewInModal,
    setLocationToViewInModal,
    setSelectedLocationCoordinateKeyForModal,
    // Game Director
    currentDirectives,
    setCurrentDirectives,
    triggerGameDirectorAnalysis: internalTriggerGameDirectorAnalysis, // Provide the trigger
    playerCommandCount,
    incrementPlayerCommandCount,
  };

  return <GameContext.Provider value={contextValue}>{children}</GameContext.Provider>;
};

export const useGameContext = () => {
  const context = useContext(GameContext);
  if (context === undefined) {
    throw new Error('useGameContext must be used within a GameProvider');
  }
  return context;
};
