
import React, { useState, useRef, useEffect } from 'react';
import { GameItem, Limb, ItemRarity, VisualStyleType } from '../services/gameTypes'; // Added VisualStyleType
import Spinner from './Spinner';

interface LimbStatusPanelProps {
  limbs: Limb[];
  characterImageUrl?: string | null; 
  onApplyItemToLimb: (itemId: string, limbId: string) => void;
  isApplyingToLimbId: string | null; 
  onUnequipItemFromLimb: (limbId: string, itemId: string) => void; // Added itemId
  visualStyle: VisualStyleType; // Added visualStyle prop
}

const limbPositions: Record<string, { top: string; left: string, width?: string; height?: string; textAlign?: 'left' | 'center' | 'right' }> = {
  'Head': { top: '15%', left: '50%', width: '25%', height: '20%' },
  'Torso': { top: '40%', left: '50%', width: '30%', height: '30%' },
  'Left Arm': { top: '40%', left: '20%', width: '20%', height: '35%' }, 
  'Right Arm': { top: '40%', left: '80%', width: '20%', height: '35%' },
  'Left Leg': { top: '75%', left: '30%', width: '20%', height: '35%' },
  'Right Leg': { top: '75%', left: '70%', width: '20%', height: '35%' },
};

const getRarityBasedBorder = (rarity?: ItemRarity): string => {
  if (!rarity) return 'border-sky-500/30 hover:border-sky-400/70'; 
  switch (rarity) {
    case 'Common': return 'border-slate-400';
    case 'Uncommon': return 'border-green-400';
    case 'Rare': return 'border-sky-400';
    case 'Epic': return 'border-purple-400';
    case 'Legendary': return 'border-amber-400';
    default: return 'border-slate-500';
  }
};

const getHealthColor = (health: number): string => {
    if (health > 70) return 'text-green-400';
    if (health > 30) return 'text-yellow-400';
    return 'text-red-400';
};

const LimbStatusPanel: React.FC<LimbStatusPanelProps> = ({ limbs, characterImageUrl, onApplyItemToLimb, isApplyingToLimbId, onUnequipItemFromLimb, visualStyle }) => {
  const [activeLimbPopover, setActiveLimbPopover] = useState<string | null>(null);
  const [draggedOverLimbId, setDraggedOverLimbId] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const togglePopover = (limbId: string) => {
    setActiveLimbPopover(prev => (prev === limbId ? null : limbId));
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        const limbButtons = Array.from(document.querySelectorAll('[data-limb-id]'));
        if (!limbButtons.some(button => button.contains(event.target as Node) && button.getAttribute('data-limb-id') === activeLimbPopover)) {
           setActiveLimbPopover(null);
        }
      }
    };

    if (activeLimbPopover) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [activeLimbPopover]);

  const handleDragOver = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault(); 
    event.dataTransfer.dropEffect = "move"; 
  };

  const handleDragEnter = (event: React.DragEvent<HTMLElement>, limbId: string) => {
    event.preventDefault();
    setDraggedOverLimbId(limbId);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDraggedOverLimbId(null);
  };

  const handleDrop = (event: React.DragEvent<HTMLElement>, limbId: string) => {
    event.preventDefault();
    setDraggedOverLimbId(null);
    setActiveLimbPopover(null); 
    try {
      const itemDataString = event.dataTransfer.getData('application/json');
      if (itemDataString) {
        const droppedItem: GameItem = JSON.parse(itemDataString);
        if (droppedItem && droppedItem.id) {
          onApplyItemToLimb(droppedItem.id, limbId);
        } else {
          console.error("Dropped item data is invalid:", droppedItem);
        }
      }
    } catch (e) {
      console.error("Error parsing dropped item data:", e);
    }
  };

  if (!limbs || limbs.length === 0) {
    return <p className="text-slate-400 mt-3">No limb data available.</p>;
  }
  
  const imageRenderingStyle: React.CSSProperties = {
    imageRendering: visualStyle === 'Pixel Art' ? 'pixelated' : 'auto',
  };

  return (
    <div className="mt-3"> 
      <h3 className="text-xl font-semibold mb-3 text-sky-300">Body Status</h3>
      {characterImageUrl ? (
        <div className="relative w-full max-w-xs mx-auto aspect-square bg-slate-700/30 rounded-lg shadow-inner ring-1 ring-slate-600">
          <img 
            src={characterImageUrl} 
            alt="Player Character" 
            className="w-full h-full object-contain" 
            style={imageRenderingStyle} // Apply dynamic style
          />
          {limbs.map((limb) => {
            const position = limbPositions[limb.name] || { top: '50%', left: '50%', width: '20%', height: '20%' };
            const isPopoverActive = activeLimbPopover === limb.id;
            const isBeingAppliedTo = isApplyingToLimbId === `${limb.id}` || (isApplyingToLimbId && isApplyingToLimbId.endsWith(`-${limb.id}`));
            const isDragOverTarget = draggedOverLimbId === limb.id;
            const hasEquippedItems = limb.equippedItems && limb.equippedItems.length > 0;
            const lastEquippedItem = hasEquippedItems ? limb.equippedItems![limb.equippedItems!.length - 1] : null;

            let buttonClasses = `absolute rounded-sm focus:outline-none focus:ring-2 focus:ring-sky-400 transition-all duration-150 ease-in-out border-2 ${getRarityBasedBorder(lastEquippedItem?.rarity)}`;
            
            if (isDragOverTarget) {
              buttonClasses += " bg-sky-500/30 ring-2 ring-sky-400 scale-105";
            } else if (isPopoverActive) {
              buttonClasses += ` ${hasEquippedItems ? 'bg-opacity-30' : 'bg-sky-600/20'}`; 
            } else if (hasEquippedItems) {
              buttonClasses += " shadow-md"; 
            }


            return (
              <React.Fragment key={limb.id}>
                <button
                  type="button"
                  data-limb-id={limb.id}
                  className={buttonClasses}
                  style={{ 
                    top: position.top, 
                    left: position.left, 
                    width: position.width,
                    height: position.height,
                    transform: 'translate(-50%, -50%)',
                  }}
                  onClick={() => togglePopover(limb.id)}
                  onDragOver={handleDragOver}
                  onDragEnter={(e) => handleDragEnter(e, limb.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, limb.id)}
                  aria-label={`View status for ${limb.name}. ${limb.status}. Health: ${limb.health}HP. ${hasEquippedItems ? `Equipped: ${limb.equippedItems!.map(it => it.name).join(', ')}.` : ''} Drop an item here to use on this limb.`}
                  title={`${limb.name}: ${limb.status} (${limb.health}HP)${hasEquippedItems ? `. Equipped: ${limb.equippedItems!.map(it => `${it.name} (${it.rarity})`).join(', ')}` : ''}. Drag item to use.`}
                >
                  {isBeingAppliedTo && <Spinner className="w-4 h-4 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-sky-300"/>}
                  
                  {hasEquippedItems && !isBeingAppliedTo && (
                    <div className="w-full h-full flex items-center justify-center overflow-hidden p-0.5">
                      {limb.equippedItems!.slice(0, 3).map((eqItem, idx) => ( // Show up to 3 icons
                        <img 
                          key={eqItem.id}
                          src={eqItem.iconUrl} 
                          alt={eqItem.name} 
                          className={`w-1/2 h-1/2 object-contain opacity-80 ${limb.equippedItems!.length > 1 ? 'max-w-[50%] max-h-[50%]' : ''} ${idx > 0 ? 'ml-[-10%]' : ''}`} // Overlap slightly
                          title={eqItem.name}
                          style={imageRenderingStyle} // Apply dynamic style to item icons on limb
                        />
                      ))}
                       {limb.equippedItems!.length > 3 && (
                        <span className="text-xs text-slate-200 bg-slate-800/70 px-1 rounded-sm absolute bottom-0 right-0">+{limb.equippedItems!.length - 3}</span>
                      )}
                    </div>
                  )}
                  <span className="sr-only">{limb.name}</span>
                </button>

                {isPopoverActive && !isDragOverTarget && (
                  <div
                    ref={popoverRef}
                    className="absolute p-3 rounded-md bg-slate-800 shadow-xl ring-1 ring-slate-600 z-10 text-left"
                    style={{ 
                      top: `calc(${position.top} - 10px)`, 
                      left: `calc(${position.left} + ${parseFloat(position.width || '0') / 2}px + 5px)`, 
                      minWidth: '200px', // Increased width
                    }}
                    role="status"
                  >
                    <button 
                        onClick={() => setActiveLimbPopover(null)} 
                        className="absolute top-1.5 right-1.5 text-slate-400 hover:text-slate-200 text-lg leading-none"
                        aria-label="Close limb status"
                    >
                        &#x2715;
                    </button>
                    <h5 className="text-md font-semibold text-sky-300 mb-1">{limb.name}</h5>
                    <p className="text-xs text-slate-300">Status: {limb.status}</p>
                    <p className={`text-xs font-medium ${getHealthColor(limb.health)} mb-2`}>Health: {limb.health} / 100 HP</p>

                    {limb.equippedItems && limb.equippedItems.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-slate-700">
                        <h6 className="text-sm font-medium text-amber-400 mb-1">Equipped Items:</h6>
                        {limb.equippedItems.map(eqItem => (
                          <div key={eqItem.id} className="mb-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center">
                                    <img src={eqItem.iconUrl} alt={eqItem.name} className="w-6 h-6 mr-2 rounded bg-slate-700 p-0.5" style={imageRenderingStyle}/>
                                    <span className="text-xs text-slate-300">{eqItem.name} ({eqItem.rarity})</span>
                                </div>
                                <button
                                  onClick={() => {
                                    onUnequipItemFromLimb(limb.id, eqItem.id);
                                    // Optionally close popover or refresh it if still items left
                                    if (limb.equippedItems && limb.equippedItems.length === 1) {
                                        setActiveLimbPopover(null);
                                    }
                                  }}
                                  className="bg-red-700 hover:bg-red-600 text-white text-[0.65rem] font-semibold py-0.5 px-1.5 rounded-sm transition-colors"
                                  aria-label={`Unequip ${eqItem.name} from ${limb.name}`}
                                >
                                  Unequip
                                </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {limbs.map((limb) => {
            const lastEquippedItem = limb.equippedItems && limb.equippedItems.length > 0 ? limb.equippedItems[limb.equippedItems.length - 1] : null;
            return (
            <div 
              key={limb.id} 
              className={`bg-slate-700 p-3 rounded-md shadow ring-1 ${getRarityBasedBorder(lastEquippedItem?.rarity)} transition-colors ${draggedOverLimbId === limb.id ? 'bg-sky-700 ring-sky-500' : ''}`}
              role="status"
              aria-labelledby={`limb-name-${limb.id}`}
              aria-describedby={`limb-status-${limb.id} limb-health-${limb.id}`}
              onDragOver={handleDragOver} 
              onDragEnter={(e) => handleDragEnter(e, limb.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, limb.id)}
              onClick={() => togglePopover(limb.id)} 
            >
              <h4 id={`limb-name-${limb.id}`} className="text-md font-medium text-sky-400 mb-0.5">{limb.name}</h4>
              <p id={`limb-status-${limb.id}`} className="text-slate-300 text-xs">Status: {limb.status}</p>
              <p id={`limb-health-${limb.id}`} className={`text-xs font-medium ${getHealthColor(limb.health)}`}>Health: {limb.health} / 100 HP</p>
              {limb.equippedItems && limb.equippedItems.length > 0 && (
                 <p className="text-xs text-amber-400 mt-1">Equipped: {limb.equippedItems.map(it => `${it.name} (${it.rarity})`).join(', ')}</p>
              )}
              {isApplyingToLimbId && isApplyingToLimbId.endsWith(`-${limb.id}`) && <Spinner className="w-4 h-4 ml-2 inline-block text-sky-300"/>}
              {activeLimbPopover === limb.id && limb.equippedItems && limb.equippedItems.length > 0 && ( 
                  <div className="mt-2 pt-2 border-t border-slate-600 space-y-1">
                      {limb.equippedItems.map(eqItem => (
                          <button
                              key={eqItem.id}
                              onClick={(e) => {
                                e.stopPropagation(); 
                                onUnequipItemFromLimb(limb.id, eqItem.id);
                                if (limb.equippedItems && limb.equippedItems.length === 1) {
                                    setActiveLimbPopover(null);
                                }
                              }}
                              className="w-full bg-red-600 hover:bg-red-500 text-white text-xs font-semibold py-1 px-2 rounded-md transition-colors"
                              aria-label={`Unequip ${eqItem.name} from ${limb.name}`}
                            >
                              Unequip {eqItem.name}
                            </button>
                      ))}
                  </div>
              )}
            </div>
          )})}
        </div>
      )}
    </div>
  );
};

export default LimbStatusPanel;
