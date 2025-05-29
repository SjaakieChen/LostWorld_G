// hooks/useEventSystem.ts
import { useCallback } from 'react';
import {
  CharacterData, FullLocationData, GameItem, GameNPC, EventEffects,
  PlayerInitiatedActionEventDetails, Skill, GameItemSuggestionForEvent, SuggestedNPCForEvent, PotentialDiscovery,
  GameLogEntry, PotentialDiscoveryType,
  VisualStyleType, GameDirectorDirective // Added GameDirectorDirective
} from '../services/gameTypes';
// Updated: Import decideIfEventShouldTrigger
import { generateDynamicEventDetails as generateDynamicEventDetailsService, generatePlayerAttackNpcConsequences, decideIfEventShouldTrigger } from '../services/eventService';
import { generateAndFetchItemIcon } from '../services/itemService';
import { generateAndFetchNpcIcon } from '../services/npcService';
import { PREDEFINED_SKILLS_CONFIG } from '../services/characterService';
import { linkGeneratedEntityToLead } from '../services/loreService';
import { Coordinates, VisitedLocationEntry } from '../contexts/GameContext';
import { ai as geminiAiInstance, IMAGE_MODEL_NAME, API_KEY } from '../services/geminiClient';


export interface UseEventSystemDeps {
  characterData: CharacterData | null;
  locationData: FullLocationData | null;
  playerInventory: GameItem[];
  gameLog: GameLogEntry[];
  currentCoordinates: Coordinates;
  talkingToNPC: GameNPC | null;
  locationNPCs: GameNPC[] | null;
  potentialDiscoveries: ReadonlyArray<PotentialDiscovery>;
  isGeneratingEvent: boolean;
  lastEventTimestamp: number | null;

  setCharacterData: React.Dispatch<React.SetStateAction<CharacterData | null>>;
  setLocationData: React.Dispatch<React.SetStateAction<FullLocationData | null>>;
  setPlayerInventory: React.Dispatch<React.SetStateAction<GameItem[]>>;
  setVisitedLocations: React.Dispatch<React.SetStateAction<Map<string, VisitedLocationEntry>>>;
  setLocationItems: React.Dispatch<React.SetStateAction<GameItem[] | null>>;
  setLocationNPCs: React.Dispatch<React.SetStateAction<GameNPC[] | null>>;
  setTalkingToNPC: React.Dispatch<React.SetStateAction<GameNPC | null>>;
  setIsGeneratingEvent: React.Dispatch<React.SetStateAction<boolean>>;
  setEventLoadingMessage: React.Dispatch<React.SetStateAction<string | null>>;
  setLastEventTimestamp: React.Dispatch<React.SetStateAction<number | null>>;

  addLogEntry: (type: string, text: string, processedText?: string) => void;
  gainSkillExperienceLogic: (skillName: string, amount: number, addLogEntry: any) => void;
  addMajorPlotPointLogic: (summary: string, involvedEntityIds?: string[], locationName?: string) => { plotPointAdded: boolean; newPlotPoint?: any };
  addMemorableEntityLogic: (entityId: string, name: string, type: any, rarity: any, descriptionHint: string, firstEncounteredContext: string) => { entityAddedOrUpdated: boolean; newEntity?: any };
  getMemoryContextString: () => string;
  markPotentialDiscoveryFoundLogic: (id: string, actualGeneratedEntityId?: string) => { updatedDiscovery?: PotentialDiscovery | null };
  consumeEnergyLogic: (amount: number, addLogEntry: any, relevantSkillName?: string) => { wasDefeated: boolean };
  addPotentialDiscovery: (
    discoveryData: Omit<PotentialDiscovery, 'id' | 'status' | 'firstMentionedTimestamp' | 'firstMentionedLocationKey' | 'fulfilledById'>,
    baseId: string,
    locationKey: string
  ) => Promise<void>;

  isEventActive: boolean;
  setIsEventActive: React.Dispatch<React.SetStateAction<boolean>>;
  currentEventImageUrl: string | null;
  setCurrentEventImageUrl: React.Dispatch<React.SetStateAction<string | null>>;
  currentEventDetails: EventEffects | null;
  setCurrentEventDetails: React.Dispatch<React.SetStateAction<EventEffects | null>>;
  currentDirectives: GameDirectorDirective | null; // Added Game Director directives
}


export const generateEventImage = async (visualPromptHint: string, locationContextHint: string, eventName: string, visualStyle: VisualStyleType): Promise<string | null> => {
    if (!API_KEY) { console.warn("API key not configured for event image. No image will be generated."); return null; }
    try {
        const stylePromptSegment = visualStyle === 'Ink Painting'
            ? "black and white traditional Chinese ink painting style"
            : `${visualStyle} style`;
        const finalImagePrompt = `Dynamic, first-person perspective ${stylePromptSegment} of an event: ${visualPromptHint}. The event is happening in a place described as: ${locationContextHint}. Image focus is the event itself. Ensure the overall image is visually appealing, intense, and interesting. Forbid any text, numbers, or UI elements. Clean ${stylePromptSegment}.`;
        const imageResponse = await geminiAiInstance.models.generateImages({
            model: IMAGE_MODEL_NAME,
            prompt: finalImagePrompt,
            config: { numberOfImages: 1, outputMimeType: 'image/jpeg' },
        });
        if (imageResponse.generatedImages?.[0]?.image?.imageBytes) {
            return `data:image/jpeg;base64,${imageResponse.generatedImages[0].image.imageBytes}`;
        }
        console.warn(`No image data from Gemini API for event image "${eventName}". Prompt: ${finalImagePrompt}`);
        return null;
    } catch (error) {
        console.error(`Error generating event image for "${eventName}":`, error);
        return null;
    }
};


export const useEventSystem = (deps: UseEventSystemDeps) => {
  const {
    characterData, locationData, playerInventory, gameLog, currentCoordinates, talkingToNPC, locationNPCs,
    potentialDiscoveries, isGeneratingEvent, lastEventTimestamp,
    setCharacterData, setLocationData, setPlayerInventory, setVisitedLocations, setLocationItems, setLocationNPCs,
    setTalkingToNPC, setIsGeneratingEvent, setEventLoadingMessage, setLastEventTimestamp,
    addLogEntry, gainSkillExperienceLogic, addMajorPlotPointLogic, addMemorableEntityLogic,
    getMemoryContextString, markPotentialDiscoveryFoundLogic, addPotentialDiscovery,
    isEventActive, setIsEventActive, currentEventImageUrl, setCurrentEventImageUrl, currentEventDetails, setCurrentEventDetails,
    currentDirectives, // Destructure currentDirectives
  } = deps;

  const applyEventEffects = useCallback(async (effects: EventEffects) => {
    const memoryContext = getMemoryContextString();
    const currentLocationVisualHint = locationData?.visualPromptHint || "a generic area";
    const locationKey = `${currentCoordinates.x},${currentCoordinates.y}`;
    const currentVisualStyle = characterData?.visualStyle || 'Pixel Art';

    if (effects.characterEffects && characterData) {
        let charChanged = false;
        const newCharData = { ...characterData };
        const { healthChange, energyChange, limbEffects, skillXpGains } = effects.characterEffects;

        if (healthChange) {
            newCharData.overallHealth = Math.max(0, Math.min(100, newCharData.overallHealth + healthChange));
            addLogEntry('game_event', `Your overall health changes by ${healthChange}. Now: ${newCharData.overallHealth}HP.`);
            charChanged = true;
        }
        if (energyChange) {
            newCharData.currentEnergy = Math.max(0, Math.min(newCharData.maxEnergy, newCharData.currentEnergy + energyChange));
            addLogEntry('game_event', `Your energy changes by ${energyChange}. Now: ${newCharData.currentEnergy}EN.`);
            charChanged = true;
        }
        if (limbEffects) {
            limbEffects.forEach(le => {
                const limbIndex = newCharData.limbs.findIndex(l => l.name === le.limbName);
                if (limbIndex !== -1) {
                    const limb = { ...newCharData.limbs[limbIndex] };
                    if (le.healthChange) limb.health = Math.max(0, Math.min(100, limb.health + le.healthChange));
                    if (le.newHealthAbsolute !== undefined) limb.health = Math.max(0, Math.min(100, le.newHealthAbsolute));
                    if (le.newStatus) limb.status = le.newStatus; else limb.status = `Affected (${limb.health}HP)`;
                    newCharData.limbs[limbIndex] = limb;
                    addLogEntry('game_event', `${limb.name} is now ${limb.status} (${limb.health}HP).`);
                    charChanged = true;
                }
            });
            if (charChanged) { 
                 const totalLimbHealth = newCharData.limbs.reduce((sum, limb) => sum + limb.health, 0);
                 newCharData.overallHealth = Math.round(totalLimbHealth / newCharData.limbs.length);
                 addLogEntry('game_event', `Overall health recalculated to ${newCharData.overallHealth}HP.`);
            }
        }
        if (newCharData.overallHealth <= 0 && !newCharData.isDefeated) {
            newCharData.isDefeated = true;
            addLogEntry('game_event', "The effects are overwhelming. You have been defeated.");
            charChanged = true;
        }
        if (charChanged) setCharacterData(newCharData);
        if (skillXpGains) skillXpGains.forEach(xp => gainSkillExperienceLogic(xp.skillName, xp.amount, addLogEntry));
    }

    if (effects.itemEffects && characterData) {
        const { itemsAddedToInventory, itemsRemovedFromInventoryByName, itemsAddedToLocation, itemsRemovedFromLocationByName } = effects.itemEffects;
        const unconfirmedItemLeads = potentialDiscoveries.filter(pd => pd.type === 'item' && pd.status === 'mentioned');

        if (itemsAddedToInventory?.length) {
            const newGameItems: GameItem[] = [];
            for (const itemSuggestion of itemsAddedToInventory) {
                const definiteVisualPromptHint = itemSuggestion.visualPromptHint || `a ${itemSuggestion.itemTypeGuess} called ${itemSuggestion.name}`;
                const iconUrl = await generateAndFetchItemIcon(definiteVisualPromptHint, itemSuggestion.name, currentVisualStyle, null);
                const newItem: GameItem = { ...itemSuggestion, visualPromptHint: definiteVisualPromptHint, id: crypto.randomUUID(), iconUrl };
                newGameItems.push(newItem);
                const fulfilledLeadId = await linkGeneratedEntityToLead(newItem, 'item', unconfirmedItemLeads, characterData, memoryContext);
                if (fulfilledLeadId) markPotentialDiscoveryFoundLogic(fulfilledLeadId, newItem.id);
                addLogEntry('game_event', `You acquired: ${newItem.name} (${newItem.rarity}).`);
                addMemorableEntityLogic(newItem.id, newItem.name, 'item', newItem.rarity, newItem.description, "Acquired from event");
            }
            setPlayerInventory(prev => [...prev, ...newGameItems]);
        }
        if (itemsRemovedFromInventoryByName?.length) {
            setPlayerInventory(prev => prev.filter(item => {
                const shouldRemove = itemsRemovedFromInventoryByName.includes(item.name);
                if (shouldRemove) addLogEntry('game_event', `You lost: ${item.name}.`);
                return !shouldRemove;
            }));
        }
        if (itemsAddedToLocation?.length && locationData) {
            const newLocItems: GameItem[] = [];
             for (const itemSuggestion of itemsAddedToLocation) {
                const definiteVisualPromptHint = itemSuggestion.visualPromptHint || `a ${itemSuggestion.itemTypeGuess} called ${itemSuggestion.name}`;
                const iconUrl = await generateAndFetchItemIcon(definiteVisualPromptHint, itemSuggestion.name, currentVisualStyle, null);
                const newItem: GameItem = { ...itemSuggestion, visualPromptHint: definiteVisualPromptHint, id: crypto.randomUUID(), iconUrl };
                newLocItems.push(newItem);
                const fulfilledLeadId = await linkGeneratedEntityToLead(newItem, 'item', unconfirmedItemLeads, characterData, memoryContext);
                if (fulfilledLeadId) markPotentialDiscoveryFoundLogic(fulfilledLeadId, newItem.id);
                addLogEntry('game_event', `${newItem.name} (${newItem.rarity}) appeared in the area!`);
                addMemorableEntityLogic(newItem.id, newItem.name, 'item', newItem.rarity, newItem.description, `Appeared in ${locationData.name} from event`);
            }
            setLocationItems(prev => [...(prev || []), ...newLocItems]);
            const coordKey = `${currentCoordinates.x},${currentCoordinates.y}`;
            setVisitedLocations(prevMap => {
                const newMap = new Map(prevMap);
                const entry = newMap.get(coordKey);
                if (entry) newMap.set(coordKey, { ...entry, items: [...(entry.items || []), ...newLocItems] });
                return newMap;
            });
        }
        if (itemsRemovedFromLocationByName?.length) {
            setLocationItems(prev => prev ? prev.filter(item => {
                const shouldRemove = itemsRemovedFromLocationByName.includes(item.name);
                if (shouldRemove) addLogEntry('game_event', `${item.name} vanished from the area.`);
                return !shouldRemove;
            }) : null);
             const coordKey = `${currentCoordinates.x},${currentCoordinates.y}`;
             setVisitedLocations(prevMap => {
                const newMap = new Map(prevMap);
                const entry = newMap.get(coordKey);
                if (entry && entry.items) newMap.set(coordKey, { ...entry, items: entry.items.filter(item => !itemsRemovedFromLocationByName.includes(item.name)) });
                return newMap;
            });
        }
    }

    if (effects.locationEffects && locationData && characterData) {
        const { descriptionChange, newTemporaryNpc, environmentTagAdded, environmentTagRemoved } = effects.locationEffects;
        let locChanged = false;
        const newLocData = {...locationData};
        if (descriptionChange) {
            newLocData.description += `\n${descriptionChange}`;
            addLogEntry('narration', `The area changes: ${descriptionChange}`);
            locChanged = true;
        }
        if (environmentTagAdded) {
            newLocData.environmentTags = [...new Set([...newLocData.environmentTags, environmentTagAdded])];
            addLogEntry('system', `Area environment is now also: ${environmentTagAdded}`);
            locChanged = true;
        }
        if (environmentTagRemoved) {
            newLocData.environmentTags = newLocData.environmentTags.filter(tag => tag !== environmentTagRemoved);
            addLogEntry('system', `Area environment is no longer: ${environmentTagRemoved}`);
            locChanged = true;
        }
        if (locChanged) setLocationData(newLocData);

        if (newTemporaryNpc) {
            const iconUrl = await generateAndFetchNpcIcon(newTemporaryNpc.visualPromptHint, newTemporaryNpc.name, locationData.visualPromptHint, currentVisualStyle);
            const npcSkills: Skill[] = PREDEFINED_SKILLS_CONFIG.map(skillConfig => {
                const suggestedSkill = newTemporaryNpc.skillSuggestions?.find(ss => ss.skillName === skillConfig.name);
                let level = 0;
                if (suggestedSkill) level = suggestedSkill.level;
                else {
                    if (newTemporaryNpc.rarity === 'Legendary') level = Math.floor(Math.random() * 4) + 7;
                    else if (newTemporaryNpc.rarity === 'Epic') level = Math.floor(Math.random() * 3) + 5;
                    else if (newTemporaryNpc.rarity === 'Rare') level = Math.floor(Math.random() * 3) + 3;
                    else level = Math.floor(Math.random() * 3) + 1;
                }
                return { id: crypto.randomUUID(), name: skillConfig.name, description: skillConfig.description, level, experience: 0, experienceToNextLevel: (level * 100 + 100) };
            });

            const tempNpc: GameNPC = {
                ...newTemporaryNpc, id: crypto.randomUUID(), iconUrl, inventory: [], skills: npcSkills,
                currentHealth: 100, maxHealth: 100, isDefeated: false, disposition: 'Neutral',
                isEventSpawned: true, isHiddenDuringEvent: false
            };
            const unconfirmedNpcLeads = potentialDiscoveries.filter(pd => pd.type === 'npc' && pd.status === 'mentioned');
            const fulfilledLeadId = await linkGeneratedEntityToLead(tempNpc, 'npc', unconfirmedNpcLeads, characterData, memoryContext);
            if (fulfilledLeadId) markPotentialDiscoveryFoundLogic(fulfilledLeadId, tempNpc.id);

            addLogEntry('game_event', `${tempNpc.name} (${tempNpc.rarity}) appears due to the event!`);
            addMemorableEntityLogic(tempNpc.id, tempNpc.name, 'npc', tempNpc.rarity, tempNpc.description, `Appeared in ${locationData.name} during event`);
            setLocationNPCs(prev => [...(prev || []), tempNpc]);
            const coordKey = `${currentCoordinates.x},${currentCoordinates.y}`;
            setVisitedLocations(prevMap => {
                const newMap = new Map(prevMap);
                const entry = newMap.get(coordKey);
                if (entry) newMap.set(coordKey, { ...entry, npcs: [...(entry.npcs || []), tempNpc] });
                return newMap;
            });
        }
    }

    if (effects.npcEffects?.length && locationNPCs) {
        let updatedNpcs = [...locationNPCs];
        effects.npcEffects.forEach(effect => {
            const npcIndex = updatedNpcs.findIndex(n => n.id === effect.npcIdTargeted);
            if (npcIndex !== -1) {
                const npc = { ...updatedNpcs[npcIndex] };
                let npcStateChanged = false;
                if (effect.healthChange) {
                    npc.currentHealth = Math.max(0, Math.min(npc.maxHealth || 100, (npc.currentHealth || 100) + effect.healthChange));
                    addLogEntry('combat', `${npc.name}'s health changes by ${effect.healthChange}. Now: ${npc.currentHealth}HP.`);
                    npcStateChanged = true;
                }
                if (effect.isDefeated !== undefined) {
                    npc.isDefeated = effect.isDefeated;
                    addLogEntry('combat', `${npc.name} is now ${effect.isDefeated ? 'defeated' : 'no longer defeated'}.`);
                    if (effect.isDefeated && talkingToNPC?.id === npc.id) setTalkingToNPC(null);
                    npcStateChanged = true;
                }
                if (effect.dispositionChange) {
                    npc.disposition = effect.dispositionChange;
                    addLogEntry('system', `${npc.name}'s disposition towards you is now ${effect.dispositionChange}.`);
                    npcStateChanged = true;
                }
                if (effect.dialogueOverride) {
                    addLogEntry('narration', `${npc.name} exclaims: "${effect.dialogueOverride}"`);
                }
                if (effect.isHiddenDuringEvent !== undefined) {
                    npc.isHiddenDuringEvent = effect.isHiddenDuringEvent;
                    addLogEntry('system', `${npc.name} is now ${effect.isHiddenDuringEvent ? 'hidden by the event' : 'no longer hidden'}.`);
                    if (effect.isHiddenDuringEvent && talkingToNPC?.id === npc.id) setTalkingToNPC(null);
                    npcStateChanged = true;
                }
                if (npcStateChanged) updatedNpcs[npcIndex] = npc;
            }
        });
        setLocationNPCs(updatedNpcs);
        const coordKey = `${currentCoordinates.x},${currentCoordinates.y}`;
        setVisitedLocations(prevMap => {
            const newMap = new Map(prevMap);
            const entry = newMap.get(coordKey);
            if (entry) newMap.set(coordKey, { ...entry, npcs: updatedNpcs });
            return newMap;
        });
    }

    if (effects.worldEffects) {
        if (effects.worldEffects.timePasses) addLogEntry('system', `Time passes: ${effects.worldEffects.timePasses}`);
        if (effects.worldEffects.weatherChanges) addLogEntry('system', `The weather changes: ${effects.worldEffects.weatherChanges}`);
    }
    if (effects.majorPlotPointSummary) {
        addMajorPlotPointLogic(effects.majorPlotPointSummary, effects.involvedEntityIdsForPlotPoint, locationData?.name);
    }

    if (effects.potentialDiscoveriesGenerated) {
      for (const pd of effects.potentialDiscoveriesGenerated) {
        await addPotentialDiscovery(pd, effects.eventTitle, locationKey);
      }
    }

  }, [
    characterData, locationData, playerInventory, currentCoordinates, locationNPCs, talkingToNPC, potentialDiscoveries,
    setCharacterData, setLocationData, setPlayerInventory, setVisitedLocations, setLocationItems, setLocationNPCs, setTalkingToNPC,
    addLogEntry, gainSkillExperienceLogic, addMajorPlotPointLogic, addMemorableEntityLogic, getMemoryContextString,
    markPotentialDiscoveryFoundLogic, addPotentialDiscovery
  ]);

  const attemptToTriggerUnexpectedEvent = useCallback(async (triggerContext: string) => {
    if (!characterData || !locationData || isGeneratingEvent || isEventActive) return;

    const lcTriggerContext = triggerContext.toLowerCase();
    const isEpicOrLegendaryThing = lcTriggerContext.includes('_epic_') || lcTriggerContext.includes('_legendary_');
    const isSystemDrivenEventContext = lcTriggerContext.startsWith('event_') || lcTriggerContext.startsWith('game_start');

    if (!isEpicOrLegendaryThing && !isSystemDrivenEventContext) {
      return;
    }
    
    setIsGeneratingEvent(true);
    setEventLoadingMessage("Sensing a disturbance...");
    addLogEntry('system', "You feel a change in the air...");
    const memoryContextString = getMemoryContextString();

    try {
      const decisionResult = await decideIfEventShouldTrigger(
        triggerContext,
        characterData,
        locationData,
        playerInventory,
        gameLog,
        memoryContextString
      );

      if (!decisionResult.shouldTriggerEvent || !decisionResult.eventConcept || !decisionResult.eventIntensity) {
        addLogEntry('system', "The feeling passes. Nothing significant seems to happen.");
        setIsGeneratingEvent(false);
        setEventLoadingMessage(null);
        return;
      }

      // Illustrative: Check Game Director directives for event generation
      let additionalPromptContext = "";
      if (currentDirectives) {
          const eventGenEnhancement = currentDirectives.promptEnhancements.find(pe => pe.targetSystem === 'EventGeneration');
          if (eventGenEnhancement) {
              additionalPromptContext += `\nGame Director Suggestion for Event: ${eventGenEnhancement.suggestion}`;
          }
          if (currentDirectives.currentGameFocus === decisionResult.eventConcept || // If focus matches concept
              currentDirectives.gameplayParameterSuggestions.increaseNarrativeLengthForScenario === decisionResult.eventConcept ||
              currentDirectives.gameplayParameterSuggestions.increaseNarrativeLengthForScenario === currentDirectives.currentGameFocus && currentDirectives.currentGameFocus === decisionResult.eventConcept ) { // Or focus matches a specific scenario directive
              additionalPromptContext += "\nGame Director Suggests: This event matches the current game focus or a scenario requiring longer narration. Please provide a more detailed and immersive event narration.";
          }
          if (currentDirectives.gameplayParameterSuggestions.preferredEventType === decisionResult.eventConcept) {
              additionalPromptContext += `\nGame Director Notes: This event type (${decisionResult.eventConcept}) is currently preferred.`;
          }
      }
      // This `additionalPromptContext` would then be appended to the prompt inside `generateDynamicEventDetailsService`
      // For this example, we'll assume `generateDynamicEventDetailsService` is modified to accept and use it.
      // This is a conceptual change to illustrate directive consumption.
      
      const eventEffects = await generateDynamicEventDetailsService(
        characterData,
        locationData,
        playerInventory,
        gameLog,
        decisionResult.eventConcept,
        decisionResult.eventIntensity,
        memoryContextString + additionalPromptContext // Pass augmented context
      );
      
      const noEventTitles = ["a fleeting sensation", "the moment passes", "all remains calm", "nothing noteworthy", "nothing unusual"];
      if (noEventTitles.some(t => eventEffects.eventTitle.toLowerCase().includes(t)) &&
          !eventEffects.characterEffects &&
          !eventEffects.itemEffects &&
          !eventEffects.locationEffects &&
          !eventEffects.npcEffects &&
          !eventEffects.majorPlotPointSummary &&
          !eventEffects.requiresPlayerActionToResolve) {
        addLogEntry('system', "The feeling passes. Nothing significant seems to happen.");
        setIsEventActive(false);
        setCurrentEventDetails(null);
        setCurrentEventImageUrl(null);
        setIsGeneratingEvent(false);
        setEventLoadingMessage(null);
        return;
      }


      setIsEventActive(true);
      setCurrentEventDetails(eventEffects);
      addLogEntry('game_event', `EVENT: ${eventEffects.eventTitle}`);
      addLogEntry('narration', eventEffects.narration);
      if (eventEffects.combatNarration) addLogEntry('combat', eventEffects.combatNarration);

      if (eventEffects.visualPromptHintForEventImage && locationData?.visualPromptHint && characterData?.visualStyle) {
          const eventImgUrl = await generateEventImage(
              eventEffects.visualPromptHintForEventImage,
              locationData.visualPromptHint,
              eventEffects.eventTitle,
              characterData.visualStyle 
          );
          setCurrentEventImageUrl(eventImgUrl);
          if (eventImgUrl) addLogEntry('system', "Event image generated.");
      } else {
          setCurrentEventImageUrl(null);
      }

      await applyEventEffects(eventEffects); 
      setLastEventTimestamp(Date.now());
      
      if (eventEffects.requiresPlayerActionToResolve) {
          addLogEntry('system', "This event requires your attention.");
          if(eventEffects.resolutionCriteriaPrompt) addLogEntry('system', `Hint: ${eventEffects.resolutionCriteriaPrompt}`);
      } else {
          let chronicleSummary = `Event Occurred: "${eventEffects.eventTitle}". ${eventEffects.narration}`;
          if (eventEffects.majorPlotPointSummary) {
              chronicleSummary += ` Lore/Plot: ${eventEffects.majorPlotPointSummary}`;
          }
          const involvedIds = new Set<string>();
          if (characterData) involvedIds.add(characterData.characterName);
          if (eventEffects.involvedEntityIdsForPlotPoint) {
              eventEffects.involvedEntityIdsForPlotPoint.forEach(id => involvedIds.add(id));
          }
          addMajorPlotPointLogic(chronicleSummary, Array.from(involvedIds), locationData?.name);

          setIsEventActive(false);
          setCurrentEventDetails(null);
          setCurrentEventImageUrl(null);
      }

    } catch (error: any) {
      if (error.message === "NO_MAJOR_EVENT") {
          addLogEntry('system', "The feeling passes. Nothing significant seems to happen.");
      } else {
          console.error("Failed to trigger or apply event:", error);
          addLogEntry('error', `Event generation failed: ${error.message || "A strange occurrence fizzled out."}`);
      }
      setIsEventActive(false);
      setCurrentEventDetails(null);
      setCurrentEventImageUrl(null);
    } finally {
      setIsGeneratingEvent(false);
      setEventLoadingMessage(null);
    }
  }, [
    characterData, locationData, playerInventory, gameLog, isGeneratingEvent, isEventActive, lastEventTimestamp,
    setIsGeneratingEvent, setEventLoadingMessage, addLogEntry, getMemoryContextString, applyEventEffects,
    setLastEventTimestamp, setIsEventActive, setCurrentEventDetails, setCurrentEventImageUrl, addMajorPlotPointLogic,
    currentDirectives // Added currentDirectives to dependency array
  ]);

  const handlePlayerInitiatedSignificantAction = useCallback(async (actionDetails: PlayerInitiatedActionEventDetails) => {
    if (!characterData || !locationData || isGeneratingEvent || isEventActive) {
        addLogEntry('system', "Cannot initiate major actions now due to ongoing processes or events.");
        return;
    }
    setIsGeneratingEvent(true);
    setEventLoadingMessage("Assessing the consequences...");
    const memoryContextString = getMemoryContextString();
    try {
        let eventEffects: EventEffects | null = null;
        if (actionDetails.actionType === 'attack_npc') {
            const npcToAttack = locationNPCs?.find(n => n.id === actionDetails.targetNpcId);
            if (npcToAttack && characterData) {
                // Illustrative: Check Game Director directives for combat resolution
                let additionalPromptContext = "";
                 if (currentDirectives) {
                    const combatEnhancement = currentDirectives.promptEnhancements.find(pe => pe.targetSystem === 'CombatResolution');
                    if (combatEnhancement) {
                        additionalPromptContext += `\nGame Director Suggestion for Combat: ${combatEnhancement.suggestion}`;
                    }
                     if (currentDirectives.currentGameFocus === 'HighStakesCombat') {
                        additionalPromptContext += "\nGame Director Notes: This is a high stakes combat scenario. Emphasize danger and impactful outcomes.";
                    }
                }
                // This `additionalPromptContext` would be passed to and used by `generatePlayerAttackNpcConsequences`
                eventEffects = await generatePlayerAttackNpcConsequences(characterData, npcToAttack, actionDetails, memoryContextString + additionalPromptContext);
            } else {
                throw new Error("Target NPC for attack not found or character data missing.");
            }
        }

        if (eventEffects) {
            setIsEventActive(true);
            setCurrentEventDetails(eventEffects);
            addLogEntry('game_event', `PLAYER ACTION EVENT: ${eventEffects.eventTitle}`);
            addLogEntry('narration', eventEffects.narration);
            if (eventEffects.combatNarration) addLogEntry('combat', eventEffects.combatNarration);

            if (eventEffects.visualPromptHintForEventImage && locationData?.visualPromptHint && characterData?.visualStyle) {
                const eventImgUrl = await generateEventImage(
                    eventEffects.visualPromptHintForEventImage,
                    locationData.visualPromptHint,
                    eventEffects.eventTitle,
                    characterData.visualStyle 
                );
                setCurrentEventImageUrl(eventImgUrl);
            } else {
                setCurrentEventImageUrl(null);
            }

            await applyEventEffects(eventEffects);
            setLastEventTimestamp(Date.now());

            const npcEffectOnTarget = eventEffects.npcEffects?.find(eff => eff.npcIdTargeted === actionDetails.targetNpcId);
            const playerDefeated = characterData?.isDefeated;

            if (npcEffectOnTarget?.isDefeated || playerDefeated || !eventEffects.requiresPlayerActionToResolve) {
                addLogEntry('system', npcEffectOnTarget?.isDefeated || playerDefeated ? "The confrontation has reached a conclusion." : "The immediate consequences of your action have played out.");
                
                let chronicleSummary = `Action Outcome: "${eventEffects.eventTitle}". Final Result: ${eventEffects.narration}`;
                 if (eventEffects.majorPlotPointSummary) {
                    chronicleSummary += ` Context/Lore: ${eventEffects.majorPlotPointSummary}`;
                }
                const involvedIds = new Set<string>();
                if (characterData) involvedIds.add(characterData.characterName);
                if (eventEffects.involvedEntityIdsForPlotPoint) {
                    eventEffects.involvedEntityIdsForPlotPoint.forEach(id => involvedIds.add(id));
                }
                 if (npcEffectOnTarget) involvedIds.add(npcEffectOnTarget.npcIdTargeted);
                addMajorPlotPointLogic(chronicleSummary, Array.from(involvedIds), locationData?.name);
                
                setIsEventActive(false);
                setCurrentEventDetails(null);
                setCurrentEventImageUrl(null);
            } else if (eventEffects.requiresPlayerActionToResolve) {
                 addLogEntry('system', "The situation remains tense and requires further action.");
                 if(eventEffects.resolutionCriteriaPrompt) addLogEntry('system', `Hint: ${eventEffects.resolutionCriteriaPrompt}`);
            }

        } else {
             addLogEntry('system', "Your action did not trigger a major consequence at this time.");
        }

    } catch (error: any) {
        console.error("Failed to handle player-initiated significant action:", error);
        addLogEntry('error', `Action failed: ${error.message || "An unexpected issue occurred."}`);
        setIsEventActive(false);
        setCurrentEventDetails(null);
        setCurrentEventImageUrl(null);
    } finally {
        setIsGeneratingEvent(false);
        setEventLoadingMessage(null);
    }
  }, [
    characterData, locationData, locationNPCs, isGeneratingEvent, isEventActive, lastEventTimestamp, 
    setIsGeneratingEvent, setEventLoadingMessage, addLogEntry, getMemoryContextString, applyEventEffects,
    setLastEventTimestamp, setIsEventActive, setCurrentEventDetails, setCurrentEventImageUrl, addMajorPlotPointLogic,
    currentDirectives // Added currentDirectives to dependency array
  ]);

  return {
    applyEventEffects,
    attemptToTriggerUnexpectedEvent,
    handlePlayerInitiatedSignificantAction,
  };
};
