// services/itemService.ts
// All specific item-related functions have been moved to sub-modules
// in the services/item/ directory. This file now re-exports them.
export * from './item/index';
export type { ProcessedTextWithDiscoveries } from '../loreService'; // Re-export if still needed by consumers of itemService directly
