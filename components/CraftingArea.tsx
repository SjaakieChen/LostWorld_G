// components/CraftingArea.tsx
import React, { useState } from 'react';
import { GameItem, ItemRarity } from '../services/gameTypes'; // Corrected import path for GameItem type
import Spinner from './Spinner';

interface CraftingAreaProps {
  craftingSlots: (GameItem | null)[];
  playerInventory: GameItem[];
  onAddItemToSlot: (item: GameItem, slotIndex: number) => void;
  onRemoveItemFromSlot: (slotIndex: number) => void;
  onAttemptCraft: () => void;
  isCrafting: boolean;
}

const getRarityBorderColor = (rarity: ItemRarity): string => {
  switch (rarity) {
    case 'Common': return 'border-slate-500';
    case 'Uncommon': return 'border-green-500';
    case 'Rare': return 'border-sky-500';
    case 'Epic': return 'border-purple-500';
    case 'Legendary': return 'border-amber-500';
    default: return 'border-slate-600';
  }
};

const getRarityHoverBorderColor = (rarity: ItemRarity): string => {
  switch (rarity) {
    case 'Common': return 'hover:border-slate-400';
    case 'Uncommon': return 'hover:border-green-400';
    case 'Rare': return 'hover:border-sky-400';
    case 'Epic': return 'hover:border-purple-400';
    case 'Legendary': return 'hover:border-amber-400';
    default: return 'hover:border-slate-500';
  }
};

const CraftingArea: React.FC<CraftingAreaProps> = ({
  craftingSlots,
  playerInventory,
  onAddItemToSlot,
  onRemoveItemFromSlot,
  onAttemptCraft,
  isCrafting,
}) => {
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number | null>(null);
  const [draggedOverSlotIndex, setDraggedOverSlotIndex] = useState<number | null>(null);


  const openItemSelectionModal = (slotIndex: number) => {
    setSelectedSlotIndex(slotIndex);
    setIsModalOpen(true);
  };

  const handleSelectItemFromModal = (item: GameItem) => {
    if (selectedSlotIndex !== null) {
      onAddItemToSlot(item, selectedSlotIndex);
    }
    setIsModalOpen(false);
    setSelectedSlotIndex(null);
  };

  const canCraft = craftingSlots.some(slot => slot !== null) && !isCrafting;

  const availableInventoryForModal = playerInventory.filter(
    invItem => !craftingSlots.some(slotItem => slotItem?.id === invItem.id)
  );

  const handleDragOverSlot = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move"; // Indicate that a move is possible
  };

  const handleDragEnterSlot = (event: React.DragEvent<HTMLDivElement>, slotIndex: number) => {
    event.preventDefault();
    if (craftingSlots[slotIndex] === null) { 
        setDraggedOverSlotIndex(slotIndex);
    }
  };

  const handleDragLeaveSlot = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDraggedOverSlotIndex(null);
  };

  const handleDropOnSlot = (event: React.DragEvent<HTMLDivElement>, slotIndex: number) => {
    event.preventDefault();
    setDraggedOverSlotIndex(null);
    if (craftingSlots[slotIndex] !== null) { 
      return;
    }
    try {
      const itemDataString = event.dataTransfer.getData('application/json');
      if (itemDataString) {
        const droppedItem: GameItem = JSON.parse(itemDataString);
        
        if (craftingSlots.some(slotItem => slotItem?.id === droppedItem.id)) {
            return;
        }
        if (droppedItem && droppedItem.id) {
          onAddItemToSlot(droppedItem, slotIndex);
        } else {
          console.error("Dropped item data is invalid for crafting slot:", droppedItem);
        }
      }
    } catch (e) {
      console.error("Error parsing dropped item data for crafting slot:", e);
    }
  };


  return (
    <div className="mt-6">
      <h3 className="text-2xl font-semibold mb-4 text-purple-400">Crafting Area</h3>
      <div className="grid grid-cols-3 gap-3 mb-4 p-3 bg-slate-700/50 rounded-lg ring-1 ring-slate-600">
        {craftingSlots.map((item, index) => {
          const isDragTarget = draggedOverSlotIndex === index && !item;
          const baseSlotClasses = `aspect-square rounded-md flex flex-col items-center justify-center p-2 text-center transition-all duration-150 ease-in-out`;
          
          let slotClasses = item 
            ? `${baseSlotClasses} border-2 ${getRarityBorderColor(item.rarity)} bg-slate-600/50 ${getRarityHoverBorderColor(item.rarity)} cursor-default`
            : `${baseSlotClasses} border-2 border-dashed border-slate-500 hover:border-purple-400 hover:bg-slate-700 cursor-pointer`;
          
          if (isDragTarget) {
            slotClasses = `${baseSlotClasses} border-2 border-purple-500 bg-purple-600/30 ring-2 ring-purple-400 scale-105`;
          }
          
          return (
            <div
              key={index}
              className={slotClasses}
              onClick={() => !item && openItemSelectionModal(index)}
              onDragOver={handleDragOverSlot}
              onDragEnter={(e) => handleDragEnterSlot(e, index)}
              onDragLeave={handleDragLeaveSlot}
              onDrop={(e) => handleDropOnSlot(e, index)}
              role="button"
              tabIndex={0}
              aria-label={item ? `Crafting slot ${index + 1} contains ${item.name} (${item.rarity}). Click to remove.` : `Crafting slot ${index + 1} is empty. Click or drag item to add.`}
              title={item ? `Item: ${item.name}. Rarity: ${item.rarity}` : "Empty crafting slot. Add an item."}
            >
              {item ? (
                <>
                  <img src={item.iconUrl} alt={item.name} className="w-12 h-12 object-contain mb-1 pointer-events-none" />
                  <p className="text-xs text-purple-300 truncate w-full pointer-events-none">{item.name}</p>
                   <p className="text-[0.65rem] text-slate-400 truncate w-full pointer-events-none">({item.rarity})</p>
                  <button
                    onClick={(e) => {
                      e.stopPropagation(); 
                      onRemoveItemFromSlot(index);
                    }}
                    className="mt-1 text-xs bg-red-700 hover:bg-red-600 px-2 py-0.5 rounded text-red-200"
                    aria-label={`Remove ${item.name} from slot ${index + 1}`}
                  >
                    Remove
                  </button>
                </>
              ) : (
                <span className={`text-slate-400 text-sm ${isDragTarget ? 'text-purple-300 font-semibold' : ''}`}>
                  {isDragTarget ? 'Drop Here' : 'Empty Slot'}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <button
        onClick={onAttemptCraft}
        disabled={!canCraft || isCrafting}
        className="w-full bg-purple-600 hover:bg-purple-500 text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-purple-400 focus:ring-opacity-75 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
        aria-label="Attempt to craft items in slots"
      >
        {isCrafting ? (
          <>
            <Spinner className="w-5 h-5 mr-2" />
            Crafting...
          </>
        ) : (
          'Craft Items'
        )}
      </button>

      {/* Item Selection Modal */}
      {isModalOpen && selectedSlotIndex !== null && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50" aria-modal="true" role="dialog">
          <div className="bg-slate-800 p-6 rounded-lg shadow-xl max-w-md w-full ring-1 ring-slate-700">
            <h4 className="text-xl font-semibold mb-4 text-purple-300">Select an Item for Slot {selectedSlotIndex + 1}</h4>
            {availableInventoryForModal.length > 0 ? (
              <div className="grid grid-cols-3 gap-3 max-h-60 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-slate-700/50">
                {availableInventoryForModal.map(invItem => (
                  <button
                    key={invItem.id}
                    onClick={() => handleSelectItemFromModal(invItem)}
                    className={`p-2 bg-slate-700 hover:bg-purple-600 rounded-md flex flex-col items-center text-center transition-colors border-2 ${getRarityBorderColor(invItem.rarity)} ${getRarityHoverBorderColor(invItem.rarity)}`}
                    aria-label={`Select ${invItem.name} (${invItem.rarity})`}
                  >
                    <img src={invItem.iconUrl} alt={invItem.name} className="w-12 h-12 object-contain mb-1" />
                    <span className="text-xs text-slate-300 truncate w-full">{invItem.name}</span>
                    <span className="text-[0.65rem] text-slate-400 truncate w-full">({invItem.rarity})</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-slate-400">No available items in inventory to add.</p>
            )}
            <button
              onClick={() => setIsModalOpen(false)}
              className="mt-6 w-full bg-slate-600 hover:bg-slate-500 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
              aria-label="Close item selection"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CraftingArea;