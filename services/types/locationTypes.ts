// services/types/locationTypes.ts
import { LocationRarity, VisualStyleType } from './commonTypes';
import { Skill } from './characterTypes';
import { PotentialDiscovery } from './loreTypes';
import { UnexpectedEventDetails } from './eventTypes';

export interface LocationDetails {
  name: string;
  description: string;
  environmentTags: string[];
  visualPromptHint: string;
  validExits: string[];
  rarity: LocationRarity;
}

export interface FullLocationData extends LocationDetails {
  imageUrl: string;
}

export interface VisitedLocationEntry {
  location: FullLocationData;
  items: GameItem[] | null; // Forward declaration, defined in itemTypes
  npcs: GameNPC[] | null;   // Forward declaration, defined in npcTypes
}

export interface MovementContext {
  previousLocation: FullLocationData;
  direction: string;
  characterConcept: string;
  characterName: string;
  skills: Skill[];
  recentStorySummary?: string;
  gameSettingType: 'Fictional' | 'Historical';
  initialHistoricalContext: string | null;
  fictionalUniverseContext?: string | null;
  potentialDiscoveries?: PotentialDiscovery[];
  intendedLocationTypeHint?: string | null;
  visualStyle: VisualStyleType;
}

export interface NewLocationGenerationResult {
  newLocationDetails: LocationDetails;
  movementNarration: string;
  unexpectedEvent?: UnexpectedEventDetails;
}

// Forward declarations for types used in VisitedLocationEntry but defined elsewhere
import { GameItem } from './itemTypes';
import { GameNPC } from './npcTypes';
