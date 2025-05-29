
// components/NPCDetailsModal.tsx
import React from 'react';
import { GameNPC, CharacterData, NPCRarity, GameItem, PotentialDiscovery, VisualStyleType } from '../services/gameTypes'; 
import { elaborateOnNpcDescription } from '../services/npcService';
import { ProcessedTextWithDiscoveries } from '../services/loreService';
import Spinner from './Spinner';
import { useEntityElaboration } from '../hooks/useEntityElaboration'; // Import the new hook

interface NPCDetailsModalProps {
  npc: GameNPC;
  onClose: () => void;
  characterData: CharacterData;
  onDescriptionElaborated: (
    npcId: string, 
    newRawDescription: string, 
    newProcessedDescriptionWithTags: string, 
    potentialDiscoveries: Omit<PotentialDiscovery, 'id' | 'status' | 'firstMentionedTimestamp' | 'firstMentionedLocationKey'>[]
  ) => void; 
  onSelectImageForViewing: (url: string, alt: string) => void; 
}

const getNpcRarityStyle = (rarity: NPCRarity): { border: string; text: string } => {
  switch (rarity) {
    case 'Common': return { border: 'ring-slate-500', text: 'text-slate-400' };
    case 'Uncommon': return { border: 'ring-green-500', text: 'text-green-400' };
    case 'Rare': return { border: 'ring-sky-500', text: 'text-sky-400' };
    case 'Epic': return { border: 'ring-purple-500', text: 'text-purple-400' };
    case 'Legendary': return { border: 'ring-amber-500', text: 'text-amber-400' };
    default: return { border: 'ring-slate-600', text: 'text-slate-500' };
  }
};

const getItemRarityColor = (rarity: GameItem['rarity']): string => {
  switch (rarity) {
    case 'Common': return 'text-slate-400';
    case 'Uncommon': return 'text-green-400';
    case 'Rare': return 'text-sky-400';
    case 'Epic': return 'text-purple-400';
    case 'Legendary': return 'text-amber-400';
    default: return 'text-slate-500';
  }
};


const NPCDetailsModal: React.FC<NPCDetailsModalProps> = ({ 
  npc, 
  onClose, 
  characterData,
  onDescriptionElaborated, 
  onSelectImageForViewing 
}) => {
  const rarityStyle = getNpcRarityStyle(npc.rarity);
  const visualStyle = characterData.visualStyle;

  const {
    displayedDescriptionNode,
    handleTriggerElaboration,
    isElaborating,
    canElaborate,
    elaborationButtonText,
  } = useEntityElaboration<GameNPC>({
    entity: npc,
    entityId: npc.id,
    initialDescription: npc.description, // This should be the one with tags if already elaborated
    elaborationServiceFn: elaborateOnNpcDescription,
    onSuccess: onDescriptionElaborated,
    characterData,
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
        className="bg-slate-800 p-6 rounded-lg shadow-2xl max-w-xl w-full ring-1 ring-slate-700 relative transform transition-all duration-300 ease-out scale-95 opacity-0 animate-modal-appear max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()} 
        style={{
            animationName: 'modal-appear-animation',
            animationDuration: '0.3s',
            animationFillMode: 'forwards',
        }}
        aria-labelledby="npc-modal-title"
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-slate-400 hover:text-slate-200 text-2xl leading-none z-10"
          aria-label={`Close details for ${npc.name}`}
        >
          &times;
        </button>
        
        <div className="flex flex-col items-center text-center mb-4">
          <button
            type="button"
            onClick={() => onSelectImageForViewing(npc.iconUrl, npc.name)}
            className={`focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 ${rarityStyle.border} rounded-md`}
            aria-label={`View larger image of ${npc.name}`}
            title={`View larger image of ${npc.name}`}
          >
            <img 
              src={npc.iconUrl} 
              alt={`${npc.name} portrait`} 
              className="w-32 h-32 object-contain rounded-md bg-slate-700 p-2 ring-1 ring-slate-600"
              style={imageRenderingStyle}
            />
          </button>
          <h3 id="npc-modal-title" className="text-3xl font-semibold text-sky-400 mt-3 mb-1">{npc.name}</h3>
          <p className={`text-sm ${rarityStyle.text} mb-2`}>({npc.rarity})</p>
        </div>

        <div className="space-y-3 text-sm text-slate-300 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-slate-700/50 pr-2 flex-grow">
            <div>
                <h4 className="font-semibold text-sky-500 mb-0.5">Description:</h4>
                <div className="leading-relaxed whitespace-pre-wrap">{displayedDescriptionNode}</div>
                {canElaborate && (
                  <button
                    onClick={handleTriggerElaboration}
                    disabled={isElaborating}
                    className="mt-2 text-xs bg-teal-700 hover:bg-teal-600 text-teal-200 font-semibold py-1 px-2.5 rounded-md transition-colors disabled:opacity-70 flex items-center"
                    aria-label={`Learn more about ${npc.name}`}
                  >
                    {isElaborating ? (
                      <>
                        <Spinner className="w-3 h-3 mr-1.5" /> Thinking...
                      </>
                    ) : (
                      elaborationButtonText
                    )}
                  </button>
                )}
            </div>
            <div>
                <h4 className="font-semibold text-sky-500 mb-0.5 mt-2">Appearance:</h4>
                <p className="leading-relaxed whitespace-pre-wrap">{npc.appearanceDetails}</p>
            </div>
            <div>
                <h4 className="font-semibold text-sky-500 mb-0.5 mt-2">Greeting:</h4>
                <p className="leading-relaxed whitespace-pre-wrap italic">"{npc.dialogueGreeting}"</p>
            </div>
            <div>
                <h4 className="font-semibold text-sky-500 mb-0.5 mt-2">Known Possessions:</h4>
                {npc.inventory && npc.inventory.length > 0 ? (
                    <ul className="list-disc list-inside pl-1 space-y-0.5">
                        {npc.inventory.map(item => (
                            <li key={item.id} className="text-xs">
                                {item.name} <span className={`${getItemRarityColor(item.rarity)}`}>({item.rarity})</span>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-xs italic text-slate-400">Carrying nothing of note.</p>
                )}
            </div>
        </div>

        <button
          onClick={onClose}
          className="mt-6 w-full bg-cyan-600 hover:bg-cyan-500 text-white font-semibold py-2.5 px-4 rounded-lg transition-colors"
          aria-label={`Confirm and close details for ${npc.name}`}
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

export default NPCDetailsModal;
