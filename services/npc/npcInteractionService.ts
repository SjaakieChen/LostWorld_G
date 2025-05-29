// services/npc/npcInteractionService.ts
import { GoogleGenAI, GenerateContentResponse, Chat, Content, FunctionDeclaration, Schema } from "@google/genai";
import { API_KEY, ai, callLLMWithToolAndValidateArgs, TEXT_MODEL_NAME, Tool, Type } from '../geminiClient';
import { GameNPC, CharacterData, GameItem, GiftOutcome, NpcItemOfferOutcome, EventEffects, MajorPlotPoint, PotentialDiscovery, VisualStyleType } from '../types';
import { SKILL_LEVEL_INTERPRETATION_GUIDE, formatSkillsForLLM, formatEquippedItemsForLLM } from '../llmPromptUtils';
import { identifyPotentialDiscoveriesInText, ProcessedTextWithDiscoveries } from '../loreService';

// Store chat sessions per NPC ID, including the event context active during initialization
const npcChatSessions = new Map<string, { chat: Chat, eventTitleContext: string | null }>();

export interface NpcDialogueResponse {
  rawText: string;
  processedText: string;
  potentialDiscoveries: Omit<PotentialDiscovery, 'id' | 'status' | 'firstMentionedTimestamp' | 'firstMentionedLocationKey' | 'fulfilledById'>[];
}

export const generateNpcDialogueResponse = async (
  npc: GameNPC, playerDialogue: string, character: CharacterData,
  currentLocationKey: string,
  memoryContextString: string = "",
  currentEventDetails: EventEffects | null // Added to make NPC aware of events
): Promise<NpcDialogueResponse> => {
  if (!API_KEY) throw new Error("Gemini API key is not configured.");
  if (npc.isDefeated) return { rawText: `${npc.name} lies defeated and cannot respond.`, processedText: `${npc.name} lies defeated and cannot respond.`, potentialDiscoveries: [] };

  const sessionEntry = npcChatSessions.get(npc.id);
  let chat = sessionEntry?.chat;
  const previousEventTitleContext = sessionEntry?.eventTitleContext;
  const currentEventTitleForContext = currentEventDetails?.eventTitle || null;

  // If event context has changed, invalidate old chat session to force re-initialization
  if (chat && previousEventTitleContext !== currentEventTitleForContext) {
    console.log(`Event context changed for NPC ${npc.name}. Old: ${previousEventTitleContext}, New: ${currentEventTitleForContext}. Re-initializing chat.`);
    chat = undefined;
    npcChatSessions.delete(npc.id); // Remove old session
  }

  let eventContextForSystemInstruction = "";
  if (currentEventDetails) {
    eventContextForSystemInstruction = `\nCURRENT EVENT: An event titled "${currentEventDetails.eventTitle}" is occurring. Narration: "${currentEventDetails.narration.substring(0, 150)}...". You MUST acknowledge or react to this event if it's significant and relevant to the conversation, your role, or safety. Your dialogue should reflect awareness of this.`;
  }

  if (!chat) {
    const playerSkillsString = formatSkillsForLLM(character.skills);
    const playerEquippedStr = formatEquippedItemsForLLM(character.limbs);
    const npcSkillsString = formatSkillsForLLM(npc.skills);

    let settingSpecificDialogueInstruction = "";
    let loreContextInstruction = "";
    if (character.gameSettingType === "Historical" && character.initialHistoricalContext) {
        settingSpecificDialogueInstruction = `Game Setting: HISTORICAL - ${character.initialHistoricalContext}. Your language, knowledge, concerns MUST reflect this era, your rarity ('${npc.rarity}'), disposition ('${npc.disposition || 'Neutral'}'), skills (${npcSkillsString}). If known historical figure (Epic/Legendary), responses align with known persona/context. Avoid modern idioms/anachronisms.`;
        loreContextInstruction = `Historical Context: ${character.initialHistoricalContext}.`;
    } else if (character.gameSettingType === "Fictional") {
        if (character.fictionalUniverseContext) {
            settingSpecificDialogueInstruction = `Game Setting: FICTIONAL within universe: "${character.fictionalUniverseContext}". Responses MUST be consistent with your character (rarity '${npc.rarity}', disposition '${npc.disposition || 'Neutral'}', skills ${npcSkillsString}), this universe's lore (including your known status e.g. alive/dead, origins), and established tone. If you are a known figure from this universe, act accordingly.`;
            loreContextInstruction = `Fictional Universe: ${character.fictionalUniverseContext}.`;
        } else {
            settingSpecificDialogueInstruction = `Game Setting: General FICTIONAL. Responses consistent with character (rarity '${npc.rarity}', disposition '${npc.disposition || 'Neutral'}', skills ${npcSkillsString}), and general fantasy/sci-fi themes. You may subtly draw inspiration from common fantasy/sci-fi tropes if they naturally fit your persona.`;
        }
    }
    // Added eventContextForSystemInstruction to the system prompt
    const systemInstruction = `You are the NPC: ${npc.name} (Rarity: ${npc.rarity}, Disposition: ${npc.disposition || 'Neutral'}).
Your Character: "${npc.description}". Your Appearance: "${npc.appearanceDetails}". Your Skills: [${npcSkillsString}].
You are talking to player: "${character.characterConcept}" (Player Health: ${character.overallHealth}HP, Energy: ${character.currentEnergy}EN, Equipped: ${playerEquippedStr}). Player Skills: [${playerSkillsString}].
Your reactions to the player (including their dialogue, appearance, and equipped items - ${playerEquippedStr}) should be natural and influenced by your personality, disposition, rarity, skills, and the game setting.
Reactions/willingness influenced by skill comparison (e.g., your Persuasion vs. player's). If skill much higher, be dominant; if lower, easily influenced. Narrate accordingly.
${loreContextInstruction}
${eventContextForSystemInstruction} 
${memoryContextString}
${settingSpecificDialogueInstruction}
${SKILL_LEVEL_INTERPRETATION_GUIDE}
Maintain consistent personality. Keep responses concise (1-3 sentences).
ENTIRE response is ONLY what you, the NPC, say. You may include VERY brief, simple, non-verbal parenthetical cues like (shrugs), (nods), (sighs), (chuckles), (winces), (looks thoughtful), (glances around nervously). DO NOT narrate your own complex physical actions or movements in parentheses, even in the first person. Keep these cues to a minimum and ensure they are natural interjections, not full sentences describing actions.
NO third-person narration. Speak directly to player. No markdown.
Your inventory: ${npc.inventory.length > 0 ? npc.inventory.map(i => `${i.name} (${i.rarity})`).join(', ') : 'nothing of note'}.
GREETING RULE: If conversation history empty OR this is your FIRST turn speaking, respond with greeting: "${npc.dialogueGreeting}", then address player's input. SUBSEQUENT turns, ONLY direct response; DO NOT repeat greeting.
Hostile/Afraid disposition reflected in greeting/responses.
If mentioning specific named items/people/locations sounding important/unique/legendary/quest-related, make mental note, NO special formatting. Game system handles hints.`;

    chat = ai.chats.create({
        model: TEXT_MODEL_NAME,
        config: { systemInstruction },
    });
    // Store with the current event context
    npcChatSessions.set(npc.id, { chat, eventTitleContext: currentEventTitleForContext });
  }
  try {
    const response = await chat.sendMessage({ message: playerDialogue });
    const rawNpcText = response.text;
    if (typeof rawNpcText === 'string' && rawNpcText.trim()) {
        const loreProcessingResult: ProcessedTextWithDiscoveries = await identifyPotentialDiscoveriesInText(
            rawNpcText, 'dialogue', npc.id, character, currentLocationKey, memoryContextString
        );
        return {
            rawText: rawNpcText,
            processedText: loreProcessingResult.processedText,
            potentialDiscoveries: loreProcessingResult.potentialDiscoveries
        };
    }
    let errorDetail = "Empty/invalid response.";
    if (response.candidates?.[0]?.finishReason) errorDetail += ` Finish reason: ${response.candidates[0].finishReason}.`;
    if (response.candidates?.[0]?.safetyRatings?.length) errorDetail += ` Safety: ${JSON.stringify(response.candidates[0].safetyRatings)}.`;
    throw new Error(`Received empty/invalid response from ${npc.name}. ${errorDetail}`);
  } catch (sdkError: any) {
    console.error(`[NPC DIALOGUE - ${npc.name}] SDK FAILED:`, sdkError);
    npcChatSessions.delete(npc.id); // Clear session on SDK error to force re-init
    throw new Error(sdkError.message || "Unknown dialogue SDK error. Try speaking to them again.");
  }
};

export const generateEventDialogueResponse = async (
  eventDetails: EventEffects,
  playerDialogue: string,
  character: CharacterData,
  worldConcept: string,
  chronicle: ReadonlyArray<MajorPlotPoint>,
  leads: ReadonlyArray<PotentialDiscovery>,
  memoryContext: string,
  currentLocationKey: string
): Promise<NpcDialogueResponse> => {
  if (!API_KEY) throw new Error("Gemini API key is not configured for event dialogue.");

  const playerSkillsString = formatSkillsForLLM(character.skills);
  const playerEquippedStr = formatEquippedItemsForLLM(character.limbs);
  const visualStyle = character.visualStyle;

  const eventSystemPrompt = `You are the narrator and embodiment of the currently active game event: "${eventDetails.eventTitle}".
Event Description: "${eventDetails.narration}"
${eventDetails.resolutionCriteriaPrompt ? `Event Resolution Hint: "${eventDetails.resolutionCriteriaPrompt}"` : ''}
Game Visual Style: ${visualStyle}.

Player Character: "${character.characterConcept}" (Equipped: ${playerEquippedStr}, Skills: [${playerSkillsString}]).
World Concept: ${worldConcept}.
Known History (Chronicle - Major Plot Points):
${chronicle.slice(-5).map(p => `- ${p.summary} (at ${p.locationName || 'Unknown'})`).join('\n') || 'No major plot points recorded recently.'}
Current Leads/Rumors:
${leads.filter(l => l.status === 'mentioned').slice(-5).map(l => `- ${l.name} (${l.type}): ${l.descriptionHint}`).join('\n') || 'No active leads noted recently.'}
Broader Game Memory: Use relevant parts of this for flavor or if the player references something from it. ${memoryContext.substring(0, 500)}...

Your Role:
1.  Respond narratively to the player's input, reflecting the event's nature, tone, and progress. Your description should be consistent with the game's visual style: ${visualStyle === 'Ink Painting' ? 'black and white traditional Chinese ink painting style' : visualStyle}.
2.  Your response should be 1-3 sentences.
3.  You ARE THE EVENT'S VOICE. Do not act as a specific pre-existing NPC unless the event explicitly makes you embody one (e.g. if eventDetails.npcEffects introduces a temporary NPC and marks them as the primary interactor).
4.  You CANNOT perform game actions (e.g., "player picks up X", "NPC Y attacks"). Your role is to describe, react, and provide atmosphere. The main game system will evaluate if the player's stated action resolves the event based on your narrative response and the original command.
5.  If player's input is vague, provide an atmospheric response or a subtle hint related to the event's resolution criteria if it has one.
6.  If the player's input seems to directly interact with a key element of the event (e.g. "I touch the glowing rune"), describe what happens immediately as a result of that touch.
7.  If your response mentions any new specific named items, people, or locations that sound important, unique, or part of a legend/quest (and are not already obviously part of the event description or known leads/chronicle), make a mental note for lore processing.

Output ONLY your textual response. NO MARKDOWN.
Example: If event is "A Chasm Opens" and player says "I peek into the chasm", you might respond: "A gust of chilling air rises from the Stygian depths, carrying with it the faint sound of distant wails. The bottom is lost in impenetrable darkness."
`;
  try {
    const response = await ai.models.generateContent({
        model: TEXT_MODEL_NAME,
        contents: `${eventSystemPrompt}\n\nPlayer: "${playerDialogue}"\nEvent Narrator:`,
    });
    const rawEventResponseText = response.text;

    if (typeof rawEventResponseText === 'string' && rawEventResponseText.trim()) {
        const loreProcessingResult: ProcessedTextWithDiscoveries = await identifyPotentialDiscoveriesInText(
            rawEventResponseText,
            'event_narration',
            eventDetails.eventTitle,
            character,
            currentLocationKey,
            memoryContext
        );
        return {
            rawText: rawEventResponseText,
            processedText: loreProcessingResult.processedText,
            potentialDiscoveries: loreProcessingResult.potentialDiscoveries
        };
    }
    throw new Error("Event dialogue LLM returned empty/invalid response.");
  } catch (sdkError: any) {
    console.error(`[EVENT DIALOGUE - ${eventDetails.eventTitle}] SDK FAILED:`, sdkError);
    throw new Error(sdkError.message || "Unknown event dialogue SDK error.");
  }
};

export const DETERMINE_GIFT_OUTCOME_TOOL: Tool = {
  functionDeclarations: [{
    name: "determine_gift_outcome",
    description: "Determines NPC reaction to gift. Considers player Persuasion, NPC skills (Persuasion/Perception), NPC rarity/personality/disposition, item value, memory context, game setting/universe, AND ONGOING EVENTS.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        accepted: { type: Type.BOOLEAN, description: "True if NPC accepts item, false otherwise." },
        narration: { type: Type.STRING, description: "Player's action narration (e.g., 'You offer the apple to the guard.')." },
        npcReactionText: { type: Type.STRING, description: "NPC's spoken response (e.g., 'Thank you, kind traveler.'). Reflects decision, personality, rarity, skills, disposition, reaction to player skills, game setting/universe, AND AWARENESS OF ONGOING EVENT (if any)." }
      },
      required: ["accepted", "narration", "npcReactionText"]
    }
  }]
};
type GiftOutcomeFromTool = { accepted: boolean; narration: string; npcReactionText: string; };
const validateGiftOutcomeStructure = (data: any): data is GiftOutcomeFromTool => {
    return data && typeof data.accepted === 'boolean' &&
           typeof data.narration === 'string' && data.narration.trim() !== '' &&
           typeof data.npcReactionText === 'string' && data.npcReactionText.trim() !== '';
};

export const determineGiftOutcome = async (
    character: CharacterData, npc: GameNPC, itemToGive: GameItem,
    chatHistory: string[], memoryContextString: string = "",
    currentEventDetails: EventEffects | null // Added event awareness
): Promise<GiftOutcome> => {
    if (!API_KEY) throw new Error("Gemini API key is not configured.");
    if (npc.isDefeated) return { accepted: false, narration: `You try to give ${itemToGive.name} to ${npc.name}, but they are defeated.`, npcReactionText: "..." };

    const playerPersuasion = character.skills.find(s => s.name === 'Persuasion')?.level || 0;
    const playerEquippedStr = formatEquippedItemsForLLM(character.limbs);
    const npcPersuasion = npc.skills.find(s => s.name === 'Persuasion')?.level || 0;
    const npcPerception = npc.skills.find(s => s.name === 'Perception')?.level || 0;

    const npcContext = `NPC Details: ${npc.name} (Rarity: ${npc.rarity}, Disposition: ${npc.disposition || 'Neutral'}, Desc: ${npc.description}). NPC Skills: Persuasion Lvl ${npcPersuasion}, Perception Lvl ${npcPerception}. Current Inventory: ${npc.inventory.map(i => i.name).join(', ') || 'none'}.`;
    const playerContext = `Player Character: ${character.characterConcept}. Player Persuasion Skill Level: ${playerPersuasion}. Equipped: ${playerEquippedStr}.`;
    const itemContext = `Item Offered: ${itemToGive.name} (Rarity: ${itemToGive.rarity}, Description: ${itemToGive.description}).`;
    const historyCtx = chatHistory.length > 0 ? `Recent Conversation Snippet (last 3 relevant lines):\n${chatHistory.join('\n')}` : "No recent conversation history available.";
    let eventContextForGift = ""; // Changed variable name
    if (currentEventDetails) {
        eventContextForGift = `\nONGOING EVENT: "${currentEventDetails.eventTitle}" - ${currentEventDetails.narration.substring(0,100)}... NPC should react appropriately to this event while considering the gift.`;
    }

    let settingSpecificNote = "";
    if (character.gameSettingType === "Historical" && character.initialHistoricalContext) {
      settingSpecificNote = `Game Setting: HISTORICAL - ${character.initialHistoricalContext}. NPC (${npc.rarity}, Disposition: ${npc.disposition}) reaction and perceived value of item ('${itemToGive.name}') MUST align with historical plausibility. If '${npc.name}' Legendary, specific reactions based on historical persona/skills.`;
    } else if (character.gameSettingType === "Fictional") {
      if (character.fictionalUniverseContext) {
          settingSpecificNote = `Game Setting: FICTIONAL within universe: "${character.fictionalUniverseContext}". NPC reaction MUST be consistent with their character, disposition, skills, and item's value in this universe.`;
      } else {
          settingSpecificNote = `Game Setting: General FICTIONAL. NPC reaction consistent with character, disposition, skills, item's value.`;
      }
    }

    const prompt = `You are an AI game logic assistant.
Context:
- ${npcContext}
- ${playerContext}
- ${itemContext}
- ${historyCtx}
- ${eventContextForGift}
- ${memoryContextString}
- ${settingSpecificNote}
- ${SKILL_LEVEL_INTERPRETATION_GUIDE}

Task: Player gives item to NPC. Determine NPC's reaction.
-   Consider NPC personality, rarity, disposition, skills (Persuasion Lvl ${npcPersuasion}, Perception Lvl ${npcPerception}), current inventory.
-   Consider item type, rarity, potential usefulness/value to NPC within the game setting/universe.
-   Consider player Persuasion skill (Level ${playerPersuasion}) AND player's equipped items (${playerEquippedStr}) as they might influence NPC's perception. Higher Player Persuasion vs NPC Persuasion/Perception increases acceptance.
-   Perceptive NPC (Perception Lvl ${npcPerception}) wary despite high player Persuasion. Gullible NPC (low Perception/Persuasion) might accept anything.
-   Consider memory context for relationships/plot points. Hostile/Afraid NPCs less likely to accept.
-   If an event is ongoing (${!!currentEventDetails}), NPC's reaction MUST reflect awareness of it. E.g., too distracted, scared, or focused on the event to care about the gift, or perhaps the gift is seen in light of the event.

CRITICAL: You MUST invoke tool 'determine_gift_outcome'. Arguments MUST adhere to schema.
DO NOT output details as text/JSON. Tool call is ONLY valid way.`;
    return callLLMWithToolAndValidateArgs(prompt, DETERMINE_GIFT_OUTCOME_TOOL, validateGiftOutcomeStructure, "Invalid gift outcome structure", `gift to ${npc.name}`);
};

export const DETERMINE_NPC_ITEM_OFFER_TOOL: Tool = {
  functionDeclarations: [{
    name: "determine_npc_item_offer",
    description: "Determines if NPC gives requested item. Considers Player Persuasion, NPC skills (Persuasion/Perception), NPC rarity/possessions/disposition, item value, memory context, game setting/universe, AND ONGOING EVENTS.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        willingToGive: { type: Type.BOOLEAN, description: "True if NPC willing to give item (or substitute)." },
        itemNameGiven: { type: Type.STRING, nullable: true, description: "Exact name of item from NPC inventory IF willing and item exists. Null if unwilling or no suitable item." },
        narration: { type: Type.STRING, description: "Player's request and NPC's initial reaction narration." },
        npcReactionText: { type: Type.STRING, description: "NPC's spoken response. Reflects decision, rarity, skills, Persuasion, disposition, game setting/universe, AND AWARENESS OF ONGOING EVENT (if any)." }
      },
      required: ["willingToGive", "narration", "npcReactionText"]
    }
  }]
};
type NpcItemOfferFromTool = { willingToGive: boolean; itemNameGiven: string | null; narration: string; npcReactionText: string; };
const validateNpcItemOfferStructure = (data: any): data is NpcItemOfferFromTool => {
    return data && typeof data.willingToGive === 'boolean' &&
           (data.itemNameGiven === null || typeof data.itemNameGiven === 'string') &&
           typeof data.narration === 'string' && data.narration.trim() !== '' &&
           typeof data.npcReactionText === 'string' && data.npcReactionText.trim() !== '';
};

export const determineNpcItemOffer = async (
    character: CharacterData, npc: GameNPC, requestedItemName: string,
    chatHistory: string[], memoryContextString: string = "",
    currentEventDetails: EventEffects | null // Added event awareness
): Promise<NpcItemOfferOutcome> => {
    if (!API_KEY) throw new Error("Gemini API key is not configured.");
    if (npc.isDefeated) return { willingToGive: false, itemNameGiven: null, itemGiven: null, narration: `${npc.name} is defeated and cannot respond to your request for ${requestedItemName}.`, npcReactionText: "..." };

    const playerPersuasion = character.skills.find(s => s.name === 'Persuasion')?.level || 0;
    const playerEquippedStr = formatEquippedItemsForLLM(character.limbs);
    const npcPersuasion = npc.skills.find(s => s.name === 'Persuasion')?.level || 0;
    const npcPerception = npc.skills.find(s => s.name === 'Perception')?.level || 0;

    const npcContext = `NPC Details: ${npc.name} (Rarity: ${npc.rarity}, Disposition: ${npc.disposition || 'Neutral'}, Desc: ${npc.description}). NPC Skills: Persuasion Lvl ${npcPersuasion}, Perception Lvl ${npcPerception}. Current Inventory: ${npc.inventory.map(i => i.name).join(', ') || 'none'}.`;
    const playerContext = `Player Character: ${character.characterConcept}. Player Persuasion Skill Level: ${playerPersuasion}. Equipped: ${playerEquippedStr}.`;
    const requestContext = `Player is requesting an item named "${requestedItemName}" from the NPC.`;
    const historyCtx = chatHistory.length > 0 ? `Recent Conversation Snippet (last 3 relevant lines):\n${chatHistory.join('\n')}` : "No recent conversation history available.";
    let eventContextForOffer = ""; // Changed variable name
    if (currentEventDetails) {
        eventContextForOffer = `\nONGOING EVENT: "${currentEventDetails.eventTitle}" - ${currentEventDetails.narration.substring(0,100)}... NPC should react appropriately to this event when considering the request.`;
    }

    let settingSpecificNote = "";
    if (character.gameSettingType === "Historical" && character.initialHistoricalContext) {
      settingSpecificNote = `Game Setting: HISTORICAL - ${character.initialHistoricalContext}. NPC (${npc.rarity}, Disposition: ${npc.disposition}) willingness to part with items, items themselves, MUST align with historical plausibility/skills. If '${npc.name}' Legendary, parts with significant items only for compelling reasons.`;
    } else if (character.gameSettingType === "Fictional") {
       if (character.fictionalUniverseContext) {
           settingSpecificNote = `Game Setting: FICTIONAL within universe: "${character.fictionalUniverseContext}". NPC willingness to part with items, and items themselves, MUST be consistent with their character, this universe's lore, and item's value.`;
       } else {
           settingSpecificNote = `Game Setting: General FICTIONAL. NPC willingness consistent with character, disposition, skills, item's value.`;
       }
    }

    let prompt = `You are an AI game logic assistant.
Context:
- ${npcContext}
- ${playerContext}
- ${requestContext}
- ${historyCtx}
- ${eventContextForOffer}
- ${memoryContextString}
- ${settingSpecificNote}
- ${SKILL_LEVEL_INTERPRETATION_GUIDE}

Task: Player asks NPC for an item. Determine NPC's response.
1.  Willingness: Decide if NPC willing to give requested item.
    -   Consider NPC personality, rarity, disposition (Hostile/Afraid NPCs very unlikely to give), skills (Persuasion Lvl ${npcPersuasion}, Perception Lvl ${npcPerception}).
    -   Persuasive NPC (Persuasion Lvl ${npcPersuasion}) might refuse/offer worse deal, even against persuasive player.
    -   Perceptive NPC (Perception Lvl ${npcPerception}) might understand player's true need/see through deception. Player's equipped items (${playerEquippedStr}) might also influence this.
    -   Consider NPC current inventory (can only give what they possess).
    -   Consider requested item nature/value within game setting/universe.
    -   Consider player Persuasion skill (Level ${playerPersuasion}). Higher Player Persuasion vs NPC skills increases chances.
    -   Consider memory context and recent conversation.
    -   If an event is ongoing (${!!currentEventDetails}), NPC's decision MUST reflect awareness of it. E.g., too distracted, or request is seen in light of the event (e.g. needs item for event).
2.  Item Given: If willing and item (or suitable substitute from inventory) possessed, provide exact name of item given. If no exact match but willing to offer substitute, provide substitute's name. Otherwise, null.
3.  Narration: Describe player's request and NPC's initial reaction.
4.  NPC Spoken Response: NPC's verbal reply, aligning with decision, personality, rarity, skills, disposition, Persuasion, game setting/universe, AND AWARENESS OF EVENT.

CRITICAL: You MUST invoke tool 'determine_npc_item_offer'. Arguments MUST adhere to schema.
DO NOT output details as text/JSON. Tool call is ONLY valid way.`;
    const resultFromTool = await callLLMWithToolAndValidateArgs(prompt, DETERMINE_NPC_ITEM_OFFER_TOOL, validateNpcItemOfferStructure, "Invalid NPC item offer structure", `request from ${npc.name}`);
    let actualItemGiven: GameItem | null = null;
    if (resultFromTool.willingToGive && resultFromTool.itemNameGiven) {
        actualItemGiven = npc.inventory.find(item => item.name.toLowerCase() === resultFromTool.itemNameGiven!.toLowerCase()) || null;
        if (!actualItemGiven) console.warn(`NPC ${npc.name} offered '${resultFromTool.itemNameGiven}', which was not found in their current inventory.`);
    }
    return { willingToGive: resultFromTool.willingToGive && !!actualItemGiven, itemNameGiven: actualItemGiven?.name || null, itemGiven: actualItemGiven, narration: resultFromTool.narration, npcReactionText: resultFromTool.npcReactionText };
};

export const elaborateOnNpcDescription = async (
  npc: GameNPC, characterData: CharacterData,
  currentLocationKey: string,
  memoryContextString: string = ""
): Promise<ProcessedTextWithDiscoveries> => {
  if (!API_KEY) throw new Error("Gemini API key is not configured.");
  const pLvl = characterData.skills.find(s => s.name === 'Perception')?.level || 0;
  const playerEquippedStr = formatEquippedItemsForLLM(characterData.limbs);
  const charCtx = `Char: ${characterData.characterConcept} (Perception Lvl ${pLvl}, Equipped: ${playerEquippedStr}). Setting: ${characterData.gameSettingType}.`;

  let settingSpecificElaborationInstruction = "";
   if (characterData.gameSettingType === 'Historical' && characterData.initialHistoricalContext) {
    settingSpecificElaborationInstruction = `Elaboration MUST be consistent with historical context: ${characterData.initialHistoricalContext}. If NPC is known figure, draw from/expand on their REAL historical biography/lore. Focus on verifiable facts or plausible historical interpretations.`;
  } else if (characterData.gameSettingType === 'Fictional') {
    if (characterData.fictionalUniverseContext) {
        settingSpecificElaborationInstruction = `Elaboration MUST be consistent with the established lore of the fictional universe: "${characterData.fictionalUniverseContext}". If NPC is known figure from this universe, expand on their specific IN-WORLD lore, relationships, and history.`;
    } else {
        settingSpecificElaborationInstruction = `Elaboration should be consistent with a general fantasy/sci-fi theme fitting the NPC. You may subtly draw inspiration from common tropes if they naturally fit the NPC's persona. Focus on unique origins, affiliations, or connections to broader world lore.`;
    }
  }

  let elabInstruction = `Provide DETAILED, FACTUAL, and LORE-RICH information about this NPC (2-4 paragraphs). Go beyond their immediate appearance or greeting. Avoid generic statements.
Focus on:
-   Specifics of their background: Where are they from? What significant events shaped them? What is their family or lineage known for? Provide real historical details if applicable and known.
-   Motivations and Goals: What are their *concrete* objectives, desires, fears, or ambitions? Why do they pursue these? Connect to historical/lore context.
-   Notable Past Actions & Accomplishments: What specific deeds or events are they known for (real historical events if applicable, or significant in-world lore events)? How did these impact the world or other characters?
-   Relationships: Details about their specific allies, enemies, mentors, or loved ones. What is the nature of these relationships (historical or in-world lore based)?
-   Skills & Abilities: (${formatSkillsForLLM(npc.skills)}) - How did they acquire these skills? Are there any famous applications of their abilities according to history/lore?
-   Secrets or Hidden Knowledge: What non-obvious information, "fun facts", intriguing historical tidbits, or specific pieces of in-world lore might a perceptive character learn or recall about them?
-   Current Disposition Context: (${npc.disposition || 'Neutral'}) - Briefly, what recent events (historical or in-world) or interactions might have led to this current disposition?
Build upon existing information and connect them to known entities or events from the game's memory context if plausible, providing specific links.
`;
  if (npc.rarity === 'Epic' || npc.rarity === 'Legendary') {
    elabInstruction += `\nAs this NPC is ${npc.rarity}, the details should be particularly significant, reflecting their impact on the world, their deep history, or pivotal role in ongoing/past events. If they are a known historical figure (for Historical setting) or a major character from the Fictional Universe, your description MUST align with and expand upon established REAL historical facts or IN-WORLD lore about them. Reveal specific anecdotes or defining moments from their past, based on actual history or established lore.`;
  }

  const prompt = `Player learns more about NPC.
NPC: ${npc.name}, Desc: ${npc.description}, Appearance: ${npc.appearanceDetails}, Greeting: "${npc.dialogueGreeting}", Rarity: ${npc.rarity}, Disposition: ${npc.disposition || 'Neutral'}, NPC Skills: ${formatSkillsForLLM(npc.skills)}.
${charCtx} ${SKILL_LEVEL_INTERPRETATION_GUIDE} (Player Perception Lvl ${pLvl} might reveal more, considering NPC skills like Mobility/Persuasion if hiding something). Player's equipped items (${playerEquippedStr}) might provide context for NPC's past interactions or how they are perceived.
${memoryContextString}
Task: ${elabInstruction} ${settingSpecificElaborationInstruction} Output ONLY rich, descriptive factual text. No markdown. No player thoughts/feelings.
If you mention any specific named items, people, or locations that sound important, unique, or part of a legend/quest, make a mental note but DO NOT use any special formatting or markup in your direct speech output. The game system will handle identifying these hints separately.`;
  try {
    const response = await ai.models.generateContent({ model: TEXT_MODEL_NAME, contents: prompt });
    const rawNpcElaborationText = response.text;
    if (rawNpcElaborationText?.trim()) {
        const loreProcessingResult: ProcessedTextWithDiscoveries = await identifyPotentialDiscoveriesInText(
            rawNpcElaborationText,
            'item_text', // Source type should be 'npc_elaboration' or similar if we want to distinguish. For now, 'item_text' is a placeholder.
            npc.id,
            characterData,
            currentLocationKey,
            memoryContextString
        );
         return loreProcessingResult;
    }
    console.warn(`Elaboration for NPC ${npc.name} resulted in empty response.`, response);
    const fallbackText = "Further recollection reveals no additional significant factual details.";
    return { rawText: fallbackText, processedText: fallbackText, potentialDiscoveries: [] };
  } catch (error: any) {
    console.error(`Error elaborating on NPC ${npc.name}:`, error);
    const errorText = `Error recalling more about ${npc.name}. (Error: ${error.message || 'Unknown'})`;
    return { rawText: errorText, processedText: errorText, potentialDiscoveries: [] };
  }
};
