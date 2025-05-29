
// components/LocationImagePanel.tsx
import React, { useState } from 'react';
import { FullLocationData, LocationRarity, GameItem, GameNPC, VisualStyleType } from '../services/gameTypes'; // Added VisualStyleType

interface LocationImagePanelProps {
  imageUrl: string; 
  imageAltText: string; 
  onSelectLocationForModal: (location: FullLocationData, coordinateKey: string) => void;
  locationData: FullLocationData | null; 
  currentCoordinates: { x: number, y: number };
  isEventActive: boolean; 
  talkingToNPC: GameNPC | null;
  onDropItemOnNpcImage: (item: GameItem, npc: GameNPC) => Promise<void>; 
  visualStyle: VisualStyleType; // Added visualStyle prop
}

const getRarityBorderColorClass = (rarity?: LocationRarity): string => {
  if (!rarity) return 'border-transparent';
  switch (rarity) {
    case 'Common': return 'border-slate-500';
    case 'Uncommon': return 'border-green-500';
    case 'Rare': return 'border-sky-500';
    case 'Epic': return 'border-purple-500';
    case 'Legendary': return 'border-amber-500';
    default: return 'border-slate-600';
  }
};

const LocationImagePanel: React.FC<LocationImagePanelProps> = ({ 
  imageUrl, 
  imageAltText, 
  onSelectLocationForModal, 
  locationData,
  currentCoordinates,
  isEventActive,
  talkingToNPC, 
  onDropItemOnNpcImage,
  visualStyle
}) => {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleImageClick = () => {
    if (!isEventActive && locationData) {
      const coordinateKey = `${currentCoordinates.x},${currentCoordinates.y}`;
      onSelectLocationForModal(locationData, coordinateKey);
    }
  };

  // Drag and Drop Handlers
  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (talkingToNPC) { 
      event.dataTransfer.dropEffect = "move";
    } else {
      event.dataTransfer.dropEffect = "none";
    }
  };

  const handleDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (talkingToNPC) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(false);
    if (!talkingToNPC) return;

    try {
      const itemDataString = event.dataTransfer.getData('application/json');
      if (itemDataString) {
        const droppedItem: GameItem = JSON.parse(itemDataString);
        if (droppedItem && droppedItem.id && talkingToNPC) { // Ensure NPC object is available
          await onDropItemOnNpcImage(droppedItem, talkingToNPC);
        } else {
          console.error("Dropped item data is invalid or NPC object missing:", droppedItem, talkingToNPC);
        }
      }
    } catch (e) {
      console.error("Error parsing dropped item data for NPC:", e);
    }
  };


  const rarityBorderClass = isEventActive 
    ? 'border-purple-500 shadow-lg shadow-purple-500/50' 
    : (talkingToNPC 
        ? getNpcRarityBorderColorClass(talkingToNPC.rarity) 
        : (locationData ? getRarityBorderColorClass(locationData.rarity) : 'border-transparent'));
  
  const titleText = talkingToNPC 
    ? `Drag item here to give to ${talkingToNPC.name}`
    : (isEventActive 
        ? imageAltText 
        : (locationData ? `Click to view details for ${imageAltText} (${locationData.rarity})` : imageAltText)
      );

  let wrapperClasses = `flex justify-center items-center aspect-square p-1 rounded-lg border-4 ${rarityBorderClass} bg-slate-700/20 relative transition-all duration-150`;
  if (talkingToNPC && isDragOver) {
    wrapperClasses += ' ring-4 ring-emerald-500 scale-105 shadow-emerald-500/50'; 
  }
  
  const imageRenderingStyle: React.CSSProperties = {
    imageRendering: visualStyle === 'Pixel Art' ? 'pixelated' : 'auto',
  };

  return (
    <div 
      className={wrapperClasses}
      onDragOver={talkingToNPC ? handleDragOver : undefined}
      onDragEnter={talkingToNPC ? handleDragEnter : undefined}
      onDragLeave={talkingToNPC ? handleDragLeave : undefined}
      onDrop={talkingToNPC ? handleDrop : undefined}
    >
      <button
        type="button"
        onClick={handleImageClick}
        className="w-full h-full focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-opacity-75 rounded-md overflow-hidden"
        aria-label={isEventActive || talkingToNPC ? imageAltText : `View details for ${imageAltText}`}
        disabled={isEventActive && !locationData} 
        title={titleText}
      >
        <img 
          src={imageUrl} 
          alt={imageAltText} 
          aria-label={`Visual representation of ${imageAltText}`}
          className="max-w-full max-h-full h-auto w-auto rounded-sm shadow-md object-contain pointer-events-none" 
          style={imageRenderingStyle} // Apply dynamic style
        />
      </button>
    </div>
  );
};

const getNpcRarityBorderColorClass = (rarity?: LocationRarity): string => {
  if (!rarity) return 'border-slate-400'; 
  switch (rarity) {
    case 'Common': return 'border-slate-500';
    case 'Uncommon': return 'border-green-500';
    case 'Rare': return 'border-sky-500';
    case 'Epic': return 'border-purple-500';
    case 'Legendary': return 'border-amber-500';
    default: return 'border-slate-600';
  }
};

export default LocationImagePanel;
