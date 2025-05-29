
// hooks/useElaboration.ts
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useGameContext } from '../contexts/GameContext';
import { CharacterData, GameItem, GameNPC, FullLocationData, PotentialDiscovery } from '../services/gameTypes';
import { ProcessedTextWithDiscoveries } from '../services/loreService';
import { parseLoreTagsToReactNode } from '../utils/textUtils';

type Entity = GameItem | GameNPC | FullLocationData;
type ElaborationServiceFn<T extends Entity> = (
  entity: T,
  characterData: CharacterData,
  currentLocationKey: string,
  memoryContextString: string
) => Promise<ProcessedTextWithDiscoveries>;

interface UseEntityElaborationProps<T extends Entity> {
  entity: T;
  entityId: string; // Item ID, NPC ID, or Location CoordinateKey
  initialDescription: string;
  elaborationServiceFn: ElaborationServiceFn<T>;
  onSuccess: (
    entityId: string, 
    newRawDescription: string, 
    newProcessedDescriptionWithTags: string, 
    potentialDiscoveries: Omit<PotentialDiscovery, 'id' | 'status' | 'firstMentionedTimestamp' | 'firstMentionedLocationKey'>[]
  ) => void;
  characterData: CharacterData | null;
  isTextualItemContext?: boolean; // Optional: specific context for "Read" vs "Learn More"
}

export const useEntityElaboration = <T extends Entity>({
  entity,
  entityId,
  initialDescription,
  elaborationServiceFn,
  onSuccess,
  characterData,
  isTextualItemContext = false,
}: UseEntityElaborationProps<T>) => {
  const { 
    addElaboratingEntityId, removeElaboratingEntityId, elaboratingEntityIds, 
    getMemoryContextString, currentCoordinates, addPotentialDiscovery 
  } = useGameContext();

  const [currentDescriptionWithTags, setCurrentDescriptionWithTags] = useState<string>(initialDescription);
  const [isLocallyElaborating, setIsLocallyElaborating] = useState(false);
  const [hasElaboratedThisInstance, setHasElaboratedThisInstance] = useState(false);

  // Update description if the entity prop changes (e.g., master data updated elsewhere)
  useEffect(() => {
    setCurrentDescriptionWithTags(initialDescription);
    // Do not reset hasElaboratedThisInstance here, as it should persist for the modal's lifecycle unless entityId changes
  }, [initialDescription]);

  useEffect(() => {
    // Reset elaboration state if the entity itself changes (e.g. opening a new modal)
    setCurrentDescriptionWithTags(initialDescription);
    setHasElaboratedThisInstance(false);
    setIsLocallyElaborating(false);
  }, [entityId, initialDescription]);


  const displayedDescriptionNode = useMemo(() => {
    return parseLoreTagsToReactNode(currentDescriptionWithTags);
  }, [currentDescriptionWithTags]);

  const isGloballyElaborating = elaboratingEntityIds.has(entityId);
  const isElaborating = isLocallyElaborating || isGloballyElaborating;

  const handleTriggerElaboration = useCallback(async () => {
    if (!characterData || !entity) {
      // This case should ideally be prevented by button disabled state
      console.warn("Cannot elaborate: missing character data or entity.");
      return;
    }

    setIsLocallyElaborating(true);
    addElaboratingEntityId(entityId);

    try {
      const memoryContext = getMemoryContextString();
      const locationKey = `${currentCoordinates.x},${currentCoordinates.y}`;
      
      const elaborationResult: ProcessedTextWithDiscoveries = await elaborationServiceFn(
        entity,
        characterData,
        locationKey,
        memoryContext
      );

      setCurrentDescriptionWithTags(elaborationResult.processedText); // Update local display
      setHasElaboratedThisInstance(true);
      
      // Call the onSuccess prop to update master data and handle discoveries
      onSuccess(
        entityId, 
        elaborationResult.rawText || elaborationResult.processedText, // Fallback for rawText
        elaborationResult.processedText, 
        elaborationResult.potentialDiscoveries
      );

    } catch (error) {
      console.error(`Error elaborating on entity ${entityId}:`, error);
      const errorText = currentDescriptionWithTags + "\n\n(Could not retrieve more details at this time.)";
      setCurrentDescriptionWithTags(errorText); // Show error in modal
      setHasElaboratedThisInstance(true);
      // Optionally call onSuccess with error state if needed, or handle error display locally
    } finally {
      setIsLocallyElaborating(false);
      removeElaboratingEntityId(entityId);
    }
  }, [
    characterData, entity, entityId, elaborationServiceFn, onSuccess,
    addElaboratingEntityId, removeElaboratingEntityId, getMemoryContextString,
    currentCoordinates, currentDescriptionWithTags // currentDescriptionWithTags needed for error fallback
  ]);

  const canElaborate = useMemo(() => {
    return !hasElaboratedThisInstance && characterData && (isGloballyElaborating || initialDescription.length < 450);
  }, [hasElaboratedThisInstance, characterData, isGloballyElaborating, initialDescription]);

  const elaborationButtonText = isTextualItemContext ? "Read" : "Learn More";

  return {
    displayedDescriptionNode,
    handleTriggerElaboration,
    isElaborating,
    canElaborate,
    elaborationButtonText,
  };
};
