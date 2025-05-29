// components/ModalManager.tsx
import React from 'react';
import { CharacterData, GameItem, GameNPC, FullLocationData, PotentialDiscovery } from '../services/gameTypes';
import ItemDetailsModal from './ItemDetailsModal';
import NPCDetailsModal from './NPCDetailsModal';
import LocationDetailsModal from './LocationDetailsModal';
import ImageViewModal from './ImageViewModal';

interface ModalManagerProps {
  itemToViewInModal: GameItem | null;
  onCloseItemModal: () => void;
  onItemDescriptionElaborated: (
    itemId: string, 
    newRawDescription: string, 
    newProcessedDescriptionWithTags: string, 
    potentialDiscoveries: Omit<PotentialDiscovery, 'id' | 'status' | 'firstMentionedTimestamp' | 'firstMentionedLocationKey'>[]
  ) => void;

  npcToViewInModal: GameNPC | null;
  onCloseNpcModal: () => void;
  onNpcDescriptionElaborated: (
    npcId: string, 
    newRawDescription: string, 
    newProcessedDescriptionWithTags: string, 
    potentialDiscoveries: Omit<PotentialDiscovery, 'id' | 'status' | 'firstMentionedTimestamp' | 'firstMentionedLocationKey'>[]
  ) => void;

  locationToViewInModal: FullLocationData | null;
  onCloseLocationModal: () => void;
  selectedLocationCoordinateKeyForModal: string | null;
  onLocationDescriptionElaborated: (
    coordinateKey: string, 
    newRawDescription: string, 
    newProcessedDescriptionWithTags: string, 
    potentialDiscoveries: Omit<PotentialDiscovery, 'id' | 'status' | 'firstMentionedTimestamp' | 'firstMentionedLocationKey'>[]
  ) => void;
  
  characterData: CharacterData | null;

  imageUrlToView: string | null;
  imageAltTextToView: string | null;
  onCloseImageViewModal: () => void;
  onSelectImageForViewing: (url: string, alt: string) => void;
}

const ModalManager: React.FC<ModalManagerProps> = ({
  itemToViewInModal,
  onCloseItemModal,
  onItemDescriptionElaborated,
  npcToViewInModal,
  onCloseNpcModal,
  onNpcDescriptionElaborated,
  locationToViewInModal,
  onCloseLocationModal,
  selectedLocationCoordinateKeyForModal,
  onLocationDescriptionElaborated,
  characterData,
  imageUrlToView,
  imageAltTextToView,
  onCloseImageViewModal,
  onSelectImageForViewing,
}) => {
  return (
    <>
      {itemToViewInModal && characterData && (
        <ItemDetailsModal
          item={itemToViewInModal}
          onClose={onCloseItemModal}
          characterData={characterData}
          onDescriptionElaborated={onItemDescriptionElaborated}
          onSelectImageForViewing={onSelectImageForViewing}
        />
      )}
      {npcToViewInModal && characterData && (
        <NPCDetailsModal
          npc={npcToViewInModal}
          onClose={onCloseNpcModal}
          characterData={characterData}
          onDescriptionElaborated={onNpcDescriptionElaborated}
          onSelectImageForViewing={onSelectImageForViewing}
        />
      )}
      {locationToViewInModal && (
        <LocationDetailsModal
          location={locationToViewInModal}
          onClose={onCloseLocationModal}
          characterData={characterData}
          coordinateKey={selectedLocationCoordinateKeyForModal}
          onDescriptionElaborated={onLocationDescriptionElaborated}
          onSelectImageForViewing={onSelectImageForViewing}
        />
      )}
      {imageUrlToView && imageAltTextToView && (
        <ImageViewModal
          imageUrl={imageUrlToView}
          altText={imageAltTextToView}
          onClose={onCloseImageViewModal}
        />
      )}
    </>
  );
};

export default ModalManager;