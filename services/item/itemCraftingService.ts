// services/item/itemCraftingService.ts
import { API_KEY, ai, callLLMWithToolAndValidateArgs, TEXT_MODEL_NAME, Tool, Type, FunctionDeclaration, Schema } from '../geminiClient';
import { GameItem, CraftingRecipeOutput, CraftingDetails, DynamicCraftingOutcome, ItemRarity, PotentialDiscovery, CharacterData, VisualStyleType } from '../types';
import { SKILL_LEVEL_INTERPRETATION_GUIDE, formatSkillsForLLM } from '../llmPromptUtils';
import { generateAndFetchItemIcon } from './itemGenerationService'; // Assuming icon gen is here or in a common item util

export const CRAFTED_ITEM_DETAILS_TOOL: Tool = {
  functionDeclarations: [{
    name: "provide_crafted_item_details", description: "Provides narration for successfully crafting a predefined item.",
    parameters: { type: Type.OBJECT, properties: { narration: { type: Type.STRING, description: "Engaging narration (1-2 sentences) of successful crafting, reflecting character's skill." } }, required: ["narration"] },
  } as FunctionDeclaration],
};
type CraftedItemDetailsFromTool = { narration: string };
const validateCraftedItemDetailsStructure = (data: any): data is CraftedItemDetailsFromTool => data && typeof data.narration === 'string' && data.narration.trim() !== '';

export const generateCraftedItemDetailsAndNarration = async (
  recipeOutput: CraftingRecipeOutput, inputItemNames: string[], character: CharacterData,
  _locationVisualPromptHint: string | null,
  memoryContextString: string = ""
): Promise<CraftingDetails> => {
  if (!API_KEY) throw new Error("Gemini API key is not configured.");
  const craftingSkill = character.skills.find(s => s.name === 'Crafting'); const craftingLevel = craftingSkill?.level || 0;
  const visualStyle = character.visualStyle;
  const prompt = `Character: ${character.characterConcept} (Crafting Level: ${craftingLevel}, Visual Style: ${visualStyle}) successfully crafted "${recipeOutput.name}" (Rarity: ${recipeOutput.rarity}) using [${inputItemNames.join(', ')}]. The crafted item's description is "${recipeOutput.description}".
${memoryContextString}
${SKILL_LEVEL_INTERPRETATION_GUIDE}
Task: Generate engaging narration (1-2 sentences, from "You" perspective) for this successful crafting event. The narration should reflect the character's Crafting skill level. For example, high skill might be "You skillfully combine...", low skill "Despite fumbling...".
CRITICAL: You MUST invoke the tool named 'provide_crafted_item_details'. The tool expects a single 'narration' string. Ensure strict adherence.`;
  const result = await callLLMWithToolAndValidateArgs(prompt, CRAFTED_ITEM_DETAILS_TOOL, validateCraftedItemDetailsStructure, "Invalid crafted item details structure", "generateCraftedItemDetailsAndNarration");
  const iconUrl = await generateAndFetchItemIcon(recipeOutput.visualPromptHint, recipeOutput.name, visualStyle);
  const craftedItem: GameItem = { ...recipeOutput, id: crypto.randomUUID(), iconUrl };
  return { craftedItem, narration: result.narration };
};

export const DYNAMIC_CRAFTING_OUTCOME_TOOL: Tool = {
  functionDeclarations: [{
    name: "determine_dynamic_crafting_outcome", description: "Determines outcome of experimental crafting. Quality/rarity HEAVILY influenced by Crafting skill, memory, game setting/universe. Epic/Legendary distinct unless fulfilling a lead. Item for lead MUST be contextually plausible. Visual prompt hint for item should be for the game's current visual style (e.g., 'Pixel Art icon', 'Anime style icon', or 'black and white traditional Chinese ink painting style icon' if 'Ink Painting' is current style), focusing on item itself with simple background.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        newItemName: { type: Type.STRING, description: "Name of resulting item. If fulfilling lead, matches lead name." },
        newItemDescription: { type: Type.STRING, description: "Description, hints at use/lore. If fulfilling lead, aligns with hint." },
        newItemItemTypeGuess: { type: Type.STRING, description: "Category (e.g., 'tool', 'junk', 'potion', 'trinket')." },
        newItemRarity: { type: Type.STRING, enum: ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'], description: `Rarity. Strongly influenced by Crafting skill, input rarity, memory, setting/universe. If fulfilling lead, matches/consistent with lead rarity. Epic/Legendary distinct (unless lead). Failures/junk 'Common'.` },
        newItemVisualPromptHint: { type: Type.STRING, description: "Detailed visual description of THE ITEM ITSELF, suitable for a [CURRENT_GAME_STYLE] icon (e.g., 'Pixel Art icon', 'Anime style icon', or 'black and white traditional Chinese ink painting style icon' if 'Ink Painting' is current style). Item should be front and center. Background implied should be simple/neutral or subtly thematic TO THE ITEM for that style, item is SOLE focus. Example for [CURRENT_GAME_STYLE]=Anime: 'a pulsing orb of dark energy with swirling patterns'." },
        narration: { type: Type.STRING, description: "Narration (1-3 sentences) of process, outcome, reflecting Crafting skill, inputs, setting/universe." },
        fulfilledLeadId: { type: Type.STRING, nullable: true, description: "ID of item lead fulfilled, if any. ONLY if item is plausible from inputs & context AND matches lead." }
      },
      required: ["newItemName", "newItemDescription", "newItemItemTypeGuess", "newItemRarity", "newItemVisualPromptHint", "narration"],
    },
  } as FunctionDeclaration],
};
type DynamicCraftingOutcomeFromTool = { newItemName: string; newItemDescription: string; newItemItemTypeGuess: string; newItemRarity: ItemRarity; newItemVisualPromptHint: string; narration: string; fulfilledLeadId?: string | null; };
const validateDynamicCraftingOutcomeStructure = (data: any): data is DynamicCraftingOutcomeFromTool => {
  const rarities: ItemRarity[] = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];
  return data && typeof data.newItemName === 'string' && data.newItemName.trim() !== '' && typeof data.newItemDescription === 'string' && data.newItemDescription.trim() !== '' &&
    typeof data.newItemItemTypeGuess === 'string' && data.newItemItemTypeGuess.trim() !== '' && typeof data.newItemRarity === 'string' && rarities.includes(data.newItemRarity as ItemRarity) &&
    typeof data.newItemVisualPromptHint === 'string' && data.newItemVisualPromptHint.trim() !== '' && typeof data.narration === 'string' && data.narration.trim() !== '' &&
    (data.fulfilledLeadId === undefined || data.fulfilledLeadId === null || typeof data.fulfilledLeadId === 'string');
};

export const guessDynamicCraftingOutcome = async (
  inputItems: GameItem[], character: CharacterData,
  _locationVisualPromptHint: string | null,
  unconfirmedLeads: PotentialDiscovery[],
  memoryContextString: string = ""
): Promise<DynamicCraftingOutcome> => {
  if (!API_KEY) throw new Error("Gemini API key is not configured.");
  const craftingSkill = character.skills.find(s => s.name === 'Crafting'); const craftingLevel = craftingSkill?.level || 0;
  const itemSummary = inputItems.map(item => `${item.name} (Type: ${item.itemTypeGuess}, Rarity: ${item.rarity}, Desc: ${item.description})`).join('; ');
  const visualStyle = character.visualStyle;

  let settingSpecificInstruction = "";
  let loreContextInstruction = "";
  if (character.gameSettingType === "Historical" && character.initialHistoricalContext) {
    settingSpecificInstruction = `Game Setting: HISTORICAL - ${character.initialHistoricalContext}. Dynamically crafted item MUST be plausible for this era. High Crafting (7+) with rare/thematic inputs and fitting memory might yield restored/empowered historical artifact type, not unique named artifacts unless inputs are its pieces or a lead suggests it and it's plausible. Item visual prompt hints must describe the item itself, suitable for a ${visualStyle === 'Ink Painting' ? 'black and white traditional Chinese ink painting style' : visualStyle} icon.`;
    loreContextInstruction = `Historical Context: ${character.initialHistoricalContext}. Current Visual Style: ${visualStyle}.`;
  } else if (character.gameSettingType === "Fictional") {
    if (character.fictionalUniverseContext) {
        settingSpecificInstruction = `Game Setting: FICTIONAL within universe: "${character.fictionalUniverseContext}". Crafted item MUST be consistent with universe lore. High Crafting (7+) with rare/thematic inputs might yield lore-appropriate Epic/Legendary item (new artifact or component, or lead fulfillment if plausible). Distinct from memory unless lead. Item visual prompt hints must describe the item itself, suitable for a ${visualStyle === 'Ink Painting' ? 'black and white traditional Chinese ink painting style' : visualStyle} icon.`;
        loreContextInstruction = `Fictional Universe: ${character.fictionalUniverseContext}. Current Visual Style: ${visualStyle}.`;
    } else {
        settingSpecificInstruction = `Game Setting: General FICTIONAL. Crafted item fits character/inputs. High Crafting (7+) with rare/thematic inputs might yield original Epic/Legendary item, or fulfill a lead if plausible. You may subtly draw inspiration from common fantasy/sci-fi tropes if they fit. Distinct from memory unless lead. Item visual prompt hints must describe the item itself, suitable for a ${visualStyle === 'Ink Painting' ? 'black and white traditional Chinese ink painting style' : visualStyle} icon.`;
        loreContextInstruction = `Current Visual Style: ${visualStyle}.`;
    }
  }

  let leadsContext = "No specific item-related leads active for crafting.";
  const itemLeads = unconfirmedLeads.filter(pd => pd.type === 'item' && pd.status === 'mentioned');
  if (itemLeads.length > 0) {
    leadsContext = `Active Item-Related Leads (Rumors) to consider for crafting fulfillment:\n${itemLeads.map(lead => `- Lead ID: ${lead.id}, Rumored Item: "${lead.name}" (Hint: ${lead.descriptionHint}, Rarity Hint: ${lead.rarityHint || 'Unknown'}).`).join('\n')}`;
  }

  const prompt = `Character: ${character.characterConcept} (Crafting Level: ${craftingLevel}, Visual Style: ${visualStyle}) is attempting to combine: [${itemSummary}].
${loreContextInstruction}
${leadsContext}
${memoryContextString}
${SKILL_LEVEL_INTERPRETATION_GUIDE}

PRIMARY DIRECTIVE: The outcome of crafting MUST be logically plausible given the input items, character's Crafting skill, and consistent with the game setting (Historical context or Fictional Universe lore). ${settingSpecificInstruction}

Task: Determine the outcome of this experimental crafting.
-   Crafting skill (Level ${craftingLevel}) is PARAMOUNT. Low skill (0-2) usually 'Common' junk/failure. Mid skill (3-6) 'Uncommon'/'Rare'. High skill (7+) 'Rare'/'Epic'. 'Legendary' exceptional, requires high skill, specific inputs, fitting context.
-   LEAD FULFILLMENT (Secondary): If inputs, skill, and context make it *highly plausible* to craft an item fulfilling an active lead from "${leadsContext}", you MAY do so. Provide 'fulfilledLeadId'. The crafted item MUST match lead's name/concept/rarity. DO NOT force lead fulfillment if implausible.
-   Be creative! Outcome based on inputs, skill, setting. Describe new item (name, desc, type, rarity).
-   Visual Prompt Hint for New Item: Provide a DETAILED visual description of THE ITEM ITSELF, suitable for a ${visualStyle === 'Ink Painting' ? 'black and white traditional Chinese ink painting style' : visualStyle} icon. Item should be front and center. Any implied background should be simple, neutral, or subtly thematic TO THE ITEM, in ${visualStyle} style, but item is SOLE focus. Replace '[CURRENT_GAME_STYLE]' in the tool schema with '${visualStyle === 'Ink Painting' ? 'black and white traditional Chinese ink painting style' : visualStyle}'.
-   Narration (1-3 sentences, "You" perspective) reflects process, outcome, skill.

CRITICAL: You MUST invoke tool 'determine_dynamic_crafting_outcome'. Arguments MUST adhere to schema.
DO NOT output details as text/JSON. Tool call is ONLY valid way.`;

  const result = await callLLMWithToolAndValidateArgs(prompt, DYNAMIC_CRAFTING_OUTCOME_TOOL, validateDynamicCraftingOutcomeStructure, "Invalid dynamic crafting outcome (check rarity, outcome interest, distinction from memory, skill adherence, lead fulfillment plausibility, visual appeal, setting/universe consistency)", "guessDynamicCraftingOutcome");
  const iconUrl = await generateAndFetchItemIcon(result.newItemVisualPromptHint, result.newItemName, visualStyle);
  const newItem: GameItem = { id: crypto.randomUUID(), name: result.newItemName, description: result.newItemDescription, itemTypeGuess: result.newItemItemTypeGuess, rarity: result.newItemRarity, visualPromptHint: result.newItemVisualPromptHint, iconUrl };
  return { newItem, narration: result.narration, fulfilledLeadId: result.fulfilledLeadId };
};
