// services/item/itemInteractionService.ts
import { API_KEY, ai, callLLMWithToolAndValidateArgs, TEXT_MODEL_NAME, Tool, Type, FunctionDeclaration, Schema } from '../geminiClient';
import { GenerateContentResponse } from "@google/genai";
import { GameItem, PickupResult, CharacterData, ItemUsageOutcome, ItemRarity, VisualStyleType } from '../types';
import { SKILL_LEVEL_INTERPRETATION_GUIDE, formatSkillsForLLM, formatCharacterLimbDetailsForLLM } from '../llmPromptUtils';
import { identifyPotentialDiscoveriesInText, ProcessedTextWithDiscoveries } from '../loreService';

export const PICKUP_ITEM_NARRATION_TOOL: Tool = {
  functionDeclarations: [{
    name: "provide_pickup_narration", description: "Generates brief narration for picking up an item.",
    parameters: { type: Type.OBJECT, properties: { narration: { type: Type.STRING, description: "Short (1 sentence) narration from the player's perspective (e.g., 'You snatch the Rusty Dagger.')." } }, required: ["narration"] },
  } as FunctionDeclaration],
};
type PickupNarrationFromTool = { narration: string };
const validatePickupNarrationStructure = (data: any): data is PickupNarrationFromTool => data && typeof data.narration === 'string' && data.narration.trim() !== '';

export const narrateAndConfirmPickup = async (
  item: GameItem,
  character: CharacterData,
  memoryContextString: string = ""
): Promise<PickupResult> => {
  if (!API_KEY) throw new Error("Gemini API key is not configured.");
  const prompt = `Character: ${character.characterConcept} (Skills: ${formatSkillsForLLM(character.skills)}) is picking up: ${item.name} (Description: ${item.description}, Rarity: ${item.rarity}).
${memoryContextString}
Task: Generate a short, engaging narration (1 sentence) for this action, from the player's perspective (using "You"). For example: "You carefully pick up the Glimmering Shard."
CRITICAL: You MUST invoke the tool named 'provide_pickup_narration'. The tool expects a single 'narration' string. Adhere to this.`;
  const result = await callLLMWithToolAndValidateArgs(prompt, PICKUP_ITEM_NARRATION_TOOL, validatePickupNarrationStructure, "Invalid pickup narration structure", "narrateAndConfirmPickup");
  return { narration: result.narration, pickedUpItem: item };
};

export const ITEM_USAGE_EFFECT_TOOL: Tool = {
  functionDeclarations: [{
    name: "determine_item_usage_effect", description: "Determines effect of using an item. Considers item properties, rarity (Epic/Legendary known items significant), character skills, targeted limb, memory context, game setting/universe. Provides narration, specifies changes. If targetLimbName NOT provided, isEquippedToLimb MUST be false. New visual prompt hint for item must be style-agnostic for the item itself if it changes.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        narration: { type: Type.STRING, description: "Engaging narration (1-3 sentences, player's perspective 'You'). Impact/tone reflects item rarity, skills, memory context (INCLUDING IF CURRENTLY IN DIALOGUE WITH AN NPC), game setting/universe. Use of Epic/Legendary significant. If in dialogue, the narration should make sense in that context (e.g., player's action is visible to NPC)." },
        itemConsumed: { type: Type.BOOLEAN, description: "Boolean indicating if item consumed." },
        isEquippedToLimb: { type: Type.BOOLEAN, nullable: true, description: "True if item equipped/worn/wielded. False if one-time use, not attached, or no targetLimbName. If true, item ADDED to limb's equipped items." },
        itemNewName: { type: Type.STRING, nullable: true, description: "New name if item changes. Null if unchanged." },
        itemNewDescription: { type: Type.STRING, nullable: true, description: "New description if item changes. Null if unchanged." },
        itemNewVisualPromptHint: { type: Type.STRING, nullable: true, description: "New STYLE-AGNOSTIC visual prompt for THE ITEM ITSELF if its appearance changes (e.g. 'a now cracked orb', 'a dagger glowing faintly'). Null if appearance unchanged. Focus on item, not background." },
        overallHealthChange: { type: Type.NUMBER, nullable: true, description: "Change in overall health. Magnitude reflects item rarity, skills, game setting/universe." },
        energyChange: { type: Type.NUMBER, nullable: true, description: "Change in energy. Magnitude reflects item rarity, skills, game setting/universe." },
        limbStatusChanges: { type: Type.ARRAY, nullable: true, description: "Array of changes to limb status/health. If limb targeted, primary effect here. Magnitude/type reflects item rarity, skills. 'newHealth' absolute (0-100).",
          items: { type: Type.OBJECT, properties: { limbName: { type: Type.STRING }, newStatus: { type: Type.STRING }, newHealth: { type: Type.NUMBER } }, required: ["limbName", "newStatus", "newHealth"] } },
        xpGain: { type: Type.OBJECT, nullable: true, description: "Optional skill XP gain. Null if no XP.", properties: { skillName: {type: Type.STRING}, amount: {type: Type.NUMBER} }, required: ["skillName", "amount"] }
      },
      required: ["narration", "itemConsumed"],
    },
  } as FunctionDeclaration],
};
type ItemUsageEffectFromTool = { narration: string; itemConsumed: boolean; isEquippedToLimb?: boolean | null; itemNewName?: string | null; itemNewDescription?: string | null; itemNewVisualPromptHint?: string | null; overallHealthChange?: number | null; energyChange?: number | null; limbStatusChanges?: { limbName: string; newStatus: string; newHealth: number; }[] | null; xpGain?: { skillName: string; amount: number } | null; };

const validateItemUsageEffectStructure = (data: any): data is ItemUsageEffectFromTool => {
  return data && typeof data.narration === 'string' && data.narration.trim() !== '' && typeof data.itemConsumed === 'boolean' &&
    (data.isEquippedToLimb === undefined || data.isEquippedToLimb === null || typeof data.isEquippedToLimb === 'boolean') &&
    (data.itemNewName === undefined || data.itemNewName === null || typeof data.itemNewName === 'string') &&
    (data.itemNewDescription === undefined || data.itemNewDescription === null || typeof data.itemNewDescription === 'string') &&
    (data.itemNewVisualPromptHint === undefined || data.itemNewVisualPromptHint === null || typeof data.itemNewVisualPromptHint === 'string') &&
    (data.overallHealthChange === undefined || data.overallHealthChange === null || typeof data.overallHealthChange === 'number') &&
    (data.energyChange === undefined || data.energyChange === null || typeof data.energyChange === 'number') &&
    (data.limbStatusChanges === undefined || data.limbStatusChanges === null || (Array.isArray(data.limbStatusChanges) && data.limbStatusChanges.every((change: any) => change && typeof change.limbName === 'string' && typeof change.newStatus === 'string' && typeof change.newHealth === 'number' && change.newHealth >= 0 && change.newHealth <= 100 ))) &&
    (data.xpGain === undefined || data.xpGain === null || (typeof data.xpGain === 'object' && data.xpGain.skillName && typeof data.xpGain.skillName === 'string' && typeof data.xpGain.amount === 'number'));
};

export const determineItemUsageEffect = async (
  itemUsed: GameItem, character: CharacterData, targetLimbNameParam?: string, memoryContextString: string = ""
): Promise<ItemUsageOutcome> => {
  if (!API_KEY) throw new Error("Gemini API key is not configured.");
  const charSkillsStr = formatSkillsForLLM(character.skills);
  const charLimbDetailsStr = formatCharacterLimbDetailsForLLM(character.limbs);
  const charStateSum = `Char: ${character.characterConcept} (Visual Style: ${character.visualStyle}). Health: ${character.overallHealth}HP, Energy: ${character.currentEnergy}/${character.maxEnergy}EN. Limbs & Equipment: [${charLimbDetailsStr}]. Defeated: ${character.isDefeated}. Skills: [${charSkillsStr}]. Setting: ${character.gameSettingType}.`;
  const itemDetailsSum = `Item: ${itemUsed.name} (Type: ${itemUsed.itemTypeGuess}, Rarity: ${itemUsed.rarity}). Desc: ${itemUsed.description}.`;

  let limbCtx = "";
  if (targetLimbNameParam) {
    const limb = character.limbs.find(l => l.name === targetLimbNameParam);
    limbCtx = limb ? ` Player is attempting to use this item on their ${limb.name} (Current Status: ${limb.status}, Health: ${limb.health}HP, Currently Equipped: ${limb.equippedItems?.map(ei => ei.name).join(', ') || 'None'})` : ` Player is attempting to use this item on an unrecognized limb named '${targetLimbNameParam}'. Assume general use or flag as implausible.`;
  } else {
    limbCtx = " Player is using this item generally (not targeting a specific limb for equipping). 'isEquippedToLimb' MUST BE false in this case.";
  }

  let settingSpecificUsageNote = "";
  if (character.gameSettingType === "Historical" && character.initialHistoricalContext) {
    settingSpecificUsageNote = `Game Setting: HISTORICAL - ${character.initialHistoricalContext}. Item effect and narration MUST be historically plausible. If '${itemUsed.name}' is Epic/Legendary, effects align with known properties/legends from that period. Mundane items have mundane effects.`;
  } else if (character.gameSettingType === "Fictional") {
    if (character.fictionalUniverseContext) {
        settingSpecificUsageNote = `Game Setting: FICTIONAL within universe: "${character.fictionalUniverseContext}". Item effect and narration MUST be consistent with this universe's lore/rules. If '${itemUsed.name}' is Epic/Legendary, effects should be significant and lore-appropriate.`;
    } else {
        settingSpecificUsageNote = `Game Setting: General FICTIONAL. Item effect and narration should fit its description and rarity. Epic/Legendary items have significant effects. You may subtly draw inspiration from common fantasy/sci-fi/pop-culture tropes if they naturally fit the item and enhance the experience.`;
    }
  }

  const prompt = `Character (${charStateSum}) is using item (${itemDetailsSum}).${limbCtx}
${memoryContextString}
${settingSpecificUsageNote}
${SKILL_LEVEL_INTERPRETATION_GUIDE}

Task: Determine the effects of using this item.
-   Narration: Provide engaging narration (1-3 sentences, from "You" perspective).
    Impact/tone reflects item rarity ('${itemUsed.rarity}'), skills, memory context (INCLUDING IF CURRENTLY IN DIALOGUE WITH AN NPC - if so, your action is likely visible), game setting/universe.
    Use of Epic/Legendary significant. Consider player's equipped items if relevant to how the used item works.
-   Item Effects: Specify if item consumed, changes properties (name, desc). If item's visual appearance changes, provide a STYLE-AGNOSTIC description for 'itemNewVisualPromptHint' (e.g., 'a now cracked orb', 'a dagger glowing faintly'). Focus on ITEM itself, not background.
-   Character Effects: Specify changes to overall health, energy, or limb status. Limb status changes include new health (0-100 absolute) and descriptive status.
-   Equipping Logic (MUST be followed):
    -   If \`targetLimbName\` provided AND \`itemUsed.itemTypeGuess\` suggests WEAPON or ARMOR/CLOTHING suitable for that limb:
        -   \`isEquippedToLimb\` MUST be true. \`itemConsumed\` MUST be false. Narration describes equipping. \`limbStatusChanges\` reflects equipping. Other character effects usually null/0 unless magical.
    -   If \`targetLimbName\` provided but item is CONSUMABLE:
        -   \`isEquippedToLimb\` MUST be false. \`itemConsumed\` likely true. Effects depend on consumable.
    -   If \`targetLimbName\` provided but item inappropriate for limb:
        -   \`isEquippedToLimb\` MUST be false. Minimal/negative effect. Narration reflects failed attempt.
    -   If \`targetLimbName\` NOT provided (general use):
        -   \`isEquippedToLimb\` MUST BE false. Item likely consumable or general effect.
-   Nonsensical Use: If use clearly nonsensical, \`isEquippedToLimb\` false, minimal/negative effects. Narration reflects this.
-   XP: Optionally grant XP for skillful application.

CRITICAL: You MUST invoke tool 'determine_item_usage_effect'. Arguments MUST adhere strictly to schema.
DO NOT output details as text/JSON. Tool call is ONLY valid way.`;

  const result = await callLLMWithToolAndValidateArgs(prompt, ITEM_USAGE_EFFECT_TOOL, validateItemUsageEffectStructure, "Invalid item usage effect structure (check effects align with rarity, type, skills, health/energy values, memory context, setting/universe consistency)", "determineItemUsageEffect");
  return {
    narration: result.narration,
    itemEffect: { consumed: result.itemConsumed, isEquippedToLimb: result.isEquippedToLimb || false, newNameIfChanged: result.itemNewName || null, newDescriptionIfChanged: result.itemNewDescription || null, newVisualPromptHintIfChanged: result.itemNewVisualPromptHint || null },
    characterEffect: { overallHealthChange: result.overallHealthChange || null, energyChange: result.energyChange || null, limbStatusChanges: result.limbStatusChanges || null, xpGain: result.xpGain || null },
  };
};

export const elaborateOnItemDescription = async (
  item: GameItem, characterData: CharacterData,
  currentLocationKey: string,
  memoryContextString: string = ""
): Promise<ProcessedTextWithDiscoveries> => {
  if (!API_KEY) throw new Error("Gemini API key is not configured.");
  const perceptionSkill = characterData.skills.find(s => s.name === 'Perception'); const perceptionLevel = perceptionSkill?.level || 0;
  const charCtx = `Char: ${characterData.characterConcept} (Perception Lvl ${perceptionLevel}). Setting: ${characterData.gameSettingType}.`;
  const textualItemTypes = ['book', 'scroll', 'note', 'letter', 'manuscript', 'codex', 'journal', 'log', 'brochure', 'pamphlet', 'inscription', 'carving', 'tablet', 'map', 'document'];
  const isTextual = textualItemTypes.some(type => item.itemTypeGuess.toLowerCase().includes(type));

  let settingSpecificElaborationInstruction = "";
  if (characterData.gameSettingType === 'Historical' && characterData.initialHistoricalContext) {
    settingSpecificElaborationInstruction = `Elaboration MUST be consistent with historical context: ${characterData.initialHistoricalContext}. If item is known artifact type, align with its REAL history/use. Focus on historical significance or connections.`;
  } else if (characterData.gameSettingType === 'Fictional') {
    if (characterData.fictionalUniverseContext) {
        settingSpecificElaborationInstruction = `Elaboration MUST be consistent with the established lore of the fictional universe: "${characterData.fictionalUniverseContext}". If item is known artifact from this universe, expand on its specific IN-WORLD lore. Focus on its role or history within this universe.`;
    } else {
        settingSpecificElaborationInstruction = `Elaboration should be consistent with a general fantasy/sci-fi theme fitting the item. You may subtly draw inspiration from common tropes if they naturally fit and enhance the experience. Focus on unique properties, origins, or connections to broader world lore.`;
    }
  }

  let elaborationInstruction = `Provide a CONCISE (1-2 short paragraphs) LORE-FOCUSED and FACT-RICH description. Avoid generic statements about its function (e.g., "This sword is for fighting"). Instead, focus on what makes THIS item unique or significant within the game world.

If NOT textual (e.g., weapon, tool, artifact):
-   Reveal its specific history, origin (e.g., who made it, when, why), notable past owners or significant events it was involved in.
-   Describe any unique magical properties, curses, blessings, or specific powers it holds, with details on how they manifest or were acquired.
-   Mention any distinguishing marks, inscriptions (and their meaning if known), or unique materials used in its construction.
-   Connect it to known entities, factions, or historical/lore events from the game's memory context if plausible, providing specific links.
-   What are some "fun facts", real historical details (if applicable), or intriguing pieces of in-world lore about this item that a knowledgeable character might recall?

If TEXTUAL (e.g., book, scroll, map, letter):
-   Extract and present specific, concrete information, key passages, names, dates, plans, observations, or secrets DIRECTLY from the text.
-   DO NOT just say 'This scroll contains battle plans.' Instead, DESCRIBE THE ACTUAL PLAN: 'The faded ink outlines a daring night raid on the Western Garrison, detailing a secret passage beneath the old aqueduct and specifying the use of silenced crossbows.' Or, if it's a historical document, 'This edict, dated 44 BCE, proclaims Caesar Dictator Perpetuo, outlining new public works projects including...'
-   If it's a map, describe key locations it reveals, real historical routes/sites (if applicable), or important symbols and their in-world lore meaning.
-   If it's a letter, summarize its specific contents, sender, recipient, and its real historical/in-world lore purpose and context.
-   What are some "fun facts", hidden meanings, historical context, or intriguing pieces of in-world lore one would glean from a careful reading?
`;
  if (item.rarity === 'Epic' || item.rarity === 'Legendary') {
    elaborationInstruction += `\nAs this item is ${item.rarity}, its details should be particularly insightful, reflecting its unique history, profound power, or significant role in the world's lore. If it's a known historical artifact (for Historical setting) or a legendary item from the Fictional Universe, your description MUST align with and expand upon established REAL historical facts or IN-WORLD lore about it.`;
  }

  const prompt = `Player learns more about item.
Item: ${item.name}, Current Desc: ${item.description}, Type: ${item.itemTypeGuess}, Rarity: ${item.rarity}.
${charCtx} ${SKILL_LEVEL_INTERPRETATION_GUIDE} (Player Perception Lvl ${perceptionLevel} might reveal more).
${memoryContextString}
Task: ${elaborationInstruction} ${settingSpecificElaborationInstruction} Output ONLY rich, descriptive factual text. No markdown. No player thoughts/feelings.
If you mention any specific named items, people, or locations that sound important, unique, or part of a legend/quest, make a mental note but DO NOT use any special formatting or markup in your direct speech output. The game system will handle identifying these hints separately.`;
  try {
    const response = await ai.models.generateContent({ model: TEXT_MODEL_NAME, contents: prompt });
    const rawItemElaborationText = response.text;
    if (rawItemElaborationText?.trim()) {
      const loreProcessingResult: ProcessedTextWithDiscoveries = await identifyPotentialDiscoveriesInText(
        rawItemElaborationText,
        'item_text',
        item.id,
        characterData,
        currentLocationKey,
        memoryContextString
      );
      return loreProcessingResult;
    }
    console.warn(`Elaboration for ${item.name} resulted in empty response.`, response);
    const fallbackText = "Further examination reveals no additional significant details.";
    return { processedText: fallbackText, rawText: fallbackText, potentialDiscoveries: [] };
  } catch (error: any) {
    console.error(`Error elaborating on item ${item.name}:`, error);
    const errorText = `Error recalling more about ${item.name}. Details hazy. (Error: ${error.message || 'Unknown'})`;
    return { processedText: errorText, rawText: errorText, potentialDiscoveries: [] };
  }
};

export const IDENTIFY_ITEM_IN_INVENTORY_TOOL: Tool = {
  functionDeclarations: [{
    name: "select_item_from_inventory_by_phrase",
    description: "Given a player's textual phrase referring to an item and a list of items in their inventory, selects the single best matching item ID. Considers item names, types, descriptions, and context (player skills, recent actions/dialogue in memory).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        matchedItemId: {
          type: Type.STRING,
          nullable: true,
          description: "The ID of the item in the inventory that best matches the player's phrase. Null if no clear match or if the phrase is too ambiguous given the inventory contents."
        },
      },
      required: ["matchedItemId"]
    }
  } as FunctionDeclaration]
};

type IdentifyItemToolOutput = { matchedItemId: string | null };
const validateIdentifyItemToolOutput = (data: any): data is IdentifyItemToolOutput => {
  return data && (data.matchedItemId === null || typeof data.matchedItemId === 'string');
};

export const identifyItemInInventoryByName = async (
  itemNamePhrase: string,
  inventory: GameItem[],
  character: CharacterData,
  memoryContext: string
): Promise<GameItem | null> => {
  if (!API_KEY) throw new Error("Gemini API key is not configured.");
  if (inventory.length === 0) return null;

  const inventorySummary = inventory.map(item =>
    `ID: ${item.id}, Name: "${item.name}", Type: ${item.itemTypeGuess}, Rarity: ${item.rarity}, Desc: "${item.description.substring(0, 50)}..."`
  ).join('\n');

  const charSkillsStr = formatSkillsForLLM(character.skills);
  const prompt = `Player wants to use an item referred to as: "${itemNamePhrase}".
Player Character: ${character.characterConcept}. Skills: [${charSkillsStr}].
Current Inventory:\n${inventorySummary}
Recent Game Context/Memory (may provide clues about intended item):\n${memoryContext}
${SKILL_LEVEL_INTERPRETATION_GUIDE}

Task: Identify which item ID from the "Current Inventory" the player is most likely referring to with the phrase "${itemNamePhrase}".
- Consider exact name matches first (case-insensitive).
- Then consider partial name matches (e.g., "healing pot" for "Healing Potion").
- Consider type matches (e.g., "potion" if they say "use potion" and have one; prioritize by rarity or more specific name if multiple).
- Use character skills and memory context to infer intent if the phrase is ambiguous (e.g., a character skilled in healing trying to "use bandage" likely means their specific "Herbal Bandage" item).
- If multiple items are plausible, pick the one that seems most relevant given the context or is generally more useful (e.g., a healing potion over a generic rock if player says "use item").
- If no item is a clear or strong match, return null for matchedItemId.

CRITICAL: You MUST invoke the tool 'select_item_from_inventory_by_phrase'.
Provide the ID of the best-matched item.
`;

  const result = await callLLMWithToolAndValidateArgs(
    prompt,
    IDENTIFY_ITEM_IN_INVENTORY_TOOL,
    validateIdentifyItemToolOutput,
    "Invalid item identification structure from LLM.",
    "identifyItemInInventoryByName"
  );

  if (result.matchedItemId) {
    return inventory.find(item => item.id === result.matchedItemId) || null;
  }
  return null;
};
