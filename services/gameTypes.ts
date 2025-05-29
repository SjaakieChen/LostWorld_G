// services/gameTypes.ts
export * from './types/commonTypes';
export * from './types/characterTypes';
export * from './types/itemTypes';
export * from './types/locationTypes';
export * from './types/npcTypes';
export * from './types/commandTypes';
export * from './types/eventTypes';
export * from './types/loreTypes';

// --- Game Director AI Types ---
export type GameFocusType =
  | 'SurvivalHorror'
  | 'DetectiveMystery'
  | 'HighStakesCombat'
  | 'SocialIntrigue'
  | 'ExplorationAdventure'
  | 'ResourceManagement'
  | 'PuzzleSolving'
  | 'SportsMatchFocus'
  | 'PoliticalIntrigue'
  | 'StealthOperations'
  | 'HumorousAdventure'
  | 'PhilosophicalDebate'
  | 'RomanticPursuit'
  | 'TragedyUnfolding'
  | 'PersonalGrowthJourney'
  | 'FactionConflict'
  | 'BaseBuildingDefense'
  | 'NoSpecificFocus' // When gameplay is very generic or transitional
  | 'CustomScenario';

export type TargetSystemType =
  | 'EventGeneration'
  | 'NPCInteraction'
  | 'CombatResolution'
  | 'LocationDescription'
  | 'ItemGeneration'
  | 'PlayerVitals'
  | 'GameLogNarration'
  | 'WorldProgression'; // For broader, long-term suggestions

export interface PromptEnhancementSuggestion {
  targetSystem: TargetSystemType;
  suggestion: string;
  priority?: 'low' | 'medium' | 'high';
}

export interface GameplayParameterSuggestions {
  focusOnResourceScarcity?: boolean;
  adjustEnergyDecayRate?: 'normal' | 'increased' | 'decreased' | 'none';
  adjustHealthRegenRate?: 'normal' | 'slowed' | 'none' | 'event_driven';
  preferredEventType?: GameFocusType | 'balanced' | null;
  increaseNarrativeLengthForScenario?: GameFocusType | string | null; // e.g., "SportsMatchFocus"
  triggerChanceModifierForGoodEvents?: number; // e.g., 1.2 for 20% increase, 0.8 for 20% decrease
  triggerChanceModifierForBadEvents?: number;
  npcDispositionVolatility?: 'low' | 'medium' | 'high'; // How quickly NPCs change minds
  customFocusDescription?: string | null;
  attentionToDetailLevel?: 'low' | 'medium' | 'high'; // For perception, examination
  dialogueStyle?: 'concise' | 'descriptive' | 'action_oriented' | 'introspective';
  pacing?: 'fast' | 'medium' | 'slow';
}

export interface GameDirectorDirective {
  directiveId: string;
  timestamp: number;
  analyzedCommandCount: number;
  lastGameLogEntryIdAnalyzed: string; // To track up to what point the analysis was done
  currentGameFocus: GameFocusType;
  promptEnhancements: PromptEnhancementSuggestion[];
  gameplayParameterSuggestions: GameplayParameterSuggestions;
  reasoning?: string;
}