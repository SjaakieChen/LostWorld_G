// components/InventoryPanel.tsx
import React, { useState, useEffect } from 'react';
import { GameItem, ItemRarity, CharacterData } from '../services/gameTypes'; 
import Spinner from './Spinner';
import { useGameContext } from '../contexts/GameContext'; // Import context

interface InventoryPanelProps {
  items: GameItem[]; // This will still be playerInventory passed from App/GameInterface
  onUseItem: (itemId: string) => void;
  isUsingItemId: string | null;
  onSelectItemForModal: (item: GameItem) => void;
  craftingSlots: (GameItem | null)[]; 
  isApplyingToLimbId: string | null; 
  // characterData is no longer needed as a prop, will be taken from context
}

const TOTAL_INVENTORY_SLOTS = 4;

const getRarityColorInfo = (rarity: ItemRarity): { border: string, hoverBorder: string, bg?: string, text?: string } => {
  switch (rarity) {
    case 'Common': return { border: 'border-slate-500', hoverBorder: 'hover:border-slate-400', bg: 'bg-slate-500', text: 'text-slate-100' };
    case 'Uncommon': return { border: 'border-green-500', hoverBorder: 'hover:border-green-400', bg: 'bg-green-500', text: 'text-green-100' };
    case 'Rare': return { border: 'border-sky-500', hoverBorder: 'hover:border-sky-400', bg: 'bg-sky-500', text: 'text-sky-100' };
    case 'Epic': return { border: 'border-purple-500', hoverBorder: 'hover:border-purple-400', bg: 'bg-purple-500', text: 'text-purple-100' };
    case 'Legendary': return { border: 'border-amber-500', hoverBorder: 'hover:border-amber-400', bg: 'bg-amber-500', text: 'text-amber-100' };
    default: return { border: 'border-slate-600', hoverBorder: 'hover:border-slate-500', bg: 'bg-slate-600', text: 'text-slate-100' };
  }
};


const InventoryPanel: React.FC<InventoryPanelProps> = ({ 
  items, // This is playerInventory from GameContext, passed down
  onUseItem, 
  isUsingItemId, 
  onSelectItemForModal,
  craftingSlots,
  isApplyingToLimbId
}) => {
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const { characterData } = useGameContext(); // Get characterData from context
  
  const handleDragStart = (event: React.DragEvent<HTMLDivElement>, item: GameItem) => {
    event.dataTransfer.setData('application/json', JSON.stringify(item));
    event.dataTransfer.effectAllowed = 'move';
    setDraggedItemId(item.id);

    // Create custom drag preview
    const dragPreview = document.createElement('div');
    dragPreview.style.position = 'absolute';
    dragPreview.style.top = '-1000px'; // Position off-screen initially
    dragPreview.style.padding = '0.5rem';
    dragPreview.style.borderRadius = '0.375rem'; // Corresponds to rounded-md
    dragPreview.style.display = 'flex';
    dragPreview.style.alignItems = 'center';
    dragPreview.style.gap = '0.5rem';
    dragPreview.style.opacity = '1'; // Fully opaque
    dragPreview.style.fontSize = '0.875rem'; // text-sm
    
    const rarityColors = getRarityColorInfo(item.rarity);
    dragPreview.style.backgroundColor = tailwindColorToActual(rarityColors.bg || 'bg-slate-600');
    dragPreview.style.color = tailwindColorToActual(rarityColors.text || 'text-slate-100');
    
    const img = document.createElement('img');
    img.src = item.iconUrl;
    img.alt = item.name;
    img.style.width = '2rem'; // w-8
    img.style.height = '2rem'; // h-8
    img.style.objectFit = 'contain';
    img.style.borderRadius = '0.25rem'; // rounded-sm
    dragPreview.appendChild(img);

    const nameSpan = document.createElement('span');
    nameSpan.textContent = item.name;
    nameSpan.style.fontWeight = '500'; // font-medium
    dragPreview.appendChild(nameSpan);

    document.body.appendChild(dragPreview);
    event.dataTransfer.setDragImage(dragPreview, 20, 20); // Offset slightly from cursor

    // Clean up the preview element
    setTimeout(() => {
      if (document.body.contains(dragPreview)) {
        document.body.removeChild(dragPreview);
      }
    }, 0);
  };

  const handleDragEnd = () => {
    setDraggedItemId(null); 
  };

  const itemBeingAppliedLimbEffectiveId = isApplyingToLimbId ? isApplyingToLimbId.split('-')[0] : null;
  
  const itemsInCraftingSlotsIds = new Set(
    craftingSlots.filter(Boolean).map(item => item!.id)
  );

  const equippedItemIds = new Set(
    (characterData?.limbs || [])
        .flatMap(limb => limb.equippedItems || []) // Get all equipped items from all limbs
        .map(item => item.id)
  );

  const displayableInventory = items.filter(item => {
    if (itemsInCraftingSlotsIds.has(item.id)) return false;
    if (item.id === itemBeingAppliedLimbEffectiveId) return false;
    if (equippedItemIds.has(item.id)) return false; // Filter out equipped items
    return true;
  });

  useEffect(() => {
    if (draggedItemId && displayableInventory.some(item => item.id === draggedItemId)) {
      // If the item that was marked as "dragged" is now part of the displayable inventory,
      // it means its active drag state that moved it *out* of the main inventory list has concluded.
      // (e.g., it returned from crafting, or a drag was cancelled).
      // Clearing draggedItemId ensures it's not incorrectly styled as "being dragged".
      setDraggedItemId(null);
    }
  }, [displayableInventory, draggedItemId]);


  const inventorySlotsToRender = Array(TOTAL_INVENTORY_SLOTS).fill(null);

  return (
    <div className="mt-6">
      <h3 id="inventory-heading" className="text-2xl font-semibold mb-4 text-red-400">Your Inventory</h3>
      {(items.length === 0 && !itemsInCraftingSlotsIds.size && !itemBeingAppliedLimbEffectiveId && !equippedItemIds.size) ? (
        <p className="text-slate-400 italic text-center col-span-full py-4">Your backpack feels light... too light. It's empty.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {inventorySlotsToRender.map((_, index) => {
            const item = displayableInventory[index];
            if (item) {
              const isLoadingThisItem = isUsingItemId === item.id;
              const isBeingDragged = item.id === draggedItemId;
              const rarityColors = getRarityColorInfo(item.rarity);
              
              const itemStyle: React.CSSProperties = isBeingDragged 
                ? { opacity: 0.05, transform: 'scale(0.95)', transition: 'opacity 0.1s ease-out, transform 0.1s ease-out' } 
                : { transition: 'opacity 0.1s ease-in, transform 0.1s ease-in' };

              return (
                <div 
                  key={item.id} 
                  draggable={!isLoadingThisItem}
                  onDragStart={(e) => !isLoadingThisItem && handleDragStart(e, item)}
                  onDragEnd={handleDragEnd}
                  style={itemStyle}
                  className={`bg-slate-700/70 p-3 rounded-lg shadow-md flex flex-col items-center text-center group relative min-h-[12rem] border-2 ${rarityColors.border} ${rarityColors.hoverBorder} transition-all duration-150 ease-out hover:shadow-red-500/30 ${!isBeingDragged && !isLoadingThisItem ? 'cursor-grab' : ''} ${isBeingDragged ? 'cursor-grabbing' : ''} ${isLoadingThisItem ? 'opacity-50 cursor-default': ''}`}
                  aria-label={`Inventory item: ${item.name}, Rarity: ${item.rarity}. ${!isLoadingThisItem ? 'Draggable.' : ''}`}
                  title={!isLoadingThisItem ? `Drag to use on self/limbs or combine in crafting. Click to view details.` : item.name}
                >
                  <button
                    type="button"
                    onClick={() => !isBeingDragged && onSelectItemForModal(item)}
                    disabled={isBeingDragged || isLoadingThisItem}
                    className="w-full flex flex-col items-center focus:outline-none focus:ring-2 focus:ring-red-400 rounded-md p-1 flex-grow"
                    aria-label={`View details for ${item.name}`}
                  >
                    <img 
                      src={item.iconUrl} 
                      alt={`${item.name} icon`} 
                      className="w-20 h-20 md:w-24 md:h-24 object-contain mb-2 rounded bg-slate-600/50 p-1 pointer-events-none"
                    />
                    <h4 className="text-base font-medium text-red-400 mb-1 pointer-events-none">{item.name}</h4>
                    <p 
                      className="text-sm text-slate-400 overflow-hidden overflow-ellipsis whitespace-nowrap max-w-full pointer-events-none"
                      title={`${item.itemTypeGuess} - Rarity: ${item.rarity}`}
                    >
                      {item.itemTypeGuess} ({item.rarity})
                    </p>
                  </button>
                  <button
                    onClick={(e) => {
                       e.stopPropagation(); 
                       if (!isBeingDragged) onUseItem(item.id);
                    }}
                    disabled={isLoadingThisItem || !!isUsingItemId || isBeingDragged} 
                    className="mt-auto w-full bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold py-1.5 px-2.5 rounded-md transition-colors duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-rose-400 focus:ring-opacity-75 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center"
                    aria-label={`Use ${item.name}`}
                  >
                    {isLoadingThisItem ? (
                      <>
                        <Spinner className="w-4 h-4 mr-1.5" />
                        Using...
                      </>
                    ) : (
                      'Use'
                    )}
                  </button>
                </div>
              );
            } else {
              return (
                <div
                  key={`empty-slot-${index}`}
                  className="bg-slate-700/20 p-3 rounded-lg shadow-inner min-h-[12rem] border-2 border-dashed border-slate-600 flex items-center justify-center"
                  aria-label="Empty inventory slot"
                >
                  <span className="text-slate-500 text-xs italic">Empty Slot</span>
                </div>
              );
            }
          })}
          {displayableInventory.length === 0 && (itemsInCraftingSlotsIds.size > 0 || !!itemBeingAppliedLimbEffectiveId || equippedItemIds.size > 0) && (
             <p className="text-slate-400 italic text-center col-span-full py-4">
               All inventory items are currently in use (crafting/equipping) or all slots are empty.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default InventoryPanel;

const tailwindColorToActual = (twColorClass: string): string => {
    const mapping: Record<string, string> = {
        'bg-slate-500': '#64748b', 'text-slate-100': '#f1f5f9',
        'bg-green-500': '#22c55e', 'text-green-100': '#dcfce7',
        'bg-sky-500': '#0ea5e9',   'text-sky-100': '#e0f2fe',
        'bg-purple-500': '#a855f7','text-purple-100': '#f3e8ff',
        'bg-amber-500': '#f59e0b', 'text-amber-100': '#fffbeb',
        'bg-slate-600': '#475569',
    };
    return mapping[twColorClass] || '#475569'; // Default color
};