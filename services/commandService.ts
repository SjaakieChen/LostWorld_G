// services/commandService.ts
import { API_KEY, callLLMWithToolAndValidateArgs, TEXT_MODEL_NAME, Tool, Type } from './geminiClient';
import {
    CharacterData, FullLocationData, GameItem, GameNPC,
    PlayerActionParseResult, Skill, ParsedPlayerActionParameters, EventEffects
} from './gameTypes';
import { SKILL_LEVEL_INTERPRETATION_GUIDE, formatSkillsForLLM, formatEquippedItemsForLLM, formatCharacterLimbDetailsForLLM } from './llmPromptUtils';


const PARSE_PLAYER_COMMAND_TOOL: Tool = {
  functionDeclarations: [{
    name: "interpret_player_action",
    description: "Interprets player command in fantasy/historical game. Identifies action, targets, params. Checks plausibility (skills like Perception/Mobility, memory context, game setting/universe, ACTIVE EVENT CONTEXT). Provides narration. Skills, memory, setting/universe, AND ACTIVE EVENT CONTEXT influence plausibility/narration.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: { type: Type.STRING, description: "Core action verb (e.g., 'go', 'take', 'dialogue_input', 'attack_npc', 'leave_area', 'event_dialogue_input'). For examining non-objects, use 'examine'." },
        targets: { type: Type.ARRAY, description: "Primary targets (item names, directions, NPC names/IDs, 'area', 'self', '0,0', 'current_location'). Empty if general. For 'examine' of non-objects, this can be empty or contain the detail phrase.", items: { type: Type.STRING } },
        parameters: {
            type: Type.OBJECT, description: "Additional parameters. All optional.",
            properties: {
                withItem: { type: Type.STRING, nullable: true, description: "Item used with the action, if any." },
                on_target: { type: Type.STRING, nullable: true, description: "Secondary target of an action, if any (e.g. 'apply bandage on arm')." },
                is_limb_target: { type: Type.BOOLEAN, nullable: true, description: "True if 'on_target' refers to a character's limb." },
                interaction_type: { type: Type.STRING, nullable: true, description: "Type of interaction (e.g., 'inspect', 'read')." },
                npc_target_name: { type: Type.STRING, nullable: true, description: "Name of the NPC being interacted with directly for non-dialogue actions (e.g. examine NPC, attack NPC). This should be the primary target for actions like 'attack'." },
                dialogue_text: { type: Type.STRING, nullable: true, description: "The text of the player's speech if the action is 'dialogue_input', 'event_dialogue_input', or an initial utterance with 'talk'." },
                item_to_give_name: { type: Type.STRING, nullable: true, description: "Name of the item to give an NPC." },
                target_npc_name_for_interaction: { type: Type.STRING, nullable: true, description: "Name of the NPC to give an item to." },
                item_to_request_name: { type: Type.STRING, nullable: true, description: "Name of the item being requested from an NPC." },
                target_npc_name_for_request: { type: Type.STRING, nullable: true, description: "Name of the NPC from whom an item is requested." },
                direct_object_npc_id: { type: Type.STRING, nullable: true, description: "ID of NPC being targeted if 'npc_target_name' resolved to a known NPC ID from context. Crucial for 'attack_npc'."},
                intendedLocationTypeHint: { type: Type.STRING, nullable: true, description: "If moving, a player-suggested location type (e.g., 'forest', 'market', 'cave'). Null otherwise." },
                examine_detail_target: { type: Type.STRING, nullable: true, description: "If player examines a detail not an item/NPC (e.g., 'examine fissure', 'look at carvings'), this field holds the detail string (e.g., 'fissure', 'carvings'). 'action' is 'examine', 'targets' may be empty or hold the detail. If this is populated, narrationForPlausibleAction should be null as specific handling is needed." }
            },
        },
        isPlausible: { type: Type.BOOLEAN, description: "Contextually plausible (game state, skills, equipped items, MEMORY CONTEXT, game setting/universe, ACTIVE EVENT CONTEXT). E.g., picking complex lock with 0 Lockpicking & no memory of a key is implausible." },
        reasonIfNotPlausible: { type: Type.STRING, nullable: true, description: "Brief reason if not plausible." },
        narrationForPlausibleAction: { type: Type.STRING, nullable: true, description: "Optional brief narration IF PLAUSIBLE SIMPLE ACTION (e.g., 'You scan surroundings.'). CRITICALLY, IF action IS 'dialogue_input', 'event_dialogue_input', 'attack_npc', 'leave_area', 'give_item', 'request_item_from_npc', OR ('talk' AND parameters.dialogue_text is present), OR IF 'examine_detail_target' is populated, THIS FIELD MUST BE NULL or empty, as these actions have their own dedicated narration mechanisms that will be invoked by the game system based on the parsed action type and parameters. This field is ONLY for simple, self-contained actions that don't trigger complex downstream logic. Reflects skills, memory, game setting/universe, AND ACTIVE EVENT CONTEXT." },
      },
      required: ["action", "targets", "isPlausible"],
    },
  }],
};

const validatePlayerActionParseResult = (data: any): data is PlayerActionParseResult => {
    if (!data || typeof data.action !== 'string' || !Array.isArray(data.targets) || typeof data.isPlausible !== 'boolean') {
        return false;
    }
    if (data.parameters !== undefined && data.parameters !== null && typeof data.parameters !== 'object') {
        return false;
    }
    if (data.parameters?.intendedLocationTypeHint !== undefined && data.parameters?.intendedLocationTypeHint !== null && typeof data.parameters.intendedLocationTypeHint !== 'string') {
        console.warn(`Validation Warning: intendedLocationTypeHint should be string or null, but was: '${data.parameters.intendedLocationTypeHint}'`);
        return false;
    }
    if (data.parameters?.examine_detail_target !== undefined && data.parameters?.examine_detail_target !== null && typeof data.parameters.examine_detail_target !== 'string') {
        console.warn(`Validation Warning: examine_detail_target should be string or null, but was: '${data.parameters.examine_detail_target}'`);
        return false;
    }

    const restrictedNarrationActions = ['dialogue_input', 'event_dialogue_input', 'attack_npc', 'leave_area', 'give_item', 'request_item_from_npc'];
    if (restrictedNarrationActions.includes(data.action) && data.narrationForPlausibleAction && data.narrationForPlausibleAction.trim() !== '') {
        console.warn(`Validation Warning: narrationForPlausibleAction should be null/empty for action '${data.action}', but was: '${data.narrationForPlausibleAction}'`);
    }
    if (data.action === 'talk' && data.parameters?.dialogue_text && data.narrationForPlausibleAction && data.narrationForPlausibleAction.trim() !== '') {
         console.warn(`Validation Warning: narrationForPlausibleAction should be null/empty for 'talk' with dialogue_text, but was: '${data.narrationForPlausibleAction}'`);
    }
    if (data.parameters?.examine_detail_target && data.narrationForPlausibleAction && data.narrationForPlausibleAction.trim() !== '') {
        console.warn(`Validation Warning: narrationForPlausibleAction should be null/empty when 'examine_detail_target' is present, but was: '${data.narrationForPlausibleAction}'`);
    }
    return true;
};

export const parsePlayerCommandAndDetermineAction = async (
  command: string, character: CharacterData, location: FullLocationData,
  locationItems: GameItem[] | null, playerInventory: GameItem[],
  recentGameLog: string[], locationNPCs: GameNPC[], talkingToNPC: GameNPC | null,
  memoryContextString: string = "",
  activeEventDetails?: EventEffects | null // Added optional activeEventDetails
): Promise<PlayerActionParseResult> => {
  if (!API_KEY) throw new Error("Gemini API key is not configured.");
  const charSkillsStr = formatSkillsForLLM(character.skills);
  const charEquippedStr = formatEquippedItemsForLLM(character.limbs);
  const charLimbDetailsStr = formatCharacterLimbDetailsForLLM(character.limbs);

  let gameSettingContext = `Game Setting: ${character.gameSettingType}.`;
  if (character.gameSettingType === 'Historical' && character.initialHistoricalContext) {
    gameSettingContext += ` Historical Context: ${character.initialHistoricalContext}.`;
  } else if (character.gameSettingType === 'Fictional' && character.fictionalUniverseContext) {
    gameSettingContext += ` Fictional Universe: ${character.fictionalUniverseContext}.`;
  } else if (character.gameSettingType === 'Fictional') {
    gameSettingContext += ` This is a general fictional world.`;
  }

  let contextPrompt = `Player: ${character.characterConcept}. Vitals: Health ${character.overallHealth}HP, Energy ${character.currentEnergy}/${character.maxEnergy}EN. Limbs & Equipment: [${charLimbDetailsStr}]. Defeated: ${character.isDefeated}. Skills: [${charSkillsStr}]. ${gameSettingContext} ${SKILL_LEVEL_INTERPRETATION_GUIDE}`;
  contextPrompt += `\nLocation: ${location.name} (Description: "${location.description}"). Env: ${location.environmentTags.join(', ')}. Exits: [${location.validExits.join(', ') || 'None'}].`;
  if (locationItems?.length) contextPrompt += `\nItems here: ${locationItems.map(i => i.name).join(', ')}.`;
  else if (locationItems === null) contextPrompt += `\nItems here: Unknown (not searched).`; else contextPrompt += `\nItems here: None.`;
  if (playerInventory.length) contextPrompt += `\nInventory: ${playerInventory.map(i => i.name).join(', ')}.`; else contextPrompt += `\nInventory: Empty.`;

  let currentTalkingToNPCName: string | null = null;
  let npcContextForLLM = "";
  if (locationNPCs?.length) {
    npcContextForLLM = `\nNPCs present: ${locationNPCs.map(n => `${n.name} (ID: ${n.id}, Defeated: ${n.isDefeated ?? false}, Disposition: ${n.disposition || 'Neutral'})`).join('; ')}.`;
    if (talkingToNPC) {
      currentTalkingToNPCName = talkingToNPC.name;
      npcContextForLLM += `\nCRITICAL: Player IS CURRENTLY TALKING TO: ${currentTalkingToNPCName} (ID: ${talkingToNPC.id}). Assume player's input is dialogue FOR THIS NPC unless clearly an attack or global command.`;
    } else {
      npcContextForLLM += `\nNot currently talking to any specific NPC.`;
    }
  } else if (locationNPCs === null) npcContextForLLM = `\nNPCs here: Unknown (not searched).`; else npcContextForLLM = `\nNPCs here: None.`;
  contextPrompt += npcContextForLLM;

  if (recentGameLog.length) contextPrompt += `\nRecent events/dialogue (last 5 relevant):\n${recentGameLog.map(l => `- ${l}`).join('\n')}`;

  let eventContextForParsing = "";
  // Add event details to context if an event is active and requires player action
  if (activeEventDetails && activeEventDetails.requiresPlayerActionToResolve) {
    eventContextForParsing = `\nACTIVE EVENT: "${activeEventDetails.eventTitle}". Event State: "${activeEventDetails.narration.substring(0,150)}...". Resolution Hint: "${activeEventDetails.resolutionCriteriaPrompt || 'None specified'}". Your command interpretation MUST consider this active event. Simple dialogue inputs should be action: 'event_dialogue_input'.`;
    contextPrompt += eventContextForParsing;
  }

  if (character.isDefeated) contextPrompt += "\nCRITICAL: Player DEFEATED. Most actions implausible (unless 'try again'/'restart').";

  const prompt = `${contextPrompt}
${memoryContextString}
Player command: "${command}"

Interpret this command. Determine action, target(s), parameters. Assess plausibility (game state, skills, equipped items, MEMORY CONTEXT, game setting/universe, ACTIVE EVENT CONTEXT).

PRIMARY RULES:
1.  ACTIVE EVENT MODE (If "ACTIVE EVENT" is in context):
    - Player's input ("${command}") is likely an attempt to interact with or resolve the event.
        - Action: 'event_dialogue_input'. Parameters.dialogue_text: "${command}". narrationForPlausibleAction: null.
    - EXCEPTIONS:
        - Unambiguous global command (e.g., "inventory", "status") not plausible as event interaction: Parse as that command. Avoid movement unless event explicitly allows/ends.
2.  CONVERSATION MODE (If "Player IS CURRENTLY TALKING TO: [NPC NAME (ID: NPC_ID)]" is in context AND NO ACTIVE EVENT requires player action):
    - Player's input ("${command}") is dialogue FOR that NPC.
        - Action: 'dialogue_input'. Parameters.dialogue_text: "${command}". narrationForPlausibleAction: null.
    - EXCEPTIONS (as before): "bye", giving item, requesting item, attacking current NPC, unambiguous global commands.
3.  INITIATING ACTIONS (Not in Event/Conversation Mode OR as an exception):
    - "talk to [NPC_NAME]", "attack [NPC_NAME]", general commands (go, take, use, examine), movement with hint, contextual details examination, "leave area" -- rules largely as before.
4.  TARGETING & NARRATION: Rules largely as before. Remember narrationForPlausibleAction IS NULL for complex actions or event_dialogue_input.

STRICT INSTRUCTION: You MUST invoke the tool 'interpret_player_action'. Your entire response MUST be a call to this tool. Do not provide any direct text response.
The field 'narrationForPlausibleAction' MUST BE NULL OR EMPTY for actions like 'dialogue_input', 'event_dialogue_input', 'attack_npc', 'leave_area', 'give_item', 'request_item_from_npc', 'talk' (if it includes an initial utterance), or 'examine' (if 'examine_detail_target' is populated).
If an NPC is attacked and their ID is available in the "NPCs present" context, YOU MUST provide this ID in 'parameters.direct_object_npc_id'.
ALWAYS call the 'interpret_player_action' tool to structure your response.
`;

  return callLLMWithToolAndValidateArgs(prompt, PARSE_PLAYER_COMMAND_TOOL, validatePlayerActionParseResult,
    "Invalid player action parse (check conversation/event mode, memory context, attack handling, ID provision, 'leave_area' handling, narration rule for complex actions, or game setting/universe consistency, examine_detail_target)", "parsePlayerCommandAndDetermineAction");
};
