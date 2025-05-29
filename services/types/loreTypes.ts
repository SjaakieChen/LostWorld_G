// services/types/loreTypes.ts
import { MemorableEntityRarity } from './commonTypes';

export type MemorableEntityType = 'character' | 'item' | 'location' | 'npc' | 'lore_hint';

export interface MemorableEntity {
  id: string;
  name: string;
  type: MemorableEntityType;
  rarity: MemorableEntityRarity;
  descriptionHint: string;
  firstEncounteredContext: string;
}

export interface MajorPlotPoint {
  id: string;
  timestamp: number;
  summary: string;
  involvedEntityIds?: string[];
  locationName?: string;
}

export type PotentialDiscoveryType = 'item' | 'npc' | 'location';
export type PotentialDiscoveryStatus = 'mentioned' | 'discovered';
export type PotentialDiscoverySourceType = 'dialogue' | 'item_text' | 'contextual_examination' | 'event_narration' | 'initial_setup';

export interface PotentialDiscovery {
  id: string;
  name: string;
  type: PotentialDiscoveryType;
  descriptionHint: string;
  rarityHint?: MemorableEntityRarity;
  sourceTextSnippet: string;
  sourceType: PotentialDiscoverySourceType;
  sourceEntityId: string;
  status: PotentialDiscoveryStatus;
  discoveryChanceModifier?: number;
  firstMentionedTimestamp: number;
  firstMentionedLocationKey?: string;
  fulfilledById?: string;
}

export interface ContextualExaminationResult {
  narration: string;
  potentialDiscoveries: Omit<PotentialDiscovery, 'id' | 'status' | 'firstMentionedTimestamp' | 'firstMentionedLocationKey' | 'fulfilledById'>[];
}

export interface ProcessedTextWithDiscoveries {
  rawText: string;
  processedText: string;
  potentialDiscoveries: Omit<PotentialDiscovery, 'id' | 'status' | 'firstMentionedTimestamp' | 'firstMentionedLocationKey' | 'fulfilledById'>[];
}