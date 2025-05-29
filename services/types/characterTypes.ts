// services/types/characterTypes.ts
import { GameItem } from './itemTypes';
import { MemorableEntityRarity, VisualStyleType } from './commonTypes';

export interface Skill {
  id: string;
  name: string;
  level: number;
  description: string;
  experience: number;
  experienceToNextLevel: number;
}

export interface Limb {
  id: string;
  name: string;
  status: string;
  health: number;
  equippedItems?: GameItem[];
}

export interface CharacterData {
  characterName: string;
  characterConcept: string;
  overallHealth: number;
  currentEnergy: number;
  maxEnergy: number;
  isDefeated: boolean;
  limbs: Limb[];
  skills: Skill[];
  characterImageUrl: string | null;
  gameSettingType: 'Fictional' | 'Historical';
  initialHistoricalContext: string | null;
  characterRarity: MemorableEntityRarity;
  fictionalUniverseContext?: string | null;
  visualStyle: VisualStyleType;
}
