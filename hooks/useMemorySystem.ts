
// hooks/useMemorySystem.ts
import { useState, useCallback } from 'react';
import {
  MemorableEntity, MajorPlotPoint, PotentialDiscovery,
  MemorableEntityType, MemorableEntityRarity, PotentialDiscoveryType, PotentialDiscoveryStatus,
  // FIX: Import CharacterData and other necessary types for full CharacterData object
  CharacterData, Limb, Skill, VisualStyleType
} from '../services/gameTypes';
import { checkIfSimilarLeadExists, linkPotentialDiscoveryToExistingEntity } from '../services/loreService'; // Import new service

export interface UseMemorySystemReturn {
  memorableEntities: ReadonlyMap<string, MemorableEntity>;
  setMemorableEntities: React.Dispatch<React.SetStateAction<Map<string, MemorableEntity>>>;
  majorPlotPoints: ReadonlyArray<MajorPlotPoint>;
  setMajorPlotPoints: React.Dispatch<React.SetStateAction<MajorPlotPoint[]>>;
  potentialDiscoveries: ReadonlyArray<PotentialDiscovery>;
  setPotentialDiscoveries: React.Dispatch<React.SetStateAction<PotentialDiscovery[]>>;

  addMemorableEntityLogic: (
    entityId: string, name: string, type: MemorableEntityType, rarity: MemorableEntityRarity,
    descriptionHint: string, firstEncounteredContext: string
  ) => { entityAddedOrUpdated: boolean; newEntity?: MemorableEntity };

  addMajorPlotPointLogic: (
    summary: string, involvedEntityIds?: string[], locationName?: string
  ) => { plotPointAdded: boolean; newPlotPoint?: MajorPlotPoint };

  addPotentialDiscoveryLogic: (
    discoveryData: Omit<PotentialDiscovery, 'id' | 'status' | 'firstMentionedTimestamp' | 'firstMentionedLocationKey' | 'fulfilledById'>,
    baseId: string,
    locationKey: string,
    getMemoryContextStringForCheck: () => string,
    currentMemorableEntities: ReadonlyMap<string, MemorableEntity> // Added for checking against known entities
  ) => Promise<{ newDiscovery?: PotentialDiscovery, newLoreHint?: MemorableEntity, duplicatePrevented?: boolean, preConfirmedLead?: PotentialDiscovery }>;
  
  markPotentialDiscoveryFoundLogic: (id: string, actualGeneratedEntityId?: string) => { updatedDiscovery?: PotentialDiscovery | null };

  getMemoryContextString: () => string;
  clearMemorySystemLogic: () => void;
}

export const useMemorySystem = (): UseMemorySystemReturn => {
  const [memorableEntities, setMemorableEntities] = useState<Map<string, MemorableEntity>>(new Map());
  const [majorPlotPoints, setMajorPlotPoints] = useState<MajorPlotPoint[]>([]);
  const [potentialDiscoveries, setPotentialDiscoveries] = useState<PotentialDiscovery[]>([]);

  const addMemorableEntityLogic = useCallback((
    entityId: string, name: string, type: MemorableEntityType, rarity: MemorableEntityRarity,
    descriptionHint: string, firstEncounteredContext: string
  ): { entityAddedOrUpdated: boolean; newEntity?: MemorableEntity } => {
    let entityAddedOrUpdated = false;
    let newEntity: MemorableEntity | undefined;

    setMemorableEntities(prev => {
      if (prev.has(entityId) && prev.get(entityId)?.name === name && prev.get(entityId)?.type === type) {
        const existing = prev.get(entityId)!;
        if (descriptionHint.length > existing.descriptionHint.length || firstEncounteredContext !== existing.firstEncounteredContext) {
          const newMap = new Map(prev);
          newEntity = {
            ...existing,
            descriptionHint: descriptionHint.length > existing.descriptionHint.length ? descriptionHint.substring(0, 150) : existing.descriptionHint,
            firstEncounteredContext: firstEncounteredContext.substring(0, 200)
          };
          newMap.set(entityId, newEntity);
          entityAddedOrUpdated = true;
          return newMap;
        }
        return prev;
      }
      const newMap = new Map(prev);
      newEntity = {
        id: entityId, name, type, rarity: rarity,
        descriptionHint: descriptionHint.substring(0, 150),
        firstEncounteredContext: firstEncounteredContext.substring(0, 200)
      };
      newMap.set(entityId, newEntity);
      entityAddedOrUpdated = true;
      return newMap;
    });
    return { entityAddedOrUpdated, newEntity };
  }, []);

  const addMajorPlotPointLogic = useCallback((
    summary: string, involvedEntityIds?: string[], locationName?: string
  ): { plotPointAdded: boolean; newPlotPoint?: MajorPlotPoint } => {
    let plotPointAdded = false;
    let newPlotPoint: MajorPlotPoint | undefined;

    setMajorPlotPoints(prev => {
      newPlotPoint = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        summary: summary.substring(0, 250),
        involvedEntityIds,
        locationName
      };
      const recentSimilar = prev.slice(-3).some(p =>
        p.summary.toLowerCase() === summary.toLowerCase() &&
        JSON.stringify(p.involvedEntityIds?.sort()) === JSON.stringify(involvedEntityIds?.sort())
      );
      if (recentSimilar) {
        console.warn("Attempted to add duplicate major plot point:", summary);
        plotPointAdded = false;
        newPlotPoint = undefined;
        return prev;
      }
      plotPointAdded = true;
      return [...prev, newPlotPoint!].slice(-20);
    });
    return { plotPointAdded, newPlotPoint };
  }, []);
  
  const addPotentialDiscoveryLogic = useCallback(async (
    discoveryData: Omit<PotentialDiscovery, 'id' | 'status' | 'firstMentionedTimestamp' | 'firstMentionedLocationKey' | 'fulfilledById'>,
    baseId: string, // ID of the NPC or item that is the source of this lead
    locationKey: string, // Coordinate key "x,y" where the lead was first mentioned
    getMemoryContextStringForCheck: () => string,
    currentMemorableEntities: ReadonlyMap<string, MemorableEntity>
  ): Promise<{ newDiscovery?: PotentialDiscovery, newLoreHint?: MemorableEntity, duplicatePrevented?: boolean, preConfirmedLead?: PotentialDiscovery }> => {
    let newDiscovery: PotentialDiscovery | undefined;
    let newLoreHint: MemorableEntity | undefined;
    let duplicatePrevented = false;
    let preConfirmedLeadResult: PotentialDiscovery | undefined;
    
    const uniqueLeadId = `${baseId}-${discoveryData.name.replace(/\s+/g, '_').toLowerCase()}-${discoveryData.type}`;

    const memoryContext = getMemoryContextStringForCheck();
    const similarLeadExists = await checkIfSimilarLeadExists(
      discoveryData,
      potentialDiscoveries,
      memoryContext
    );

    if (similarLeadExists) {
      console.log(`Similar lead for "${discoveryData.name}" already exists. Not adding.`);
      duplicatePrevented = true;
      return { duplicatePrevented };
    }

    // Check if this "new" lead actually refers to an already known entity
    // FIX: Ensure characterForLoreCheck conforms to the full CharacterData interface.
    // Fix: Added 'visualStyle' property to characterForLoreCheck
    const characterForLoreCheck: CharacterData = { 
        characterName: "System", 
        characterConcept: "Lore Keeper", 
        skills: [],
        overallHealth: 100,
        currentEnergy: 100,
        maxEnergy: 100,
        isDefeated: false,
        limbs: [], // Assuming default limbs are not needed for this check
        characterImageUrl: null,
        gameSettingType: 'Fictional', // Default or derive if necessary
        initialHistoricalContext: null,
        characterRarity: 'Lore', // Default rarity
        fictionalUniverseContext: null,
        visualStyle: 'Pixel Art' as VisualStyleType, // Added default visualStyle
    };
    const matchedExistingEntityId = await linkPotentialDiscoveryToExistingEntity(
      discoveryData,
      currentMemorableEntities,
      characterForLoreCheck, 
      memoryContext
    );

    if (matchedExistingEntityId) {
      // Lead refers to something already known. Create it as 'discovered'.
      setPotentialDiscoveries(prev => {
        if (prev.some(pd => pd.id === uniqueLeadId && pd.status === 'discovered' && pd.fulfilledById === matchedExistingEntityId)) {
          return prev; // Already exists in this exact pre-confirmed state
        }
        preConfirmedLeadResult = {
          ...discoveryData,
          id: uniqueLeadId,
          status: 'discovered',
          fulfilledById: matchedExistingEntityId,
          firstMentionedTimestamp: Date.now(),
          firstMentionedLocationKey: locationKey,
        };
        // Add or update if it somehow existed as 'mentioned' before this check
        const existingIndex = prev.findIndex(pd => pd.id === uniqueLeadId);
        if (existingIndex > -1) {
            const updatedList = [...prev];
            updatedList[existingIndex] = preConfirmedLeadResult;
            return updatedList;
        }
        return [...prev, preConfirmedLeadResult];
      });
      // DO NOT create a 'lore_hint' MemorableEntity for this, as it's instantly confirmed.
      console.log(`Lead for "${discoveryData.name}" auto-confirmed as it matches existing entity ID: ${matchedExistingEntityId}.`);
      return { preConfirmedLead: preConfirmedLeadResult };
    }

    // If not a duplicate lead and not matching an existing entity, add as new 'mentioned' lead
    setPotentialDiscoveries(prev => {
      if (prev.some(pd => pd.id === uniqueLeadId)) { // Final check to prevent re-adding if race condition
        return prev;
      }
      newDiscovery = {
        ...discoveryData,
        id: uniqueLeadId,
        status: 'mentioned',
        firstMentionedTimestamp: Date.now(),
        firstMentionedLocationKey: locationKey,
        fulfilledById: undefined,
      };
      return [...prev, newDiscovery];
    });

    if (newDiscovery) {
      const { entityAddedOrUpdated, newEntity: createdLoreHint } = addMemorableEntityLogic(
        newDiscovery.id,
        newDiscovery.name,
        'lore_hint',
        newDiscovery.rarityHint || 'Lore',
        newDiscovery.descriptionHint,
        `Mentioned in ${newDiscovery.sourceType} (ID: ${newDiscovery.sourceEntityId}) at ${locationKey}`
      );
      if (entityAddedOrUpdated) {
        newLoreHint = createdLoreHint;
      }
    }
    return { newDiscovery, newLoreHint, duplicatePrevented };
  }, [addMemorableEntityLogic, potentialDiscoveries]);


  const markPotentialDiscoveryFoundLogic = useCallback((id: string, actualGeneratedEntityId?: string): { updatedDiscovery?: PotentialDiscovery | null } => {
    let updatedDiscovery: PotentialDiscovery | null = null;
    setPotentialDiscoveries(prev =>
      prev.map(pd => {
        if (pd.id === id && pd.status === 'mentioned') {
          updatedDiscovery = {
            ...pd,
            status: 'discovered',
            fulfilledById: actualGeneratedEntityId
          };
          return updatedDiscovery;
        }
        return pd;
      })
    );
    return { updatedDiscovery };
  }, []);


  const getMemoryContextString = useCallback((): string => {
    let contextStr = "MEMORY CONTEXT:\n";
    const discoveredLeadIds = new Set(potentialDiscoveries.filter(pd => pd.status === 'discovered').map(pd => pd.id));

    const entitiesToShow = Array.from(memorableEntities.values())
      .filter(entity => {
        // If entity is a lore_hint, check if it corresponds to a discovered lead.
        // The ID of a lore_hint memorableEntity is the same as the ID of its corresponding PotentialDiscovery.
        if (entity.type === 'lore_hint') {
          return !discoveredLeadIds.has(entity.id);
        }
        return true; // Include all other types of memorable entities
      })
      .slice(-10); // Show last 10 of the filtered list

    if (entitiesToShow.length > 0) {
      contextStr += "\nNotable Entities (Name, Type, Rarity, Hint, First Encounter):\n";
      entitiesToShow.forEach(entity => {
        contextStr += `- ${entity.name} (${entity.type}, ${entity.rarity}). Hint: ${entity.descriptionHint}. Seen: ${entity.firstEncounteredContext}\n`;
      });
    } else {
        contextStr += "No specific notable entities recorded yet.\n";
    }


    if (majorPlotPoints.length > 0) {
      contextStr += "\nRecent Major Plot Points (Chronicle - Summary, Involved, Location):\n";
      majorPlotPoints.slice(-10).forEach(point => { 
        contextStr += `- ${point.summary}. Involved: ${point.involvedEntityIds?.join(', ') || 'N/A'}. At: ${point.locationName || 'Unknown Location'}\n`;
      });
    } else {
      contextStr += "No major plot points recorded yet.\n";
    }

    const mentionedDiscoveries = potentialDiscoveries.filter(pd => pd.status === 'mentioned');
    if (mentionedDiscoveries.length > 0) {
      contextStr += "\nActive Leads (Potential Discoveries - Name, Type, Hint, Rarity Hint):\n";
      mentionedDiscoveries.slice(-10).forEach(pd => {
        contextStr += `- ${pd.name} (${pd.type}, Hint: ${pd.descriptionHint}, Rarity Hint: ${pd.rarityHint || 'Unknown'}).\n`;
      });
    } else {
      contextStr += "No specific rumors or unconfirmed leads noted yet.\n";
    }

    return contextStr;
  }, [memorableEntities, majorPlotPoints, potentialDiscoveries]); 

  const clearMemorySystemLogic = useCallback(() => {
    setMemorableEntities(new Map());
    setMajorPlotPoints([]);
    setPotentialDiscoveries([]);
  }, []);

  return {
    memorableEntities, setMemorableEntities,
    majorPlotPoints, setMajorPlotPoints,
    potentialDiscoveries, setPotentialDiscoveries,
    addMemorableEntityLogic,
    addMajorPlotPointLogic,
    addPotentialDiscoveryLogic,
    markPotentialDiscoveryFoundLogic,
    getMemoryContextString,
    clearMemorySystemLogic,
  };
};
