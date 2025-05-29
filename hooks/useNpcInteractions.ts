// hooks/useNpcInteractions.ts
import { useState, useCallback } from 'react';
import { GameNPC, FullLocationData, CharacterData, GameLogEntry, GameItem, PotentialDiscovery } from '../services/gameTypes';
import { generateNPCsForLocation } from '../services/npcService';
import { useGameContext, Coordinates, VisitedLocationEntry } from '../contexts/GameContext';
import { linkGeneratedEntityToLead } from '../services/loreService'; 

interface UseNpcInteractionsProps {}

export const useNpcInteractions = ({}: UseNpcInteractionsProps) => {
  const {
    locationData, characterData, currentCoordinates, visitedLocations, setVisitedLocations,
    addLogEntry, 
    locationNPCs: contextLocationNPCs,
    setLocationNPCs: setContextLocationNPCs, talkingToNPC, setTalkingToNPC,
    _consumeEnergy, _gainSkillExperience, attemptToTriggerUnexpectedEvent,
    addMemorableEntity, getMemoryContextString,
    potentialDiscoveries, markPotentialDiscoveryFound 
  } = useGameContext();

  const [isLoadingNPCs, setIsLoadingNPCs] = useState<boolean>(false); 
  const [npcsError, setNpcsError] = useState<string | null>(null);

  const handleStartConversation = useCallback((npcId: string) => {
    if (!contextLocationNPCs) return;
    const npcToTalkTo = contextLocationNPCs.find(npc => npc.id === npcId);
    if (npcToTalkTo) { 
        setTalkingToNPC(npcToTalkTo); 
        addLogEntry('system', `You begin talking to ${npcToTalkTo.name}.`); 
        // Removed: attemptToTriggerUnexpectedEvent(`start_talk_with_${npcToTalkTo.name.replace(/\s+/g, '_')}_${npcToTalkTo.rarity}`);
    }
  }, [contextLocationNPCs, addLogEntry, setTalkingToNPC]);

  const handleEndConversation = useCallback(() => {
    if (talkingToNPC) { 
        addLogEntry('system', `You end conversation with ${talkingToNPC.name}.`); 
        attemptToTriggerUnexpectedEvent(`end_talk_with_${talkingToNPC.name.replace(/\s+/g, '_')}_${talkingToNPC.rarity}`);
        setTalkingToNPC(null); 
    }
  }, [talkingToNPC, addLogEntry, setTalkingToNPC, attemptToTriggerUnexpectedEvent]);

  const handleTriggerLookForPeople = useCallback(async () => {
    if (!characterData) { addLogEntry('error', "Character data not available."); return; }
    if (characterData.isDefeated) { addLogEntry('system', "You are too weak to search."); return; }
    _consumeEnergy(2, "Perception"); // Reduced energy cost for looking for people
    const freshCharacterData = characterData;
    if (freshCharacterData.isDefeated) return;

    const requestCoordinates = { ...currentCoordinates };
    const requestLocationData = locationData; 
    const requestLocationName = requestLocationData?.name;

    if (!requestLocationData || npcsError) { 
       if (npcsError && (currentCoordinates.x === requestCoordinates.x && currentCoordinates.y === requestCoordinates.y)) {
        addLogEntry('error', `Cannot look for people in ${requestLocationName || 'current area'}: ${npcsError}`);
      } return;
    }
    const currentCoordinateKey = `${requestCoordinates.x},${requestCoordinates.y}`;
    const visitedEntryForNPCs = visitedLocations.get(currentCoordinateKey);
    if (!visitedEntryForNPCs) { addLogEntry('error', `Cannot look in ${requestLocationName || 'current area'}: location data missing.`); return; }

    if (visitedEntryForNPCs.npcs === null) { 
        setNpcsError(null); setIsLoadingNPCs(true); 
        const memoryContextString = getMemoryContextString();
        try {
            const unconfirmedNpcLeads = potentialDiscoveries.filter(pd => pd.type === 'npc' && pd.status === 'mentioned');
            // Pass freshCharacterData (which includes visualStyle) to generateNPCsForLocation
            let npcs = await generateNPCsForLocation(requestLocationData, freshCharacterData, unconfirmedNpcLeads, memoryContextString); 
            
            npcs = npcs.map(npc => ({
                ...npc,
                currentHealth: npc.currentHealth ?? 100,
                maxHealth: npc.maxHealth ?? 100,
                isDefeated: npc.isDefeated ?? false,
                disposition: npc.disposition ?? 'Neutral'
            }));

            for (const npc of npcs) {
              const fulfilledLeadId = await linkGeneratedEntityToLead(npc, 'npc', unconfirmedNpcLeads, freshCharacterData, memoryContextString);
              if (fulfilledLeadId) {
                markPotentialDiscoveryFound(fulfilledLeadId, npc.id); 
              }
              addMemorableEntity(npc.id, npc.name, 'npc', npc.rarity, npc.description.substring(0,50) + "...", `Encountered in ${requestLocationData.name}`);
            }

            setVisitedLocations(prev => { 
                const newMap = new Map(prev); const entry = newMap.get(currentCoordinateKey);
                if (entry) newMap.set(currentCoordinateKey, { ...entry, npcs: npcs }); return newMap;
            });
            if (currentCoordinates.x === requestCoordinates.x && currentCoordinates.y === requestCoordinates.y) {
                setContextLocationNPCs(npcs);
                if (npcs.length > 0) {
                    addLogEntry('game_event', `You notice: ${npcs.map(n => `${n.name} (${n.rarity})`).join(', ')} in ${requestLocationName || 'this area'}.`);
                    if (visitedEntryForNPCs.npcs === null) { 
                        _gainSkillExperience("Perception", 3); 
                        await attemptToTriggerUnexpectedEvent(`npcs_found_first_time_count_${npcs.length}_in_${requestLocationData.name.replace(/\s+/g, '_')}`); 
                    }
                } else {
                    addLogEntry('game_event', `After looking around in ${requestLocationName || 'this area'}, you don't see anyone else here.`);
                    if (visitedEntryForNPCs.npcs === null) await attemptToTriggerUnexpectedEvent(`npcs_searched_area_empty_in_${requestLocationData.name.replace(/\s+/g, '_')}`);
                }
            } else addLogEntry('system', `NPC search for ${requestLocationName || 'a previous area'} completed, results cached.`);
        } catch (genNPCsError: any) {
            console.error(`Failed to generate NPCs for ${requestLocationName}:`, genNPCsError);
            const npcGenErrorMessage = genNPCsError.message || "Error looking for people.";
            setVisitedLocations(prev => { 
                const newMap = new Map(prev); const entry = newMap.get(currentCoordinateKey);
                if (entry) newMap.set(currentCoordinateKey, { ...entry, npcs: [] }); return newMap;
            });
            if (currentCoordinates.x === requestCoordinates.x && currentCoordinates.y === requestCoordinates.y) {
                setNpcsError(npcGenErrorMessage); addLogEntry('error', `Search failed: ${npcGenErrorMessage}`); setContextLocationNPCs([]); 
            } else addLogEntry('system', `NPC search for ${requestLocationName || 'a previous area'} failed. Error logged.`);
        } finally { setIsLoadingNPCs(false); }
    } else { 
        if (visitedEntryForNPCs.npcs?.length) addLogEntry('narration', `You recall seeing: ${visitedEntryForNPCs.npcs.map(n => `${n.name} (${n.rarity})`).join(', ')} here.`);
        else addLogEntry('narration', `You reconfirm no one else is around here.`);
        if (contextLocationNPCs === null && visitedEntryForNPCs.npcs !== null && currentCoordinates.x === requestCoordinates.x && currentCoordinates.y === requestCoordinates.y) {
            setContextLocationNPCs(visitedEntryForNPCs.npcs);
        }
         await attemptToTriggerUnexpectedEvent(`npcs_reconfirm_search_in_${requestLocationData.name.replace(/\s+/g, '_')}`);
    }
  }, [
    locationData, characterData, npcsError, currentCoordinates, visitedLocations, 
    addLogEntry, setVisitedLocations, setContextLocationNPCs, 
    contextLocationNPCs, _consumeEnergy, _gainSkillExperience, attemptToTriggerUnexpectedEvent,
    addMemorableEntity, getMemoryContextString, potentialDiscoveries, markPotentialDiscoveryFound
  ]);

  return {
    locationNPCs: contextLocationNPCs, isLoadingNPCs, npcsError, talkingToNPC, 
    handleStartConversation, handleEndConversation, handleTriggerLookForPeople,
    setLocationNPCs: setContextLocationNPCs, setIsLoadingNPCs, setNpcsError, setTalkingToNPC, 
  };
};
