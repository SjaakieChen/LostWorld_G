// components/AppContent.tsx
import React, { useState, useCallback, useEffect } from 'react';
import { useGameContext, Coordinates } from '../contexts/GameContext'; 
import GameInterface, { GameInterfaceProps, ItemInteractionProps, NPCInteractionProps, CraftingInteractionProps, CharacterScreenInteractionProps } from './GameInterface';
import {
  CharacterData, Limb, FullLocationData, GameItem, ParsedPlayerActionParameters, GameLogEntry, PotentialDiscovery, MemorableEntityType, PotentialDiscoveryType, PotentialDiscoveryStatus, MemorableEntity, GameNPC, VisualStyleType
} from '../services/gameTypes'; 

import ModalManager from './ModalManager';
import GameScreen from './GameScreen'; 

import AppHeader from './AppHeader';
import InteractiveConsole from './InteractiveConsole';
import AppFooter from './AppFooter';

import { useGameInitialization } from '../hooks/useGameInitialization';
import { useItemManagement } from '../hooks/useItemManagement';
import { useAppLoadingState } from '../hooks/useAppLoadingState';
import { useModals } from '../hooks/useModals'; 
import { useCrafting } from '../hooks/useCrafting';
import { useNpcInteractions } from '../hooks/useNpcInteractions';
import { useLocationItems } from '../hooks/useLocationItems';
import { useCommandProcessor } from '../hooks/useCommandProcessor';
import { useGameDirector } from '../hooks/useGameDirector'; // Import useGameDirector

const AppContent: React.FC = () => {
  const gameContext = useGameContext(); // Get the whole context
  const {
    gameStarted,
    characterData, 
    locationData,
    playerInventory,
    currentCoordinates,
    gameLog,
    isLoading: contextIsLoading, 
    loadingMessage: contextLoadingMessage,
    error,
    locationNPCs, 
    talkingToNPC,
    locationItems,
    isGeneratingEvent, 
    eventLoadingMessage,
    memorableEntities, 
    potentialDiscoveries, 
    visitedLocations, 
    addLogEntry, 
    addPotentialDiscovery, 
    setPlayerInventory, setLocationItems, setLocationNPCs, setVisitedLocations, setLocationData: setContextLocationData,
    // Game Director related items from context, to pass to useGameDirector if it were here.
    // For now, useGameDirector is instantiated below and uses the context itself.
    currentDirectives, // We can read this if needed, but useGameDirector manages its own instance and updates context
    setCurrentDirectives,
    playerCommandCount,
    // triggerGameDirectorAnalysis: contextTriggerAnalysis - no longer directly used here
  } = gameContext;

  // Instantiate useGameDirector - it will use useGameContext internally
  // We don't need to pass individual context values to it explicitly.
  // The trigger function from useGameDirector will be the one we actually use/pass down.
  const gameDirector = useGameDirector();


  const {
    itemToViewInModal, setItemToViewInModal,
    npcToViewInModal, setNpcToViewInModal,
    locationToViewInModal, setLocationToViewInModal,
    selectedLocationCoordinateKeyForModal, setSelectedLocationCoordinateKeyForModal,
    imageUrlToView, imageAltTextToView, setImageUrlToView, setImageAltTextToView, 
    handleSelectItemForModal, handleCloseItemModal,
    handleSelectNPCForModal, handleCloseNPCModal,
    handleSelectLocationForModal, handleCloseLocationModal,
    handleSelectImageForViewing, handleCloseImageViewModal,
  } = useModals();
  
  const [apiKeyMissing, setApiKeyMissing] = useState(false);
  const [isConsoleMinimized, setIsConsoleMinimized] = useState(false);
  
  const [isPickingUpItem, setIsPickingUpItem] = useState<string | null>(null);
  const [isUsingItem, setIsUsingItem] = useState<string | null>(null);
  const [isApplyingToLimb, setIsApplyingToLimb] = useState<string | null>(null);
  const [previousMovementSourceCoordinates, setPreviousMovementSourceCoordinates] = useState<Coordinates | null>(null);


  useEffect(() => {
    if (!(process.env.API_KEY)) {
      setApiKeyMissing(true);
      console.warn("API_KEY environment variable is not set. The application will not function correctly.");
    }
  }, []);

  const toggleConsoleMinimized = useCallback(() => {
    setIsConsoleMinimized(prev => !prev);
  }, []);

  const {
    craftingSlots, setCraftingSlots, 
    isCrafting, setIsCrafting,       
    handleAddItemToCraftingSlot,
    handleRemoveItemFromCraftingSlot,
    handleAttemptCraft, 
  } = useCrafting({});

  const gameInitialization = useGameInitialization({
    handleCloseItemModal, handleCloseNPCModal, handleCloseLocationModal, handleCloseImageViewModal,
    setSelectedLocationCoordinateKeyForModal, 
    setCraftingSlots, setIsCrafting, 
    setIsPickingUpItem, setIsUsingItem, setIsApplyingToLimb, 
    setPreviousMovementSourceCoordinates, setIsConsoleMinimized,
  });

  const { 
    handlePickupItem, handleUseItem, handleApplyItemToLimb, handleUnequipItemFromLimb 
  } = useItemManagement({
    isPickingUpItem, setIsPickingUpItem,
    isUsingItem, setIsUsingItem,
    isApplyingToLimb, setIsApplyingToLimb,
  });
  
  const handleItemDescriptionElaborated = useCallback(
    (itemId: string, newRawDesc: string, newProcessedDesc: string, newDiscoveries: Omit<PotentialDiscovery, 'id' | 'status' | 'firstMentionedTimestamp' | 'firstMentionedLocationKey'>[]) => {
      setItemToViewInModal(prev => prev && prev.id === itemId ? { ...prev, description: newProcessedDesc } : prev);
      setPlayerInventory(prevInv => prevInv.map(item => item.id === itemId ? { ...item, description: newProcessedDesc } : item));
      setLocationItems(prevLocItems => prevLocItems ? prevLocItems.map(item => item.id === itemId ? { ...item, description: newProcessedDesc } : item) : null);
      
      const coordKey = `${currentCoordinates.x},${currentCoordinates.y}`;
      setVisitedLocations(prevMap => {
        const newMap = new Map(prevMap);
        const entry = newMap.get(coordKey);
        if (entry && entry.items) {
          const updatedItemsInEntry = entry.items.map(i => i.id === itemId ? { ...i, description: newProcessedDesc } : i);
          newMap.set(coordKey, { ...entry, items: updatedItemsInEntry });
        }
        return newMap;
      });

      addLogEntry('system', `Learned more about ${itemToViewInModal?.name || 'item'}.`);
      const locationKey = `${currentCoordinates.x},${currentCoordinates.y}`;
      newDiscoveries.forEach(pd => addPotentialDiscovery(pd, itemId, locationKey));
    }, [setItemToViewInModal, setPlayerInventory, setLocationItems, addLogEntry, addPotentialDiscovery, currentCoordinates, itemToViewInModal?.name, setVisitedLocations]
  );

  const handleNpcDescriptionElaborated = useCallback(
    (npcId: string, newRawDesc: string, newProcessedDesc: string, newDiscoveries: Omit<PotentialDiscovery, 'id' | 'status' | 'firstMentionedTimestamp' | 'firstMentionedLocationKey'>[]) => {
      setNpcToViewInModal(prev => prev && prev.id === npcId ? { ...prev, description: newProcessedDesc } : prev);
      setLocationNPCs(prevNpcs => prevNpcs ? prevNpcs.map(npc => npc.id === npcId ? { ...npc, description: newProcessedDesc } : npc) : null);
      
      const coordKey = `${currentCoordinates.x},${currentCoordinates.y}`;
      setVisitedLocations(prevMap => {
        const newMap = new Map(prevMap);
        const entry = newMap.get(coordKey);
        if (entry && entry.npcs) {
          const updatedNpcsInEntry = entry.npcs.map(n => n.id === npcId ? { ...n, description: newProcessedDesc } : n);
          newMap.set(coordKey, { ...entry, npcs: updatedNpcsInEntry });
        }
        return newMap;
      });

      addLogEntry('system', `Learned more about ${npcToViewInModal?.name || 'NPC'}.`);
      const locationKey = `${currentCoordinates.x},${currentCoordinates.y}`;
      newDiscoveries.forEach(pd => addPotentialDiscovery(pd, npcId, locationKey));
    }, [setNpcToViewInModal, setLocationNPCs, setVisitedLocations, addLogEntry, addPotentialDiscovery, currentCoordinates, npcToViewInModal?.name]
  );

  const handleLocationDescriptionElaborated = useCallback(
    (coordinateKey: string, newRawDesc: string, newProcessedDesc: string, newDiscoveries: Omit<PotentialDiscovery, 'id' | 'status' | 'firstMentionedTimestamp' | 'firstMentionedLocationKey'>[]) => {
      setLocationToViewInModal(prev => prev && selectedLocationCoordinateKeyForModal === coordinateKey ? { ...prev, description: newProcessedDesc } : prev);
      
      setVisitedLocations(prevMap => {
        const newMap = new Map(prevMap);
        const entry = newMap.get(coordinateKey);
        if (entry) {
          newMap.set(coordinateKey, { 
            ...entry, 
            location: { 
              ...entry.location, 
              description: newProcessedDesc, 
            } 
          });
        }
        return newMap;
      });

      if (locationData && `${currentCoordinates.x},${currentCoordinates.y}` === coordinateKey) {
        setContextLocationData(prevLocData => prevLocData ? { ...prevLocData, description: newProcessedDesc } : null);
      }

      addLogEntry('system', `Learned more about ${locationToViewInModal?.name || 'location'}.`);
      newDiscoveries.forEach(pd => addPotentialDiscovery(pd, coordinateKey, coordinateKey));
    }, [
      setLocationToViewInModal, selectedLocationCoordinateKeyForModal, setVisitedLocations, setContextLocationData,
      locationData, currentCoordinates, addLogEntry, addPotentialDiscovery, locationToViewInModal?.name
    ]
  );


  const { 
    isLoadingNPCs: hookIsLoadingNPCs, 
    npcsError,
    handleStartConversation, handleEndConversation,
    handleTriggerLookForPeople, 
  } = useNpcInteractions({});

  const {
    isLoadingItems: hookIsLoadingItems, 
    itemsError,
    handleTriggerLookForItems, 
  } = useLocationItems({});
  
  const { processPlayerCommand, handleGiveItemToNpc } = useCommandProcessor({
    onPickupItemRequested: handlePickupItem, 
    onUseItemRequested: (itemId, params) => handleUseItem(itemId, params), 
    onSelectItemForModal: handleSelectItemForModal, 
    onSelectNPCForModal: handleSelectNPCForModal,  
    onStartConversation: handleStartConversation,  
    onEndConversation: handleEndConversation,    
    onTriggerLookForItems: handleTriggerLookForItems,
    onTriggerLookForPeople: handleTriggerLookForPeople,
    previousMovementSourceCoordinates, setPreviousMovementSourceCoordinates,
  });

  const { appHeaderIsLoading, appHeaderLoadingMessage, consoleIsProcessing } = useAppLoadingState({
    contextIsLoading,
    contextLoadingMessage,
    hookIsLoadingItems,
    hookIsLoadingNPCs,
    isGeneratingEvent,
    eventLoadingMessage,
    isCharacterDefeated: characterData?.isDefeated ?? false,
  });

  const calculateOverallHealth = (limbs: Limb[]): number => {
    if (!limbs || limbs.length === 0) return 100;
    const totalHealth = limbs.reduce((sum, limb) => sum + limb.health, 0);
    return Math.round(totalHealth / limbs.length);
  };

  const handleSelectKnowledgeEntryForModal = useCallback((id: string, type: MemorableEntityType | PotentialDiscoveryType, status?: PotentialDiscoveryStatus) => {
    let entityIdToSearch = id;
    let actualEntityType = type;
    
    if (type === 'lore_hint' && status !== 'discovered') {
        addLogEntry('system', "This is a piece of general lore or a hint. No specific details modal available yet.");
        return;
    }

    const discoveryDetails = potentialDiscoveries.find(pd => pd.id === id);

    if (discoveryDetails && status === 'discovered' && discoveryDetails.fulfilledById) {
        entityIdToSearch = discoveryDetails.fulfilledById;
        actualEntityType = discoveryDetails.type; 
    } else if (status === 'mentioned') {
        addLogEntry('system', `Details for ${discoveryDetails?.name || 'this lead'} are still unknown or unconfirmed.`);
        return;
    } else if (status === 'discovered' && (!discoveryDetails || !discoveryDetails.fulfilledById)) {
        addLogEntry('system', `Details for this discovered ${type} are confirmed but not directly linkable to a modal via this entry yet.`);
        return;
    }

    let foundEntity: GameItem | GameNPC | FullLocationData | null = null;
    let coordinateKeyForLocation: string | null = null;

    switch (actualEntityType) {
        case 'item':
            foundEntity = playerInventory.find(item => item.id === entityIdToSearch) || locationItems?.find(item => item.id === entityIdToSearch) || null;
            if (foundEntity) handleSelectItemForModal(foundEntity as GameItem);
            break;
        case 'npc':
            foundEntity = locationNPCs?.find(npc => npc.id === entityIdToSearch) || null;
            if (foundEntity) handleSelectNPCForModal(foundEntity as GameNPC);
            break;
        case 'location':
            if (entityIdToSearch.includes(',')) { 
                 const entry = visitedLocations.get(entityIdToSearch);
                 if (entry) {
                    foundEntity = entry.location;
                    coordinateKeyForLocation = entityIdToSearch;
                 }
            } else { 
                for (const [key, entry] of visitedLocations.entries()) {
                    if (entry.location.name === entityIdToSearch) {
                        foundEntity = entry.location;
                        coordinateKeyForLocation = key;
                        break;
                    }
                }
            }
            if (foundEntity) handleSelectLocationForModal(foundEntity as FullLocationData, coordinateKeyForLocation!);
            break;
        default:
            if (type !== 'lore_hint') { 
               addLogEntry('error', `Cannot open details for unknown knowledge type: ${actualEntityType}`);
            }
            return;
    }

    if (!foundEntity) {
        addLogEntry('system', `Details for this ${actualEntityType} are not currently available or the link is missing.`);
    }
  }, [playerInventory, locationItems, locationNPCs, visitedLocations, potentialDiscoveries, handleSelectItemForModal, handleSelectNPCForModal, handleSelectLocationForModal, addLogEntry]);


  const currentPhaseTitle = "Phase 12: ReadMe & New Visual Styles"; 

  const itemInteractionProps: ItemInteractionProps = {
    locationItems,
    isLoadingItems: hookIsLoadingItems,
    itemsError,
    onSelectItemForModal: handleSelectItemForModal,
    onTriggerLookForItems: handleTriggerLookForItems,
    onPickupItem: handlePickupItem,
    isPickingUpItemId: isPickingUpItem,
  };

  const npcInteractionProps: NPCInteractionProps = {
    locationNPCs,
    isLoadingNPCs: hookIsLoadingNPCs,
    npcsError,
    talkingToNPC,
    onStartConversation: handleStartConversation,
    onSelectNPCForModal: handleSelectNPCForModal,
    onTriggerLookForPeople: handleTriggerLookForPeople,
    onEndConversation: handleEndConversation,
  };

  const craftingInteractionProps: CraftingInteractionProps = {
    craftingSlots,
    onAddItemToCraftingSlot: handleAddItemToCraftingSlot,
    onRemoveItemFromSlot: handleRemoveItemFromCraftingSlot,
    onAttemptCraft: handleAttemptCraft,
    isCrafting,
  };
  
  const characterScreenInteractionProps: CharacterScreenInteractionProps = {
    onUseItem: handleUseItem,
    isUsingItemId: isUsingItem,
    onApplyItemToLimb: handleApplyItemToLimb,
    isApplyingToLimbId: isApplyingToLimb,
    onUnequipItemFromLimb: handleUnequipItemFromLimb,
    overallHealth: characterData ? calculateOverallHealth(characterData.limbs) : 100,
    currentEnergy: characterData?.currentEnergy ?? 100,
    maxEnergy: characterData?.maxEnergy ?? 100,
  };

  const gameInterfaceProps: GameInterfaceProps = {
    itemProps: itemInteractionProps,
    npcProps: npcInteractionProps,
    craftingProps: craftingInteractionProps,
    characterProps: characterScreenInteractionProps,
    onSelectLocationForModal: handleSelectLocationForModal,
    currentCoordinates: currentCoordinates,
    onSelectKnowledgeEntry: handleSelectKnowledgeEntryForModal,
    onDropItemOnNpcImage: handleGiveItemToNpc, 
  };
  
  // UseEffect to call the Game Director's trigger when appropriate.
  // This specific trigger (on command count) is managed by useGameDirector itself now.
  // Other manual triggers (e.g., after major plot point, event end) would call
  // gameDirector.triggerGameDirectorAnalysis() directly from those respective service/hook points.

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 text-slate-100 flex flex-col selection:bg-sky-500 selection:text-white">
      <AppHeader 
        isLoading={appHeaderIsLoading} 
        loadingMessage={appHeaderLoadingMessage}
        currentPhaseTitle={currentPhaseTitle} 
        apiKeyMissing={apiKeyMissing}
        isGeneratingEvent={isGeneratingEvent} 
        eventLoadingMessage={eventLoadingMessage}
        />
      
      <div className="flex-grow overflow-y-auto"> 
        <GameScreen
          isGlobalBlockingLoad={contextIsLoading}
          loadingMessage={contextLoadingMessage}
          error={error}
          gameStarted={gameStarted}
          apiKeyMissing={apiKeyMissing}
          characterData={characterData}
          locationData={locationData}
          gameLog={gameLog}
          gameInterfaceProps={gameInterfaceProps}
          onQuickStart={gameInitialization.handleStartNewGame}
          onCustomStart={gameInitialization.handleCustomStartGame}
          onTryAgain={gameInitialization.handleStartNewGame} // For GameOverScreen
        />
      </div>

      <ModalManager
        itemToViewInModal={itemToViewInModal}
        onCloseItemModal={handleCloseItemModal}
        onItemDescriptionElaborated={handleItemDescriptionElaborated}
        npcToViewInModal={npcToViewInModal}
        onCloseNpcModal={handleCloseNPCModal}
        onNpcDescriptionElaborated={handleNpcDescriptionElaborated}
        locationToViewInModal={locationToViewInModal}
        onCloseLocationModal={handleCloseLocationModal}
        onLocationDescriptionElaborated={handleLocationDescriptionElaborated}
        selectedLocationCoordinateKeyForModal={selectedLocationCoordinateKeyForModal}
        characterData={characterData}
        imageUrlToView={imageUrlToView}
        imageAltTextToView={imageAltTextToView}
        onCloseImageViewModal={handleCloseImageViewModal}
        onSelectImageForViewing={handleSelectImageForViewing} 
      />

      <InteractiveConsole 
        gameStarted={gameStarted} 
        talkingToNPC={talkingToNPC} 
        handleEndConversation={handleEndConversation}
        processPlayerCommand={processPlayerCommand}
        isProcessing={consoleIsProcessing} 
        gameLog={gameLog} 
        isConsoleMinimized={isConsoleMinimized} 
        onToggleMinimize={toggleConsoleMinimized} />
      <AppFooter />
      <a 
        href="https://www.instagram.com/sjaakie_chen/" 
        target="_blank" 
        rel="noopener noreferrer" 
        className="fixed bottom-4 right-4 opacity-30 hover:opacity-50 transition-opacity z-50"
        aria-label="Visit Instagram profile"
      >
        <svg 
          className="w-6 h-6 text-white" 
          fill="currentColor" 
          viewBox="0 0 24 24"
        >
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
        </svg>
      </a>
    </div>);
};

export default AppContent;
