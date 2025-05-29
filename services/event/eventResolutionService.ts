// services/event/eventResolutionService.ts
import { API_KEY, ai, callLLMWithToolAndValidateArgs, Tool, Type, FunctionDeclaration, Schema } from '../geminiClient';
import { EventEffects, PlayerActionParseResult, CharacterData, GameNPC, EventResolutionResult, GameItem, VisualStyleType } from '../types';
import { formatSkillsForLLM, SKILL_LEVEL_INTERPRETATION_GUIDE, formatCharacterLimbDetailsForLLM } from '../llmPromptUtils';

const validateEventResolutionResult = (data: any): data is EventResolutionResult => {
  return (
    data &&
    typeof data.resolved === 'boolean' &&
    typeof data.resolutionNarration === 'string' && data.resolutionNarration.trim() !== '' &&
    (data.majorPlotPointSummary === undefined || data.majorPlotPointSummary === null || typeof data.majorPlotPointSummary === 'string') && 
    (data.updatedNpcDisposition === undefined || data.updatedNpcDisposition === null || (typeof data.updatedNpcDisposition === 'object' && typeof data.updatedNpcDisposition.npcId === 'string')) &&
    (data.itemsAwardedToPlayer === undefined || data.itemsAwardedToPlayer === null || Array.isArray(data.itemsAwardedToPlayer)) &&
    (data.progressed === undefined || typeof data.progressed === 'boolean') &&
    (data.nextStageNarration === undefined || data.nextStageNarration === null || typeof data.nextStageNarration === 'string') &&
    (data.updatedVisualPromptHintForEventImage === undefined || data.updatedVisualPromptHintForEventImage === null || typeof data.updatedVisualPromptHintForEventImage === 'string') &&
    (data.updatedResolutionCriteriaPrompt === undefined || data.updatedResolutionCriteriaPrompt === null || typeof data.updatedResolutionCriteriaPrompt === 'string')
  );
};

const getStyleForEventImagePrompt = (visualStyle: VisualStyleType): string => {
  switch (visualStyle) {
    case 'Pixel Art': return "Pixel Art";
    case 'Anime': return "Anime";
    case 'Ink Painting': return "black and white traditional Chinese ink painting";
    case 'Oil Painting': return "distinctive impasto oil painting";
    case 'Water Painting': return "luminous watercolor painting";
    case 'Low Poly': return "stylized low-poly 3D render";
    default: return visualStyle; // Fallback
  }
};

export const EVALUATE_EVENT_RESOLUTION_TOOL: Tool = {
  functionDeclarations: [{
    name: "evaluate_event_resolution_attempt",
    description: "Evaluates player's attempt to resolve/progress an event. Determines if action leads to full resolution, progression to new stage, or no change. Considers event's current criteria, player skills, items, game setting/universe. Outcomes (positive/negative/mixed) reflected in narration, effects, and story progression. Visual prompts for event/items must be for game's current visual style (e.g., 'Pixel Art style', 'Anime style', 'distinctive impasto oil painting style', 'luminous watercolor painting style'). The event's progression should allow for player agency and be thematically consistent with the original event concept.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        resolved: { type: Type.BOOLEAN, description: "True if player's action FULLY resolves the event. False otherwise." },
        resolutionNarration: { type: Type.STRING, description: "Briefly narrate the *direct impact and consequence* of the player's action on the event (1-2 sentences), not just a description of the action itself. E.g., 'The ancient mechanism shudders and a hidden door grinds open...' or 'Your attempt to reason with the spirit fails; it becomes more agitated.'. This narration should be CHRONICLE-FRIENDLY, summarizing the key outcome of the resolution." },
        majorPlotPointSummary: { type: Type.STRING, nullable: true, description: "If the resolution action itself introduces a new, distinct piece of lore or plot not covered by the main narration, summarize it here for the chronicle. (Optional)" },
        progressed: { type: Type.BOOLEAN, description: "True if action causes event to change state or progress to a new stage, but isn't fully resolved. False if action fully resolves or has no significant impact. (Optional, defaults false)"},
        nextStageNarration: {type: Type.STRING, nullable: true, description: "CRITICAL: If 'progressed' is true, describe the *story progression* and how the event *evolves* (2-3 sentences), CONSIDERING THE PLAYER'S ACTION AND THE ORIGINAL EVENT CONCEPT. Introduce new story elements, challenges, dangers, NPC reactions, or lore revelations that are thematically consistent. What happens TO PLAYER or what CHANGES AROUND THEM? This should be DENSE with lore/change and actively involve the player. It's not a static re-description. (Optional)"},
        updatedVisualPromptHintForEventImage: { type: Type.STRING, nullable: true, description: "If 'progressed' is true AND the visual scene changes significantly, prompt for a new [CURRENT_GAME_STYLE] image reflecting the event's new state. (Optional)" },
        updatedResolutionCriteriaPrompt: { type: Type.STRING, nullable: true, description: "If 'progressed' is true, new criteria/hint/challenge for resolving the event from its new stage. This new criteria MUST remain thematically consistent with the player's successful thematic action and the original event concept. (Optional)" },
        updatedNpcDisposition: { type: Type.OBJECT, nullable: true, description: "If FULLY resolved AND causes NPC disposition change. (Optional)", properties: { npcId: { type: Type.STRING }, newDisposition: { type: Type.STRING, description: "New disposition. Must be one of: 'Neutral', 'Friendly', 'Hostile', 'Afraid'." } }, required: ["npcId", "newDisposition"] }, // Enum in description
        itemsAwardedToPlayer: { type: Type.ARRAY, nullable: true, description: "If FULLY resolved AND items awarded. (Optional)", items: { type: Type.OBJECT, properties: { name: {type: Type.STRING}, description: {type: Type.STRING}, itemTypeGuess: {type: Type.STRING}, rarity: {type: Type.STRING, description: "Rarity. Must be one of: 'Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'."}, visualPromptHint: {type:Type.STRING, nullable: true, description:"(Optional, for a [CURRENT_GAME_STYLE] icon)"} }, required: ["name", "description", "itemTypeGuess", "rarity"]} } // Enum in description
      },
      required: ["resolved", "resolutionNarration"],
    }
  } as FunctionDeclaration],
};

export const checkEventResolution = async (
  eventDetails: EventEffects,
  playerCommandText: string,
  parsedPlayerAction: PlayerActionParseResult,
  characterData: CharacterData,
  involvedNpcs: GameNPC[],
  memoryContextString: string,
  playerInventory: GameItem[]
): Promise<EventResolutionResult> => {
  if (!API_KEY) throw new Error("API key not configured for event resolution.");
  if (!eventDetails.requiresPlayerActionToResolve) return { resolved: true, resolutionNarration: "The event concludes on its own." };

  const playerSkillsString = formatSkillsForLLM(characterData.skills);
  const playerLimbsString = formatCharacterLimbDetailsForLLM(characterData.limbs);
  const playerInventoryString = playerInventory.map(item => `${item.name} (Rarity: ${item.rarity}, Type: ${item.itemTypeGuess})`).join(', ') || 'empty';
  const involvedNpcsString = involvedNpcs.map(npc => `${npc.name} (ID: ${npc.id}, Rarity: ${npc.rarity}, Disposition: ${npc.disposition || 'Neutral'})`).join('; ') || 'None apparent';
  const visualStyle = characterData.visualStyle;
  const currentGameStyleString = getStyleForEventImagePrompt(visualStyle);
  const originalEventConceptHint = `Original Event Concept Hint: The event '${eventDetails.eventTitle}' started with the narration: '${eventDetails.narration.substring(0,100)}...'`; 

  let settingSpecificInstruction = "";
  if (characterData.gameSettingType === "Historical" && characterData.initialHistoricalContext) {
    settingSpecificInstruction = `Game Setting: HISTORICAL - ${characterData.initialHistoricalContext}. Event resolution, NPC reactions, items must be plausible for this era/culture. Visuals in ${currentGameStyleString}.`;
  } else if (characterData.gameSettingType === "Fictional") {
    if (characterData.fictionalUniverseContext) {
        settingSpecificInstruction = `Game Setting: FICTIONAL universe: "${characterData.fictionalUniverseContext}". Resolution consistent with its lore/power levels. Visuals in ${currentGameStyleString}.`;
    } else {
        settingSpecificInstruction = `Game Setting: General FICTIONAL. Resolution fits theme. Visuals in ${currentGameStyleString}.`;
    }
  }

  const prompt = `You are an AI game master. Player is trying to resolve/progress an event.
EVENT DETAILS:
Title: "${eventDetails.eventTitle}"
Current Narration/State: "${eventDetails.narration}"
Current Resolution Criteria Hint: "${eventDetails.resolutionCriteriaPrompt || 'No specific hint available.'}"
${originalEventConceptHint} 
Event Visual Style Context: ${visualStyle}.

PLAYER & CONTEXT:
Player: ${characterData.characterConcept} (Health: ${characterData.overallHealth}, Energy: ${characterData.currentEnergy}, Skills: ${playerSkillsString}, Limbs: ${playerLimbsString}).
Inventory: ${playerInventoryString}.
Involved NPCs: ${involvedNpcsString}.
Player Command: "${playerCommandText}"
Parsed Action: ${JSON.stringify(parsedPlayerAction)}
${memoryContextString}
${settingSpecificInstruction}
${SKILL_LEVEL_INTERPRETATION_GUIDE}

TASK: Evaluate the player's action against the current event state and criteria by calling the 'evaluate_event_resolution_attempt' tool.
Consider the following aspects when formulating the evaluation for the tool:
1.  Action Analysis: Does the player's action align with the 'Resolution Criteria Hint' or the original event concept? Consider skills, items, and thematic relevance. The outcome (success/failure/partial) should reflect these.
2.  Resolution vs. Progression: Determine if the action 'resolved' the event, 'progressed' it to a new stage, or had no significant impact.
3.  Narrations:
    - Provide a 'resolutionNarration' describing the direct impact and consequence of the player's action on the event.
    - If the event 'progressed', detail the 'nextStageNarration', explaining how the event evolves based on the player's action.
4.  Updates (if progressed): If the scene changes, consider an 'updatedVisualPromptHintForEventImage'. If the challenge shifts, provide an 'updatedResolutionCriteriaPrompt'.
5.  Rewards (if fully resolved): Specify any 'updatedNpcDisposition' or 'itemsAwardedToPlayer'.
6.  Consistency & Challenge: Ensure outputs are thematically coherent. The event should remain challenging and outcomes logical. Player agency should be respected.

CRITICAL: Invoke 'evaluate_event_resolution_attempt' tool. Adhere strictly to its schema, using the parameter descriptions within the tool's definition. Tool call is ONLY valid output.
Replace '[CURRENT_GAME_STYLE]' in tool schema descriptions with '${currentGameStyleString}'.
For 'itemsAwardedToPlayer', any 'visualPromptHint' should be for a '${currentGameStyleString} icon of...'.`;

  return callLLMWithToolAndValidateArgs(
    prompt,
    EVALUATE_EVENT_RESOLUTION_TOOL,
    validateEventResolutionResult,
    "Invalid event resolution structure (check resolved, narration, progression fields, consistency, challenge, lore density, thematic relevance, majorPlotPointSummary)",
    `checkEventResolution (Event: ${eventDetails.eventTitle})`
  );
};