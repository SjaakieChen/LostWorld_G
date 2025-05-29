// services/npc/npcGenerationService.ts
import { API_KEY, ai, callLLMWithToolAndValidateArgs, IMAGE_MODEL_NAME, Tool, Type, FunctionDeclaration } from '../geminiClient';
import { GameNPC, SuggestedNPCFromLLM, FullLocationData, CharacterData, GameItem, SuggestedItemFromLLM, ItemRarity, Skill, NPCRarity, PotentialDiscovery, VisualStyleType } from '../types';
import { PREDEFINED_SKILLS_CONFIG } from '../config/gameConstants';
import { generateAndFetchItemIcon } from '../item/itemGenerationService';
import { SKILL_LEVEL_INTERPRETATION_GUIDE, formatSkillsForLLM, formatEquippedItemsForLLM } from '../llmPromptUtils';

const getStyleForNpcPortraitPrompt = (visualStyle: VisualStyleType): string => {
  switch (visualStyle) {
    case 'Pixel Art': return "Pixel Art portrait/sprite";
    case 'Anime': return "Anime style portrait/sprite";
    case 'Ink Painting': return "black and white traditional Chinese ink painting style portrait/sprite";
    case 'Oil Painting': return "distinctive impasto oil painting style portrait/sprite";
    case 'Water Painting': return "luminous watercolor painting style portrait/sprite";
    case 'Low Poly': return "stylized low-poly 3D render style portrait/sprite";
    default: return `${visualStyle} portrait/sprite`; // Fallback
  }
};

export const generateAndFetchNpcIcon = async (
    visualPromptHint: string,
    npcName: string,
    locationVisualPromptHint: string,
    visualStyle: VisualStyleType
): Promise<string> => {
    let iconUrl = `https://via.placeholder.com/128x128/777/fff?text=${encodeURIComponent(npcName.substring(0,3))}`;
    if (!API_KEY) { console.warn(`API key not configured. Using placeholder icon for ${npcName}.`); return iconUrl; }
    
    const npcStyleDescriptor = getStyleForNpcPortraitPrompt(visualStyle);
    let npcImagePrompt: string;

    try {
        let backgroundDescription = `a background thematically consistent with: "${locationVisualPromptHint}" and rendered in a ${visualStyle} style`;
        
        if (visualStyle === 'Ink Painting') {
            backgroundDescription = `a simple black and white Chinese ink painting style background, like textured paper, subtle ink wash, or minimalist traditional elements consistent with the location: "${locationVisualPromptHint}"`;
        } else if (visualStyle === 'Oil Painting') {
            backgroundDescription = `a simple, subtly textured background that complements an oil painting portrait, perhaps suggesting an environment consistent with: "${locationVisualPromptHint}" without distracting from the NPC. Ensure the oily texture of the paint is apparent in the NPC's rendering.`;
        } else if (visualStyle === 'Water Painting') {
            backgroundDescription = `a light, airy background with soft watercolor washes, or a suggestion of textured paper, consistent with the location: "${locationVisualPromptHint}" and enhancing the watercolor portrait. The watery, transparent nature of the medium should be evident in the NPC's rendering.`;
        } else if (visualStyle === 'Low Poly') {
             backgroundDescription = `a clean, minimalist background, possibly with simple geometric shapes or a flat color, consistent with the low-poly aesthetic and the location: "${locationVisualPromptHint}"`;
        } else if (locationVisualPromptHint.toLowerCase().includes(`a detailed ${visualStyle.toLowerCase()} style illustration`)) { // General case for styles like Pixel Art, Anime
            backgroundDescription = `a background matching the style of: "${locationVisualPromptHint.replace(`A detailed ${visualStyle.toLowerCase()} style illustration for a fantasy adventure game.`, "").trim()}"`;
        }

        npcImagePrompt = `${npcStyleDescriptor} of an NPC described as: "${visualPromptHint}". NPC is focus. Background: ${backgroundDescription}. Well-lit, distinct. Clean ${npcStyleDescriptor.replace(' portrait/sprite', '')}.
IMPORTANT: Image MUST ONLY contain NPC sprite on background. NO text, watermarks, labels, icons, borders, chat/dialogue boxes, UI elements. Features/attire clear.`;

        const imageResponse = await ai.models.generateImages({ model: IMAGE_MODEL_NAME, prompt: npcImagePrompt, config: { numberOfImages: 1, outputMimeType: 'image/png' } });
        if (imageResponse.generatedImages?.[0]?.image?.imageBytes) iconUrl = `data:image/png;base64,${imageResponse.generatedImages[0].image.imageBytes}`;
        else console.warn(`No icon image data for NPC ${npcName}. Using placeholder. Prompt: ${npcImagePrompt}`);
    } catch (error: any) {
        console.error(`Error generating icon for NPC ${npcName} (Prompt: ${npcImagePrompt}):`, error.message || error);
    }
    return iconUrl;
};

const getStyleForItemIconPrompt = (visualStyle: VisualStyleType): string => { 
  switch (visualStyle) {
    case 'Pixel Art': return "Pixel Art icon";
    case 'Anime': return "Anime style icon";
    case 'Ink Painting': return "black and white traditional Chinese ink painting style icon";
    case 'Oil Painting': return "distinctive impasto oil painting style icon";
    case 'Water Painting': return "luminous watercolor painting style icon";
    case 'Low Poly': return "stylized low-poly 3D render style icon";
    default: return `${visualStyle} icon`;
  }
};

export const SUGGEST_NPC_INVENTORY_ITEMS_TOOL: Tool = {
  functionDeclarations: [{
    name: "suggest_npc_inventory_items", description: "Suggests 0-3 plausible starting inventory items for an NPC. Items lore-relevant, useful, or interesting. Rarity reflects value/importance. Considers memory context and game setting/universe for Epic/Legendary items. Visual prompt hints are for the game's current visual style (e.g., 'Pixel Art icon', 'Anime style icon', 'distinctive impasto oil painting style icon', 'luminous watercolor painting style icon'), item-focused.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        items: {
          type: Type.ARRAY,
          description: "Array of 0-3 items. If none, MUST be empty array: {\"items\": []}. Items fit NPC role, needs, lore, game setting/universe. Epic/Legendary distinct from memory.",
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING, description: "Item name." },
              description: { type: Type.STRING, description: "Brief, evocative description." },
              itemTypeGuess: { type: Type.STRING, description: "Category (e.g., 'quest_item', 'armor', 'tool', 'trinket')." },
              rarity: { type: Type.STRING, enum: ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'], description: `Rarity. Consider NPC status, role, item uniqueness, game setting/universe. Epic/Legendary distinct from memory.` },
              visualPromptHint: { type: Type.STRING, description: "Visual prompt for 32x32 [CURRENT_GAME_STYLE_ICON] (e.g., 'Pixel Art icon of a...', 'Anime style icon of...', 'distinctive impasto oil painting style icon of a thick, textured amulet', 'luminous watercolor painting style icon of a flowing, translucent silk scarf'). Item is SOLE FOCUS on simple/neutral or item-thematic background for that style. Ensure appealing, clear, interesting." },
            },
            required: ["name", "description", "itemTypeGuess", "rarity", "visualPromptHint"],
          },
        },
      },
      required: ["items"],
    },
  } as FunctionDeclaration],
};
type SuggestedNpcInventoryItemsFromTool = { items: SuggestedItemFromLLM[] };
const validateNpcInventoryItemsStructure = (data: any): data is SuggestedNpcInventoryItemsFromTool => {
    const rarities: ItemRarity[] = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];
    return data && Array.isArray(data.items) && data.items.every((item: any) =>
        item && typeof item.name === 'string' && item.name.trim() !== '' &&
        typeof item.description === 'string' && item.description.trim() !== '' &&
        typeof item.itemTypeGuess === 'string' && item.itemTypeGuess.trim() !== '' &&
        typeof item.rarity === 'string' && rarities.includes(item.rarity as ItemRarity) &&
        typeof item.visualPromptHint === 'string' && item.visualPromptHint.trim() !== ''
    );
};

export const generateNPCInventoryItems = async (npc: SuggestedNPCFromLLM, characterData?: CharacterData, memoryContextString: string = ""): Promise<GameItem[]> => {
    if (!API_KEY || !npc.initialInventoryInstructions || npc.initialInventoryInstructions.toLowerCase().includes("nothing of note")) return [];
    const visualStyle = characterData?.visualStyle || 'Pixel Art';
    const itemStyleIconString = getStyleForItemIconPrompt(visualStyle);

    let settingSpecificInstruction = "";
    if (characterData?.gameSettingType === "Historical" && characterData.initialHistoricalContext) {
        settingSpecificInstruction = `Game Setting: HISTORICAL - ${characterData.initialHistoricalContext}. All suggested inventory items MUST be historically plausible and authentic for the NPC's role and rarity. Epic/Legendary items should be exceptionally fitting. Avoid anachronisms. Visual prompt hints for items must be suitable for a ${itemStyleIconString}, item-focused.`;
    } else if (characterData?.gameSettingType === "Fictional") {
        if (characterData.fictionalUniverseContext) {
            settingSpecificInstruction = `Game Setting: FICTIONAL within universe: "${characterData.fictionalUniverseContext}". Items MUST be consistent with this universe's lore and the NPC's role. Visual prompt hints for items must be suitable for a ${itemStyleIconString}, item-focused.`;
        } else {
            settingSpecificInstruction = `Game Setting: General FICTIONAL. Items should fit NPC's character and lore. Visual prompt hints for items must be suitable for a ${itemStyleIconString}, item-focused.`;
        }
    }

    const prompt = `You are an AI game assistant. Your task is to suggest inventory items for an NPC.
Context:
- NPC Details: Name: "${npc.name}", Rarity: ${npc.rarity}, Description: "${npc.description}", Appearance: "${npc.appearanceDetails}".
- NPC Inventory Instructions: "${npc.initialInventoryInstructions}".
- Game Visual Style: ${visualStyle}.
- ${memoryContextString}
- ${settingSpecificInstruction}

Guidelines for Item Suggestion:
1.  Quantity: Suggest 0-3 items. If zero, provide an empty array for "items".
2.  Relevance: Items must fit NPC's character, role, stated inventory instructions, and game setting/universe. They should be interesting, lore-relevant, or useful.
3.  Rarity: Rarity reflects item value/importance, considering NPC status, role, game setting/universe. Epic/Legendary distinct from memory.
4.  Icons: Visual prompt hints for 32x32 ${itemStyleIconString}. The hint must include '${itemStyleIconString}'. Item must be SOLE FOCUS on simple/neutral or item-thematic background appropriate for ${visualStyle}. Ensure appealing, clear, interesting. Replace '[CURRENT_GAME_STYLE_ICON]' in tool schema description with '${itemStyleIconString}'.

CRITICAL: You MUST invoke tool 'suggest_npc_inventory_items'. Arguments MUST adhere to schema.
DO NOT output item details as text/JSON. Tool call is ONLY valid way.`;

    try {
        const suggested = await callLLMWithToolAndValidateArgs(prompt, SUGGEST_NPC_INVENTORY_ITEMS_TOOL, validateNpcInventoryItemsStructure,
            "Invalid NPC inventory structure (check item rarity, description, distinction from memory, icon prompt, visual appeal, setting/universe consistency)", `generateNPCInventoryItems for ${npc.name}`);
        if (!suggested.items?.length) return [];
        return suggested.items.map((itemDetails): GameItem => ({
            ...itemDetails,
            id: crypto.randomUUID(),
            iconUrl: '', 
        }));
    } catch (error) { console.error(`Failed to generate inventory for NPC ${npc.name}:`, error); return []; }
};

export const SUGGEST_NPCS_TOOL: Tool = {
  functionDeclarations: [{
    name: "suggest_npcs_for_location", description: "Suggests 0-2 plausible NPCs. Provides details including skill suggestions (levels 0-10 appropriate to concept/rarity/setting/universe). Epic/Legendary NPCs distinct from memory (unless fulfilling a lead); if in known universe, may be figures from it. Visual prompt hint for NPC portrait/sprite must be for the game's current visual style (e.g., 'Pixel Art portrait/sprite', 'Anime style portrait/sprite', 'distinctive impasto oil painting style portrait/sprite', 'luminous watercolor painting style portrait/sprite').",
    parameters: {
      type: Type.OBJECT,
      properties: {
        npcs: {
          type: Type.ARRAY,
          description: "Array of 0-2 NPCs. NPCs contextually appropriate. Prioritize fulfilling an NPC-related lead if plausible. Epic/Legendary NPCs distinct from memory unless they are established figures from the game's fictional universe context or fulfill a lead.",
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING, description: "NPC name or title. If fulfilling a lead, MUST match lead's NPC name." },
              description: { type: Type.STRING, description: "Brief description of NPC's role/demeanor (1-2 sentences). If fulfilling a lead, description aligns with lead's hint." },
              appearanceDetails: { type: Type.STRING, description: "Key visual details of appearance (1-2 sentences)." },
              dialogueGreeting: { type: Type.STRING, description: "Characteristic greeting." },
              rarity: { type: Type.STRING, enum: ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'], description: `Significance. If fulfilling a lead, rarity matches/consistent with lead's rarity hint. Epic/Legendary distinct from memory (unless known figure or fulfilling lead for one); if historical/fictional universe, could be known figures.` },
              visualPromptHint: { type: Type.STRING, description: "Prompt for 64x64 or 128x128 [CURRENT_GAME_STYLE_PORTRAIT_SPRITE] (e.g., 'Pixel Art portrait of...', 'Anime style sprite of...', 'distinctive impasto oil painting style portrait of an old general with a deeply lined face and thick, textured brushstrokes on his ornate uniform', 'luminous watercolor painting style portrait of a graceful elf with flowing, translucent hair and soft, blended features'). Reflect appearance, rarity, setting/universe. Must include '[CURRENT_GAME_STYLE_PORTRAIT_SPRITE]', 'simple background' or background consistent with role/location and style. Ensure appealing, clear, interesting." },
              initialInventoryInstructions: { type: Type.STRING, nullable: true, description: "Optional: Brief instructions for initial inventory (e.g., 'carries pouch of herbs'). Legendary/universe figures might possess iconic items."},
              skillSuggestions: {
                type: Type.ARRAY, nullable: true,
                description: `Optional array of skill suggestions. Assign levels (0-10) for PREDEFINED skills (${PREDEFINED_SKILLS_CONFIG.map(s=>s.name).join(', ')}) HIGHLY APPROPRIATE to NPC concept, rarity, role, game setting/universe. E.g., 'Legendary Warrior' gets Combat 9-10. 'Common Peasant' low skills (0-2). 'Nimble scout' might get Mobility. Untrained 0. Skill proficiency scale: 0=Untrained, 1-2=Novice, 3-4=Apprentice, 5-6=Adept, 7-8=Expert, 9=Virtuoso, 10=Master. If omitted, skills default low. If fulfilling a lead, skills should align with NPC concept.`,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    skillName: { type: Type.STRING },
                    level: { type: Type.NUMBER }
                  },
                  required: ["skillName", "level"]
                }
              }
            },
            required: ["name", "description", "appearanceDetails", "dialogueGreeting", "rarity", "visualPromptHint"],
          },
        },
      },
      required: ["npcs"],
    },
  } as FunctionDeclaration],
};
type SuggestedNPCsFromTool = { npcs: SuggestedNPCFromLLM[] };
const validateSuggestedNPCsStructure = (data: any): data is SuggestedNPCsFromTool => {
    const rarities: NPCRarity[] = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];
    return data && Array.isArray(data.npcs) && data.npcs.every((npc: any) =>
        npc && typeof npc.name === 'string' && npc.name.trim() !== '' &&
        typeof npc.description === 'string' && npc.description.trim() !== '' &&
        typeof npc.appearanceDetails === 'string' && npc.appearanceDetails.trim() !== '' &&
        typeof npc.dialogueGreeting === 'string' && npc.dialogueGreeting.trim() !== '' &&
        typeof npc.rarity === 'string' && rarities.includes(npc.rarity as NPCRarity) &&
        typeof npc.visualPromptHint === 'string' && npc.visualPromptHint.trim() !== '' &&
        (npc.initialInventoryInstructions === undefined || npc.initialInventoryInstructions === null || typeof npc.initialInventoryInstructions === 'string') &&
        (npc.skillSuggestions === undefined || npc.skillSuggestions === null || (Array.isArray(npc.skillSuggestions) && npc.skillSuggestions.every((skill: any) =>
            skill && typeof skill.skillName === 'string' && PREDEFINED_SKILLS_CONFIG.some(s => s.name === skill.skillName) &&
            typeof skill.level === 'number' && skill.level >= 0 && skill.level <= 10
        )))
    );
};

export const generateNPCsForLocation = async (
  location: FullLocationData,
  character: CharacterData,
  potentialDiscoveries: PotentialDiscovery[],
  memoryContextString: string = ""
): Promise<GameNPC[]> => {
  if (!API_KEY) { console.warn("Cannot generate NPCs: API key not configured."); return []; }
  const playerSkillsString = formatSkillsForLLM(character.skills);
  const playerEquippedStr = formatEquippedItemsForLLM(character.limbs);
  const perceptionLevel = character.skills.find(s => s.name === 'Perception')?.level || 0;
  const playerContext = `Player: ${character.characterConcept}. Health: ${character.overallHealth}HP, Energy: ${character.currentEnergy}/${character.maxEnergy}EN. Skills: [${playerSkillsString}]. Equipped: ${playerEquippedStr}. Perception Level: ${perceptionLevel}.`;
  const visualStyle = character.visualStyle;
  const npcStylePortraitSpriteString = getStyleForNpcPortraitPrompt(visualStyle);

  let settingSpecificInstruction = "";
  let loreContextInstruction = "";
  if (character.gameSettingType === "Historical" && character.initialHistoricalContext) {
    settingSpecificInstruction = `NPCs (names, roles, descriptions, appearances, dialogue, rarity, skills, inventory instructions) MUST be historically plausible and authentic for this period (${character.initialHistoricalContext}) and culture, rendered in ${npcStylePortraitSpriteString}. Epic/Legendary NPCs SHOULD be actual known historical figures if context/memory allow (unless fulfilling a lead for one), distinct from existing memorable entities. Their details (skills, status e.g. alive/dead) should reflect known persona.`;
    loreContextInstruction = `Historical Context: ${character.initialHistoricalContext}. Game Visual Style: ${visualStyle}.`;
  } else if (character.gameSettingType === "Fictional") {
    if (character.fictionalUniverseContext) {
        settingSpecificInstruction = `NPCs (names, roles, appearance, skills, inventory, rarity, dialogue) MUST be consistent with the universe of "${character.fictionalUniverseContext}" (its lore, character archetypes, and known character statuses e.g. alive/dead, origins, typical whereabouts), rendered in ${npcStylePortraitSpriteString}. Epic/Legendary NPCs could be established figures from this universe, distinct from memory (unless fulfilling a lead for one).`;
        loreContextInstruction = `Fictional Universe: ${character.fictionalUniverseContext}. Game Visual Style: ${visualStyle}.`;
    } else {
        settingSpecificInstruction = `NPCs should fit character concept and location theme, rendered in ${npcStylePortraitSpriteString}. Epic/Legendary NPCs should be unique, lore-rich figures, distinct from memory (unless fulfilling a lead for one). You may subtly draw inspiration from common fantasy/sci-fi tropes if they naturally fit the NPC and enhance experience. Skills reflect their concept/rarity.`;
        loreContextInstruction = `Game Visual Style: ${visualStyle}.`;
    }
  }

  let leadsContext = "No specific NPC-related leads are currently active.";
  const npcLeads = potentialDiscoveries.filter(pd => pd.type === 'npc' && pd.status === 'mentioned');
  if (npcLeads.length > 0) {
    leadsContext = `Active NPC-Related Leads (Rumors):\n${npcLeads.map(lead => `- Rumored NPC: "${lead.name}" (Type: ${lead.type}, Hint: ${lead.descriptionHint}, Rarity Hint: ${lead.rarityHint || 'Unknown'}). Source: ${lead.sourceTextSnippet.substring(0, 50)}...`).join('\n')}`;
  }

  const prompt = `You are an AI game assistant. Your task is to suggest NPCs for a location.
Context:
- Player Character: ${playerContext}
- Current Location: "${location.name}" (Description: "${location.description}", Tags: [${location.environmentTags.join(', ')}], Rarity: ${location.rarity}).
- ${loreContextInstruction}
- ${leadsContext}
- ${memoryContextString}
- ${SKILL_LEVEL_INTERPRETATION_GUIDE} (Applies to NPC skill assignment!)

PRIMARY DIRECTIVE: NPCs generated MUST be contextually appropriate for the current location AND strictly consistent with the game's established setting (Historical context or Fictional Universe lore, including known character statuses like being deceased, their origins, and typical whereabouts). Adherence to the established setting is PARAMOUNT. ${settingSpecificInstruction} NPCs should also react plausibly to player's appearance (equipped items). Visual prompt hints for NPC portraits/sprites must be suitable for the game's visual style: ${visualStyle}.

Guidelines for NPC Suggestion:
1.  Quantity: Suggest 0-2 plausible NPCs.
2.  Appropriateness & Consistency: NPCs fit location theme, rarity, tags, game setting/universe. This is the PRIMARY consideration.
3.  Lead Fulfillment (Secondary Consideration): If an active NPC-related lead from "${leadsContext}" can be FULFILLED *WITHOUT violating the PRIMARY DIRECTIVE* (contextual appropriateness, setting consistency, lore accuracy e.g. character status), then you MAY suggest an NPC that fulfills it.
    - If fulfilling a lead, the generated NPC's name, description, rarity, and concept MUST align closely with the lead's details and still be plausible in the current context.
    - However, if fulfilling a lead would result in an NPC that is out of place, anachronistic, lore-breaking (e.g., a character known to be deceased in the Fictional Universe Context appearing alive without narrative justification), or thematically inconsistent, DO NOT fulfill that lead. Instead, generate other contextually appropriate NPCs (or no NPCs if none fit). Leads are rumors, not guarantees.
4.  Skills (Suggestions): For each NPC, assign levels (0-10) for relevant skills from ${PREDEFINED_SKILLS_CONFIG.map(s=>s.name).join(', ')}. Skill levels MUST be appropriate for NPC concept, rarity, role, game setting/universe. If fulfilling a lead, skills must fit. (e.g. a nimble character might have some Mobility skill).
5.  Perception Influence: Higher player Perception (Level ${perceptionLevel}) might increase chance of noticing rarer/hidden NPCs, or those related to leads.
6.  Epic/Legendary NPCs: Rare, contextually fitting. Distinct from memory unless established figures from game's fictional universe context OR fulfilling a lead for such an NPC. Skills reflect status.
7.  Icon Hints: Visual prompt for 64x64 or 128x128 ${npcStylePortraitSpriteString}. The hint must include '${npcStylePortraitSpriteString}' and mention a 'simple background' or one consistent with their role/location and the ${visualStyle} style. Ensure appealing, clear, interesting image. Replace '[CURRENT_GAME_STYLE_PORTRAIT_SPRITE]' in tool schema description with '${npcStylePortraitSpriteString}'.
8.  Inventory: Optionally provide brief instructions for NPC initial inventory.

CRITICAL: You MUST invoke tool 'suggest_npcs_for_location'. Arguments MUST adhere strictly to schema.
DO NOT output NPC details as text/JSON. Tool call is ONLY valid way.`;

  const suggested = await callLLMWithToolAndValidateArgs(prompt, SUGGEST_NPCS_TOOL, validateSuggestedNPCsStructure,
    "Invalid NPC suggestion structure (check rarity, skills, distinction from memory, lead fulfillment plausibility/lore consistency, visual prompt format, visual appeal, setting/universe consistency, contextual appropriateness)", "generateNPCsForLocation");
  if (!suggested.npcs?.length) return [];

  return Promise.all(suggested.npcs.map(async (npcDetails): Promise<GameNPC> => {
      const iconUrl = await generateAndFetchNpcIcon(npcDetails.visualPromptHint, npcDetails.name, location.visualPromptHint, visualStyle);
      const inventoryItems = await generateNPCInventoryItems(npcDetails, character, memoryContextString);

      const npcSkills: Skill[] = PREDEFINED_SKILLS_CONFIG.map(skillConfig => {
        const suggestedSkill = npcDetails.skillSuggestions?.find(ss => ss.skillName === skillConfig.name);
        let level = 0;
        if (suggestedSkill) {
            level = suggestedSkill.level;
        } else {
            if (npcDetails.rarity === 'Legendary') level = Math.floor(Math.random() * 3) + 3;
            else if (npcDetails.rarity === 'Epic') level = Math.floor(Math.random() * 3) + 2;
            else if (npcDetails.rarity === 'Rare') level = Math.floor(Math.random() * 2) + 1;
            else level = Math.floor(Math.random() * 2);
            if (Math.random() < 0.6 && !(skillConfig.name === "Combat" && npcDetails.rarity === "Legendary")) level = 0;
            if (skillConfig.name === "Combat" && npcDetails.rarity === "Legendary" && (!suggestedSkill || suggestedSkill.level < 7)) level = Math.floor(Math.random() * 2) + 7;
        }

        return {
            id: crypto.randomUUID(),
            name: skillConfig.name,
            description: skillConfig.description,
            level,
            experience: 0,
            experienceToNextLevel: (level * 100 + 100)
        };
      });

      return {
          ...npcDetails,
          id: crypto.randomUUID(),
          iconUrl,
          inventory: inventoryItems,
          skills: npcSkills,
          currentHealth: 100,
          maxHealth: 100,
          isDefeated: false,
          disposition: 'Neutral'
        };
  }));
};