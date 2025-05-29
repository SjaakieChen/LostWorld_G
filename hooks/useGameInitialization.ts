// hooks/useGameInitialization.ts
import { useCallback, useState } from 'react';
import { useGameContext, Coordinates, VisitedLocationEntry } from '../contexts/GameContext';
import {
  CharacterData, FullLocationData, GameItem, SuggestedItemFromLLM, VisualStyleType, PotentialDiscovery // Added PotentialDiscovery
} from '../services/gameTypes';
import { generateCharacterDetails, generatePlayerCharacterImage, CharacterDetailsOnly, CharacterGenerationResult } from '../services/characterService';
import { generateLocationDetailsAndImage } from '../services/locationService';
import { refineUserStartInputs } from '../services/worldSetupService';
import { generateAndFetchItemIcon } from '../services/itemService';
import { generateInitialLeads } from '../services/loreService'; // Import the new service

const MAX_WORLD_CREATION_ATTEMPTS = 3;

interface UseGameInitializationProps {
  // Removed: setSettingType, setUserWorldAndCharacterIdea
  handleCloseItemModal: () => void;
  handleCloseNPCModal: () => void;
  handleCloseLocationModal: () => void;
  handleCloseImageViewModal: () => void;
  setSelectedLocationCoordinateKeyForModal: React.Dispatch<React.SetStateAction<string | null>>;
  setCraftingSlots: React.Dispatch<React.SetStateAction<(GameItem | null)[]>>;
  setIsCrafting: React.Dispatch<React.SetStateAction<boolean>>;
  setIsPickingUpItem: React.Dispatch<React.SetStateAction<string | null>>;
  setIsUsingItem: React.Dispatch<React.SetStateAction<string | null>>;
  setIsApplyingToLimb: React.Dispatch<React.SetStateAction<string | null>>;
  setPreviousMovementSourceCoordinates: React.Dispatch<React.SetStateAction<Coordinates | null>>;
  setIsConsoleMinimized: React.Dispatch<React.SetStateAction<boolean>>;
}

export const useGameInitialization = ({
  // Removed: setSettingType, setUserWorldAndCharacterIdea
  handleCloseItemModal,
  handleCloseNPCModal,
  handleCloseLocationModal,
  handleCloseImageViewModal,
  setSelectedLocationCoordinateKeyForModal,
  setCraftingSlots,
  setIsCrafting,
  setIsPickingUpItem,
  setIsUsingItem,
  setIsApplyingToLimb,
  setPreviousMovementSourceCoordinates,
  setIsConsoleMinimized,
}: UseGameInitializationProps) => {
  const {
    setGameStarted,
    setCharacterData,
    setLocationData,
    setPlayerInventory,
    setCurrentCoordinates,
    setVisitedLocations,
    setGameLog,
    addLogEntry,
    setIsLoading,
    setLoadingMessage,
    setError,
    setLocationNPCs,
    setTalkingToNPC,
    setLocationItems,
    attemptToTriggerUnexpectedEvent,
    addMemorableEntity,
    addMajorPlotPoint,
    getMemoryContextString,
    clearMemorySystem,
    visitedLocations,
    addPotentialDiscovery, // Added for initial leads
  } = useGameContext();

  const resetGameState = useCallback(() => {
    setError(null);
    setGameStarted(false);
    setCharacterData(null);
    setLocationData(null);
    setPlayerInventory([]);
    setCraftingSlots(Array(3).fill(null));
    setIsCrafting(false);
    setIsPickingUpItem(null);
    setIsUsingItem(null);
    setIsApplyingToLimb(null);
    setGameLog([]);
    setCurrentCoordinates({ x: 0, y: 0 });
    setVisitedLocations(new Map());
    setPreviousMovementSourceCoordinates(null);

    setLocationNPCs(null);
    setTalkingToNPC(null);
    setLocationItems(null);

    handleCloseItemModal();
    handleCloseNPCModal();
    handleCloseLocationModal();
    handleCloseImageViewModal();
    setSelectedLocationCoordinateKeyForModal(null);

    // Removed: setSettingType, setUserWorldAndCharacterIdea calls
    setIsConsoleMinimized(false);

    if (clearMemorySystem) {
      clearMemorySystem();
    }
  }, [
    setError, setGameStarted, setCharacterData, setLocationData, setPlayerInventory,
    setGameLog, setCurrentCoordinates, setVisitedLocations,
    handleCloseItemModal, handleCloseNPCModal, handleCloseLocationModal, handleCloseImageViewModal,
    setCraftingSlots, setIsCrafting, setIsPickingUpItem, setIsUsingItem, setIsApplyingToLimb,
    setPreviousMovementSourceCoordinates, setIsConsoleMinimized,
    setLocationNPCs, setTalkingToNPC,
    setLocationItems,
    // Removed: setSettingType, setUserWorldAndCharacterIdea dependencies
    clearMemorySystem
  ]);

  const initializeGameWorld = useCallback(async (
    initialCharConcept: string,
    initialCharName: string | null,
    locConcept: string,
    gameSetting: 'Fictional' | 'Historical',
    worldContext: string | null,
    visualStyle: VisualStyleType // Added visualStyle
  ) => {
    let charDetailsOnly: CharacterDetailsOnly | null = null;
    let initialItemSuggestions: SuggestedItemFromLLM[] | undefined = [];
    let locData: FullLocationData | null = null;
    const memoryContextString = getMemoryContextString();

    setLoadingMessage("Conceptualizing your character...");
    const characterGenResult: CharacterGenerationResult = await generateCharacterDetails(
        initialCharConcept,
        visualStyle, // Pass visualStyle here
        initialCharName,
        gameSetting,
        worldContext,
        memoryContextString
    );
    charDetailsOnly = characterGenResult.characterDetails;
    initialItemSuggestions = characterGenResult.initialItems;

    // Store visualStyle and fictionalUniverseContext if it's a fictional game
    charDetailsOnly.visualStyle = visualStyle;
    if (gameSetting === 'Fictional' && worldContext) {
        charDetailsOnly.fictionalUniverseContext = worldContext;
    }


    addMemorableEntity(charDetailsOnly.characterName, charDetailsOnly.characterName, 'character', charDetailsOnly.characterRarity, charDetailsOnly.characterConcept, "Player Character - Game Start");
    addLogEntry('game_event', `Character: ${charDetailsOnly.characterName} - ${charDetailsOnly.characterConcept} (Rarity: ${charDetailsOnly.characterRarity}, Style: ${visualStyle})`);
    if (charDetailsOnly.fictionalUniverseContext) {
        addLogEntry('system', `Playing in the universe of: ${charDetailsOnly.fictionalUniverseContext}`);
    }


    if (charDetailsOnly.skills?.length) {
        addLogEntry('system', `Initial skills: ${charDetailsOnly.skills.filter(s => s.level > 0).map(s => `${s.name} (Lvl ${s.level})`).join(', ') || 'None notable'}`);
    }

    setLoadingMessage("Creating your world...");
    const characterForLocationTheme: CharacterData = {
        ...charDetailsOnly,
        characterImageUrl: null,
        fictionalUniverseContext: gameSetting === 'Fictional' ? worldContext : null,
        visualStyle: visualStyle // Ensure visualStyle is on characterForLocationTheme
    };
    locData = await generateLocationDetailsAndImage(locConcept, characterForLocationTheme, getMemoryContextString()); // Pass characterForLocationTheme which includes visualStyle
    addMemorableEntity(locData.name, locData.name, 'location', locData.rarity, locData.description, "Game Start Location");

    const startingItems: GameItem[] = [];
    if (initialItemSuggestions?.length) {
        for (const suggestion of initialItemSuggestions) {
            const iconUrl = await generateAndFetchItemIcon(suggestion.visualPromptHint, suggestion.name, visualStyle, null);
            const newItem: GameItem = { ...suggestion, id: crypto.randomUUID(), iconUrl: iconUrl || '' };
            startingItems.push(newItem);
            addMemorableEntity(newItem.id, newItem.name, 'item', newItem.rarity, newItem.description.substring(0,50) + "...", "Starting Equipment");
            addLogEntry('game_event', `Starts with: ${newItem.name} (${newItem.rarity}).`);
        }
        setPlayerInventory(startingItems);
    }


    setLoadingMessage("Generating character appearance...");
    // generatePlayerCharacterImage will use characterForLocationTheme.visualStyle
    const charImageUrl = await generatePlayerCharacterImage(characterForLocationTheme, locData.visualPromptHint);

    const finalCharacterData: CharacterData = { ...charDetailsOnly, characterImageUrl: charImageUrl, visualStyle }; // Ensure visualStyle is saved on finalCharacterData
    setCharacterData(finalCharacterData);
    setLocationData(locData);

    addLogEntry('system', charImageUrl ? `Character appearance generated for ${finalCharacterData.characterName}.` : `Character appearance for ${finalCharacterData.characterName} could not be generated. Using placeholder.`);
    addLogEntry('narration', `${locData.description}`);
    addLogEntry('game_event', `You find yourself in: ${locData.name} (Rarity: ${locData.rarity}).`);

    const initialCoordinates = { x: 0, y: 0 };
    setCurrentCoordinates(initialCoordinates);
    setLocationItems(null);
    setLocationNPCs(null);

    setPreviousMovementSourceCoordinates(null);
    const initialCoordinateKey = `${initialCoordinates.x},${initialCoordinates.y}`;
     setVisitedLocations(prev => {
        const newMap = new Map(prev);
        newMap.set(initialCoordinateKey, { location: locData!, items: null, npcs: null });
        return newMap;
    });

    // Generate and add initial leads
    setLoadingMessage("Discovering initial leads...");
    const initialLeads = await generateInitialLeads(
      finalCharacterData,
      locData,
      gameSetting,
      worldContext,
      visualStyle,
      getMemoryContextString() // Use current memory which includes char & loc
    );

    if (initialLeads.length > 0) {
      addLogEntry('system', "Initial rumors and leads surface...");
      for (const leadData of initialLeads) {
        // The `baseId` can be a generic context for game start.
        // The `locationKey` is where these leads are 'discovered' or become known.
        await addPotentialDiscovery(leadData, `game_start-${finalCharacterData.characterName}`, initialCoordinateKey);
      }
    }


    addMajorPlotPoint(`Game started for character '${finalCharacterData.characterName}' (${finalCharacterData.characterRarity}) in '${locData.name}'. Setting: ${gameSetting}, Style: ${visualStyle}. Initial leads: ${initialLeads.length}.`, [finalCharacterData.characterName, locData.name], locData.name);
    setGameStarted(true);
    await attemptToTriggerUnexpectedEvent(`game_start_in_${locData.name.replace(/\s+/g, '_')}_${locData.rarity}`);
  }, [
    setLoadingMessage, getMemoryContextString, addMemorableEntity,
    addLogEntry, setPlayerInventory, setCharacterData, setLocationData,
    setCurrentCoordinates, setLocationItems, setLocationNPCs,
    setPreviousMovementSourceCoordinates, setVisitedLocations,
    addMajorPlotPoint, setGameStarted, attemptToTriggerUnexpectedEvent,
    addPotentialDiscovery // Added addPotentialDiscovery
  ]);


  const handleStartNewGame = useCallback(async () => {
    setIsLoading(true);
    resetGameState();
    addLogEntry('system', "Starting new adventure...");
    let success = false;
    for (let attempt = 1; attempt <= MAX_WORLD_CREATION_ATTEMPTS; attempt++) {
      try {
        await initializeGameWorld(
            "A mysterious adventurer concept",
            null,
            "A mysterious place",
            "Fictional",
            null,
            'Pixel Art' // Default visual style for random start
        );
        success = true; break;
      } catch (err: any) {
        console.error(`World creation attempt ${attempt} failed:`, err);
        setError(`World creation failed (attempt ${attempt}/${MAX_WORLD_CREATION_ATTEMPTS}): ${err.message || 'Unknown error'}. Retrying...`);
        if (attempt === MAX_WORLD_CREATION_ATTEMPTS) {
          setError(`Failed to create world after ${MAX_WORLD_CREATION_ATTEMPTS} attempts: ${err.message || 'Unknown error'}. Please try again.`);
        }
        await new Promise(resolve => setTimeout(resolve, 500 * attempt));
      }
    }
    setIsLoading(false); setLoadingMessage('');
  }, [
    addLogEntry, resetGameState, setIsLoading, setLoadingMessage, setError,
    initializeGameWorld
  ]);

  const handleCustomStartGame = useCallback(async (settingTypePassed: 'Fictional' | 'Historical', userWorldAndCharacterIdeaPassed: string, visualStylePassed: VisualStyleType) => {
    if (!userWorldAndCharacterIdeaPassed.trim()) {
      // This validation might also be done in NewGameForm, but good to have a guard here.
      setError("Please describe your desired world and character idea.");
      addLogEntry('error', "World/Character idea cannot be empty for custom start.");
      return;
    }
    setIsLoading(true);
    resetGameState();
    addLogEntry('system', `Starting custom adventure: ${settingTypePassed} setting, ${visualStylePassed} style...`);
    let success = false;
    for (let attempt = 1; attempt <= MAX_WORLD_CREATION_ATTEMPTS; attempt++) {
      try {
        setLoadingMessage(`Refining your ideas (attempt ${attempt})...`);
        const refinedInputs = await refineUserStartInputs(settingTypePassed, userWorldAndCharacterIdeaPassed, getMemoryContextString());

        const worldContextForInit = settingTypePassed === 'Historical'
            ? userWorldAndCharacterIdeaPassed // For historical, the broader user idea serves as context
            : refinedInputs.fictionalUniverseContext; // For fictional, use the identified universe or null

        await initializeGameWorld(
            refinedInputs.refinedCharConcept,
            refinedInputs.refinedCharName,
            refinedInputs.refinedStartLocationConcept,
            settingTypePassed,
            worldContextForInit,
            visualStylePassed // Pass the selected visual style
        );
        success = true; break;
      } catch (err: any) {
        console.error(`Custom world creation attempt ${attempt} failed:`, err);
        setError(`World creation failed (attempt ${attempt}/${MAX_WORLD_CREATION_ATTEMPTS}): ${err.message || 'Unknown error'}. Retrying...`);
         if (attempt === MAX_WORLD_CREATION_ATTEMPTS) {
          setError(`Failed to create custom world after ${MAX_WORLD_CREATION_ATTEMPTS} attempts: ${err.message || 'Unknown error'}. Please try again.`);
        }
        await new Promise(resolve => setTimeout(resolve, 500 * attempt));
      }
    }
    setIsLoading(false); setLoadingMessage('');
  }, [
    addLogEntry, resetGameState, setIsLoading, setLoadingMessage, setError,
    getMemoryContextString, initializeGameWorld
  ]);

  return {
    handleStartNewGame,
    handleCustomStartGame,
  };
};