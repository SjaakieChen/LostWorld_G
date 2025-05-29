
// components/ItemDetailsModal.tsx
import React from 'react';
import { GameItem, ItemRarity, CharacterData, PotentialDiscovery, VisualStyleType } from '../services/gameTypes'; 
import { elaborateOnItemDescription } from '../services/itemService'; 
import { ProcessedTextWithDiscoveries } from '../services/loreService';
import { useGameContext } from '../contexts/GameContext';
import Spinner from './Spinner';
import { useEntityElaboration } from '../hooks/useEntityElaboration'; // Import the new hook

interface ItemDetailsModalProps {
  item: GameItem;
  onClose: () => void;
  characterData: CharacterData;
  onDescriptionElaborated: (
    itemId: string, 
    newRawDescription: string, 
    newProcessedDescriptionWithTags: string, 
    potentialDiscoveries: Omit<PotentialDiscovery, 'id' | 'status' | 'firstMentionedTimestamp' | 'firstMentionedLocationKey'>[]
  ) => void; 
  onSelectImageForViewing: (url: string, alt: string) => void; 
}

const getRarityBorderColor = (rarity: ItemRarity): string => {
  switch (rarity) {
    case 'Common': return 'ring-slate-500';
    case 'Uncommon': return 'ring-green-500';
    case 'Rare': return 'ring-sky-500';
    case 'Epic': return 'ring-purple-500';
    case 'Legendary': return 'ring-amber-500';
    default: return 'ring-slate-600';
  }
};

const getRarityTextColor = (rarity: ItemRarity): string => {
  switch (rarity) {
    case 'Common': return 'text-slate-400';
    case 'Uncommon': return 'text-green-400';
    case 'Rare': return 'text-sky-400';
    case 'Epic': return 'text-purple-400';
    case 'Legendary': return 'text-amber-400';
    default: return 'text-slate-500';
  }
};

const textualItemTypes = ['book', 'scroll', 'note', 'letter', 'manuscript', 'codex', 'journal', 'log', 'brochure', 'pamphlet', 'inscription', 'carving', 'tablet', 'map', 'document'];
const isTextualItem = (itemTypeGuess: string): boolean => {
  if (!itemTypeGuess) return false;
  return textualItemTypes.some(type => itemTypeGuess.toLowerCase().includes(type));
};

const ItemDetailsModal: React.FC<ItemDetailsModalProps> = ({ 
  item, 
  onClose, 
  characterData, 
  onDescriptionElaborated,
  onSelectImageForViewing
}) => {
  const rarityBorderClass = getRarityBorderColor(item.rarity);
  const rarityTextClass = getRarityTextColor(item.rarity);
  const visualStyle = characterData.visualStyle;

  const {
    displayedDescriptionNode,
    handleTriggerElaboration,
    isElaborating,
    canElaborate,
    elaborationButtonText: dynamicElaborationButtonText,
  } = useEntityElaboration<GameItem>({
    entity: item,
    entityId: item.id,
    initialDescription: item.description, // This should be the one with tags if already elaborated
    elaborationServiceFn: elaborateOnItemDescription,
    onSuccess: onDescriptionElaborated,
    characterData,
    isTextualItemContext: isTextualItem(item.itemTypeGuess),
  });
  
  const imageRenderingStyle: React.CSSProperties = {
    imageRendering: visualStyle === 'Pixel Art' ? 'pixelated' : 'auto',
  };

  return (
    <div 
      className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 z-50" 
      aria-modal="true" 
      role="dialog"
      onClick={onClose} 
    >
      <div 
        className={`bg-slate-800 p-6 rounded-lg shadow-2xl max-w-lg w-full ring-2 ${rarityBorderClass} relative transform transition-all duration-300 ease-out scale-95 opacity-0 animate-modal-appear max-h-[90vh] flex flex-col`}
        onClick={(e) => e.stopPropagation()} 
        style={{
            animationName: 'modal-appear-animation',
            animationDuration: '0.3s',
            animationFillMode: 'forwards',
        }}
        aria-labelledby="item-modal-title"
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-slate-400 hover:text-slate-200 text-2xl leading-none z-10"
          aria-label="Close item details"
        >
          &times;
        </button>
        
        <div className="flex flex-col items-center text-center mb-4">
          <button
            type="button"
            onClick={() => onSelectImageForViewing(item.iconUrl, item.name)}
            className={`focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 ${rarityBorderClass} rounded-md`}
            aria-label={`View larger image of ${item.name}`}
            title={`View larger image of ${item.name}`}
          >
            <img 
              src={item.iconUrl} 
              alt={`${item.name} icon`} 
              className={`w-24 h-24 object-contain rounded-md bg-slate-700 p-2 ring-1 ${rarityBorderClass}`}
              style={imageRenderingStyle}
            />
          </button>
          <h3 id="item-modal-title" className="text-2xl font-semibold text-red-400 mt-3 mb-1">{item.name}</h3>
          <p className={`text-sm ${rarityTextClass} font-medium mb-1`}>{item.rarity}</p>
          <p className="text-sm text-slate-500 mb-4 italic">({item.itemTypeGuess})</p>
        </div>
        
        <div className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap mb-3 text-left max-h-64 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-slate-700/50 pr-2 flex-grow">
          {displayedDescriptionNode}
        </div>

        {canElaborate && (
          <button
            onClick={handleTriggerElaboration}
            disabled={isElaborating}
            className="w-full bg-teal-600 hover:bg-teal-500 text-white font-semibold py-2 px-4 rounded-lg transition-colors text-sm mb-3 disabled:opacity-70 flex items-center justify-center"
            aria-label={`Elaborate on ${item.name}`}
          >
            {isElaborating ? (
              <>
                <Spinner className="w-4 h-4 mr-2" /> Thinking...
              </>
            ) : (
              dynamicElaborationButtonText
            )}
          </button>
        )}

        <button
          onClick={onClose}
          className="w-full bg-sky-600 hover:bg-sky-500 text-white font-semibold py-2.5 px-4 rounded-lg transition-colors"
          aria-label="Confirm and close item details"
        >
          Close
        </button>
      </div>
      <style>{`
        @keyframes modal-appear-animation {
          to {
            transform: scale(1);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
};

export default ItemDetailsModal;
