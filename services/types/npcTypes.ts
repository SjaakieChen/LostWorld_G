// services/types/npcTypes.ts
import { NPCRarity, ItemRarity } from './commonTypes'; // Correctly import ItemRarity from commonTypes
import { GameItem } from './itemTypes'; // Removed ItemRarity from this import
import { Skill } from './characterTypes';

export interface SuggestedNPCFromLLM {
  name: string;
  description: string;
  appearanceDetails: string;
  dialogueGreeting: string;
  visualPromptHint: string;
  initialInventoryInstructions?: string;
  rarity: NPCRarity;
  skillSuggestions?: Array<{ skillName: string; level: number }>;
}

export interface GameNPC extends SuggestedNPCFromLLM {
  id: string;
  iconUrl: string;
  inventory: GameItem[];
  skills: Skill[];
  currentHealth?: number;
  maxHealth?: number;
  isDefeated?: boolean;
  disposition?: 'Neutral' | 'Friendly' | 'Hostile' | 'Afraid';
  isHiddenDuringEvent?: boolean;
  isEventSpawned?: boolean;
}

export interface GiftOutcome {
    accepted: boolean;
    narration: string;
    npcReactionText: string;
}

export interface NpcItemOfferOutcome {
    willingToGive: boolean;
    itemNameGiven: string | null;
    itemGiven: GameItem | null;
    narration: string;
    npcReactionText: string;
}

export interface SuggestedNPCForEvent extends SuggestedNPCFromLLM {
  // any additional fields specific to event-spawned NPCs can go here
}