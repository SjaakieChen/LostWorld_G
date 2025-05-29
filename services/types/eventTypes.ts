// services/types/eventTypes.ts
import { GameItemSuggestionForEvent } from './itemTypes';
import { SuggestedNPCForEvent, GameNPC } from './npcTypes';
import { PotentialDiscovery } from './loreTypes';


export interface UnexpectedEventDetails {
  twistTitle: string;
  twistNarration: string;
  immediateEffectDescription?: string;
  potentialOpportunitiesOrThreats?: string[];
}

export interface CharacterEffectForEvent {
  healthChange?: number;
  energyChange?: number;
  limbEffects?: Array<{
    limbName: string;
    healthChange?: number;
    newStatus?: string;
    newHealthAbsolute?: number;
  }>;
  skillXpGains?: Array<{
    skillName: string;
    amount: number;
  }>;
  statusEffectAdded?: string;
  statusEffectRemoved?: string;
}

export interface ItemEffectForEvent {
  itemsAddedToInventory?: GameItemSuggestionForEvent[];
  itemsRemovedFromInventoryByName?: string[];
  itemsAddedToLocation?: GameItemSuggestionForEvent[];
  itemsRemovedFromLocationByName?: string[];
}

export interface LocationEffectForEvent {
  descriptionChange?: string;
  newTemporaryNpc?: SuggestedNPCForEvent;
  environmentTagAdded?: string;
  environmentTagRemoved?: string;
}

export interface NpcEffectForEvent {
  npcIdTargeted: string;
  healthChange?: number;
  isDefeated?: boolean;
  dispositionChange?: GameNPC['disposition'];
  dialogueOverride?: string;
  isHiddenDuringEvent?: boolean;
}

export interface EventEffects {
  eventTitle: string;
  narration: string;
  combatNarration?: string;
  characterEffects?: CharacterEffectForEvent;
  itemEffects?: ItemEffectForEvent;
  locationEffects?: LocationEffectForEvent;
  npcEffects?: NpcEffectForEvent[];
  worldEffects?: {
    timePasses?: string;
    weatherChanges?: string;
  };
  majorPlotPointSummary?: string;
  involvedEntityIdsForPlotPoint?: string[];
  visualPromptHintForEventImage?: string | null;
  eventImageUrl?: string | null;
  requiresPlayerActionToResolve?: boolean;
  resolutionCriteriaPrompt?: string | null;
  resolutionNpcDispositionChange?: { npcId: string; newDisposition: GameNPC['disposition'] } | null;
  resolutionItemsAwardedToPlayer?: GameItemSuggestionForEvent[] | null;
  potentialDiscoveriesGenerated?: Omit<PotentialDiscovery, 'id' | 'status' | 'firstMentionedTimestamp' | 'firstMentionedLocationKey' | 'fulfilledById'>[];
}

export interface PlayerInitiatedActionEventDetails {
  actionType: 'attack_npc';
  targetNpcId: string;
}

export interface EventResolutionResult {
  resolved: boolean;
  resolutionNarration: string;
  updatedNpcDisposition?: { npcId: string; newDisposition: GameNPC['disposition'] } | null;
  itemsAwardedToPlayer?: GameItemSuggestionForEvent[] | null;
  majorPlotPointSummary?: string | null;
  progressed?: boolean;
  nextStageNarration?: string;
  updatedVisualPromptHintForEventImage?: string | null;
  updatedResolutionCriteriaPrompt?: string | null;
}
