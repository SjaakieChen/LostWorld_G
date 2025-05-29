
// hooks/useCrafting.ts
import { useState, useCallback } from 'react';
import { GameItem, CharacterData, CraftingRecipe, CraftingDetails, DynamicCraftingOutcome, ItemRarity, PotentialDiscovery } from '../services/gameTypes';
import { generateCraftedItemDetailsAndNarration, guessDynamicCraftingOutcome } from '../services/itemService';
import { useGameContext } from '../contexts/GameContext'; 
import { linkGeneratedEntityToLead } from '../services/loreService'; // Added for predefined recipe lead linking

const recipes: CraftingRecipe[] = [ /* ... (recipes as before) ... */ ];
const NUM_CRAFTING_SLOTS = 3;
interface UseCraftingProps {}

export const useCrafting = ({}: UseCraftingProps) => { 
  const { 
    characterData, playerInventory, setPlayerInventory, addLogEntry, 
    _consumeEnergy, _gainSkillExperience, attemptToTriggerUnexpectedEvent,
    addMemorableEntity, getMemoryContextString, locationData, 
    potentialDiscoveries, // Destructure potentialDiscoveries
    markPotentialDiscoveryFound // Added for lead fulfillment
  } = useGameContext();

  const [craftingSlots, setCraftingSlots] = useState<(GameItem | null)[]>(Array(NUM_CRAFTING_SLOTS).fill(null));
  const [isCrafting, setIsCrafting] = useState<boolean>(false); 

  const handleAddItemToCraftingSlot = useCallback((item: GameItem, slotIndex: number) => {
    if (craftingSlots.some(slotItem => slotItem?.id === item.id)) { addLogEntry('system', `${item.name} is already in a slot.`); return; }
    const newSlots = [...craftingSlots]; newSlots[slotIndex] = item; setCraftingSlots(newSlots);
    addLogEntry('system', `Added ${item.name} to crafting slot ${slotIndex + 1}.`);
  }, [craftingSlots, addLogEntry]);

  const handleRemoveItemFromCraftingSlot = useCallback((slotIndex: number) => {
    const itemInSlot = craftingSlots[slotIndex]; const newSlots = [...craftingSlots]; newSlots[slotIndex] = null; setCraftingSlots(newSlots);
    if (itemInSlot) addLogEntry('system', `Removed ${itemInSlot.name} from slot ${slotIndex + 1}.`);
  }, [craftingSlots, addLogEntry]);

  const getXpForRarity = (rarity: ItemRarity): number => { 
    switch(rarity) {
        case 'Common': return 5;
        case 'Uncommon': return 10;
        case 'Rare': return 20;
        case 'Epic': return 50;
        case 'Legendary': return 100;
        default: return 0;
    }
  };

  const handleAttemptCraft = useCallback(async () => {
    if (!characterData) return;
    if (characterData.isDefeated) { addLogEntry('system', "Too weak to craft."); return; }
    const itemsInSlotsUnfiltered = craftingSlots.filter(item => item !== null) as GameItem[];
    if (itemsInSlotsUnfiltered.length === 0) { addLogEntry('system', 'Place items in slots.'); return; }
    _consumeEnergy(3, "Crafting");  // Reduced energy cost for crafting
    const freshCharacterData = characterData; 
    if (freshCharacterData.isDefeated) return;

    setIsCrafting(true); 
    addLogEntry('system', `Attempting craft with: ${itemsInSlotsUnfiltered.map(i => i.name).join(', ')}...`);
    const memoryContextString = getMemoryContextString();
    const currentLocationVisualHint = locationData?.visualPromptHint || null; 
    let matchedRecipe: CraftingRecipe | null = null; let consumedSlotIndices: number[] = [];
    
    // Filter potential discoveries for item type and 'mentioned' status for crafting
    const unconfirmedItemLeads = potentialDiscoveries.filter(pd => pd.type === 'item' && pd.status === 'mentioned');

    for (const recipe of recipes) {
      const tempSlotItemsForThisRecipe = [...itemsInSlotsUnfiltered];
      const tempConsumedIndicesForThisRecipe: number[] = [];
      let recipeCanBeFulfilled = true;
      for (const input of recipe.inputs) {
        let requiredCount = input.quantity;
        for (let i = 0; i < requiredCount; i++) {
          const itemIndexInTempSlots = tempSlotItemsForThisRecipe.findIndex(slotItem => slotItem.name === input.itemName);
          if (itemIndexInTempSlots !== -1) {
            const originalSlotOfFoundItem = craftingSlots.findIndex(cs => cs?.id === tempSlotItemsForThisRecipe[itemIndexInTempSlots].id);
            if (originalSlotOfFoundItem !== -1 && !tempConsumedIndicesForThisRecipe.includes(originalSlotOfFoundItem)) {
                tempConsumedIndicesForThisRecipe.push(originalSlotOfFoundItem);
            }
            tempSlotItemsForThisRecipe.splice(itemIndexInTempSlots, 1);
          } else { recipeCanBeFulfilled = false; break; }
        }
        if (!recipeCanBeFulfilled) break;
      }
      if (recipeCanBeFulfilled && tempSlotItemsForThisRecipe.length === 0 && itemsInSlotsUnfiltered.length === recipe.inputs.reduce((sum, inp) => sum + inp.quantity, 0) ) {
        matchedRecipe = recipe; consumedSlotIndices = tempConsumedIndicesForThisRecipe.sort((a,b) => a-b); break;
      }
    }

    try {
        if (matchedRecipe) {
            const inputItemNames = consumedSlotIndices.map(idx => craftingSlots[idx]!.name);
            const result: CraftingDetails = await generateCraftedItemDetailsAndNarration(
                matchedRecipe.output, 
                inputItemNames, 
                freshCharacterData, 
                currentLocationVisualHint, 
                memoryContextString
            );
            const consumedItemIds = consumedSlotIndices.map(idx => craftingSlots[idx]?.id).filter(id => !!id) as string[];
            setPlayerInventory(prevInv => prevInv.filter(item => !consumedItemIds.includes(item.id)));
            setPlayerInventory(prevInv => [...prevInv, result.craftedItem]); 
            addMemorableEntity(result.craftedItem.id, result.craftedItem.name, 'item', result.craftedItem.rarity, result.craftedItem.description.substring(0,50) + "...", `Crafted in ${locationData?.name || 'current area'}`);
            addLogEntry('narration', result.narration);
            addLogEntry('game_event', `Crafted ${result.craftedItem.name} (Rarity: ${result.craftedItem.rarity}).`);
            _gainSkillExperience("Crafting", getXpForRarity(result.craftedItem.rarity) * 0.5); 
            setCraftingSlots(Array(NUM_CRAFTING_SLOTS).fill(null));
            
            // Link predefined recipe output to leads
            const fulfilledPredefinedLeadId = await linkGeneratedEntityToLead(result.craftedItem, 'item', unconfirmedItemLeads, freshCharacterData, memoryContextString);
            if (fulfilledPredefinedLeadId) {
                markPotentialDiscoveryFound(fulfilledPredefinedLeadId, result.craftedItem.id);
            }

            await attemptToTriggerUnexpectedEvent(`crafted_recipe_item_${result.craftedItem.rarity.toLowerCase()}_in_${locationData?.name.toLowerCase().replace(/\s+/g, '_') || 'unknown_loc'}`);
        } else {
          if (itemsInSlotsUnfiltered.length >= 2) {
            const itemsForDynamicCraft = [...itemsInSlotsUnfiltered];
            const consumedDynamicItemIds = itemsForDynamicCraft.map(item => item.id);
            setPlayerInventory(prevInv => prevInv.filter(item => !consumedDynamicItemIds.includes(item.id)));
            setCraftingSlots(Array(NUM_CRAFTING_SLOTS).fill(null));
            const result: DynamicCraftingOutcome = await guessDynamicCraftingOutcome(
                itemsForDynamicCraft, 
                freshCharacterData, 
                currentLocationVisualHint, 
                unconfirmedItemLeads, // Pass filtered leads
                memoryContextString
            );
            setPlayerInventory(prevInv => [...prevInv, result.newItem]); 
            addMemorableEntity(result.newItem.id, result.newItem.name, 'item', result.newItem.rarity, result.newItem.description.substring(0,50) + "...", `Dynamically crafted in ${locationData?.name || 'current area'}`);
            addLogEntry('narration', result.narration);
            addLogEntry('game_event', `Experimentally crafted ${result.newItem.name} (Rarity: ${result.newItem.rarity}).`);
            _gainSkillExperience("Crafting", getXpForRarity(result.newItem.rarity)); 

            // Handle lead fulfillment from dynamic crafting
            if (result.fulfilledLeadId) {
                markPotentialDiscoveryFound(result.fulfilledLeadId, result.newItem.id);
            } else { // If LLM didn't directly fulfill, try a semantic link
                const fulfilledDynamicLeadId = await linkGeneratedEntityToLead(result.newItem, 'item', unconfirmedItemLeads, freshCharacterData, memoryContextString);
                if (fulfilledDynamicLeadId) {
                    markPotentialDiscoveryFound(fulfilledDynamicLeadId, result.newItem.id);
                }
            }

            await attemptToTriggerUnexpectedEvent(`crafted_dynamic_item_${result.newItem.rarity.toLowerCase()}_in_${locationData?.name.toLowerCase().replace(/\s+/g, '_') || 'unknown_loc'}`);
          } else addLogEntry('system', "Items don't combine, not enough for experiment.");
        }
    } catch (err: any) {
        console.error("Crafting error:", err);
        const errorMsg = err.message || (matchedRecipe ? "Error during predefined crafting." : "Combination yielded smoke. Items lost.");
        addLogEntry('error', `Crafting failed: ${errorMsg}`);
        if (!matchedRecipe && itemsInSlotsUnfiltered.length >=2) {
             const consumedDynamicItemIds = itemsInSlotsUnfiltered.map(item => item.id);
             setPlayerInventory(prevInv => prevInv.filter(item => !consumedDynamicItemIds.includes(item.id)));
             setCraftingSlots(Array(NUM_CRAFTING_SLOTS).fill(null));
        }
    } finally { 
        setIsCrafting(false); 
    }
  }, [
    craftingSlots, characterData, playerInventory, setPlayerInventory, addLogEntry, 
    _consumeEnergy, _gainSkillExperience, attemptToTriggerUnexpectedEvent,
    addMemorableEntity, getMemoryContextString, locationData?.name, locationData?.visualPromptHint, 
    potentialDiscoveries, // Added potentialDiscoveries to dependency array
    markPotentialDiscoveryFound // Added markPotentialDiscoveryFound
  ]); 

  return {
    craftingSlots, setCraftingSlots, isCrafting, setIsCrafting, 
    handleAddItemToCraftingSlot, handleRemoveItemFromCraftingSlot, handleAttemptCraft,
  };
};
