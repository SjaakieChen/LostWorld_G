// components/GameInterface.tsx
import React, { useEffect } from 'react';
import { CharacterData, FullLocationData, GameItem, GameNPC, MemorableEntity, PotentialDiscovery, MajorPlotPoint, MemorableEntityType, PotentialDiscoveryType, PotentialDiscoveryStatus, VisualStyleType } from '../services/gameTypes'; // Added knowledge types & VisualStyleType
import { useGameContext, Coordinates } from '../contexts/GameContext'; 
import LimbStatusPanel from './LimbStatusPanel';
import LocationImagePanel from './LocationImagePanel';
import LocationItemsList from './LocationItemsList';
import InventoryPanel from './InventoryPanel';
import Alert from './Alert';
import Spinner from './Spinner';
import CraftingArea from './CraftingArea';
import LocationNPCsList from './LocationNPCsList';
import MinimapPanel from './MinimapPanel'; 
import CharacterVitalsPanel from './CharacterVitalsPanel';
import CharacterSkillsPanel from './CharacterSkillsPanel'; 
import KnowledgePanel from './KnowledgePanel'; 

// Grouped Prop Interfaces
export interface ItemInteractionProps {
  locationItems: GameItem[] | null;
  isLoadingItems: boolean;
  itemsError: string | null;
  onSelectItemForModal: (item: GameItem) => void;
  onTriggerLookForItems: () => void;
  onPickupItem: (itemId: string) => void;
  isPickingUpItemId: string | null;
}

export interface NPCInteractionProps {
  locationNPCs: GameNPC[] | null;
  isLoadingNPCs: boolean;
  npcsError: string | null;
  talkingToNPC: GameNPC | null;
  onStartConversation: (npcId: string) => void;
  onSelectNPCForModal: (npc: GameNPC) => void;
  onTriggerLookForPeople: () => void;
  onEndConversation: () => void;
}

export interface CraftingInteractionProps {
  craftingSlots: (GameItem | null)[];
  onAddItemToCraftingSlot: (item: GameItem, slotIndex: number) => void;
  onRemoveItemFromSlot: (slotIndex: number) => void;
  onAttemptCraft: () => void;
  isCrafting: boolean;
}

export interface CharacterScreenInteractionProps {
  onUseItem: (itemId: string) => void;
  isUsingItemId: string | null;
  onApplyItemToLimb: (itemId: string, limbId: string) => void;
  isApplyingToLimbId: string | null;
  onUnequipItemFromLimb: (limbId: string, itemId: string) => void;
  overallHealth: number;
  currentEnergy: number;
  maxEnergy: number;
}

// Main GameInterfaceProps
export interface GameInterfaceProps { 
  itemProps: ItemInteractionProps;
  npcProps: NPCInteractionProps;
  craftingProps: CraftingInteractionProps;
  characterProps: CharacterScreenInteractionProps;
  onSelectLocationForModal: (location: FullLocationData, coordinateKey: string) => void;
  currentCoordinates: Coordinates;
  onSelectKnowledgeEntry: (id: string, type: MemorableEntityType | PotentialDiscoveryType, status?: PotentialDiscoveryStatus) => void; 
  onDropItemOnNpcImage: (item: GameItem, npc: GameNPC) => Promise<void>;
}

const GameInterface: React.FC<GameInterfaceProps> = ({ 
  itemProps,
  npcProps,
  craftingProps,
  characterProps,
  onSelectLocationForModal,
  currentCoordinates,
  onSelectKnowledgeEntry, 
  onDropItemOnNpcImage,
}) => {
  const { 
    characterData, 
    locationData, 
    playerInventory,
    visitedLocations,
    memorableEntities,    
    potentialDiscoveries, 
    majorPlotPoints,
    isEventActive, 
    currentEventImageUrl,
    currentEventDetails
  } = useGameContext();

  if (!characterData || !locationData) {
    return (
      <div className="w-full p-4 md:p-6 space-y-6 bg-slate-850 shadow-2xl rounded-lg ring-1 ring-slate-700 relative text-center">
        <Spinner className="w-12 h-12 mx-auto text-sky-500" />
        <p className="text-slate-300">Loading game data...</p>
      </div>
    );
  }

  const itemsAlreadyFoundOrSearched = itemProps.locationItems !== null;
  const npcsAlreadyFoundOrSearched = npcProps.locationNPCs !== null;

  const displayImageUrl = isEventActive && currentEventImageUrl 
    ? currentEventImageUrl 
    : (npcProps.talkingToNPC?.iconUrl || locationData.imageUrl);
  
  const displayImageAltText = isEventActive && currentEventDetails?.eventTitle
    ? currentEventDetails.eventTitle
    : (npcProps.talkingToNPC?.name || locationData.name);

  const visualStyle = characterData.visualStyle; // Get visual style

  return (
    <div className="w-full p-4 md:p-6 space-y-6 bg-slate-850 shadow-2xl rounded-lg ring-1 ring-slate-700 relative">
      
      <h2 id="location-main-heading" className="text-3xl font-bold text-center">
        {isEventActive && currentEventDetails?.eventTitle ? (
            <span className="text-purple-400">EVENT: {currentEventDetails.eventTitle}</span>
        ) : npcProps.talkingToNPC ? (
            <>
                <span className="text-slate-300">Talking to: </span> 
                <span className="text-sky-400">{npcProps.talkingToNPC.name}</span>
            </>
        ) : (
            <span className="text-yellow-400">{locationData.name}</span>
        )}
         {!isEventActive && !npcProps.talkingToNPC && locationData && <span className="text-xl text-slate-400 ml-2">({locationData.rarity})</span>}
      </h2>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8">
        {/* --- LEFT COLUMN (Character & Knowledge) --- */}
        <div className="space-y-6 lg:col-span-4">
          <section aria-labelledby="character-info-heading" className="bg-slate-700/30 p-4 rounded-lg shadow">
            <h3 id="character-info-heading" className="text-2xl font-semibold mb-3 text-sky-400">{characterData.characterName || "Character Status"}</h3>
            
            <div className="prose prose-sm prose-invert max-w-none prose-p:text-slate-300 my-3">
              <p className="font-medium text-sky-300">Concept:</p>
              <p className="italic text-sm">{characterData.characterConcept}</p>
            </div>
            <LimbStatusPanel 
              limbs={characterData.limbs} 
              characterImageUrl={characterData.characterImageUrl}
              onApplyItemToLimb={characterProps.onApplyItemToLimb}
              isApplyingToLimbId={characterProps.isApplyingToLimbId}
              onUnequipItemFromLimb={characterProps.onUnequipItemFromLimb} 
              visualStyle={visualStyle} // Pass visualStyle
            />
          </section>

          <section aria-labelledby="character-vitals-skills-heading" className="bg-slate-700/30 p-4 rounded-lg shadow">
             <h3 id="character-vitals-skills-heading" className="text-2xl font-semibold mb-3 text-teal-400 sr-only">Vitals & Skills</h3>
            <CharacterVitalsPanel 
              overallHealth={characterProps.overallHealth}
              currentEnergy={characterProps.currentEnergy}
              maxEnergy={characterProps.maxEnergy}
            />
            <CharacterSkillsPanel skills={characterData.skills} />
          </section>

          <section aria-labelledby="knowledge-archives-heading" className="bg-slate-700/30 p-4 rounded-lg shadow">
            <KnowledgePanel 
              memorableEntities={memorableEntities}
              potentialDiscoveries={potentialDiscoveries}
              majorPlotPoints={majorPlotPoints}
              onSelectKnowledgeEntry={onSelectKnowledgeEntry}
            />
          </section>
        </div>

        {/* --- MIDDLE COLUMN (Location Image, Description, Minimap) --- */}
        <div className="lg:col-span-4 space-y-6">
          <section aria-labelledby="location-visual-heading" className="bg-slate-700/30 p-4 rounded-lg shadow relative">
            <h3 id="location-visual-heading" className="text-2xl font-semibold mb-3 text-amber-300 sr-only">Visuals</h3>
            <LocationImagePanel 
              imageUrl={displayImageUrl} 
              imageAltText={displayImageAltText}
              onSelectLocationForModal={onSelectLocationForModal} 
              locationData={isEventActive ? null : (npcProps.talkingToNPC ? null : locationData)} 
              currentCoordinates={currentCoordinates}
              isEventActive={isEventActive}
              talkingToNPC={npcProps.talkingToNPC} 
              onDropItemOnNpcImage={onDropItemOnNpcImage} 
              visualStyle={visualStyle} // Pass visualStyle
            />
            
            {!isEventActive && locationData.environmentTags && locationData.environmentTags.length > 0 && !npcProps.talkingToNPC && (
              <div className="mt-4 text-center">
                <h4 className="text-md font-medium text-slate-400 mb-2">Environment:</h4>
                <div className="flex flex-wrap gap-2 justify-center">
                  {locationData.environmentTags.map((tag, index) => (
                    <span 
                      key={index} 
                      className="bg-sky-700 text-sky-200 px-3 py-1 rounded-full text-xs font-medium shadow"
                      aria-label={`Environment tag: ${tag}`}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {!isEventActive && currentCoordinates && !npcProps.talkingToNPC && (
              <div className="mt-2 text-center"> 
                <h4 className="text-md font-medium text-slate-400">Coordinates:</h4>
                <p className="text-sm text-slate-300 tabular-nums">({currentCoordinates.x}, {currentCoordinates.y})</p>
              </div>
            )}
             {!isEventActive && locationData.validExits && !npcProps.talkingToNPC && (
                <div className="mt-2 text-center"> 
                    <h4 className="text-md font-medium text-slate-400">Exits:</h4>
                    <p className="text-sm text-slate-300">
                        {locationData.validExits.length > 0 ? locationData.validExits.join(', ') : 'None apparent'}
                    </p>
                </div>
            )}
             {isEventActive && currentEventDetails?.narration && (
                <div className="mt-2 text-center p-2 bg-slate-700/50 rounded">
                    <h4 className="text-md font-medium text-purple-300 mb-1">Event Details:</h4>
                    <p className="text-sm text-slate-300 italic">{currentEventDetails.narration}</p>
                </div>
            )}
          </section>
          
          <section aria-labelledby="world-map-heading" className="bg-slate-700/30 p-4 rounded-lg shadow">
            <h3 id="world-map-heading" className="text-2xl font-semibold mb-3 text-lime-400">World Map</h3>
            <MinimapPanel 
                visitedLocations={visitedLocations} 
                currentCoordinates={currentCoordinates} 
                onSelectLocationForModal={onSelectLocationForModal} 
                visualStyle={visualStyle} // Pass visualStyle
            />
          </section>
        </div>

        {/* --- RIGHT COLUMN (Items, NPCs, Inventory, Crafting) --- */}
        <div className="space-y-6 lg:col-span-4">
          <section aria-labelledby="location-items-heading" className="bg-slate-700/30 p-4 rounded-lg shadow">
            <div className="flex justify-between items-center mb-4">
              <h3 id="location-items-heading" className="text-2xl font-semibold text-red-400">Items Here</h3>
              <button
                onClick={itemProps.onTriggerLookForItems}
                disabled={isEventActive || itemProps.isLoadingItems || itemsAlreadyFoundOrSearched || !!npcProps.talkingToNPC || characterData.isDefeated}
                className="bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold py-1.5 px-3 rounded-md transition-colors duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label={itemsAlreadyFoundOrSearched ? "Items already searched/found" : "Search for items in this area"}
              >
                {itemProps.isLoadingItems ? <Spinner className="w-4 h-4"/> : (itemsAlreadyFoundOrSearched ? 'Searched' : 'Search Area')}
              </button>
            </div>
            {itemProps.isLoadingItems && !itemsAlreadyFoundOrSearched && ( 
              <div className="flex items-center text-slate-400">
                <Spinner className="w-5 h-5 mr-2 text-emerald-500" />
                <span>Searching for items...</span>
              </div>
            )}
            {itemProps.itemsError && !itemProps.isLoadingItems && (
              <Alert type="error" message={`Failed to load items: ${itemProps.itemsError}`} />
            )}
            {!itemProps.isLoadingItems && !itemProps.itemsError && (
              <LocationItemsList 
                items={itemProps.locationItems} 
                onPickupItem={itemProps.onPickupItem}
                isPickingUpItemId={itemProps.isPickingUpItemId}
                onSelectItemForModal={itemProps.onSelectItemForModal}
              />
            )}
          </section>

          <section aria-labelledby="location-npcs-heading" className="bg-slate-700/30 p-4 rounded-lg shadow">
            <div className="flex justify-between items-center mb-4">
                <h3 id="location-npcs-heading" className="text-2xl font-semibold text-sky-400">People Here</h3>
                <button
                    onClick={npcProps.onTriggerLookForPeople}
                    disabled={isEventActive || npcProps.isLoadingNPCs || npcsAlreadyFoundOrSearched || !!npcProps.talkingToNPC || characterData.isDefeated}
                    className="bg-cyan-700 hover:bg-cyan-600 text-white text-xs font-semibold py-1.5 px-3 rounded-md transition-colors duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label={npcsAlreadyFoundOrSearched ? "People already searched/found" : "Look for people in this area"}
                >
                    {npcProps.isLoadingNPCs ? <Spinner className="w-4 h-4"/> : (npcsAlreadyFoundOrSearched ? 'Searched' : 'Look for People')}
                </button>
            </div>
            {npcProps.isLoadingNPCs && !npcsAlreadyFoundOrSearched && ( 
              <div className="flex items-center text-slate-400">
                <Spinner className="w-5 h-5 mr-2 text-cyan-500" />
                <span>Looking for people...</span>
              </div>
            )}
            {npcProps.npcsError && !npcProps.isLoadingNPCs && (
              <Alert type="error" message={`Failed to find NPCs: ${npcProps.npcsError}`} />
            )}
            {!npcProps.isLoadingNPCs && !npcProps.npcsError && (
              <LocationNPCsList
                npcs={npcProps.locationNPCs}
                onStartConversation={npcProps.onStartConversation}
                onSelectNPCForModal={npcProps.onSelectNPCForModal}
                isInteracting={!!npcProps.talkingToNPC}
                isEventActive={isEventActive}
                currentEventDetails={currentEventDetails}
                visualStyle={visualStyle} // Pass visualStyle
              />
            )}
          </section>

          <section aria-labelledby="player-inventory-heading" className="bg-slate-700/30 p-4 rounded-lg shadow">
            <InventoryPanel 
              items={playerInventory} 
              onUseItem={characterProps.onUseItem}
              isUsingItemId={characterProps.isUsingItemId}
              onSelectItemForModal={itemProps.onSelectItemForModal}
              craftingSlots={craftingProps.craftingSlots}
              isApplyingToLimbId={characterProps.isApplyingToLimbId}
            />
          </section>

          <section aria-labelledby="crafting-area-heading" className="bg-slate-700/30 p-4 rounded-lg shadow">
            <CraftingArea
              craftingSlots={craftingProps.craftingSlots}
              playerInventory={playerInventory} 
              onAddItemToSlot={craftingProps.onAddItemToCraftingSlot}
              onRemoveItemFromSlot={craftingProps.onRemoveItemFromSlot}
              onAttemptCraft={craftingProps.onAttemptCraft}
              isCrafting={craftingProps.isCrafting}
            />
          </section>
        </div>
      </div>
    </div>
  );
};

export default GameInterface;