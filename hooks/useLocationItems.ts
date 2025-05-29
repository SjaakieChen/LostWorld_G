// hooks/useLocationItems.ts
import { useState, useCallback } from 'react';
import { GameItem, FullLocationData, CharacterData, GameLogEntry, GameNPC, ItemRarity, PotentialDiscovery } from '../services/gameTypes';
import { generateItemsForLocation } from '../services/itemService';
import { useGameContext, Coordinates, VisitedLocationEntry } from '../contexts/GameContext'; 
import { linkGeneratedEntityToLead } from '../services/loreService'; 


interface UseLocationItemsProps {}

export const useLocationItems = ({}: UseLocationItemsProps) => {
  const {
    locationData, characterData, currentCoordinates, visitedLocations, setVisitedLocations,
    addLogEntry, 
    locationItems: contextLocationItems, 
    setLocationItems: setContextLocationItems, _consumeEnergy, _gainSkillExperience,
    attemptToTriggerUnexpectedEvent,
    addMemorableEntity, getMemoryContextString,
    potentialDiscoveries, markPotentialDiscoveryFound 
  } = useGameContext();

  const [isLoadingItems, setIsLoadingItems] = useState<boolean>(false); 
  const [itemsError, setItemsError] = useState<string | null>(null);

  const handleTriggerLookForItems = useCallback(async () => {
    if (!characterData) { addLogEntry('error', "Character data not available."); return; }
    if (characterData.isDefeated) { addLogEntry('system', "Your wounds are too severe to search."); return; }
    _consumeEnergy(2, "Perception"); // Reduced energy cost for looking for items
    const freshCharacterData = characterData; 
    if (freshCharacterData.isDefeated) return;

    const requestCoordinates = { ...currentCoordinates };
    const requestLocationData = locationData; 
    const requestLocationName = requestLocationData?.name;

    if (!requestLocationData || itemsError) { 
      if (itemsError && (currentCoordinates.x === requestCoordinates.x && currentCoordinates.y === requestCoordinates.y)) {
         addLogEntry('error', `Cannot search in ${requestLocationName || 'current area'}: ${itemsError}`);
      } return;
    }
    const currentCoordinateKey = `${requestCoordinates.x},${requestCoordinates.y}`;
    const visitedEntryForItems = visitedLocations.get(currentCoordinateKey);
    if (!visitedEntryForItems) { addLogEntry('error', `Cannot look in ${requestLocationName || 'current area'}: location data missing.`); return; }

    if (visitedEntryForItems.items === null) { 
        setItemsError(null); setIsLoadingItems(true); 
        const memoryContextString = getMemoryContextString();
        try {
            const unconfirmedItemLeads = potentialDiscoveries.filter(pd => pd.type === 'item' && pd.status === 'mentioned');
            let items = await generateItemsForLocation(requestLocationData, freshCharacterData, unconfirmedItemLeads, memoryContextString); 
            
            for (const item of items) {
              const fulfilledLeadId = await linkGeneratedEntityToLead(item, 'item', unconfirmedItemLeads, freshCharacterData, memoryContextString);
              if (fulfilledLeadId) {
                markPotentialDiscoveryFound(fulfilledLeadId, item.id); 
              }
              addMemorableEntity(item.id, item.name, 'item', item.rarity, item.description.substring(0,50) + "...", `Found in ${requestLocationData.name}`);
            }

            setVisitedLocations(prev => {
                const newMap = new Map(prev);
                const entry = newMap.get(currentCoordinateKey);
                if (entry) newMap.set(currentCoordinateKey, { ...entry, items: items });
                return newMap;
            });
            if (currentCoordinates.x === requestCoordinates.x && currentCoordinates.y === requestCoordinates.y) {
                setContextLocationItems(items); 
                if (items.length > 0) {
                    addLogEntry('game_event', `You find: ${items.map(i => `${i.name} (${i.rarity})`).join(', ')} in ${requestLocationName || 'this area'}.`);
                    if (visitedEntryForItems.items === null) { 
                        _gainSkillExperience("Perception", 5); 
                        await attemptToTriggerUnexpectedEvent(`items_found_first_time_count_${items.length}_in_${requestLocationData.name.replace(/\s+/g, '_')}`); 
                    }
                } else {
                    addLogEntry('game_event', `After a thorough search of ${requestLocationName || 'this area'}, you find nothing of particular interest.`);
                    if (visitedEntryForItems.items === null) await attemptToTriggerUnexpectedEvent(`items_searched_area_empty_in_${requestLocationData.name.replace(/\s+/g, '_')}`);
                }
            } else addLogEntry('system', `Item search for ${requestLocationName || 'a previous area'} completed, results cached.`);
        } catch (genItemsError: any) {
            console.error(`Failed to generate items for ${requestLocationName}:`, genItemsError);
            const itemGenErrorMessage = genItemsError.message || "Error searching for items.";
            setVisitedLocations(prev => { 
                const newMap = new Map(prev); const entry = newMap.get(currentCoordinateKey);
                if (entry) newMap.set(currentCoordinateKey, { ...entry, items: [] }); return newMap;
            });
            if (currentCoordinates.x === requestCoordinates.x && currentCoordinates.y === requestCoordinates.y) {
                setItemsError(itemGenErrorMessage); addLogEntry('error', `Item search failed: ${itemGenErrorMessage}`); setContextLocationItems([]); 
            } else addLogEntry('system', `Item search for ${requestLocationName || 'a previous area'} failed. Error logged.`);
        } finally { setIsLoadingItems(false); }
    } else { 
        if (visitedEntryForItems.items?.length) addLogEntry('narration', `You recall seeing: ${visitedEntryForItems.items.map(i => `${i.name} (${i.rarity})`).join(', ')} here.`);
        else addLogEntry('narration', `You reconfirm no distinct items here.`);
        if (contextLocationItems === null && visitedEntryForItems.items !== null && currentCoordinates.x === requestCoordinates.x && currentCoordinates.y === requestCoordinates.y) {
             setContextLocationItems(visitedEntryForItems.items);
        }
        await attemptToTriggerUnexpectedEvent(`items_reconfirm_search_in_${requestLocationData.name.replace(/\s+/g, '_')}`);
    }
  }, [
    locationData, characterData, itemsError, currentCoordinates, visitedLocations, 
    addLogEntry, setVisitedLocations, setContextLocationItems, 
    contextLocationItems, _consumeEnergy, _gainSkillExperience, attemptToTriggerUnexpectedEvent, 
    addMemorableEntity, getMemoryContextString, potentialDiscoveries, markPotentialDiscoveryFound 
  ]);

  return {
    locationItems: contextLocationItems, isLoadingItems, itemsError,
    handleTriggerLookForItems, setLocationItems: setContextLocationItems, 
    setIsLoadingItems, setItemsError,
  };
};
