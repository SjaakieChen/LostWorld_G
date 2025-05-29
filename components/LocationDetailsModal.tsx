
// components/LocationDetailsModal.tsx
import React from 'react';
import { FullLocationData, CharacterData, LocationRarity, PotentialDiscovery, VisualStyleType } from '../services/gameTypes';
import { elaborateOnLocationDescription } from '../services/locationService';
import Spinner from './Spinner';
import { useEntityElaboration } from '../hooks/useEntityElaboration'; // Import the new hook

interface LocationDetailsModalProps {
  location: FullLocationData;
  onClose: () => void;
  characterData: CharacterData | null; 
  coordinateKey: string | null; 
  onDescriptionElaborated: (
    coordinateKey: string, 
    newRawDescription: string, 
    newProcessedDescriptionWithTags: string, 
    potentialDiscoveries: Omit<PotentialDiscovery, 'id' | 'status' | 'firstMentionedTimestamp' | 'firstMentionedLocationKey'>[]
  ) => void; 
  onSelectImageForViewing: (url: string, alt: string) => void;
}

const getRarityColorClasses = (rarity: LocationRarity): { border: string; text: string; nameText?: string } => { // nameText removed for new scheme
  switch (rarity) {
    case 'Common': return { border: 'ring-slate-500', text: 'text-slate-400' };
    case 'Uncommon': return { border: 'ring-green-500', text: 'text-green-400' };
    case 'Rare': return { border: 'ring-sky-500', text: 'text-sky-400' };
    case 'Epic': return { border: 'ring-purple-500', text: 'text-purple-400' };
    case 'Legendary': return { border: 'ring-amber-500', text: 'text-amber-300' }; // Keep amber for legendary tag
    default: return { border: 'ring-slate-600', text: 'text-slate-500' };
  }
};


const LocationDetailsModal: React.FC<LocationDetailsModalProps> = ({ 
  location, 
  onClose, 
  characterData,
  coordinateKey, // This is the entityId for locations
  onDescriptionElaborated,
  onSelectImageForViewing
}) => {
  const rarityClasses = getRarityColorClasses(location.rarity);
  const locationNameColor = 'text-yellow-400'; // Location name color
  const visualStyle = characterData?.visualStyle;

  const {
    displayedDescriptionNode,
    handleTriggerElaboration,
    isElaborating,
    canElaborate,
    elaborationButtonText,
  } = useEntityElaboration<FullLocationData>({
    entity: location,
    entityId: coordinateKey || `${location.name}-fallbackKey`, // Fallback key if coordinateKey is null, though it shouldn't be
    initialDescription: location.description, // This should be the one with tags if already elaborated
    elaborationServiceFn: elaborateOnLocationDescription,
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
        className={`bg-slate-800 p-6 rounded-lg shadow-2xl max-w-2xl w-full ring-2 ${rarityClasses.border} relative transform transition-all duration-300 ease-out scale-95 opacity-0 animate-modal-appear max-h-[90vh] flex flex-col`}
        onClick={(e) => e.stopPropagation()} 
        style={{
            animationName: 'modal-appear-animation',
            animationDuration: '0.3s',
            animationFillMode: 'forwards',
        }}
        aria-labelledby="location-modal-title"
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-slate-400 hover:text-slate-200 text-2xl leading-none z-10"
          aria-label={`Close details for ${location.name}`}
        >
          &times;
        </button>
        
        <div className="flex items-center mb-4">
            <button
                type="button"
                onClick={() => onSelectImageForViewing(location.imageUrl, location.name)}
                className={`focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 ${rarityClasses.border} rounded-md mr-4`}
                aria-label={`View larger image of ${location.name}`}
                title={`View larger image of ${location.name}`}
            >
                <img 
                    src={location.imageUrl} 
                    alt={`${location.name}`} 
                    className="w-20 h-20 object-contain rounded-md bg-slate-700 p-1 ring-1 ring-slate-600"
                    style={imageRenderingStyle}
                />
            </button>
            <div>
              <h3 id="location-modal-title" className={`text-3xl font-semibold ${locationNameColor}`}>{location.name}</h3>
              <p className={`text-sm font-medium ${rarityClasses.text}`}>({location.rarity})</p>
            </div>
        </div>


        <div className="space-y-3 text-sm text-slate-300 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-slate-700/50 pr-2 flex-grow">
            <div>
                <h4 className="font-semibold text-yellow-500 mb-0.5">Description:</h4>
                <div className="leading-relaxed whitespace-pre-wrap">{displayedDescriptionNode}</div>
                 {canElaborate && (
                  <button
                    onClick={handleTriggerElaboration}
                    disabled={isElaborating}
                    className="mt-2 text-xs bg-teal-700 hover:bg-teal-600 text-teal-200 font-semibold py-1 px-2.5 rounded-md transition-colors disabled:opacity-70 flex items-center"
                    aria-label={`Learn more about ${location.name}`}
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
            
            {location.environmentTags && location.environmentTags.length > 0 && (
                <div>
                    <h4 className="font-semibold text-yellow-500 mb-1 mt-2">Environment Tags:</h4>
                    <div className="flex flex-wrap gap-2">
                    {location.environmentTags.map((tag, index) => (
                        <span 
                        key={index} 
                        className="bg-sky-700 text-sky-200 px-2 py-0.5 rounded-full text-xs font-medium shadow"
                        >
                        {tag}
                        </span>
                    ))}
                    </div>
                </div>
            )}

            {location.validExits && location.validExits.length > 0 && (
                 <div>
                    <h4 className="font-semibold text-yellow-500 mb-0.5 mt-2">Valid Exits:</h4>
                    <p className="leading-relaxed">{location.validExits.join(', ')}</p>
                </div>
            )}
        </div>

        <button
          onClick={onClose}
          className="mt-6 w-full bg-amber-600 hover:bg-amber-500 text-white font-semibold py-2.5 px-4 rounded-lg transition-colors"
          aria-label={`Confirm and close details for ${location.name}`}
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

export default LocationDetailsModal;
