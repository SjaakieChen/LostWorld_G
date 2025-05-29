// services/loreService.ts
import { API_KEY, ai, callLLMWithToolAndValidateArgs, TEXT_MODEL_NAME, Tool, Type, FunctionDeclaration, Schema } from './geminiClient';
import { CharacterData, PotentialDiscovery, PotentialDiscoveryType, ItemRarity, NPCRarity, LocationRarity, MemorableEntityRarity, GameItem, GameNPC, FullLocationData, MemorableEntity, PotentialDiscoverySourceType, VisualStyleType } from './gameTypes';
import { formatSkillsForLLM, SKILL_LEVEL_INTERPRETATION_GUIDE } from './llmPromptUtils';

interface IdentifiedLoreEntity {
  name: string;
  type: PotentialDiscoveryType;
  descriptionHint: string; // Short phrase describing it, as if a rumor
  rarityHint?: MemorableEntityRarity; // Optional
  originalPhrase: string; // The exact phrase from the input text
}

interface LoreIdentificationResultFromTool {
  entities: IdentifiedLoreEntity[];
  textWithMarkup: string; // Original text with [lore] tags
}

const validateLoreIdentificationStructure = (data: any): data is LoreIdentificationResultFromTool => {
  if (!data || typeof data.textWithMarkup !== 'string' || !Array.isArray(data.entities)) {
    return false;
  }
  const validTypes: PotentialDiscoveryType[] = ['item', 'npc', 'location'];
  const validRarities: MemorableEntityRarity[] = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Lore', 'Character_Self'];

  return data.entities.every((entity: any) =>
    entity &&
    typeof entity.name === 'string' && entity.name.trim() !== '' &&
    typeof entity.type === 'string' && validTypes.includes(entity.type as PotentialDiscoveryType) &&
    typeof entity.descriptionHint === 'string' && entity.descriptionHint.trim() !== '' &&
    (entity.rarityHint === undefined || (typeof entity.rarityHint === 'string' && validRarities.includes(entity.rarityHint as MemorableEntityRarity))) &&
    typeof entity.originalPhrase === 'string' && entity.originalPhrase.trim() !== ''
  );
};

const IDENTIFY_LORE_ENTITIES_TOOL: Tool = {
  functionDeclarations: [{
    name: "identify_and_markup_lore_entities",
    description: "Identifies potential new lore entities (items, NPCs, locations) mentioned in text. Returns details and the original text with these entities marked up. Focuses on significant, named entities that sound like discoverable game elements, not generic terms. Avoids re-identifying entities already known from memory context if their name is an exact match.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        entities: {
          type: Type.ARRAY,
          description: "Array of identified lore entities. Empty if none found.",
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING, description: "The proper name of the identified entity." },
              type: { type: Type.STRING, enum: ['item', 'npc', 'location'], description: "Type of entity." },
              descriptionHint: { type: Type.STRING, description: "A very brief (3-7 word) hint or rumor about the entity, derived from the text. E.g., 'a powerful artifact', 'a hermit in the mountains', 'a lost city of gold'." },
              rarityHint: { type: Type.STRING, enum: ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Lore', 'Character_Self'], nullable: true, description: "Implied rarity, if any. Default to 'Lore' or null if unclear." },
              originalPhrase: { type: Type.STRING, description: "The exact phrase/text from the input that refers to this entity." }
            },
            required: ["name", "type", "descriptionHint", "originalPhrase"]
          }
        },
        textWithMarkup: {
          type: Type.STRING,
          description: "The original input text, with identified lore entities enclosed in [lore entity_type=\"TYPE\" entity_name=\"NAME\"]ENTITY_PHRASE[/lore] tags. Example: 'He mentioned the [lore entity_type=\"item\" entity_name=\"Sunstone Compass\"]Sunstone Compass[/lore] found in the [lore entity_type=\"location\" entity_name=\"Whispering Caves\"]Whispering Caves[/lore].'"
        }
      },
      required: ["entities", "textWithMarkup"]
    }
  } as FunctionDeclaration]
};

export interface ProcessedTextWithDiscoveries {
  rawText: string;
  processedText: string;
  potentialDiscoveries: Omit<PotentialDiscovery, 'id' | 'status' | 'firstMentionedTimestamp' | 'firstMentionedLocationKey' | 'fulfilledById'>[];
}

export const identifyPotentialDiscoveriesInText = async (
  textToProcess: string,
  sourceType: PotentialDiscoverySourceType,
  sourceEntityId: string, // ID of the NPC speaking or the item being read
  character: CharacterData,
  locationKey: string, // e.g. "0,0"
  memoryContext: string // Output of getMemoryContextString()
): Promise<ProcessedTextWithDiscoveries> => {
  if (!API_KEY) {
    console.warn("API key not configured. Cannot identify lore entities.");
    return { rawText: textToProcess, processedText: textToProcess, potentialDiscoveries: [] };
  }

  const charCtx = `Player Character: ${character.characterName} (${character.characterConcept}). Skills: ${formatSkillsForLLM(character.skills)}. ${SKILL_LEVEL_INTERPRETATION_GUIDE}`;
  let sourceContext = "";
  if (sourceType === 'dialogue') {
    sourceContext = `This text is dialogue from an NPC (ID: ${sourceEntityId}).`;
  } else if (sourceType === 'item_text') {
    sourceContext = `This text is from an item (ID: ${sourceEntityId}) being read/examined.`;
  } else if (sourceType === 'contextual_examination') {
    sourceContext = `This text is from a player examining a contextual detail (Source ID: ${sourceEntityId}) in their surroundings.`;
  } else if (sourceType === 'event_narration') {
    sourceContext = `This text is narrative description or dialogue related to an ongoing event (Event ID/Title: ${sourceEntityId}).`;
  }


  const prompt = `You are an AI assistant for a text-based adventure game. Your task is to identify mentions of potentially new, significant, and discoverable game entities (items, NPCs, locations) within the provided text. These entities should sound like unique named things the player could later find or encounter.
Do not identify generic concepts (e.g., "a sword", "a cave", "a merchant") unless they are given a specific, proper name and context suggests uniqueness (e.g., "the Sword of Valoria", "the Crystal Caves of Eldoria", "Merchant Vorlag").
${charCtx}
${sourceContext}
Current Game Memory Context (Entities already known or rumored. Avoid re-identifying exact name matches from this list unless the new mention adds significant new detail):
${memoryContext}

Text to Analyze:
---
${textToProcess}
---

Instructions:
1.  Carefully read the "Text to Analyze".
2.  Identify specific names of items, NPCs, or locations that are presented as potentially discoverable, legendary, hidden, or important for a quest/lore.
3.  For each identified entity, determine its type ('item', 'npc', 'location'), a very brief 'descriptionHint' (3-7 words, like a rumor), and its 'originalPhrase' (the exact text snippet from the input). Optionally, suggest a 'rarityHint'.
4.  Return the original text with identified entity phrases wrapped in special tags: \`[lore entity_type="TYPE" entity_name="PROPER_NAME_OF_ENTITY"]ORIGINAL_PHRASE_HERE[/lore]\`.
    - Ensure "PROPER_NAME_OF_ENTITY" is the canonical name you've identified for the entity.
    - Ensure "ORIGINAL_PHRASE_HERE" is the exact text snippet from the input.
5.  If no such significant entities are mentioned, the 'entities' array should be empty, and 'textWithMarkup' should be the original, unchanged text.

CRITICAL: You MUST use the 'identify_and_markup_lore_entities' tool. Adhere strictly to its schema.
Focus on QUALITY over quantity. Only identify truly distinct and potentially discoverable named entities. Player's Perception skill (see charCtx) can slightly influence the likelihood of noticing subtle hints.
`;

  try {
    const result = await callLLMWithToolAndValidateArgs(
      prompt,
      IDENTIFY_LORE_ENTITIES_TOOL,
      validateLoreIdentificationStructure,
      "Invalid lore identification structure (check entities array, textWithMarkup, and individual entity fields).",
      `identifyPotentialDiscoveriesInText (Source: ${sourceType} ${sourceEntityId})`
    );

    const discoveries: Omit<PotentialDiscovery, 'id' | 'status' | 'firstMentionedTimestamp' | 'firstMentionedLocationKey' | 'fulfilledById'>[] = result.entities.map(entity => ({
      name: entity.name,
      type: entity.type,
      descriptionHint: entity.descriptionHint,
      rarityHint: entity.rarityHint,
      sourceTextSnippet: entity.originalPhrase,
      sourceType: sourceType,
      sourceEntityId: sourceEntityId,
    }));

    return {
      rawText: textToProcess,
      processedText: result.textWithMarkup,
      potentialDiscoveries: discoveries,
    };

  } catch (error) {
    console.error("Error identifying potential discoveries:", error);
    return { rawText: textToProcess, processedText: textToProcess, potentialDiscoveries: [] };
  }
};


interface LinkEntityToLeadToolOutput {
  fulfilledLeadId: string | null;
}

const validateLinkEntityToLeadStructure = (data: any): data is LinkEntityToLeadToolOutput => {
  return data && (typeof data.fulfilledLeadId === 'string' || data.fulfilledLeadId === null);
};

const LINK_ENTITY_TO_LEAD_TOOL: Tool = {
  functionDeclarations: [{
    name: "link_entity_to_lead",
    description: "Compares a newly generated game entity (item, NPC, or location) against a list of unconfirmed leads of the same type. Determines if the new entity fulfills any of the leads based on name similarity, description, and contextual relevance. Returns the ID of the fulfilled lead or null.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        fulfilledLeadId: {
          type: Type.STRING,
          nullable: true,
          description: "The ID of the lead that is best fulfilled by the generated entity. Null if no lead is fulfilled or no leads provided."
        }
      },
      required: ["fulfilledLeadId"]
    }
  } as FunctionDeclaration]
};

export const linkGeneratedEntityToLead = async (
  generatedEntity: GameItem | GameNPC | FullLocationData,
  entityType: PotentialDiscoveryType,
  unconfirmedLeads: PotentialDiscovery[],
  character: CharacterData,
  memoryContext: string
): Promise<string | null> => {
  if (!API_KEY) {
    console.warn("API key not configured. Cannot link entity to lead.");
    return null;
  }
  if (unconfirmedLeads.length === 0) {
    return null;
  }

  const generatedEntityDescription = `
    Name: ${generatedEntity.name}
    Type: ${entityType}
    Rarity: ${(generatedEntity as any).rarity || 'N/A'}
    Description: ${(generatedEntity as any).description || (generatedEntity as FullLocationData).visualPromptHint}
    ${entityType === 'item' ? `Item Type Guess: ${(generatedEntity as GameItem).itemTypeGuess}` : ''}
    ${entityType === 'npc' ? `Appearance: ${(generatedEntity as GameNPC).appearanceDetails}` : ''}
    ${entityType === 'location' ? `Environment Tags: ${(generatedEntity as FullLocationData).environmentTags?.join(', ')}` : ''}
  `;

  const leadsString = unconfirmedLeads.map(lead =>
    `- Lead ID: ${lead.id}, Lead Name: "${lead.name}", Lead Description Hint: "${lead.descriptionHint}", Lead Rarity Hint: ${lead.rarityHint || 'N/A'}, Source: ${lead.sourceType} snippet "${lead.sourceTextSnippet.substring(0, 70)}..."`
  ).join('\n');
  const gameSettingContext = `Game Setting: ${character.gameSettingType}. ${
    character.gameSettingType === 'Historical' && character.initialHistoricalContext ? `Context: ${character.initialHistoricalContext}.` :
    character.gameSettingType === 'Fictional' && character.fictionalUniverseContext ? `Universe: ${character.fictionalUniverseContext}.` :
    ''
  }`;

  const prompt = `You are an AI assistant determining if a newly generated game entity fulfills an existing unconfirmed lead.
${gameSettingContext}
Player Character: ${character.characterName} (${character.characterConcept}).
Current Game Memory Context:
${memoryContext}
A new entity of type '${entityType}' has just been generated:
${generatedEntityDescription}
Here are the currently unconfirmed leads of type '${entityType}':
${leadsString.length > 0 ? leadsString : "No unconfirmed leads of this type exist."}
Task: Compare the "Generated ${entityType}" with each "Unconfirmed Lead".
Factors for matching:
1.  Semantic Similarity of Names (e.g., "Ancient Sword" vs. "The Sword of Ancients").
2.  Alignment of Descriptions/Hints.
3.  Contextual Plausibility given memory and setting.
4.  Rarity Consistency.
Goal: Identify the ONE lead MOST CLEARLY and PLAUSIBLY fulfilled. If multiple match, pick BEST. If no strong match, 'fulfilledLeadId' MUST be null. Do not confirm weak matches.
CRITICAL: You MUST invoke tool 'link_entity_to_lead' with 'fulfilledLeadId'.`;

  try {
    const result = await callLLMWithToolAndValidateArgs(
      prompt, LINK_ENTITY_TO_LEAD_TOOL, validateLinkEntityToLeadStructure,
      "Invalid lead linking structure. Must return fulfilledLeadId (string or null).",
      `linkGeneratedEntityToLead (Entity: ${generatedEntity.name}, Type: ${entityType})`
    );
    return result.fulfilledLeadId;
  } catch (error) {
    console.error(`Error linking entity ${generatedEntity.name} to lead:`, error);
    return null;
  }
};

export const checkIfSimilarLeadExists = async ( // Now async
  newLeadData: Omit<PotentialDiscovery, 'id' | 'status' | 'firstMentionedTimestamp' | 'firstMentionedLocationKey' | 'fulfilledById'>,
  existingLeads: ReadonlyArray<PotentialDiscovery>,
  memoryContext?: string // Optional, can be used by LLM if this becomes LLM-based
): Promise<boolean> => {
  if (!API_KEY) {
    console.warn("API key not configured for checkIfSimilarLeadExists. Falling back to basic string check.");
    // Basic non-LLM check as a fallback
    const newNameLower = newLeadData.name.toLowerCase().trim();
    return existingLeads.some(existingLead =>
      existingLead.type === newLeadData.type &&
      existingLead.name.toLowerCase().trim() === newNameLower
    );
  }

  const newLeadString = `New Lead: Name: "${newLeadData.name}", Type: ${newLeadData.type}, Hint: "${newLeadData.descriptionHint}", Rarity Hint: ${newLeadData.rarityHint || 'N/A'}.`;
  const existingLeadsString = existingLeads.length > 0
    ? "Existing Leads:\n" + existingLeads.map(lead => `- Name: "${lead.name}", Type: ${lead.type}, Hint: "${lead.descriptionHint}", Rarity Hint: ${lead.rarityHint || 'N/A'}, Status: ${lead.status}.`).join('\n')
    : "No existing leads of this type.";

  const prompt = `You are an AI assistant determining if a new potential discovery (lead) is semantically similar enough to an existing lead to be considered a duplicate.
${memoryContext || "No broader memory context provided."}
${newLeadString}
${existingLeadsString}

Task:
Compare the "New Lead" with each "Existing Lead". Consider:
1.  Semantic Name Similarity: Are names very close (e.g., "Amulet of Kings" vs. "The King's Amulet")?
2.  Description Hint Overlap: Do hints describe essentially the same thing?
3.  Type Consistency: Must be the same type.
Goal: Determine if the "New Lead" is essentially a REWORDING or SLIGHT VARIATION of an "Existing Lead" (regardless of status: 'mentioned' or 'discovered').
If a very strong semantic similarity exists with ANY existing lead, return true (similar lead exists).
If the new lead is distinct enough, return false (no similar lead exists).
Prioritize preventing redundant leads for the same underlying concept.

CRITICAL: You MUST invoke the tool 'check_if_similar_lead_exists_tool_response'. This is the only way to return your decision.
`;

  const CHECK_SIMILAR_LEAD_TOOL: Tool = {
    functionDeclarations: [{
      name: "check_if_similar_lead_exists_tool_response",
      description: "Responds whether a semantically similar lead already exists.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          similarLeadExists: { type: Type.BOOLEAN, description: "True if a similar lead already exists, false otherwise." }
        },
        required: ["similarLeadExists"]
      }
    }]
  };
  const validateSimilarLeadCheckStructure = (data: any): data is { similarLeadExists: boolean } => {
    return data && typeof data.similarLeadExists === 'boolean';
  };

  try {
    const result = await callLLMWithToolAndValidateArgs(
      prompt,
      CHECK_SIMILAR_LEAD_TOOL,
      validateSimilarLeadCheckStructure,
      "Invalid similar lead check structure. Must return similarLeadExists (boolean).",
      `checkIfSimilarLeadExists (New Lead: ${newLeadData.name})`
    );
    return result.similarLeadExists;
  } catch (error) {
    console.error(`Error checking for similar lead "${newLeadData.name}":`, error);
    // Fallback to basic check on error
    const newNameLower = newLeadData.name.toLowerCase().trim();
    return existingLeads.some(existingLead =>
      existingLead.type === newLeadData.type &&
      existingLead.name.toLowerCase().trim() === newNameLower
    );
  }
};

// --- New Service for Linking Lead to Existing Entity ---
interface LinkLeadToExistingEntityToolOutput {
  matchedExistingEntityId: string | null;
}

const validateLinkLeadToExistingEntityStructure = (data: any): data is LinkLeadToExistingEntityToolOutput => {
  return data && (typeof data.matchedExistingEntityId === 'string' || data.matchedExistingEntityId === null);
};

const LINK_LEAD_TO_EXISTING_ENTITY_TOOL: Tool = {
  functionDeclarations: [{
    name: "link_lead_to_existing_entity",
    description: "Compares a potential new lead against a list of already known memorable entities. Determines if the lead refers to an entity the player already knows. Returns the ID of the matched memorable entity or null.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        matchedExistingEntityId: {
          type: Type.STRING,
          nullable: true,
          description: "The ID of the memorable entity that this lead likely refers to. Null if no strong match with an existing known entity."
        }
      },
      required: ["matchedExistingEntityId"]
    }
  } as FunctionDeclaration]
};

export const linkPotentialDiscoveryToExistingEntity = async (
  potentialLeadData: Omit<PotentialDiscovery, 'id' | 'status' | 'firstMentionedTimestamp' | 'firstMentionedLocationKey' | 'fulfilledById'>,
  existingEntities: ReadonlyMap<string, MemorableEntity>,
  character: CharacterData,
  memoryContext: string // Full memory context string
): Promise<string | null> => {
  if (!API_KEY) {
    console.warn("API key not configured. Cannot link lead to existing entity.");
    return null;
  }

  const relevantExistingEntities = Array.from(existingEntities.values()).filter(
    entity => entity.type === potentialLeadData.type
  );

  if (relevantExistingEntities.length === 0) {
    return null;
  }

  const leadString = `Potential New Lead: Name: "${potentialLeadData.name}", Type: ${potentialLeadData.type}, Hint: "${potentialLeadData.descriptionHint}", Rarity Hint: ${potentialLeadData.rarityHint || 'N/A'}.`;

  const existingEntitiesString = "Known Memorable Entities (of the same type):\n" + relevantExistingEntities.map(entity =>
    `- Entity ID: ${entity.id}, Name: "${entity.name}", Type: ${entity.type}, Rarity: ${entity.rarity}, Hint: "${entity.descriptionHint}"`
  ).join('\n');

  const gameSettingContext = `Game Setting: ${character.gameSettingType}. ${
    character.gameSettingType === 'Historical' && character.initialHistoricalContext ? `Context: ${character.initialHistoricalContext}.` :
    character.gameSettingType === 'Fictional' && character.fictionalUniverseContext ? `Universe: ${character.fictionalUniverseContext}.` :
    ''
  }`;

  const prompt = `You are an AI assistant determining if a new potential discovery (a lead/rumor) actually refers to an entity ALREADY KNOWN to the player.
${gameSettingContext}
Player Character: ${character.characterName} (${character.characterConcept}).
Full Game Memory Context (includes all known entities, plot points, and other leads):
${memoryContext}

${leadString}

${existingEntitiesString.length > 0 ? existingEntitiesString : "No existing memorable entities of this type are known."}

Task:
Carefully compare the "Potential New Lead" with each "Known Memorable Entity" of the same type.
Consider these factors for matching:
1.  Strong Semantic Similarity of Names: Does the lead's name very closely match an existing entity's name (e.g., "The Sunken Library" vs. "Sunken Library of Eldoria")?
2.  Strong Alignment of Descriptions/Hints: Does the lead's hint strongly align with the known entity's description?
3.  Contextual Plausibility: Given the full game memory and setting, is it highly plausible that this lead refers to something already recorded as known?
4.  Rarity Consistency: Is the lead's rarity hint consistent with the known entity's rarity?

Your Goal:
Identify if the "Potential New Lead" is essentially a rediscovery or re-mentioning of a "Known Memorable Entity".
- If a very strong and clear match is found, provide the 'matchedExistingEntityId' of that known entity.
- If multiple known entities seem to match, pick only the BEST and MOST DIRECT fit.
- If no known entity is a strong or clear match, 'matchedExistingEntityId' MUST be null. The lead should be treated as new information.
- Do not link if the match is weak or coincidental. The link should be quite evident.

CRITICAL: You MUST invoke the tool 'link_lead_to_existing_entity' and provide the 'matchedExistingEntityId'. This is the only way to return your decision.
`;

  try {
    const result = await callLLMWithToolAndValidateArgs(
      prompt,
      LINK_LEAD_TO_EXISTING_ENTITY_TOOL,
      validateLinkLeadToExistingEntityStructure,
      "Invalid link lead to existing entity structure. Must return matchedExistingEntityId (string or null).",
      `linkPotentialDiscoveryToExistingEntity (Lead: ${potentialLeadData.name})`
    );
    return result.matchedExistingEntityId;
  } catch (error) {
    console.error(`Error linking lead ${potentialLeadData.name} to existing entity:`, error);
    return null;
  }
};

// --- Service for Generating Initial Game Leads ---
interface InitialLeadFromTool {
  name: string;
  type: PotentialDiscoveryType;
  descriptionHint: string;
  rarityHint?: MemorableEntityRarity;
  sourceTextSnippet: string; // e.g., "An old map fragment hints at..."
}

interface InitialLeadsResultFromTool {
  leads: InitialLeadFromTool[];
}

const validateInitialLeadsStructure = (data: any): data is InitialLeadsResultFromTool => {
  if (!data || !Array.isArray(data.leads)) {
    return false;
  }
  const validTypes: PotentialDiscoveryType[] = ['item', 'npc', 'location'];
  const validRarities: MemorableEntityRarity[] = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Lore', 'Character_Self'];

  return data.leads.every((lead: any) =>
    lead &&
    typeof lead.name === 'string' && lead.name.trim() !== '' &&
    typeof lead.type === 'string' && validTypes.includes(lead.type as PotentialDiscoveryType) &&
    typeof lead.descriptionHint === 'string' && lead.descriptionHint.trim() !== '' &&
    (lead.rarityHint === undefined || (typeof lead.rarityHint === 'string' && validRarities.includes(lead.rarityHint as MemorableEntityRarity))) &&
    typeof lead.sourceTextSnippet === 'string' && lead.sourceTextSnippet.trim() !== ''
  );
};

const GENERATE_INITIAL_LEADS_TOOL: Tool = {
  functionDeclarations: [{
    name: "generate_initial_game_leads",
    description: "Generates 1-2 initial leads/rumors for the start of the game, based on the character, starting location, game setting, and visual style. These leads hint at potential items, NPCs, or locations for the player to investigate and should be thematically consistent.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        leads: {
          type: Type.ARRAY,
          description: "Array of 1-2 generated leads. Empty if no suitable leads found.",
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING, description: "The proper name of the hinted item, NPC, or location." },
              type: { type: Type.STRING, enum: ['item', 'npc', 'location'], description: "Type of entity hinted at." },
              descriptionHint: { type: Type.STRING, description: "A brief (5-15 word) hint or rumor about the discovery. E.g., 'a hidden grove guarded by ancient spirits', 'a legendary sword lost in the ruins', 'a mysterious hermit dwelling in the eastern caves'." },
              rarityHint: { type: Type.STRING, enum: ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Lore'], nullable: true, description: "Implied rarity of the hinted entity. Optional." },
              sourceTextSnippet: { type: Type.STRING, description: "A short, thematic in-world phrase indicating how this lead is known or intuited by the character (e.g., 'A faded inscription in your journal mentions...', 'Local legends whisper of...', 'A recurring dream hints at...'). Should be 5-15 words." }
            },
            required: ["name", "type", "descriptionHint", "sourceTextSnippet"]
          }
        }
      },
      required: ["leads"]
    }
  } as FunctionDeclaration]
};

export const generateInitialLeads = async (
  characterData: CharacterData,
  locationData: FullLocationData,
  gameSetting: 'Fictional' | 'Historical',
  worldContext: string | null,
  visualStyle: VisualStyleType,
  memoryContextString: string
): Promise<Omit<PotentialDiscovery, 'id' | 'status' | 'firstMentionedTimestamp' | 'firstMentionedLocationKey' | 'fulfilledById'>[]> => {
  if (!API_KEY) {
    console.warn("API key not configured. Cannot generate initial leads.");
    return [];
  }

  const charCtx = `Character: ${characterData.characterName} - ${characterData.characterConcept} (Rarity: ${characterData.characterRarity}, Skills: ${formatSkillsForLLM(characterData.skills)}, Visual Style: ${visualStyle}).`;
  const locCtx = `Starting Location: ${locationData.name} - ${locationData.description} (Rarity: ${locationData.rarity}, Tags: ${locationData.environmentTags.join(', ')}).`;
  let settingCtx = `Game Setting: ${gameSetting}.`;
  if (gameSetting === 'Historical' && worldContext) {
    settingCtx += ` Specific Historical Context: ${worldContext}. Leads must be historically plausible for this era/culture.`;
  } else if (gameSetting === 'Fictional' && worldContext) {
    settingCtx += ` Specific Fictional Universe: ${worldContext}. Leads must be consistent with this universe's lore.`;
  } else if (gameSetting === 'Fictional') {
    settingCtx += ` This is a generic fictional world; be creative but thematic.`;
  }

  const prompt = `You are an AI game master crafting initial plot hooks for a new game.
${charCtx}
${locCtx}
${settingCtx}
Memory Context (existing entities, if any, to avoid immediate duplication for leads):
${memoryContextString}

Task: Generate 1 or 2 thematic and actionable leads (rumors, hints, objectives) that fit the starting character, location, and game setting. These leads should provide initial direction or mystery for the player.
- Leads can hint at nearby interesting items, notable NPCs, or intriguing locations.
- They should feel like natural starting points or pieces of knowledge the character might possess or intuit.
- The 'sourceTextSnippet' should be a short, evocative in-world phrase explaining how the character knows this hint (e.g., "A tattered map fragment suggests...", "Whispers in the tavern spoke of...", "A recurring dream points to...").
- Rarity of leads should generally be Common to Rare, unless the character/location concept strongly implies something Epic/Legendary from the start.

CRITICAL: You MUST use the 'generate_initial_game_leads' tool. Adhere strictly to its schema.
Return 1-2 leads. If absolutely no thematic leads can be generated, an empty 'leads' array is acceptable.
`;

  try {
    const result = await callLLMWithToolAndValidateArgs(
      prompt,
      GENERATE_INITIAL_LEADS_TOOL,
      validateInitialLeadsStructure,
      "Invalid initial leads structure (check leads array, and individual lead fields like name, type, descriptionHint, sourceTextSnippet).",
      "generateInitialLeads"
    );

    return result.leads.map(lead => ({
      name: lead.name,
      type: lead.type,
      descriptionHint: lead.descriptionHint,
      rarityHint: lead.rarityHint,
      sourceTextSnippet: lead.sourceTextSnippet,
      sourceType: 'initial_setup', // Categorize these specifically
      sourceEntityId: `GameStart-${characterData.characterName}`, // Link to character or a generic start ID
    }));

  } catch (error) {
    console.error("Error generating initial game leads:", error);
    return [];
  }
};