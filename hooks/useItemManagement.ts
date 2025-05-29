
// hooks/useItemManagement.ts
import { useCallback, useState } from 'react';
import { useGameContext } from '../contexts/GameContext';
import {
  GameItem, PickupResult, ItemUsageOutcome, ParsedPlayerActionParameters
} from '../services/gameTypes';
import { narrateAndConfirmPickup, determineItemUsageEffect } from '../services/itemService';

interface UseItemManagementProps {
  isPickingUpItem: string | null; 
  setIsPickingUpItem: React.Dispatch<React.SetStateAction<string | null>>;
  isUsingItem: string | null; 
  setIsUsingItem: React.Dispatch<React.SetStateAction<string | null>>;
  isApplyingToLimb: string | null; 
  setIsApplyingToLimb: React.Dispatch<React.SetStateAction<string | null>>;
}

export const useItemManagement = ({
  isPickingUpItem,
  setIsPickingUpItem,
  isUsingItem,
  setIsUsingItem,
  isApplyingToLimb,
  setIsApplyingToLimb,
}: UseItemManagementProps) => {
  const {
    characterData, setCharacterData,
    locationData,
    locationItems, setLocationItems,
    playerInventory, setPlayerInventory,
    currentCoordinates,
    visitedLocations, setVisitedLocations,
    addLogEntry,
    _consumeEnergy,
    _gainSkillExperience,
    attemptToTriggerUnexpectedEvent,
    addMajorPlotPoint,
    getMemoryContextString,
  } = useGameContext();


  const handlePickupItem = useCallback(async (itemId: string) => {
    if (!characterData || !locationItems || !locationData) {
      addLogEntry('error', "No items visible or area not searched to pick up from."); return;
    }
    const itemToPickup = locationItems.find(item => item.id === itemId);
    if (!itemToPickup) {
      addLogEntry('error', "Could not find the item to pick up."); return;
    }
    _consumeEnergy(0); // Reduced energy cost for pickup
    if (characterData.isDefeated && itemToPickup.itemTypeGuess.toLowerCase() !== 'revival_item_type') { // Example: allow picking up revival items if defeated
        addLogEntry('system', "You are too weak to pick that up.");
        return;
    }
    
    setIsPickingUpItem(itemId); 

    const memoryContextString = getMemoryContextString();
    try {
      const result: PickupResult = await narrateAndConfirmPickup(itemToPickup, characterData, memoryContextString);
      const newLocationItems = locationItems.filter(item => item.id !== itemId);
      setLocationItems(newLocationItems);
      setPlayerInventory(prevInventory => [...prevInventory, result.pickedUpItem]);
      addLogEntry('narration', result.narration);
      const coordinateKey = `${currentCoordinates.x},${currentCoordinates.y}`;
      const currentVisitedEntry = visitedLocations.get(coordinateKey);
      if (currentVisitedEntry) {
        setVisitedLocations(prev => new Map(prev).set(coordinateKey, { ...currentVisitedEntry, items: newLocationItems }));
      }
      if (itemToPickup.rarity === 'Epic' || itemToPickup.rarity === 'Legendary') {
        addMajorPlotPoint(`Player acquired ${itemToPickup.rarity} item: '${itemToPickup.name}'.`, [itemToPickup.id], locationData?.name);
      }
      await attemptToTriggerUnexpectedEvent(`item_pickup_${itemToPickup.rarity.toLowerCase()}_${itemToPickup.name.replace(/\s+/g, '_')}_from_${locationData.name.replace(/\s+/g, '_')}`);
    } catch (err: any) {
      console.error("Failed to pick up item:", err);
      addLogEntry('error', `Pickup failed: ${err.message || "An error occurred while picking up the item."}`);
    } finally {
      setIsPickingUpItem(null); 
    }
  }, [
    characterData, locationItems, locationData, _consumeEnergy, addLogEntry, currentCoordinates, visitedLocations,
    setPlayerInventory, setVisitedLocations, setLocationItems, 
    setIsPickingUpItem, 
    attemptToTriggerUnexpectedEvent, getMemoryContextString, addMajorPlotPoint
  ]);

  const _updateCharacterAndInventoryFromItemUsage = useCallback((
    itemUsed: GameItem, result: ItemUsageOutcome, triggerContextBase: string, targetLimbForEquipName?: string
  ) => {
    if (!characterData || !locationData) return; 
    let itemModifiedInInventory = false;
    let newInventory = [...playerInventory];

    if (result.itemEffect.consumed) {
        newInventory = newInventory.filter(item => item.id !== itemUsed.id);
        itemModifiedInInventory = true;
    } else {
        if (result.itemEffect.newNameIfChanged || result.itemEffect.newDescriptionIfChanged || result.itemEffect.newVisualPromptHintIfChanged) {
            newInventory = newInventory.map(item => {
                if (item.id === itemUsed.id) {
                    itemModifiedInInventory = true;
                    return {
                        ...item,
                        name: result.itemEffect.newNameIfChanged || item.name,
                        description: result.itemEffect.newDescriptionIfChanged || item.description,
                        visualPromptHint: result.itemEffect.newVisualPromptHintIfChanged || item.visualPromptHint,
                    };
                }
                return item;
            });
        }
    }
    
    setCharacterData(prevCharData => {
        if (!prevCharData) return null;
        let newCharData = { ...prevCharData };
        let overallHealthRecalculated = false;

        if (result.characterEffect.overallHealthChange) {
            newCharData.overallHealth = Math.max(0, Math.min(100, newCharData.overallHealth + result.characterEffect.overallHealthChange));
            addLogEntry('game_event', `Overall health changed by ${result.characterEffect.overallHealthChange}. Now: ${newCharData.overallHealth}HP.`);
        }
        if (result.characterEffect.energyChange) {
            newCharData.currentEnergy = Math.max(0, Math.min(newCharData.maxEnergy, newCharData.currentEnergy + result.characterEffect.energyChange));
            addLogEntry('game_event', `Energy changed by ${result.characterEffect.energyChange}. Now: ${newCharData.currentEnergy}EN.`);
        }
        if (result.characterEffect.limbStatusChanges) {
            newCharData.limbs = newCharData.limbs.map(limb => {
                const change = result.characterEffect.limbStatusChanges!.find(lsc => lsc.limbName === limb.name);
                if (change) {
                    overallHealthRecalculated = true; 
                    return { ...limb, status: change.newStatus, health: change.newHealth };
                }
                return limb;
            });
        }
        if (result.itemEffect.isEquippedToLimb && targetLimbForEquipName) {
            newCharData.limbs = newCharData.limbs.map(limb => {
                if (limb.name === targetLimbForEquipName) {
                    const itemToEquip = playerInventory.find(i => i.id === itemUsed.id); 
                    if (itemToEquip) { 
                        itemModifiedInInventory = true; 
                        newInventory = newInventory.filter(invItem => invItem.id !== itemToEquip.id); 
                        return { ...limb, equippedItems: [...(limb.equippedItems || []), itemToEquip] };
                    }
                }
                return limb;
            });
            addLogEntry('game_event', `${itemUsed.name} equipped to ${targetLimbForEquipName}.`);
        }

        if (overallHealthRecalculated) {
            const totalLimbHealth = newCharData.limbs.reduce((sum, limb) => sum + limb.health, 0);
            newCharData.overallHealth = Math.round(totalLimbHealth / newCharData.limbs.length);
        }
        if (newCharData.overallHealth <= 0 && !newCharData.isDefeated) {
            newCharData.isDefeated = true;
            addLogEntry('game_event', "The effects are devastating. You have been defeated.");
        }
        return newCharData;
    });

    if (itemModifiedInInventory) {
        setPlayerInventory(newInventory);
    }

    if (result.characterEffect.xpGain) {
        _gainSkillExperience(result.characterEffect.xpGain.skillName, result.characterEffect.xpGain.amount);
    }
    if (itemUsed.rarity === 'Epic' || itemUsed.rarity === 'Legendary') {
       if (result.itemEffect.isEquippedToLimb || result.characterEffect.overallHealthChange || result.characterEffect.limbStatusChanges?.length) {
         addMajorPlotPoint(`Player used ${itemUsed.rarity} item '${itemUsed.name}', causing significant effect.`, [itemUsed.id], locationData?.name);
       }
    }
  }, [addLogEntry, setCharacterData, setPlayerInventory, playerInventory, _gainSkillExperience, characterData, locationData, addMajorPlotPoint]);


  const handleUseItem = useCallback(async (itemId: string, parameters?: ParsedPlayerActionParameters) => {
    if (!characterData || !locationData) { addLogEntry('error', 'Character data not available.'); return; }
    const itemToUse = playerInventory.find(item => item.id === itemId);
    if (!itemToUse) { addLogEntry('error', 'Item not found in inventory.'); return; }
    _consumeEnergy(1); // Reduced energy cost for general item use
    if (characterData.isDefeated && itemToUse.itemTypeGuess.toLowerCase() !== 'revival_item_type') {
        addLogEntry('system', "You are too weak to use that item.");
        return;
    }
    
    setIsUsingItem(itemId); 

    addLogEntry('system', `Attempting to use ${itemToUse.name}...`);
    const memoryContextString = parameters?._augmentedMemoryContext || getMemoryContextString();
    try {
      const currentCharacterSnapshot = { ...characterData };
      const result: ItemUsageOutcome = await determineItemUsageEffect(
        itemToUse, 
        currentCharacterSnapshot, 
        parameters?.is_limb_target ? parameters.on_target : undefined, 
        memoryContextString
      );
      addLogEntry('narration', result.narration);
      _updateCharacterAndInventoryFromItemUsage(itemToUse, result, `item_used_${itemToUse.name.replace(/\s+/g, '_')}`);
      await attemptToTriggerUnexpectedEvent(`used_item_${itemToUse.rarity.toLowerCase()}_${itemToUse.name.replace(/\s+/g, '_')}_in_${locationData.name.replace(/\s+/g, '_')}`);
    } catch (err: any) {
      console.error("Item usage error:", err);
      addLogEntry('error', `Item usage failed: ${err.message || "An unexpected error occurred."}`);
    } finally {
      setIsUsingItem(null); 
    }
  }, [characterData, playerInventory, locationData, addLogEntry, setIsUsingItem, _updateCharacterAndInventoryFromItemUsage, _consumeEnergy, getMemoryContextString, attemptToTriggerUnexpectedEvent]);

  const handleApplyItemToLimb = useCallback(async (itemId: string, limbId: string, parameters?: ParsedPlayerActionParameters) => {
    if (!characterData || !locationData) { addLogEntry('error', 'Character data not available to apply item to limb.'); return; }
    const itemToApply = playerInventory.find(item => item.id === itemId);
    if (!itemToApply) { addLogEntry('error', `Item with ID ${itemId} not found in inventory.`); return; }
    const targetLimb = characterData.limbs.find(limb => limb.id === limbId);
    if (!targetLimb) { addLogEntry('error', `Limb with ID ${limbId} not found.`); return; }
    _consumeEnergy(1); // Reduced energy cost for applying item to limb
    if (characterData.isDefeated && itemToApply.itemTypeGuess.toLowerCase() !== 'revival_item_type') {
        addLogEntry('system', "You are too weak to apply that item.");
        return;
    }
    
    setIsApplyingToLimb(`${itemId}-${limbId}`); 

    addLogEntry('system', `Attempting to use ${itemToApply.name} on your ${targetLimb.name}...`);
    const memoryContextString = parameters?._augmentedMemoryContext || getMemoryContextString();

    try {
      const currentCharacterSnapshot = { ...characterData };
      const result: ItemUsageOutcome = await determineItemUsageEffect(
        itemToApply, 
        currentCharacterSnapshot, 
        targetLimb.name, 
        memoryContextString
      );
      addLogEntry('narration', result.narration);
      _updateCharacterAndInventoryFromItemUsage(itemToApply, result, `item_applied_to_limb_${targetLimb.name.replace(/\s+/g, '_')}`, targetLimb.name);
      await attemptToTriggerUnexpectedEvent(`applied_item_${itemToApply.rarity.toLowerCase()}_to_limb_${targetLimb.name.replace(/\s+/g, '_')}_in_${locationData.name.replace(/\s+/g, '_')}`);
    } catch (err: any) {
      console.error(`Error applying item ${itemToApply.name} to ${targetLimb.name}:`, err);
      addLogEntry('error', `Failed to apply ${itemToApply.name} to ${targetLimb.name}: ${err.message || "An unexpected error occurred."}`);
    } finally {
      setIsApplyingToLimb(null); 
    }
  }, [characterData, playerInventory, locationData, addLogEntry, setIsApplyingToLimb, _updateCharacterAndInventoryFromItemUsage, _consumeEnergy, getMemoryContextString, attemptToTriggerUnexpectedEvent]);

  const handleUnequipItemFromLimb = useCallback((limbId: string, itemIdToUnequip: string) => {
    if (!characterData || !locationData) {
        addLogEntry('error', 'Character data not available to unequip item.');
        return;
    }
    _consumeEnergy(0); // Reduced energy cost for unequipping
    if (characterData.isDefeated) {
        addLogEntry('system', "You are too weak to change equipment.");
        return;
    }

    let unequippedItem: GameItem | null = null;

    setCharacterData(prevCharData => {
        if (!prevCharData) return null;
        const newLimbs = prevCharData.limbs.map(limb => {
            if (limb.id === limbId) {
                const itemIndex = limb.equippedItems?.findIndex(item => item.id === itemIdToUnequip);
                if (itemIndex !== undefined && itemIndex > -1) {
                    unequippedItem = limb.equippedItems![itemIndex];
                    const updatedEquippedItems = limb.equippedItems!.filter((_, idx) => idx !== itemIndex);
                    addLogEntry('system', `Unequipped ${unequippedItem!.name} from your ${limb.name}.`);
                    return { ...limb, equippedItems: updatedEquippedItems };
                } else {
                    addLogEntry('error', `Item to unequip not found on ${limb.name}.`);
                }
            }
            return limb;
        });
        return { ...prevCharData, limbs: newLimbs };
    });

    if (unequippedItem) {
        setPlayerInventory(prevInventory => [...prevInventory, unequippedItem!]);
        if (unequippedItem.rarity === 'Epic' || unequippedItem.rarity === 'Legendary') {
             addMajorPlotPoint(`Player unequipped ${unequippedItem.rarity} item '${unequippedItem.name}'.`, [unequippedItem.id], locationData.name);
        }
        attemptToTriggerUnexpectedEvent(`unequipped_item_${unequippedItem.rarity.toLowerCase()}_from_limb_in_${locationData.name.replace(/\s+/g, '_')}`);
    }
  }, [characterData, locationData, setPlayerInventory, setCharacterData, addLogEntry, _consumeEnergy, attemptToTriggerUnexpectedEvent, addMajorPlotPoint]);


  return {
    handlePickupItem,
    handleUseItem,
    handleApplyItemToLimb,
    handleUnequipItemFromLimb,
  };
};
