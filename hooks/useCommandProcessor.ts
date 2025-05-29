// hooks/useCommandProcessor.ts
import React, { useCallback } from 'react';
import {
  CharacterData, FullLocationData, GameItem, GameNPC,
  PlayerActionParseResult, ParsedPlayerActionParameters, MovementContext,
  NewLocationGenerationResult, GameLogEntry, PlayerInitiatedActionEventDetails, LocationDetails, PLAYER_ACTIONS,
  PotentialDiscovery, EventResolutionResult, GameItemSuggestionForEvent, ContextualExaminationResult, EventEffects, MajorPlotPoint,
  VisualStyleType
} from '../services/gameTypes';
import { useGameContext, Coordinates } from '../contexts/GameContext';
import { parsePlayerCommandAndDetermineAction } from '../services/commandService';
import { generateNewLocationDetailsAndNarration, examineContextualDetail, generateLocationImage } from '../services/locationService'; // Import generateLocationImage
import { ai as geminiAiInstance, IMAGE_MODEL_NAME, API_KEY } from '../services/geminiClient';
import { generateNpcDialogueResponse, determineGiftOutcome, determineNpcItemOffer, NpcDialogueResponse, generateEventDialogueResponse } from '../services/npcService';
import { generateAndFetchItemIcon, identifyItemInInventoryByName } from '../services/itemService';
import { identifyPotentialDiscoveriesInText, ProcessedTextWithDiscoveries, linkGeneratedEntityToLead } from '../services/loreService';
import { checkEventResolution } from '../services/eventService';
import { generateEventImage } from './useEventSystem';

interface UseCommandProcessorProps {
  onPickupItemRequested: (itemId: string) => Promise<void>;
  onUseItemRequested: (itemId: string, parameters: ParsedPlayerActionParameters) => Promise<void>;
  onSelectItemForModal: (item: GameItem) => void;
  onSelectNPCForModal: (npc: GameNPC) => void;
  onStartConversation: (npcId: string) => void;
  onEndConversation: () => void;
  onTriggerLookForItems: () => Promise<void>;
  onTriggerLookForPeople: () => Promise<void>;
  previousMovementSourceCoordinates: Coordinates | null;
  setPreviousMovementSourceCoordinates: React.Dispatch<React.SetStateAction<Coordinates | null>>;
}

interface UseCommandProcessorReturn {
    processPlayerCommand: (commandText: string) => Promise<void>;
    handleGiveItemToNpc: (item: GameItem, npc: GameNPC) => Promise<void>;
}

export const useCommandProcessor = (props: UseCommandProcessorProps): UseCommandProcessorReturn => {
  const {
    onPickupItemRequested, onUseItemRequested, onSelectItemForModal, onSelectNPCForModal,
    onStartConversation, onEndConversation, onTriggerLookForItems, onTriggerLookForPeople,
    previousMovementSourceCoordinates, setPreviousMovementSourceCoordinates,
  } = props;

  const {
    gameStarted, characterData, locationData, playerInventory, gameLog, addLogEntry,
    setIsLoading, setLoadingMessage, setIsConsoleBusy,
    currentCoordinates, setCurrentCoordinates,
    visitedLocations, setVisitedLocations, locationNPCs, setLocationNPCs,
    talkingToNPC, setTalkingToNPC, locationItems, setLocationItems,
    setPlayerInventory, setLocationData: setContextLocationData,
    _consumeEnergy, _gainSkillExperience,
    attemptToTriggerUnexpectedEvent, handlePlayerInitiatedSignificantAction, applyEventEffects,
    addMemorableEntity, addMajorPlotPoint, getMemoryContextString,
    potentialDiscoveries, addPotentialDiscovery, markPotentialDiscoveryFound,
    isEventActive, setIsEventActive,
    currentEventDetails, setCurrentEventDetails, setCurrentEventImageUrl,
    majorPlotPoints,
    incrementPlayerCommandCount, // Added from GameContext
    triggerGameDirectorAnalysis, // Added from GameContext
  } = useGameContext();

  const getNewCoordinates = useCallback((currentX: number, currentY: number, direction: string): { x: number; y: number; normalizedDirection: string } => {
    const dir = direction.toLowerCase(); let dx = 0; let dy = 0; let normalizedDirection = direction;
    if (['north', 'n', 'forwards', 'forward'].includes(dir)) { dy = 1; normalizedDirection = 'north'; }
    else if (['south', 's', 'backwards', 'backward'].includes(dir)) { dy = -1; normalizedDirection = 'south'; }
    else if (['east', 'e', 'right'].includes(dir)) { dx = 1; normalizedDirection = 'east'; }
    else if (['west', 'w', 'left'].includes(dir)) { dx = -1; normalizedDirection = 'west'; }
    else if (['up', 'u'].includes(dir)) { normalizedDirection = 'up'; }
    else if (['down', 'd'].includes(dir)) { normalizedDirection = 'down'; }
    else {
      return { x: currentX, y: currentY, normalizedDirection: 'an_unknown_direction' };
    }
    return { x: currentX + dx, y: currentY + dy, normalizedDirection };
  }, []);

  const _getVisibleNpcs = useCallback(() => {
    if (!locationNPCs) return [];
    if (isEventActive && currentEventDetails) {
        const eventNpcIdsAffected = new Set(currentEventDetails.npcEffects?.map(eff => eff.npcIdTargeted) || []);
        return locationNPCs.filter(npc => {
            if (npc.isDefeated) return false;
            if (npc.isEventSpawned) return true;
            const effectOnNpc = currentEventDetails.npcEffects?.find(eff => eff.npcIdTargeted === npc.id);
            if (effectOnNpc) {
                return effectOnNpc.isHiddenDuringEvent === false || effectOnNpc.isHiddenDuringEvent === undefined;
            }
            return false;
        });
    }
    return locationNPCs.filter(npc => !npc.isDefeated);
  }, [locationNPCs, isEventActive, currentEventDetails]);


  const _handleDialogueInput = async (parameters: ParsedPlayerActionParameters, npcToAddress?: GameNPC) => {
    const visibleNpcs = _getVisibleNpcs();
    const npcForThisDialogue = npcToAddress || (talkingToNPC && visibleNpcs.find(n => n.id === talkingToNPC.id));


    if (npcForThisDialogue && parameters.dialogue_text && characterData && !characterData.isDefeated) {
      const memoryContextString = getMemoryContextString();
      const locationKey = `${currentCoordinates.x},${currentCoordinates.y}`;
      try {
        const dialogueResult: NpcDialogueResponse = await generateNpcDialogueResponse(
            npcForThisDialogue,
            parameters.dialogue_text,
            characterData,
            locationKey,
            memoryContextString,
            currentEventDetails // Pass current event details
        );

        addLogEntry('narration', `${npcForThisDialogue.name} says: ${dialogueResult.rawText}`, `${npcForThisDialogue.name} says: ${dialogueResult.processedText}`);

        for (const pd of dialogueResult.potentialDiscoveries) {
            await addPotentialDiscovery(pd, npcForThisDialogue.id, locationKey);
        }

        if (parameters.dialogue_text.toLowerCase().includes("secret") || parameters.dialogue_text.toLowerCase().includes("plan to assassinate")) {
            addMajorPlotPoint(`Player revealed to ${npcForThisDialogue.name}: "${parameters.dialogue_text.substring(0, 70)}..."`, [characterData.characterName, npcForThisDialogue.id], locationData?.name);
        }
        if (npcForThisDialogue.rarity === 'Epic' || npcForThisDialogue.rarity === 'Legendary') {
            const eventTriggerContext = `dialogue_interaction_with_${npcForThisDialogue.rarity.toLowerCase()}_npc_${npcForThisDialogue.name.replace(/\s+/g, '_')}`;
            await attemptToTriggerUnexpectedEvent(eventTriggerContext);
        } else {
            await attemptToTriggerUnexpectedEvent(`dialogue_response_from_${npcForThisDialogue.name.toLowerCase().replace(/\s+/g, '_')}_rarity_${npcForThisDialogue.rarity}`);
        }

      } catch(e: any) {
        addLogEntry('error', `Error with ${npcForThisDialogue?.name}: ${e?.message || 'Unknown dialogue error'}`);
      }
    } else if (characterData?.isDefeated) {
      addLogEntry('system', "Too weak to speak.");
    } else if (!npcForThisDialogue) {
        addLogEntry('error', "No one is currently being spoken to for this dialogue, or they are obscured by the event.");
    } else if (!parameters.dialogue_text) {
        addLogEntry('error', "What do you want to say?");
    } else {
      addLogEntry('error', "Dialogue error (NPC, text, or char data missing).");
    }
  };

  const _handleTalkToNpcCommand = async (npcNameToTalk?: string, initialUtterance?: string) => {
    if (characterData?.isDefeated) { addLogEntry('system', "You are too weak to initiate conversations."); return; }
    if (!npcNameToTalk) { addLogEntry('error', "Who do you want to talk to?"); return; }
    const visibleNpcs = _getVisibleNpcs();
    const targetNpc = visibleNpcs.find(n => n.name.toLowerCase() === npcNameToTalk.toLowerCase());
    if (!targetNpc) { addLogEntry('error', `Cannot find ${npcNameToTalk} here or they are not currently interactable.`); return; }
    if (talkingToNPC?.id === targetNpc.id) {
      addLogEntry('system', `You are already talking to ${targetNpc.name}.`);
      if (initialUtterance && initialUtterance.trim() !== "") { await _handleDialogueInput({ dialogue_text: initialUtterance }, targetNpc); }
      return;
    }
    if (talkingToNPC) {  addLogEntry('system', `You first end your conversation with ${talkingToNPC.name}.`); onEndConversation();  }
    onStartConversation(targetNpc.id);
    if (initialUtterance && initialUtterance.trim() !== "") { await _handleDialogueInput({ dialogue_text: initialUtterance }, targetNpc); }
  };

  const _handleEndConversation = () => {
    if (talkingToNPC) { onEndConversation(); }
    else { addLogEntry('system', "You are not currently talking to anyone."); }
  };

  const _handlePickupTakeGetCommand = async (targetName?: string) => {
    if (isEventActive) { addLogEntry('system', "You are too focused on the event to pick up items now."); return; }
    if (!targetName) { addLogEntry('error', "What do you want to pick up?"); return; }
    if (!locationItems) { addLogEntry('error', "You haven't searched for items here, or there are none."); return; }
    const itemToPickup = locationItems.find(item => item.name.toLowerCase() === targetName.toLowerCase());
    if (!itemToPickup) { addLogEntry('error', `Cannot find "${targetName}" here.`); return; }
    await onPickupItemRequested(itemToPickup.id);
  };

  const _handleUseItemCommand = async (targetName?: string, parameters?: ParsedPlayerActionParameters) => {
    if (!targetName) { addLogEntry('error', "What do you want to use?"); return; }
    if (!characterData) { addLogEntry('error', "Character data not available."); return; }

    setIsConsoleBusy(true);
    let itemToUse: GameItem | null = null;
    let memoryContextForUsage = getMemoryContextString();

    try {
      if (playerInventory.length > 0) {
        setLoadingMessage(`Thinking about using "${targetName}"...`);
        itemToUse = await identifyItemInInventoryByName(targetName, playerInventory, characterData, memoryContextForUsage);
        setLoadingMessage('');
      }

      if (!itemToUse) {
        addLogEntry('error', `You don't seem to have anything like a "${targetName}" to use.`);
        setIsConsoleBusy(false);
        return;
      }

      if (talkingToNPC) {
        memoryContextForUsage += `\nCURRENTLY IN DIALOGUE WITH: ${talkingToNPC.name} (ID: ${talkingToNPC.id}, Rarity: ${talkingToNPC.rarity}, Disposition: ${talkingToNPC.disposition || 'Neutral'}). Their current inventory: ${talkingToNPC.inventory.map(i => i.name).join(', ') || 'none'}.`;
      }
      if (isEventActive && currentEventDetails) {
        memoryContextForUsage += `\nACTIVE EVENT: "${currentEventDetails.eventTitle}". Event State: "${currentEventDetails.narration.substring(0,100)}...". This item usage might be relevant to resolving or interacting with the event.`;
      }


      const updatedParameters = {
        ...(parameters || {}),
        _augmentedMemoryContext: memoryContextForUsage
      };

      await onUseItemRequested(itemToUse.id, updatedParameters);

    } catch (error: any) {
      addLogEntry('error', `Error identifying or using item: ${error.message}`);
    } finally {
      setIsConsoleBusy(false);
      setLoadingMessage('');
    }
  };

  const _handleExamineCommand = async (targetToExamineName: string, parameters?: ParsedPlayerActionParameters) => {
    if (!targetToExamineName && !parameters?.examine_detail_target) { addLogEntry('error', "What do you want to examine?"); return; }
    const detailToExamine = parameters?.examine_detail_target || targetToExamineName;
    const targetLower = detailToExamine.toLowerCase();
    const visibleNpcs = _getVisibleNpcs();

    if (['area', 'location', 'surroundings', 'room', 'here', 'around'].includes(targetLower)) {
        if (isEventActive && currentEventDetails) {
          addLogEntry('narration', currentEventDetails.narration || "You survey the chaotic scene of the event.");
          addLogEntry('system', `Contextual examination of event: ${currentEventDetails.eventTitle}`);
          return;
        }
        addLogEntry('system', "You scan your surroundings...");
        await onTriggerLookForItems();
        await onTriggerLookForPeople();
        if (locationData) { addLogEntry('narration', locationData.description); }
        return;
    }
    const itemInInventory = playerInventory.find(item => item.name.toLowerCase() === targetLower);
    if (itemInInventory) { onSelectItemForModal(itemInInventory); return; }
    const itemInLocation = locationItems?.find(item => item.name.toLowerCase() === targetLower);
    if (itemInLocation) { onSelectItemForModal(itemInLocation); return; }
    const npcInLocation = visibleNpcs.find(npc => npc.name.toLowerCase() === targetLower);
    if (npcInLocation) { onSelectNPCForModal(npcInLocation); return; }

    if (characterData && locationData) {
        setIsConsoleBusy(true);
        setLoadingMessage(`Examining ${detailToExamine}...`);
        try {
            const memoryContext = getMemoryContextString();
            const locationKey = `${currentCoordinates.x},${currentCoordinates.y}`;
            const examResult: ContextualExaminationResult = await examineContextualDetail(
                detailToExamine,
                characterData,
                locationData,
                currentEventDetails,
                locationKey,
                memoryContext
            );
            addLogEntry('narration', examResult.narration);
            for (const pd of examResult.potentialDiscoveries) {
                await addPotentialDiscovery(pd, `examine_${detailToExamine.replace(/\s+/g, '_')}`, locationKey);
            }
            _gainSkillExperience("Perception", 1);
            await attemptToTriggerUnexpectedEvent(`examined_detail_${detailToExamine.replace(/\s+/g, '_')}_in_${locationData.name.replace(/\s+/g, '_')}`);
        } catch (err: any) {
            addLogEntry('error', `Cannot examine "${detailToExamine}": ${err.message || 'Nothing noteworthy observed.'}`);
        } finally {
            setIsConsoleBusy(false);
            setLoadingMessage('');
        }
    } else {
      addLogEntry('error', `You don't see a "${detailToExamine}" to examine closely here, or they are currently obscured.`);
    }
  };

  const _handleDiscoverNpcsCommand = async () => {
    if (isEventActive) { addLogEntry('system', "Your attention is fixed on the current event; you cannot search for others now."); return; }
    await onTriggerLookForPeople();
  };
   const _handleDiscoverItemsCommand = async () => {
    if (isEventActive) { addLogEntry('system', "The unfolding event prevents you from searching for items."); return; }
    await onTriggerLookForItems();
  };


  const _handleGiveItemToNpcCommand = async (itemToGiveParam?: GameItem, targetNpcParam?: GameNPC, itemNameFromCommand?: string, npcNameFromCommand?: string) => {
    if (!characterData || characterData.isDefeated) { addLogEntry('system', "You are too weak to interact."); return; }
    _consumeEnergy(1, "Persuasion"); // Reduced energy cost for giving item
    if (characterData.isDefeated) return;
    setIsConsoleBusy(true);
    try {
      const itemToGive = itemToGiveParam || playerInventory.find(i => i.name.toLowerCase() === (itemNameFromCommand || '').toLowerCase());
      if (!itemToGive) { addLogEntry('error', `You don't have a "${itemNameFromCommand || 'specified item'}".`); return; }

      const visibleNpcs = _getVisibleNpcs();
      const targetNpc = targetNpcParam || visibleNpcs.find(n => n.name.toLowerCase() === (npcNameFromCommand || '').toLowerCase());
      if (!targetNpc) { addLogEntry('error', `Cannot find ${npcNameFromCommand || 'specified NPC'} here or they are not currently interactable.`); return; }

      const chatHistory = gameLog.filter(e => (e.type === 'command' && e.text.toLowerCase().startsWith('you say:')) || (e.type === 'narration' && e.text.toLowerCase().startsWith(`${targetNpc.name.toLowerCase()} says:`))).slice(-3).map(e => e.text);
      const memoryContextString = getMemoryContextString();
      const giftResult = await determineGiftOutcome(characterData, targetNpc, itemToGive, chatHistory, memoryContextString, currentEventDetails);

      const locationKey = `${currentCoordinates.x},${currentCoordinates.y}`;
      const loreProcessedReaction: ProcessedTextWithDiscoveries = await identifyPotentialDiscoveriesInText(giftResult.npcReactionText, 'dialogue', targetNpc.id, characterData, locationKey, memoryContextString);

      for (const pd of loreProcessedReaction.potentialDiscoveries) {
        await addPotentialDiscovery(pd, targetNpc.id, locationKey);
      }

      addLogEntry('narration', giftResult.narration);
      addLogEntry('narration', `${targetNpc.name} says: ${giftResult.npcReactionText}`, `${targetNpc.name} says: ${loreProcessedReaction.processedText}`);

      if (giftResult.accepted) {
        let finalItemToGive = {...itemToGive};
        if (!finalItemToGive.iconUrl || finalItemToGive.iconUrl.startsWith('https://via.placeholder.com')) {
            addLogEntry('system', `Generating icon for ${finalItemToGive.name} as it's given...`);
            try {
                const newIconUrl = await generateAndFetchItemIcon(finalItemToGive.visualPromptHint, finalItemToGive.name, characterData.visualStyle, null);
                finalItemToGive.iconUrl = newIconUrl;
            } catch (iconError) {
                console.error(`Failed to generate icon for given item ${finalItemToGive.name}:`, iconError);
                addLogEntry('error', `Could not create icon for ${finalItemToGive.name}.`);
            }
        }

        setPlayerInventory(prevInv => prevInv.filter(item => item.id !== finalItemToGive.id));
        setLocationNPCs(prevNpcs => prevNpcs ? prevNpcs.map(npc => npc.id === targetNpc.id ? {...npc, inventory: [...npc.inventory, finalItemToGive]} : npc) : null);
        const coordKey = `${currentCoordinates.x},${currentCoordinates.y}`;
        setVisitedLocations(prevMap => {
            const newMap = new Map(prevMap);
            const entry = newMap.get(coordKey);
            if (entry) {
                const updatedNpcsInEntry = entry.npcs?.map(n => n.id === targetNpc.id ? {...n, inventory: [...n.inventory, finalItemToGive]} : n) || null;
                newMap.set(coordKey, { ...entry, npcs: updatedNpcsInEntry });
            }
            return newMap;
        });
        addLogEntry('game_event', `${targetNpc.name} accepted the ${finalItemToGive.name}.`);
        _gainSkillExperience('Persuasion', 10);
        addMajorPlotPoint(`Player gave '${finalItemToGive.name}' (${finalItemToGive.rarity}) to ${targetNpc.name}. NPC accepted.`, [characterData.characterName, targetNpc.id, finalItemToGive.id], locationData?.name);
        await attemptToTriggerUnexpectedEvent(`gave_item_${finalItemToGive.rarity.toLowerCase()}_to_${targetNpc.name.toLowerCase().replace(/\s+/g, '_')}_accepted`);
      } else {
        addLogEntry('system', `${targetNpc.name} did not accept the ${itemToGive.name}.`);
        addMajorPlotPoint(`Player offered '${itemToGive.name}' to ${targetNpc.name}. NPC refused.`, [characterData.characterName, targetNpc.id, itemToGive.id], locationData?.name);
        await attemptToTriggerUnexpectedEvent(`gave_item_${itemToGive.rarity.toLowerCase()}_to_${targetNpc.name.toLowerCase().replace(/\s+/g, '_')}_refused`);
      }
    } catch (giftError: any) { addLogEntry('error', `Error giving item: ${giftError.message || "Unknown error"}`); }
    finally { setIsConsoleBusy(false); }
  };

  const _handleRequestItemFromNpcCommand = async (requestedItemNameParam?: string, targetNpcNameParam?: string) => {
    if (!characterData || characterData.isDefeated) { addLogEntry('system', "You are too weak to make requests."); return; }
    _consumeEnergy(1, "Persuasion"); // Reduced energy cost for requesting item
    if (characterData.isDefeated) return;
    setIsConsoleBusy(true);
    try {
      if (!requestedItemNameParam || !targetNpcNameParam) { addLogEntry('error', "Specify item and NPC (e.g., 'ask Bob for key')."); return; }
      const visibleNpcs = _getVisibleNpcs();
      const targetNpc = visibleNpcs.find(n => n.name.toLowerCase() === targetNpcNameParam.toLowerCase());
      if (!targetNpc) { addLogEntry('error', `Cannot find ${targetNpcNameParam} here or they are not currently interactable.`); return; }
      const chatHistory = gameLog.filter(e => (e.type === 'command' && e.text.toLowerCase().startsWith('you say:')) || (e.type === 'narration' && e.text.toLowerCase().startsWith(`${targetNpc.name.toLowerCase()} says:`))).slice(-3).map(e => e.text);
      const memoryContextString = getMemoryContextString();
      const offerResult = await determineNpcItemOffer(characterData, targetNpc, requestedItemNameParam, chatHistory, memoryContextString, currentEventDetails);

      const locationKey = `${currentCoordinates.x},${currentCoordinates.y}`;
      const loreProcessedReaction: ProcessedTextWithDiscoveries = await identifyPotentialDiscoveriesInText(offerResult.npcReactionText, 'dialogue', targetNpc.id, characterData, locationKey, memoryContextString);

      for (const pd of loreProcessedReaction.potentialDiscoveries) {
        await addPotentialDiscovery(pd, targetNpc.id, locationKey);
      }

      addLogEntry('narration', offerResult.narration);
      addLogEntry('narration', `${targetNpc.name} says: ${offerResult.npcReactionText}`, `${targetNpc.name} says: ${loreProcessedReaction.processedText}`);

      if (offerResult.willingToGive && offerResult.itemGiven) {
        let itemAcquired = {...offerResult.itemGiven};
        if (!itemAcquired.iconUrl || itemAcquired.iconUrl.startsWith('https://via.placeholder.com')) {
            addLogEntry('system', `Generating icon for ${itemAcquired.name}...`);
            try {
                const newIconUrl = await generateAndFetchItemIcon(itemAcquired.visualPromptHint, itemAcquired.name, characterData.visualStyle, null);
                itemAcquired.iconUrl = newIconUrl;
            } catch (iconError) {
                console.error(`Failed to generate icon for acquired item ${itemAcquired.name}:`, iconError);
                addLogEntry('error', `Could not create icon for ${itemAcquired.name}.`);
            }
        }

        setPlayerInventory(prevInv => [...prevInv, itemAcquired]);
        setLocationNPCs(prevNpcs => prevNpcs ? prevNpcs.map(npc => npc.id === targetNpc.id ? {...npc, inventory: npc.inventory.filter(item => item.id !== itemAcquired.id)} : npc) : null);
        const coordKey = `${currentCoordinates.x},${currentCoordinates.y}`;
        setVisitedLocations(prevMap => {
            const newMap = new Map(prevMap);
            const entry = newMap.get(coordKey);
            if (entry) {
                const updatedNpcsInEntry = entry.npcs?.map(n => n.id === targetNpc.id ? {...n, inventory: n.inventory.filter(item => item.id !== itemAcquired.id)} : n) || null;
                newMap.set(coordKey, { ...entry, npcs: updatedNpcsInEntry });
            }
            return newMap;
         });
        addLogEntry('game_event', `${targetNpc.name} gave you ${itemAcquired.name}.`);
        _gainSkillExperience('Persuasion', 10);
        addMajorPlotPoint(`${targetNpc.name} gave '${itemAcquired.name}' (${itemAcquired.rarity}) to player.`, [characterData.characterName, targetNpc.id, itemAcquired.id], locationData?.name);
        await attemptToTriggerUnexpectedEvent(`npc_${targetNpc.name.toLowerCase().replace(/\s+/g, '_')}_gave_item_${itemAcquired.rarity.toLowerCase()}`);
      } else {
        addLogEntry('system', `${targetNpc.name} did not give you the ${requestedItemNameParam}.`);
        addMajorPlotPoint(`${targetNpc.name} did not give '${requestedItemNameParam}' to player.`, [characterData.characterName, targetNpc.id], locationData?.name);
        await attemptToTriggerUnexpectedEvent(`npc_${targetNpc.name.toLowerCase().replace(/\s+/g, '_')}_refused_item_${requestedItemNameParam.toLowerCase().replace(/\s+/g, '_')}`);
      }
    } catch (requestError: any) { addLogEntry('error', `Error requesting item: ${requestError.message || "Unknown error"}`); }
    finally { setIsConsoleBusy(false); }
  };

  const _handleMoveCommand = async (movementDirectionFromParse: string, actionType: string, intendedLocationTypeHint?: string | null) => {
    if (isEventActive) {
      addLogEntry('system', "You must deal with the current event before moving!");
      return;
    }
    if (!characterData || !locationData ) { addLogEntry('error', 'Game state not ready for movement.'); return; }
    if(characterData.isDefeated && !locationData.name.toLowerCase().includes("afterlife") && !locationData.name.toLowerCase().includes("limbo")) {
        addLogEntry('system', "You are too weak to move."); return;
    }
    _consumeEnergy(2, "Survival"); // Reduced energy cost for movement
    if (characterData.isDefeated && !locationData.name.toLowerCase().includes("afterlife") && !locationData.name.toLowerCase().includes("limbo")) return;

    let finalMovementDirection = movementDirectionFromParse.toLowerCase();
    const currentValidExits = locationData.validExits.map(e => e.toLowerCase());

    if (actionType === PLAYER_ACTIONS.LEAVE_AREA || finalMovementDirection === "random_exit") {
        if (currentValidExits.length > 0) {
            finalMovementDirection = currentValidExits[Math.floor(Math.random() * currentValidExits.length)];
        } else {
            addLogEntry('error', "There are no apparent exits from this location to 'leave' through.");
            return;
        }
    }

    const coordMatch = finalMovementDirection.match(/^(-?\d+),(-?\d+)$/);
    let newX: number, newY: number, normalizedMovementDirection: string;

    if (coordMatch) {
        newX = parseInt(coordMatch[1], 10);
        newY = parseInt(coordMatch[2], 10);
        normalizedMovementDirection = `to coordinates ${finalMovementDirection}`;
    } else {
        const moveResult = getNewCoordinates(currentCoordinates.x, currentCoordinates.y, finalMovementDirection);
        newX = moveResult.x;
        newY = moveResult.y;
        normalizedMovementDirection = moveResult.normalizedDirection;
    }

    if (normalizedMovementDirection === 'an_unknown_direction') {
         addLogEntry('error', `Cannot interpret direction: "${finalMovementDirection}". Try N, S, E, W or use the map.`);
         return;
    }
    if (!coordMatch && !currentValidExits.includes(normalizedMovementDirection)) {
      addLogEntry('error', `Cannot move ${normalizedMovementDirection} from ${locationData.name}. Valid exits: ${currentValidExits.join(', ') || 'none'}.`); return;
    }
    if (newX === currentCoordinates.x && newY === currentCoordinates.y && !coordMatch ) {
        addLogEntry('error', `Cannot move ${normalizedMovementDirection} from here, it seems you'd stay in place.`); return;
    }

    setIsLoading(true); setLoadingMessage(`Moving ${normalizedMovementDirection}...`);
    const newCoordinateKey = `${newX},${newY}`;
    const oldCoordinates = { ...currentCoordinates };
    const isNewLocationVisit = !visitedLocations.has(newCoordinateKey);
    let movementSuccessful = false;
    const memoryContextString = getMemoryContextString();

    try {
        let newLocationFullData: FullLocationData;
        let movementNarrationToLog: string;

        if (visitedLocations.has(newCoordinateKey)) {
            const visitedEntry = visitedLocations.get(newCoordinateKey)!;
            newLocationFullData = visitedEntry.location;
            movementNarrationToLog = `You head ${normalizedMovementDirection} and arrive at ${newLocationFullData.name}.`;
            addLogEntry('narration', movementNarrationToLog);
            addLogEntry('narration', newLocationFullData.description);
            setLocationItems(visitedEntry.items);
            setLocationNPCs(visitedEntry.npcs);
            movementSuccessful = true;
        } else {
            const unconfirmedLocationLeads = potentialDiscoveries.filter(pd => pd.type === 'location' && pd.status === 'mentioned');
            const moveContext: MovementContext = {
                previousLocation: locationData,
                direction: normalizedMovementDirection,
                characterConcept: characterData.characterConcept,
                characterName: characterData.characterName,
                skills: characterData.skills,
                gameSettingType: characterData.gameSettingType,
                initialHistoricalContext: characterData.initialHistoricalContext,
                fictionalUniverseContext: characterData.fictionalUniverseContext,
                recentStorySummary: gameLog.slice(-5).map(e => e.text).join(' '),
                potentialDiscoveries: unconfirmedLocationLeads,
                intendedLocationTypeHint: intendedLocationTypeHint || null,
                visualStyle: characterData.visualStyle,
            };
            const result: NewLocationGenerationResult = await generateNewLocationDetailsAndNarration(moveContext, memoryContextString);

            const newLocDetails: LocationDetails = result.newLocationDetails;
            const imageUrl = await generateLocationImage(newLocDetails.visualPromptHint, newLocDetails.name, characterData.visualStyle); // Use refactored function
            newLocationFullData = { ...newLocDetails, imageUrl };
            movementNarrationToLog = result.movementNarration;

            addLogEntry('narration', movementNarrationToLog);
            addLogEntry('narration', newLocationFullData.description);
            addLogEntry('game_event', `Discovered: ${newLocationFullData.name} (Rarity: ${newLocationFullData.rarity}).`);

            setVisitedLocations(prev => new Map(prev).set(newCoordinateKey, { location: newLocationFullData, items: null, npcs: null }));
            setLocationItems(null);
            setLocationNPCs(null);

            const fulfilledLeadId = await linkGeneratedEntityToLead(newLocationFullData, 'location', unconfirmedLocationLeads, characterData, memoryContextString);
            if (fulfilledLeadId) {
              markPotentialDiscoveryFound(fulfilledLeadId, newCoordinateKey);
            }
            addMemorableEntity(newCoordinateKey, newLocationFullData.name, 'location', newLocationFullData.rarity, newLocationFullData.description.substring(0, 70) + "...", `Discovered by moving ${normalizedMovementDirection} from ${locationData.name}`);

            movementSuccessful = true;
        }

        if (movementSuccessful) {
            setContextLocationData(newLocationFullData);
            setCurrentCoordinates({ x: newX, y: newY });
            setPreviousMovementSourceCoordinates(oldCoordinates);
            _gainSkillExperience("Survival", 1);
            const triggerCtx = isNewLocationVisit
                ? `moved_to_new_location_${newLocationFullData.rarity.toLowerCase()}_${newLocationFullData.environmentTags.join('_') || 'unknown_env'}`
                : `revisited_location_${newLocationFullData.name.toLowerCase().replace(/\s+/g, '_')}`;
            await attemptToTriggerUnexpectedEvent(triggerCtx);
        }

    } catch (moveError: any) {
        console.error("Error during movement: ", moveError);
        addLogEntry('error', `Movement failed: ${moveError.message || 'An unknown error occurred while trying to move.'}`);
    } finally {
        setIsLoading(false); setLoadingMessage('');
    }
  };

  const _handleAttackNpcCommand = async (targetNpcNameFromCommand?: string, directObjectId?: string) => {
    if (!characterData || characterData.isDefeated) { addLogEntry('system', "You are too weak to attack."); return; }
    if (!targetNpcNameFromCommand && !directObjectId) { addLogEntry('error', "Who do you want to attack?"); return; }

    const visibleNpcs = _getVisibleNpcs();
    let targetNpc: GameNPC | undefined;
    if (directObjectId) { targetNpc = visibleNpcs.find(npc => npc.id === directObjectId); }
    if (!targetNpc && targetNpcNameFromCommand) { targetNpc = visibleNpcs.find(npc => npc.name.toLowerCase() === targetNpcNameFromCommand.toLowerCase()); }

    if (!targetNpc) { addLogEntry('error', `Cannot find "${targetNpcNameFromCommand || 'target'}" here to attack or they are not currently interactable.`); return; }
    if (targetNpc.isDefeated) { addLogEntry('system', `${targetNpc.name} is already defeated.`); return; }

    const actionDetails: PlayerInitiatedActionEventDetails = {
      actionType: 'attack_npc',
      targetNpcId: targetNpc.id
    };
    await handlePlayerInitiatedSignificantAction(actionDetails);
  };


  const processPlayerCommand = useCallback(async (commandText: string) => {
    if (!characterData || !locationData || !gameStarted) {
      addLogEntry('error', 'Game not ready for commands.');
      return;
    }
    addLogEntry('command', `You say: "${commandText}"`, commandText); // Log raw command
    incrementPlayerCommandCount(); // Increment command count
    setIsConsoleBusy(true);

    try {
      const recentGameLogTexts = gameLog.slice(-5).map(entry => entry.text);
      const memoryContext = getMemoryContextString();
      const visibleNpcs = _getVisibleNpcs();

      const eventDetailsForParse = (isEventActive && currentEventDetails?.requiresPlayerActionToResolve) ? currentEventDetails : null;

      const parsedResult: PlayerActionParseResult = await parsePlayerCommandAndDetermineAction(
        commandText, characterData, locationData, locationItems, playerInventory,
        recentGameLogTexts, visibleNpcs, talkingToNPC, memoryContext, eventDetailsForParse
      );

      if (!parsedResult.isPlausible) {
        addLogEntry('error', parsedResult.reasonIfNotPlausible || "That action doesn't seem possible right now.");
        setIsConsoleBusy(false);
        return;
      }

      if (parsedResult.narrationForPlausibleAction) {
        addLogEntry('narration', parsedResult.narrationForPlausibleAction);
      }
      const targetName = parsedResult.targets[0];

      switch (parsedResult.action) {
        case PLAYER_ACTIONS.EVENT_DIALOGUE_INPUT:
            if (currentEventDetails && currentEventDetails.requiresPlayerActionToResolve) {
                const dialogueText = parsedResult.parameters?.dialogue_text || commandText;
                const locationKey = `${currentCoordinates.x},${currentCoordinates.y}`;
                const eventResponse: NpcDialogueResponse = await generateEventDialogueResponse(
                    currentEventDetails, dialogueText, characterData, locationData.name, majorPlotPoints, potentialDiscoveries, memoryContext, locationKey
                );
                addLogEntry('narration', eventResponse.rawText, eventResponse.processedText);
                for (const pd of eventResponse.potentialDiscoveries) {
                  await addPotentialDiscovery(pd, currentEventDetails.eventTitle, locationKey);
                }

                const resolutionResult: EventResolutionResult = await checkEventResolution(currentEventDetails, commandText, parsedResult, characterData, visibleNpcs, memoryContext, playerInventory);
                addLogEntry('narration', resolutionResult.resolutionNarration);
                if (resolutionResult.majorPlotPointSummary) {
                    addMajorPlotPoint(resolutionResult.majorPlotPointSummary, [characterData.characterName, currentEventDetails.eventTitle], locationData.name);
                }

                if (resolutionResult.resolved) {
                    addLogEntry('game_event', `Event "${currentEventDetails.eventTitle}" has been resolved!`);
                    if (resolutionResult.updatedNpcDisposition && characterData) {
                        const npcToUpdate = locationNPCs?.find(n => n.id === resolutionResult.updatedNpcDisposition!.npcId);
                        if (npcToUpdate) {
                            const updatedNpc = { ...npcToUpdate, disposition: resolutionResult.updatedNpcDisposition.newDisposition };
                            setLocationNPCs(prev => prev ? prev.map(n => n.id === updatedNpc.id ? updatedNpc : n) : null);
                            addLogEntry('system', `${npcToUpdate.name}'s disposition is now ${updatedNpc.disposition}.`);
                        }
                    }
                    if (resolutionResult.itemsAwardedToPlayer?.length && characterData) {
                         for (const itemSuggestion of resolutionResult.itemsAwardedToPlayer) {
                            const iconUrl = await generateAndFetchItemIcon(itemSuggestion.visualPromptHint || itemSuggestion.name, itemSuggestion.name, characterData.visualStyle, null);
                            const newItem: GameItem = { ...itemSuggestion, visualPromptHint: itemSuggestion.visualPromptHint || itemSuggestion.name, id: crypto.randomUUID(), iconUrl };
                            setPlayerInventory(prev => [...prev, newItem]);
                            addLogEntry('game_event', `You received: ${newItem.name} (${newItem.rarity}).`);
                        }
                    }
                    setIsEventActive(false); setCurrentEventDetails(null); setCurrentEventImageUrl(null);
                    triggerGameDirectorAnalysis(true); // Event resolved, good time to re-evaluate game focus
                } else if (resolutionResult.progressed) {
                    addLogEntry('game_event', `Event "${currentEventDetails.eventTitle}" has progressed!`);
                    const updatedEventDetails = {
                        ...currentEventDetails,
                        narration: resolutionResult.nextStageNarration || currentEventDetails.narration,
                        visualPromptHintForEventImage: resolutionResult.updatedVisualPromptHintForEventImage || currentEventDetails.visualPromptHintForEventImage,
                        resolutionCriteriaPrompt: resolutionResult.updatedResolutionCriteriaPrompt || currentEventDetails.resolutionCriteriaPrompt
                    };
                    setCurrentEventDetails(updatedEventDetails);
                    if (resolutionResult.nextStageNarration) addLogEntry('narration', resolutionResult.nextStageNarration);
                    if (resolutionResult.updatedVisualPromptHintForEventImage && locationData?.visualPromptHint && characterData?.visualStyle) {
                        const newImgUrl = await generateEventImage(resolutionResult.updatedVisualPromptHintForEventImage, locationData.visualPromptHint, updatedEventDetails.eventTitle, characterData.visualStyle);
                        setCurrentEventImageUrl(newImgUrl);
                    }
                } else {
                     addLogEntry('system', "Your action didn't seem to change the course of the event.");
                }
            } else {
                addLogEntry('error', "Tried to send event dialogue, but no resolvable event is active.");
            }
            break;
        case PLAYER_ACTIONS.DIALOGUE_INPUT: await _handleDialogueInput(parsedResult.parameters!); break;
        case PLAYER_ACTIONS.TALK: await _handleTalkToNpcCommand(targetName, parsedResult.parameters?.dialogue_text); break;
        case PLAYER_ACTIONS.END_CONVERSATION: _handleEndConversation(); break;
        case PLAYER_ACTIONS.PICKUP: case PLAYER_ACTIONS.TAKE: case PLAYER_ACTIONS.GET: await _handlePickupTakeGetCommand(targetName); break;
        case PLAYER_ACTIONS.USE: await _handleUseItemCommand(targetName, parsedResult.parameters || undefined); break;
        case PLAYER_ACTIONS.EXAMINE: case PLAYER_ACTIONS.LOOK: case PLAYER_ACTIONS.INSPECT: await _handleExamineCommand(targetName, parsedResult.parameters || undefined); break;
        case PLAYER_ACTIONS.DISCOVER_ITEMS: case PLAYER_ACTIONS.SEARCH_AREA_FOR_ITEMS: await _handleDiscoverItemsCommand(); break;
        case PLAYER_ACTIONS.DISCOVER_NPCS: case PLAYER_ACTIONS.LOOK_FOR_PEOPLE: await _handleDiscoverNpcsCommand(); break;
        case PLAYER_ACTIONS.GO: case PLAYER_ACTIONS.MOVE: case PLAYER_ACTIONS.WALK: case PLAYER_ACTIONS.RUN: case PLAYER_ACTIONS.LEAVE_AREA: await _handleMoveCommand(targetName, parsedResult.action, parsedResult.parameters?.intendedLocationTypeHint); break;
        case PLAYER_ACTIONS.GIVE_ITEM: await _handleGiveItemToNpcCommand(undefined, undefined, parsedResult.parameters?.item_to_give_name, parsedResult.parameters?.target_npc_name_for_interaction); break;
        case PLAYER_ACTIONS.REQUEST_ITEM_FROM_NPC: await _handleRequestItemFromNpcCommand(parsedResult.parameters?.item_to_request_name, parsedResult.parameters?.target_npc_name_for_request); break;
        case PLAYER_ACTIONS.ATTACK_NPC: await _handleAttackNpcCommand(targetName, parsedResult.parameters?.direct_object_npc_id); break;
        case PLAYER_ACTIONS.INVENTORY: case PLAYER_ACTIONS.CHECK_INVENTORY:
            addLogEntry('system', playerInventory.length > 0 ? `You have: ${playerInventory.map(i => `${i.name} (${i.rarity})`).join(', ')}.` : "Your inventory is empty.");
            break;
        case PLAYER_ACTIONS.STATUS: case PLAYER_ACTIONS.HEALTH: case PLAYER_ACTIONS.CHECK_SELF:
            addLogEntry('system', `Overall Health: ${characterData.overallHealth}HP. Energy: ${characterData.currentEnergy}/${characterData.maxEnergy}EN. Limbs: ${characterData.limbs.map(l => `${l.name} (${l.status}, ${l.health}HP)`).join('; ')}.`);
            break;
        default: addLogEntry('error', `Unknown action: ${parsedResult.action}`); break;
      }
    } catch (e: any) {
      addLogEntry('error', `Command processing error: ${e.message}`);
      console.error("Command processing error:", e);
    } finally {
      setIsConsoleBusy(false);
      // Conditionally trigger Game Director analysis after a command is processed.
      // The useGameDirector hook itself will handle the timing logic (interval, cooldown).
      triggerGameDirectorAnalysis();
    }
  }, [
    characterData, locationData, gameStarted, addLogEntry, gameLog, locationItems, playerInventory, talkingToNPC,
    setIsConsoleBusy, getMemoryContextString, _getVisibleNpcs, _handleDialogueInput, _handleTalkToNpcCommand,
    _handleEndConversation, _handlePickupTakeGetCommand, _handleUseItemCommand, _handleExamineCommand,
    _handleDiscoverItemsCommand, _handleDiscoverNpcsCommand, _handleMoveCommand, _handleGiveItemToNpcCommand,
    _handleRequestItemFromNpcCommand, _handleAttackNpcCommand,
    isEventActive, currentEventDetails, majorPlotPoints, potentialDiscoveries, currentCoordinates,
    generateEventDialogueResponse, checkEventResolution, setIsEventActive, setCurrentEventDetails,
    setCurrentEventImageUrl, addMajorPlotPoint, addPotentialDiscovery, handlePlayerInitiatedSignificantAction, applyEventEffects,
    setLocationNPCs, setPlayerInventory, _gainSkillExperience, locationNPCs,
    incrementPlayerCommandCount, triggerGameDirectorAnalysis, // Added Game Director triggers
    onPickupItemRequested, onUseItemRequested, onSelectItemForModal, onSelectNPCForModal,
    onStartConversation, onEndConversation, onTriggerLookForItems, onTriggerLookForPeople,
    previousMovementSourceCoordinates, setPreviousMovementSourceCoordinates,
    setContextLocationData, setIsLoading, setLoadingMessage, setVisitedLocations
  ]);

  return { processPlayerCommand, handleGiveItemToNpc: _handleGiveItemToNpcCommand };
};
