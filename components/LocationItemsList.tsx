// components/LocationItemsList.tsx
import React from 'react';
import { GameItem, ItemRarity } from '../services/gameTypes'; // Corrected import path for GameItem type
import Spinner from './Spinner';

interface LocationItemsListProps {
  items: GameItem[] | null; 
  onPickupItem: (itemId: string) => void;
  isPickingUpItemId: string | null; 
  onSelectItemForModal: (item: GameItem) => void;
}

const getRarityBorderColor = (rarity: ItemRarity): string => {
  switch (rarity) {
    case 'Common': return 'border-slate-500 hover:border-slate-400';
    case 'Uncommon': return 'border-green-500 hover:border-green-400';
    case 'Rare': return 'border-sky-500 hover:border-sky-400';
    case 'Epic': return 'border-purple-500 hover:border-purple-400';
    case 'Legendary': return 'border-amber-500 hover:border-amber-400';
    default: return 'border-slate-600 hover:border-slate-500';
  }
};

const LocationItemsList: React.FC<LocationItemsListProps> = ({ items, onPickupItem, isPickingUpItemId, onSelectItemForModal }) => {
  if (items === null) {
    return <p className="text-slate-400 italic">You haven't thoroughly searched this area for items yet. Try 'look around' or 'examine area'.</p>;
  }

  if (items.length === 0) {
    return <p className="text-slate-400 italic">You look around but find no distinct items of interest here.</p>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {items.map((item) => {
        const isLoadingThisItem = isPickingUpItemId === item.id;
        const rarityBorderClass = getRarityBorderColor(item.rarity);
        return (
          <div 
            key={item.id} 
            className={`bg-slate-700 p-3 rounded-lg shadow-md flex flex-col items-center text-center group relative min-h-[12rem] border-2 ${rarityBorderClass} transition-colors`}
            aria-label={`Item: ${item.name}, Rarity: ${item.rarity}`}
          >
            <button
              type="button"
              onClick={() => onSelectItemForModal(item)}
              className="w-full flex flex-col items-center focus:outline-none focus:ring-2 focus:ring-red-400 rounded-md p-1 flex-grow"
              aria-label={`View details for ${item.name}`}
            >
              <img 
                src={item.iconUrl} 
                alt={`${item.name} icon`} 
                className="w-20 h-20 md:w-24 md:h-24 object-contain mb-2 rounded bg-slate-600/50 p-1 group-hover:scale-105 transition-transform"
              />
              <h4 className="text-base font-medium text-red-400 group-hover:text-red-300 mb-1">{item.name}</h4>
              <p 
                className="text-sm text-slate-400 overflow-hidden overflow-ellipsis whitespace-nowrap max-w-full"
                title={`${item.itemTypeGuess} - Rarity: ${item.rarity}`}
              >
                {item.itemTypeGuess} ({item.rarity})
              </p>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation(); // Prevent modal from opening if pickup is clicked
                onPickupItem(item.id);
              }}
              disabled={isLoadingThisItem || !!isPickingUpItemId} 
              className="mt-auto w-full bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold py-1.5 px-2.5 rounded-md transition-colors duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-opacity-75 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center"
              aria-label={`Pick up ${item.name}`}
            >
              {isLoadingThisItem ? (
                <>
                  <Spinner className="w-4 h-4 mr-1.5" />
                  Taking...
                </>
              ) : (
                'Pick Up'
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
};

export default LocationItemsList;