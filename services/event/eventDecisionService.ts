// services/event/eventDecisionService.ts
import { API_KEY, ai, callLLMWithToolAndValidateArgs, Tool, Type, FunctionDeclaration } from '../geminiClient';
import { CharacterData, FullLocationData, GameItem, GameLogEntry, VisualStyleType } from '../types';
import { formatSkillsForLLM, SKILL_LEVEL_INTERPRETATION_GUIDE, formatCharacterLimbDetailsForLLM } from '../llmPromptUtils';

export type EventDecisionFromTool = {
  shouldTriggerEvent: boolean;
  eventConcept: string | null;
  eventIntensity: 'low' | 'medium' | 'high' | null;
};

const validateEventDecisionStructure = (data: any): data is EventDecisionFromTool => {
  const validIntensities: Array<'low' | 'medium' | 'high' | null> = ['low', 'medium', 'high', null];
  return (
    data &&
    typeof data.shouldTriggerEvent === 'boolean' &&
    (data.eventConcept === null || (typeof data.eventConcept === 'string' && data.eventConcept.trim() !== '')) &&
    (validIntensities.includes(data.eventIntensity)) &&
    (data.shouldTriggerEvent ? (data.eventConcept !== null && data.eventIntensity !== null) : true)
  );
};

export const DECIDE_EVENT_TRIGGER_TOOL: Tool = {
  functionDeclarations: [{
    name: "decide_event_trigger_and_concept",
    description: "Decides if an event should trigger based on player action and game context. Provides a concept and intensity if an event is warranted. Considers significance of trigger (rarity of involved entities: Epic/Legendary), character skills (Perception), location, inventory, recent logs, memory, and game setting. CRITICAL: Mundane actions or those involving Common/Uncommon entities should NOT trigger events unless context is exceptional. Events should be STORY-DRIVEN and impactful. If trigger context involves 'dialogue_interaction_with_', consider the dialogue content from Recent Log/Memory for significance.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        shouldTriggerEvent: { type: Type.BOOLEAN, description: "True if an event is warranted (primarily for Epic/Legendary triggers, or significant dialogue with Epic/Legendary NPCs), false otherwise. False for mundane triggers." },
        eventConcept: { type: Type.STRING, nullable: true, description: "If true, a brief (3-10 word) evocative concept for the event, focusing on STORY or CHALLENGE. E.g., 'The ground trembles ominously', 'NPC Enraged by Insult', 'Secret Revealed to the Council'. Null if false. (Nullable)" },
        eventIntensity: { type: Type.STRING, nullable: true, description: "If true, suggested intensity: 'low' (atmospheric, minor choice), 'medium' (direct interaction, some consequence), 'high' (significant challenge/plot). Null if false. (Nullable, Enum: low, medium, high)" }
      },
      required: ["shouldTriggerEvent", "eventConcept", "eventIntensity"]
    }
  } as FunctionDeclaration]
};

export const decideIfEventShouldTrigger = async (
  triggerContext: string,
  characterData: CharacterData,
  locationData: FullLocationData,
  playerInventory: GameItem[],
  recentGameLogEntries: GameLogEntry[],
  memoryContextString: string = ""
): Promise<EventDecisionFromTool> => {
  if (!API_KEY) {
    console.warn("API key not configured for event decision. Defaulting to no event.");
    return { shouldTriggerEvent: false, eventConcept: null, eventIntensity: null };
  }

  const playerSkillsString = formatSkillsForLLM(characterData.skills);
  const playerLimbsString = formatCharacterLimbDetailsForLLM(characterData.limbs);
  const playerInventoryString = playerInventory.map(item => `${item.name} (Rarity: ${item.rarity})`).join(', ') || 'empty';
  const recentLogString = recentGameLogEntries.slice(-3).map(e => e.text).join('\n');
  const visualStyle = characterData.visualStyle;

  let settingSpecificInstruction = "";
  if (characterData.gameSettingType === "Historical" && characterData.initialHistoricalContext) {
    settingSpecificInstruction = `Game Setting: HISTORICAL - ${characterData.initialHistoricalContext}. Event concepts MUST be plausible for this period/culture.`;
  } else if (characterData.gameSettingType === "Fictional") {
    if (characterData.fictionalUniverseContext) {
        settingSpecificInstruction = `Game Setting: FICTIONAL universe: "${characterData.fictionalUniverseContext}". Event concepts MUST be consistent with its lore and themes.`;
    } else {
        settingSpecificInstruction = `Game Setting: General FICTIONAL. Event concepts should fit character/location themes.`;
    }
  }

  const prompt = `You are an AI game master deciding if an event should occur based on a trigger.
TRIGGER CONTEXT: "${triggerContext}" (This string often includes entity type and rarity, e.g., 'item_pickup_epic_artifact_of_doom', 'dialogue_interaction_with_legendary_npc_gandalf')

CURRENT GAME STATE:
Player: ${characterData.characterConcept} (Health: ${characterData.overallHealth}, Energy: ${characterData.currentEnergy}, Skills: ${playerSkillsString}, Limbs: ${playerLimbsString}, Visual Style: ${visualStyle}).
Location: ${locationData.name} (Rarity: ${locationData.rarity}, Desc: ${locationData.description}, Tags: ${locationData.environmentTags.join(', ')}).
Inventory: ${playerInventoryString}.
Recent Log (Contains recent player/NPC dialogue): "${recentLogString}".
${memoryContextString}
${settingSpecificInstruction}
${SKILL_LEVEL_INTERPRETATION_GUIDE}

TASK: Decide if an event should trigger.
PRIMARY EVENT TRIGGER RULE:
-   Events should PRIMARILY trigger for actions involving 'Epic' or 'Legendary' entities (items, locations, NPCs) as indicated by the "TRIGGER CONTEXT" (e.g., contains "_epic_", "_legendary_") or current game state (e.g., player enters a Legendary location).
-   Actions involving 'Rare' entities MIGHT trigger 'low' or 'medium' intensity events, especially if player skills (e.g., high Perception) or a unique situation in the "TRIGGER CONTEXT" warrants it.
-   Actions involving 'Common' or 'Uncommon' entities, or mundane actions (e.g., "walked through empty field", "crafted common item"), should ALMOST ALWAYS result in 'shouldTriggerEvent: false', UNLESS the "TRIGGER CONTEXT" itself implies an extraordinary circumstance despite a typically low rarity trigger (e.g., "picked_up_common_rock_that_suddenly_glows_ominously").

DIALOGUE-SPECIFIC EVENT TRIGGER RULE (Applies if "TRIGGER CONTEXT" contains 'dialogue_interaction_with_'):
-   If the NPC involved is 'Epic' or 'Legendary' (as indicated in "TRIGGER CONTEXT"), 'shouldTriggerEvent: true' is only warranted if the dialogue content itself (analyze "Recent Log" and broader "Memory Context") is EXCEPTIONALLY significant. Examples of significant dialogue content include:
    -   A major secret being revealed or a critical admission/lie by the NPC.
    -   A plot-altering discussion that directly leads to a new quest, a significant plan, a betrayal, or a major turning point in the story.
    -   A strong emotional provocation from the player or a profound emotional reaction from the NPC (e.g., rage, deep fear, sudden inspiration, profound sorrow) that has IMMEDIATE and TANGIBLE consequences or leads to a distinct new situation.
    -   The discovery of critical, game-changing lore, prophecies, or information that recontextualizes major aspects of the world or ongoing plots.
-   MERE GREETINGS, simple questions, or commonplace statements, even to 'Epic'/'Legendary' characters, should result in 'shouldTriggerEvent: false' UNLESS the specific content of that mundane interaction unexpectedly unlocks one of the significant criteria above (e.g., a coded phrase in a greeting reveals a secret identity).
-   If triggering, the 'eventConcept' MUST reflect the nature of the significant dialogue (e.g., "NPC Enraged by Insult", "Secret Revealed to the Council", "Ancient Prophecy Uncovered", "Sudden Betrayal", "Guan Yu's Mountain Strategy Revealed").
-   'eventIntensity' should be 'medium' or 'high' for such dialogue-triggered events due to their narrative importance.

ADDITIONAL CONSIDERATIONS:
1.  Analyze Trigger Context & Recent Log: Based on the rules above, is "${triggerContext}" (and recent dialogue in logs) significant enough?
2.  Mundane Actions/Dialogue: If not meeting the criteria, set 'shouldTriggerEvent: false'.
3.  Contextual Relevance & Story Focus: If event triggers, concept MUST fit location, character, inventory, recent events, and game setting/universe. Focus on concepts that lead to story development, challenges, or interesting lore reveals.
4.  Intensity: 'low' (atmospheric, minor choice, observation, small lore drop), 'medium' (direct interaction, some consequence, minor challenge, notable lore), 'high' (significant challenge, plot development, major changes to world/character, dense lore). Intensity should generally correlate with the rarity of the trigger.
5.  Narrative Value: Events should add interest, challenge, or depth. Avoid repetitive or nonsensical events. They should feel like a natural consequence or a meaningful development in the story.

CRITICAL: Invoke 'decide_event_trigger_and_concept' tool. Adhere to schema.
If 'shouldTriggerEvent' is true, 'eventConcept' and 'eventIntensity' MUST be provided and align with the trigger (rarity and/or dialogue significance).
If 'shouldTriggerEvent' is false, 'eventConcept' and 'eventIntensity' MUST be null.`;

  return callLLMWithToolAndValidateArgs(
    prompt,
    DECIDE_EVENT_TRIGGER_TOOL,
    validateEventDecisionStructure,
    "Invalid event decision structure (check shouldTriggerEvent, eventConcept, eventIntensity, consistency, focus on story/challenge and rarity/dialogue rules)",
    `decideIfEventShouldTrigger (Trigger: ${triggerContext})`
  );
};
