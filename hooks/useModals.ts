
// hooks/useModals.ts
import { useState, useCallback } from 'react';
import { GameItem, GameNPC, FullLocationData } from '../services/gameTypes';

export interface UseModalsReturn {
  itemToViewInModal: GameItem | null;
  setItemToViewInModal: React.Dispatch<React.SetStateAction<GameItem | null>>;
  npcToViewInModal: GameNPC | null;
  setNpcToViewInModal: React.Dispatch<React.SetStateAction<GameNPC | null>>;
  locationToViewInModal: FullLocationData | null;
  setLocationToViewInModal: React.Dispatch<React.SetStateAction<FullLocationData | null>>;
  selectedLocationCoordinateKeyForModal: string | null;
  setSelectedLocationCoordinateKeyForModal: React.Dispatch<React.SetStateAction<string | null>>;
  imageUrlToView: string | null;
  setImageUrlToView: React.Dispatch<React.SetStateAction<string | null>>;
  imageAltTextToView: string | null;
  setImageAltTextToView: React.Dispatch<React.SetStateAction<string | null>>;

  handleSelectItemForModal: (item: GameItem) => void;
  handleCloseItemModal: () => void;
  handleSelectNPCForModal: (npc: GameNPC) => void;
  handleCloseNPCModal: () => void;
  handleSelectLocationForModal: (location: FullLocationData, coordinateKey?: string) => void;
  handleCloseLocationModal: () => void;
  handleSelectImageForViewing: (url: string, alt: string) => void;
  handleCloseImageViewModal: () => void;
}

export const useModals = (): UseModalsReturn => {
  const [itemToViewInModal, setItemToViewInModal] = useState<GameItem | null>(null);
  const [npcToViewInModal, setNpcToViewInModal] = useState<GameNPC | null>(null);
  const [locationToViewInModal, setLocationToViewInModal] = useState<FullLocationData | null>(null);
  const [selectedLocationCoordinateKeyForModal, setSelectedLocationCoordinateKeyForModal] = useState<string | null>(null);
  const [imageUrlToView, setImageUrlToView] = useState<string | null>(null);
  const [imageAltTextToView, setImageAltTextToView] = useState<string | null>(null);

  const handleSelectItemForModal = useCallback((item: GameItem) => {
    setItemToViewInModal(item);
  }, []);

  const handleCloseItemModal = useCallback(() => {
    setItemToViewInModal(null);
  }, []);

  const handleSelectNPCForModal = useCallback((npc: GameNPC) => {
    setNpcToViewInModal(npc);
  }, []);

  const handleCloseNPCModal = useCallback(() => {
    setNpcToViewInModal(null);
  }, []);

  const handleSelectLocationForModal = useCallback((location: FullLocationData, coordinateKey?: string) => {
    setLocationToViewInModal(location);
    setSelectedLocationCoordinateKeyForModal(coordinateKey || null);
  }, []);

  const handleCloseLocationModal = useCallback(() => {
    setLocationToViewInModal(null);
    setSelectedLocationCoordinateKeyForModal(null);
  }, []);

  const handleSelectImageForViewing = useCallback((url: string, alt: string) => {
    setImageUrlToView(url);
    setImageAltTextToView(alt);
  }, []);

  const handleCloseImageViewModal = useCallback(() => {
    setImageUrlToView(null);
    setImageAltTextToView(null);
  }, []);

  return {
    itemToViewInModal, setItemToViewInModal,
    npcToViewInModal, setNpcToViewInModal,
    locationToViewInModal, setLocationToViewInModal,
    selectedLocationCoordinateKeyForModal, setSelectedLocationCoordinateKeyForModal,
    imageUrlToView, setImageUrlToView,
    imageAltTextToView, setImageAltTextToView,
    handleSelectItemForModal, handleCloseItemModal,
    handleSelectNPCForModal, handleCloseNPCModal,
    handleSelectLocationForModal, handleCloseLocationModal,
    handleSelectImageForViewing, handleCloseImageViewModal,
  };
};
