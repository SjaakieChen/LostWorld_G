// components/KnowledgePanel.tsx
import React, { useState } from 'react';
import { MemorableEntity, PotentialDiscovery, MajorPlotPoint, MemorableEntityType, PotentialDiscoveryType, PotentialDiscoveryStatus, ItemRarity, NPCRarity, LocationRarity, MemorableEntityRarity } from '../services/gameTypes';

interface KnowledgePanelProps {
  memorableEntities: ReadonlyMap<string, MemorableEntity>;
  potentialDiscoveries: ReadonlyArray<PotentialDiscovery>;
  majorPlotPoints: ReadonlyArray<MajorPlotPoint>;
  onSelectKnowledgeEntry: (id: string, type: MemorableEntityType | PotentialDiscoveryType, status?: PotentialDiscoveryStatus) => void;
}

type KnowledgeSection = 'entities' | 'discoveries' | 'chronicle';

const rarityOrder: Record<MemorableEntityRarity, number> = {
    'Legendary': 5,
    'Epic': 4,
    'Character_Self': 3, 
    'Rare': 3,
    'Uncommon': 2,
    'Common': 1,
    'Lore': 0,
};


const getRarityTextColorClass = (rarity?: MemorableEntityRarity): string => {
  if (!rarity) return 'text-slate-400';
  switch (rarity) {
    case 'Common': return 'text-slate-300';
    case 'Uncommon': return 'text-green-300';
    case 'Rare': return 'text-sky-300'; // This is for the rarity TAG, distinct from name color
    case 'Epic': return 'text-purple-300';
    case 'Legendary': return 'text-amber-300';
    case 'Lore': return 'text-yellow-300'; 
    case 'Character_Self': return 'text-rose-300'; 
    default: return 'text-slate-400';
  }
};

const getRarityBorderColorClass = (rarity?: MemorableEntityRarity): string => {
  if (!rarity) return 'border-slate-600';
  switch (rarity) {
    case 'Common': return 'border-slate-500';
    case 'Uncommon': return 'border-green-500';
    case 'Rare': return 'border-sky-500';
    case 'Epic': return 'border-purple-500';
    case 'Legendary': return 'border-amber-500';
    case 'Lore': return 'border-yellow-500';
    case 'Character_Self': return 'border-rose-500';
    default: return 'border-slate-600';
  }
};

const getTypeColorClass = (type: MemorableEntityType | PotentialDiscoveryType): string => {
    switch (type) {
        case 'item': return 'text-red-400';         // New: Red for items
        case 'npc': return 'text-sky-400';         // New: Blue for NPCs
        case 'location': return 'text-yellow-400';  // New: Yellow for locations
        case 'lore_hint': return 'text-yellow-300';// Adjusted for lore hints
        case 'character': return 'text-sky-400';   // New: Blue for Self (character type)
        default: return 'text-slate-400';
    }
}

const KnowledgePanel: React.FC<KnowledgePanelProps> = ({
  memorableEntities,
  potentialDiscoveries,
  majorPlotPoints,
  onSelectKnowledgeEntry
}) => {
  const [expandedSection, setExpandedSection] = useState<KnowledgeSection | null>(null);

  const toggleSection = (section: KnowledgeSection) => {
    setExpandedSection(prev => (prev === section ? null : section));
  };
  
  const sortedMemorableEntities = Array.from(memorableEntities.values())
    .filter(e => e.type !== 'lore_hint') 
    .sort((a, b) => {
        const rarityA = rarityOrder[a.rarity] ?? 0;
        const rarityB = rarityOrder[b.rarity] ?? 0;
        if (rarityB !== rarityA) {
            return rarityB - rarityA; 
        }
        return a.name.localeCompare(b.name); 
    });

  const allDiscoveriesSorted = [...potentialDiscoveries].sort((a, b) => {
    if (a.status !== b.status) {
      return a.status === 'mentioned' ? -1 : 1; 
    }
    const rarityA = rarityOrder[a.rarityHint || 'Lore'] ?? 0; 
    const rarityB = rarityOrder[b.rarityHint || 'Lore'] ?? 0;
    if (rarityB !== rarityA) {
      return rarityB - rarityA;
    }
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="w-full text-sm">
      <h3 id="knowledge-archives-heading" className="text-2xl font-semibold mb-4 text-indigo-300">Knowledge Archives</h3>
      
      <div className="mb-3">
        <button
          onClick={() => toggleSection('entities')}
          className="w-full text-left text-lg font-medium text-indigo-200 hover:text-indigo-100 focus:outline-none py-1.5 px-2 rounded bg-indigo-700/30 hover:bg-indigo-700/50 transition-colors"
          aria-expanded={expandedSection === 'entities'}
          aria-controls="known-entities-content"
        >
          Known Entities ({sortedMemorableEntities.length})
          <span className={`float-right transform transition-transform ${expandedSection === 'entities' ? 'rotate-180' : ''}`}>▼</span>
        </button>
        {expandedSection === 'entities' && (
          <div id="known-entities-content" className="mt-2 space-y-1.5 max-h-48 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-slate-700/50 pr-1">
            {sortedMemorableEntities.length > 0 ? (
              sortedMemorableEntities.map(entity => (
                <button
                  key={entity.id}
                  onClick={() => onSelectKnowledgeEntry(entity.id, entity.type)}
                  className={`w-full text-left p-1.5 rounded-md bg-slate-800/60 hover:bg-slate-700/80 border-l-2 ${getRarityBorderColorClass(entity.rarity)} transition-all focus:outline-none focus:ring-1 focus:ring-indigo-400`}
                  title={`Click to view details for ${entity.name}`}
                >
                  <div className="flex justify-between items-baseline">
                    <span className={`font-medium ${getTypeColorClass(entity.type)}`}>{entity.name}</span>
                    <span className={`text-xs ${getRarityTextColorClass(entity.rarity)}`}>({entity.rarity})</span>
                  </div>
                  <p className="text-xs text-slate-400 truncate" title={entity.descriptionHint}>{entity.descriptionHint}</p>
                </button>
              ))
            ) : (
              <p className="text-slate-400 italic p-1.5">No specific entities recorded yet.</p>
            )}
          </div>
        )}
      </div>

      <div className="mb-3">
        <button
          onClick={() => toggleSection('discoveries')}
          className="w-full text-left text-lg font-medium text-yellow-200 hover:text-yellow-100 focus:outline-none py-1.5 px-2 rounded bg-yellow-700/30 hover:bg-yellow-700/50 transition-colors"
          aria-expanded={expandedSection === 'discoveries'}
          aria-controls="rumored-leads-content"
        >
          Leads & Discoveries ({potentialDiscoveries.length})
           <span className={`float-right transform transition-transform ${expandedSection === 'discoveries' ? 'rotate-180' : ''}`}>▼</span>
        </button>
        {expandedSection === 'discoveries' && (
          <div id="rumored-leads-content" className="mt-2 space-y-1.5 max-h-48 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-slate-700/50 pr-1">
            {allDiscoveriesSorted.length > 0 ? (
              allDiscoveriesSorted.map(discovery => {
                const displayRarityText = discovery.rarityHint && discovery.rarityHint !== 'Lore' 
                                           ? discovery.rarityHint 
                                           : (discovery.rarityHint === 'Lore' ? 'Lore Hint' : 'Unk. Rarity');
                const rarityColorClass = getRarityTextColorClass(discovery.rarityHint || 'Lore'); 
                const borderColorClass = getRarityBorderColorClass(discovery.rarityHint || 'Lore');

                return (
                  <button
                    key={discovery.id}
                    onClick={() => onSelectKnowledgeEntry(discovery.id, discovery.type, discovery.status)}
                    className={`w-full text-left p-1.5 rounded-md bg-slate-800/60 hover:bg-slate-700/80 border-l-2 ${borderColorClass} transition-all focus:outline-none focus:ring-1 focus:ring-yellow-400 ${discovery.status === 'discovered' ? 'opacity-70 hover:opacity-100' : ''}`}
                    title={`Source: ${discovery.sourceTextSnippet}`}
                  >
                    <div className="flex justify-between items-baseline">
                      <span className={`font-medium ${getTypeColorClass(discovery.type)}`}>
                        {discovery.name}
                        {discovery.status === 'discovered' && <span className="text-xs text-green-400 ml-1">(Confirmed)</span>}
                      </span>
                      <span className={`text-xs ${rarityColorClass}`}>
                          ({displayRarityText}) - {discovery.status === 'discovered' ? 
                              <span className="text-green-400">Discovered</span> : 
                              <span className="text-yellow-400">Mentioned</span>}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 italic truncate" title={discovery.descriptionHint}>{discovery.descriptionHint}</p>
                  </button>
                );
              })
            ) : (
              <p className="text-slate-400 italic p-1.5">No active rumors or leads yet.</p>
            )}
          </div>
        )}
      </div>

      <div>
        <button
          onClick={() => toggleSection('chronicle')}
          className="w-full text-left text-lg font-medium text-purple-200 hover:text-purple-100 focus:outline-none py-1.5 px-2 rounded bg-purple-700/30 hover:bg-purple-700/50 transition-colors"
          aria-expanded={expandedSection === 'chronicle'}
          aria-controls="chronicle-content"
        >
          Chronicle ({majorPlotPoints.length})
          <span className={`float-right transform transition-transform ${expandedSection === 'chronicle' ? 'rotate-180' : ''}`}>▼</span>
        </button>
        {expandedSection === 'chronicle' && (
          <div id="chronicle-content" className="mt-2 space-y-1.5 max-h-48 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-slate-700/50 pr-1">
            {majorPlotPoints.length > 0 ? (
              [...majorPlotPoints].reverse().map(point => ( 
                <div key={point.id} className="p-1.5 rounded-md bg-slate-800/60 border-l-2 border-purple-500">
                  <span className="text-xs text-purple-300 block">{new Date(point.timestamp).toLocaleDateString()} - {point.locationName || 'Various Locations'}</span>
                  <p className="text-xs text-slate-300">{point.summary}</p>
                </div>
              ))
            ) : (
              <p className="text-slate-400 italic p-1.5">The story is yet to unfold.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default KnowledgePanel;