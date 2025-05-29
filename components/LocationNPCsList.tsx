
// components/LocationNPCsList.tsx
import React from 'react';
import { GameNPC, NPCRarity, EventEffects, VisualStyleType } from '../services/gameTypes'; // Added EventEffects, VisualStyleType
import { useGameContext } from '../contexts/GameContext';

interface LocationNPCsListProps {
  npcs: GameNPC[] | null;
  onStartConversation: (npcId: string) => void;
  onSelectNPCForModal: (npc: GameNPC) => void;
  isInteracting: boolean;
  isEventActive: boolean; // Added from GameInterface
  currentEventDetails: EventEffects | null; // Added from GameInterface
  visualStyle: VisualStyleType; // Added visualStyle prop
}

const getNpcCardRarityStyle = (rarity: NPCRarity): { border: string; shadow?: string; } => {
  switch (rarity) {
    case 'Common': return { border: 'border-slate-500 hover:border-slate-400' };
    case 'Uncommon': return { border: 'border-green-500 hover:border-green-400' };
    case 'Rare': return { border: 'border-sky-500 hover:border-sky-400' };
    case 'Epic': return { border: 'border-purple-500 hover:border-purple-400', shadow: 'shadow-purple-500/30' };
    case 'Legendary': return { border: 'border-amber-500 hover:border-amber-400', shadow: 'shadow-amber-500/30' };
    default: return { border: 'border-slate-600 hover:border-slate-500' };
  }
};

const getRarityTextColorClass = (rarity: NPCRarity): string => {
  switch (rarity) {
    case 'Common': return 'text-slate-300';
    case 'Uncommon': return 'text-green-300';
    case 'Rare': return 'text-sky-300';
    case 'Epic': return 'text-purple-300';
    case 'Legendary': return 'text-amber-300';
    default: return 'text-slate-400';
  }
};


const LocationNPCsList: React.FC<LocationNPCsListProps> = ({ 
  npcs, 
  onStartConversation, 
  onSelectNPCForModal, 
  isInteracting,
  isEventActive,
  currentEventDetails,
  visualStyle
}) => {

  let activeNpcs: GameNPC[] = [];

  if (npcs === null && !isEventActive) { // Only show default if not event and NPCs not loaded
    return <p className="text-slate-400 italic">You haven't looked for anyone here yet. Try 'look for people' or 'search for NPCs'.</p>;
  }

  if (isEventActive) {
    const eventNpcIdsAffected = new Set(currentEventDetails?.npcEffects?.map(eff => eff.npcIdTargeted) || []);
    
    activeNpcs = (npcs || []).filter(npc => {
      if (npc.isDefeated) return false;
      if (npc.isEventSpawned) return true; // Event-spawned NPCs are always relevant

      const eventEffectOnNpc = currentEventDetails?.npcEffects?.find(eff => eff.npcIdTargeted === npc.id);
      if (eventEffectOnNpc) {
        return eventEffectOnNpc.isHiddenDuringEvent === false || eventEffectOnNpc.isHiddenDuringEvent === undefined;
      }
      // If NPC not mentioned in event effects, they are hidden during the event to focus on event characters.
      return false; 
    });

    // Add new temporary NPC if one exists in event details and isn't already in the list (e.g. if it was just added)
    const tempNpcFromEvent = currentEventDetails?.locationEffects?.newTemporaryNpc;
    if (tempNpcFromEvent) {
        // Check if a similar NPC (by name, as ID might not match if re-added) is already in activeNpcs from the main list.
        // This logic assumes temporary NPCs spawned by events are unique enough not to clash with existing NPCs if the event is re-triggered or complex.
        // For simplicity, we'll assume `isEventSpawned` handles this.
        const existingEventNpc = activeNpcs.find(n => n.isEventSpawned && n.name === tempNpcFromEvent.name);
        if (!existingEventNpc) {
            // This is a simplified GameNPC structure for display. Full generation happens in useEventSystem.
            // If `locationNPCs` from context ALREADY includes this temp NPC (because applyEventEffects added it),
            // the filter above will correctly include it if `isEventSpawned` is true.
            // This part is more of a fallback or for display logic if the temp NPC isn't yet in the main list.
        }
    }

  } else {
    activeNpcs = (npcs || []).filter(npc => !npc.isDefeated);
  }


  if (activeNpcs.length === 0) {
    const message = isEventActive 
        ? "The area seems devoid of other people, or they are obscured by the ongoing event."
        : "You look around but see no one else of note here.";
    return <p className="text-slate-400 italic">{message}</p>;
  }

  const imageRenderingStyle: React.CSSProperties = {
    imageRendering: visualStyle === 'Pixel Art' ? 'pixelated' : 'auto',
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {activeNpcs.map((npc) => {
        const cardRarityStyle = getNpcCardRarityStyle(npc.rarity);
        const rarityTextColor = getRarityTextColorClass(npc.rarity);
        const npcNameColor = npc.isEventSpawned ? 'text-purple-400' : 'text-sky-400'; // Purple name for event NPCs

        return (
          <div
            key={npc.id}
            className={`bg-slate-700 rounded-lg shadow-md overflow-hidden group relative aspect-[3/4] border-2 ${cardRarityStyle.border} ${cardRarityStyle.shadow ? `hover:${cardRarityStyle.shadow}` : ''} transition-all duration-150 ease-in-out cursor-pointer`}
            aria-label={`Character: ${npc.name}, Rarity: ${npc.rarity}`}
            onClick={() => onSelectNPCForModal(npc)}
          >
            <img
              src={npc.iconUrl}
              alt={`${npc.name}`}
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 ease-in-out group-hover:scale-105 pointer-events-none" // Added pointer-events-none so click goes to parent div
              style={imageRenderingStyle} // Apply dynamic style
            />
            <div className="absolute inset-0 flex flex-col justify-end p-3 bg-gradient-to-t from-slate-900/80 via-slate-900/50 to-transparent">
              <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation(); // Prevent outer div's onClick
                    onSelectNPCForModal(npc);
                }}
                className="w-full text-left focus:outline-none mb-2"
                aria-label={`View details for ${npc.name}`}
              >
                <h4 className={`text-lg font-semibold ${npcNameColor} group-hover:underline mb-0.5 truncate`} title={npc.name}>{npc.name}</h4>
                <p
                  className="text-xs text-slate-300 overflow-hidden overflow-ellipsis whitespace-nowrap max-w-full"
                  title={npc.description}
                >
                  {npc.description.length > 30 ? npc.description.substring(0, 27) + "..." : npc.description} 
                  <span className={`ml-1 font-medium ${rarityTextColor}`}>({npc.rarity})</span>
                </p>
              </button>
              <button
                onClick={(e) => {
                    e.stopPropagation(); // Prevent outer div's onClick
                    onStartConversation(npc.id);
                }}
                disabled={isInteracting} // General interaction lock if already talking
                className="w-full bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold py-2 px-3 rounded-md transition-colors duration-150 ease-in-out focus:outline-none focus:ring-2 ring-offset-2 ring-offset-black/50 focus:ring-cyan-400 disabled:opacity-70 disabled:cursor-not-allowed"
                aria-label={`Talk to ${npc.name}`}
              >
                Talk
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default LocationNPCsList;
