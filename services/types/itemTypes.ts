// services/types/itemTypes.ts
import { ItemRarity } from './commonTypes';

export interface SuggestedItemFromLLM {
  name: string;
  description: string;
  itemTypeGuess: string;
  visualPromptHint: string;
  rarity: ItemRarity;
}

export interface GameItem extends SuggestedItemFromLLM {
  id: string;
  iconUrl: string;
}

export interface PickupResult {
  narration: string;
  pickedUpItem: GameItem;
}

export interface CraftingRecipeInput {
  itemName: string;
  quantity: number;
}

export interface CraftingRecipeOutput {
  name: string;
  description: string;
  itemTypeGuess: string;
  visualPromptHint: string;
  rarity: ItemRarity;
}

export interface CraftingRecipe {
  id: string;
  inputs: CraftingRecipeInput[];
  output: CraftingRecipeOutput;
}

export interface CraftingDetails {
  craftedItem: GameItem;
  narration: string;
  xpGain?: { skillName: string; amount: number };
}

export interface DynamicCraftingOutcome {
  newItem: GameItem;
  narration: string;
  xpGain?: { skillName: string; amount: number };
  fulfilledLeadId?: string | null;
}

export interface ItemUsageOutcome {
  narration: string;
  itemEffect: {
    consumed: boolean;
    newNameIfChanged: string | null;
    newDescriptionIfChanged: string | null;
    newVisualPromptHintIfChanged: string | null;
    isEquippedToLimb?: boolean;
  };
  characterEffect: {
    overallHealthChange: number | null;
    energyChange: number | null;
    limbStatusChanges: {
      limbName: string;
      newStatus: string;
      newHealth: number;
    }[] | null;
    xpGain?: { skillName: string; amount: number };
  };
}

export interface GameItemSuggestionForEvent extends Omit<SuggestedItemFromLLM, 'visualPromptHint'> {
  visualPromptHint?: string;
}
