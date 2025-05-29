
// hooks/useEntityElaboration.ts
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useGameContext } from '../contexts/GameContext';
import { CharacterData, GameItem, GameNPC, FullLocationData, PotentialDiscovery } from '../services/gameTypes';
import { ProcessedTextWithDiscoveries } from '../services/loreService';
import { parseLoreTagsToReactNode } from '../utils/textUtils'; // Ensure this path is correct

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
    getMemoryContextString, currentCoordinates,
  } = useGameContext();

  const [internalDescription, setInternalDescription] = useState<string>(initialDescription);
  const [hasElaboratedForCurrentEntity, setHasElaboratedForCurrentEntity] = useState(false);
  const [isLocallyElaborating, setIsLocallyElaborating] = useState(false);

  // Effect 1: Runs ONLY when the entityId changes (e.g. new modal opens for a different entity)
  useEffect(() => {
    setInternalDescription(initialDescription); // initialDescription prop will be for the new entity
    setHasElaboratedForCurrentEntity(false);    // Reset for the new entity
    setIsLocallyElaborating(false);             // Reset loading state for the new entity
  }, [entityId, initialDescription]); // Also re-run if initialDescription for the new entityId changes

  // Effect 2: Runs if initialDescription prop changes, but only updates if not already elaborated in this instance.
  // This ensures that if the parent re-renders (e.g. due to some other state change) but passes the same
  // initialDescription, and we *have* elaborated, we don't revert.
  // If the parent passes a *new* initialDescription (e.g. master data changed externally before elaboration),
  // this will pick it up IF we haven't elaborated yet.
  useEffect(() => {
    if (!hasElaboratedForCurrentEntity) {
      setInternalDescription(initialDescription);
    }
    // This effect depends on initialDescription. If entityId also changes, Effect 1 handles the primary reset.
  }, [initialDescription, hasElaboratedForCurrentEntity]);


  const displayedDescriptionNode = useMemo(() => {
    return parseLoreTagsToReactNode(internalDescription);
  }, [internalDescription]);

  const isGloballyElaborating = elaboratingEntityIds.has(entityId);
  const isElaborating = isLocallyElaborating || isGloballyElaborating;

  const handleTriggerElaboration = useCallback(async () => {
    if (!characterData || !entity) {
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

      setInternalDescription(elaborationResult.processedText); 
      setHasElaboratedForCurrentEntity(true); // Mark that this modal instance has elaborated.

      onSuccess(
        entityId,
        elaborationResult.rawText || elaborationResult.processedText,
        elaborationResult.processedText,
        elaborationResult.potentialDiscoveries
      );

    } catch (error) {
      console.error(`Error elaborating on entity ${entityId}:`, error);
      const errorText = internalDescription + "\n\n(Could not retrieve more details at this time.)";
      setInternalDescription(errorText);
      setHasElaboratedForCurrentEntity(true); 
    } finally {
      setIsLocallyElaborating(false);
      removeElaboratingEntityId(entityId);
    }
  }, [
    characterData, entity, entityId, elaborationServiceFn, onSuccess,
    addElaboratingEntityId, removeElaboratingEntityId, getMemoryContextString,
    currentCoordinates, internalDescription 
  ]);

  const canElaborate = useMemo(() => {
    // If initialDescription itself is long (because master data was updated and it's already elaborated),
    // this will be false.
    // If initialDescription is short, but we've elaborated in this instance, also false.
    return !hasElaboratedForCurrentEntity && characterData && (isGloballyElaborating || initialDescription.length < 450);
  }, [hasElaboratedForCurrentEntity, characterData, isGloballyElaborating, initialDescription]);

  const elaborationButtonText = isTextualItemContext ? "Read" : "Learn More";

  return {
    displayedDescriptionNode,
    handleTriggerElaboration,
    isElaborating,
    canElaborate,
    elaborationButtonText,
  };
};
