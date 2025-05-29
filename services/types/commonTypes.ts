// services/types/commonTypes.ts

export type ItemRarity = 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary';
export type NPCRarity = 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary';
export type LocationRarity = 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary';
export type MemorableEntityRarity = ItemRarity | NPCRarity | LocationRarity | 'Lore' | 'Character_Self';

// Added Pencil Drawn, Paper Cutout
export type VisualStyleType = 'Pixel Art' | 'Anime' | 'Ink Painting' | 'Low Poly' | 'Oil Painting' | 'Water Painting' | 'Pencil Drawn' | 'Paper Cutout';

export interface Coordinates {
  x: number;
  y: number;
}

export interface GameLogEntry {
  id: string;
  type: 'command' | 'narration' | 'error' | 'system' | 'game_event' | 'combat';
  text: string;
  timestamp: Date;
  processedText?: string;
}