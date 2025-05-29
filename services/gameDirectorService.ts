
// services/gameDirectorService.ts
import { API_KEY, ai, callLLMWithToolAndValidateArgs, TEXT_MODEL_NAME, Tool, Type, FunctionDeclaration, Schema } from './geminiClient';
import {
  CharacterData, FullLocationData, GameItem, GameNPC, EventEffects,
  GameLogEntry, MajorPlotPoint, PotentialDiscovery, GameDirectorDirective,
  GameFocusType, PromptEnhancementSuggestion, GameplayParameterSuggestions, TargetSystemType
} from './gameTypes';
import { formatSkillsForLLM, SKILL_LEVEL_INTERPRETATION_GUIDE, formatEquippedItemsForLLM, formatCharacterLimbDetailsForLLM } from './llmPromptUtils';

const GAME_FOCUS_TYPES_ENUM: GameFocusType[] = [
  'SurvivalHorror', 'DetectiveMystery', 'HighStakesCombat', 'SocialIntrigue',
  'ExplorationAdventure', 'ResourceManagement', 'PuzzleSolving', 'SportsMatchFocus',
  'PoliticalIntrigue', 'StealthOperations', 'HumorousAdventure', 'PhilosophicalDebate',
  'RomanticPursuit', 'TragedyUnfolding', 'PersonalGrowthJourney', 'FactionConflict',
  'BaseBuildingDefense', 'NoSpecificFocus', 'CustomScenario'
];

const TARGET_SYSTEM_TYPES_ENUM: TargetSystemType[] = [
  'EventGeneration', 'NPCInteraction', 'CombatResolution', 'LocationDescription',
  'ItemGeneration', 'PlayerVitals', 'GameLogNarration', 'WorldProgression'
];

const GAMEPLAY_PARAMETER_KEYS: (keyof GameplayParameterSuggestions)[] = [
  'focusOnResourceScarcity', 'adjustEnergyDecayRate', 'adjustHealthRegenRate',
  'preferredEventType', 'increaseNarrativeLengthForScenario', 'triggerChanceModifierForGoodEvents',
  'triggerChanceModifierForBadEvents', 'npcDispositionVolatility', 'customFocusDescription',
  'attentionToDetailLevel', 'dialogueStyle', 'pacing'
];


const PROVIDE_GAME_DIRECTION_SUGGESTIONS_TOOL: Tool = {
  functionDeclarations: [{
    name: "provide_game_direction_suggestions",
    description: "Analyzes the comprehensive game state and player interaction patterns to determine the current gameplay focus. Based on this focus, suggests directives to enhance player immersion and experience. These directives include general prompt enhancements for various game AI systems and specific gameplay parameter adjustments.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        currentGameFocus: {
          type: Type.STRING,
          enum: GAME_FOCUS_TYPES_ENUM,
          description: "The primary gameplay style or genre the player seems to be engaged in or the game is leaning towards. If 'CustomScenario', provide details in 'customFocusDescription'."
        },
        promptEnhancements: {
          type: Type.ARRAY,
          description: "Array of suggestions to modify prompts for other AI systems to align with the current game focus.",
          items: {
            type: Type.OBJECT,
            properties: {
              targetSystem: { type: Type.STRING, enum: TARGET_SYSTEM_TYPES_ENUM, description: "The game system this suggestion targets." },
              suggestion: { type: Type.STRING, description: "Specific textual advice for the target system's LLM prompts (e.g., 'For EventGeneration, emphasize a sense of urgency and danger.')." },
              priority: { type: Type.STRING, enum: ['low', 'medium', 'high'], nullable: true, description: "Optional priority for this enhancement." }
            },
            required: ["targetSystem", "suggestion"]
          }
        },
        gameplayParameterSuggestions: {
          type: Type.OBJECT,
          description: "Specific suggestions for adjusting game parameters to match the focus.",
          properties: {
            focusOnResourceScarcity: { type: Type.BOOLEAN, nullable: true, description: "True if survival/resource management is key." },
            adjustEnergyDecayRate: { type: Type.STRING, enum: ['normal', 'increased', 'decreased', 'none'], nullable: true, description: "Suggest change to player energy decay." },
            adjustHealthRegenRate: { type: Type.STRING, enum: ['normal', 'slowed', 'none', 'event_driven'], nullable: true, description: "Suggest change to health regeneration." },
            preferredEventType: { type: Type.STRING, enum: [...GAME_FOCUS_TYPES_ENUM, 'balanced', null] as (GameFocusType | 'balanced' | null)[], nullable: true, description: "Suggest preferred type of event to generate." },
            increaseNarrativeLengthForScenario: { type: Type.STRING, nullable: true, description: "Suggest specific scenario (e.g., a GameFocusType or a unique string like 'BossBattle') where narration should be longer." },
            triggerChanceModifierForGoodEvents: { type: Type.NUMBER, nullable: true, description: "Multiplier for good events (e.g., 1.2 for +20%)." },
            triggerChanceModifierForBadEvents: { type: Type.NUMBER, nullable: true, description: "Multiplier for bad events." },
            npcDispositionVolatility: { type: Type.STRING, enum: ['low', 'medium', 'high'], nullable: true, description: "How easily NPC dispositions might change." },
            customFocusDescription: { type: Type.STRING, nullable: true, description: "Detailed description if currentGameFocus is 'CustomScenario'." },
            attentionToDetailLevel: { type: Type.STRING, enum: ['low', 'medium', 'high'], nullable: true, description: "Suggested level for perception detail."},
            dialogueStyle: {type: Type.STRING, enum: ['concise', 'descriptive', 'action_oriented', 'introspective'], nullable: true, description: "Preferred NPC dialogue style."},
            pacing: {type: Type.STRING, enum: ['fast', 'medium', 'slow'], nullable: true, description: "Overall game pacing."}
          },
        },
        reasoning: { type: Type.STRING, nullable: true, description: "Brief explanation for the suggested directives based on the game state analysis." }
      },
      required: ["currentGameFocus", "promptEnhancements", "gameplayParameterSuggestions"]
    }
  } as FunctionDeclaration]
};

type GameDirectorToolOutput = Omit<GameDirectorDirective, 'directiveId' | 'timestamp' | 'analyzedCommandCount' | 'lastGameLogEntryIdAnalyzed'>;

const validateGameDirectorToolOutput = (data: any): data is GameDirectorToolOutput => {
  if (!data || !GAME_FOCUS_TYPES_ENUM.includes(data.currentGameFocus)) return false;
  if (!Array.isArray(data.promptEnhancements)) return false;
  for (const pe of data.promptEnhancements) {
    if (!TARGET_SYSTEM_TYPES_ENUM.includes(pe.targetSystem) || typeof pe.suggestion !== 'string') return false;
    if (pe.priority && !['low', 'medium', 'high'].includes(pe.priority)) return false;
  }
  if (typeof data.gameplayParameterSuggestions !== 'object' || data.gameplayParameterSuggestions === null) return false;
  for (const key in data.gameplayParameterSuggestions) {
    if (!GAMEPLAY_PARAMETER_KEYS.includes(key as keyof GameplayParameterSuggestions)) {
        // console.warn(`GameDirector Validation: Unknown key in gameplayParameterSuggestions: ${key}`);
    }
  }
  if (data.reasoning !== undefined && data.reasoning !== null && typeof data.reasoning !== 'string') return false;
  return true;
};


export const analyzeAndSuggestGameDirectives = async (
  characterData: CharacterData | null,
  locationData: FullLocationData | null,
  playerInventory: GameItem[],
  recentGameLog: GameLogEntry[], 
  memoryContextString: string,
  activeEventDetails: EventEffects | null,
  currentDirectives: GameDirectorDirective | null 
): Promise<GameDirectorToolOutput | null> => {
  if (!API_KEY) {
    console.warn("GameDirectorService: API_KEY not configured.");
    return null;
  }
  if (!characterData || !locationData) {
    console.warn("GameDirectorService: Missing character or location data.");
    return null;
  }

  const charSkillsStr = formatSkillsForLLM(characterData.skills);
  const charEquippedStr = formatEquippedItemsForLLM(characterData.limbs);
  const charLimbDetailsStr = formatCharacterLimbDetailsForLLM(characterData.limbs);

  let gameSettingContext = `Game Setting: ${characterData.gameSettingType}.`;
  if (characterData.gameSettingType === 'Historical' && characterData.initialHistoricalContext) {
    gameSettingContext += ` Historical Context: ${characterData.initialHistoricalContext}.`;
  } else if (characterData.gameSettingType === 'Fictional' && characterData.fictionalUniverseContext) {
    gameSettingContext += ` Fictional Universe: ${characterData.fictionalUniverseContext}.`;
  }

  const gameLogSummary = recentGameLog.slice(-20).map(entry => `[${entry.type}] ${entry.text.substring(0, 100)}...`).join('\n');

  const prompt = `You are a sophisticated Game Director AI for a text-based adventure game.
Your goal is to analyze the complete game state and player's recent actions to determine the current emergent gameplay focus.
Based on this focus, you will provide directives to enhance player immersion and guide other AI systems.

CURRENT GAME STATE SNAPSHOT:
Character: ${characterData.characterName} - ${characterData.characterConcept}
  Rarity: ${characterData.characterRarity}, Visual Style: ${characterData.visualStyle}
  Health: ${characterData.overallHealth}HP, Energy: ${characterData.currentEnergy}/${characterData.maxEnergy}EN
  Limbs & Equipment: [${charLimbDetailsStr}]
  Defeated: ${characterData.isDefeated}
  Skills: [${charSkillsStr}]
  ${gameSettingContext}

Current Location: ${locationData.name} (Rarity: ${locationData.rarity})
  Description: "${locationData.description.substring(0, 150)}..."
  Environment Tags: ${locationData.environmentTags.join(', ')}
  Exits: [${locationData.validExits.join(', ') || 'None'}]

Player Inventory: ${playerInventory.length > 0 ? playerInventory.map(i => `${i.name} (${i.rarity})`).join(', ') : 'Empty'}

${activeEventDetails ? `Active Event: "${activeEventDetails.eventTitle}" - ${activeEventDetails.narration.substring(0, 100)}... (Requires Action: ${activeEventDetails.requiresPlayerActionToResolve ?? false})` : 'No active event.'}

Game Memory & Chronicle (Summary):
${memoryContextString.substring(0, 1000)}...

Recent Game Log (Last 20 entries):
${gameLogSummary}

${currentDirectives ? `Previous Game Director Focus: ${currentDirectives.currentGameFocus}` : 'No previous game director focus.'}

${SKILL_LEVEL_INTERPRETATION_GUIDE}

YOUR TASK:
1.  Analyze ALL provided context: player stats, skills, inventory, location, ongoing event, memory, recent log.
    What is the player *actually doing*? What themes are emerging? Is there a clear objective or gameplay loop forming?

2.  Determine 'currentGameFocus': Select the most fitting GameFocusType. If it's a unique scenario not covered by predefined types, use 'CustomScenario' and describe it in 'customFocusDescription'. 'NoSpecificFocus' if gameplay is generic.

3.  Suggest 'promptEnhancements' (0-3 suggestions):
    Provide specific, actionable advice for other AI systems (EventGeneration, NPCInteraction, CombatResolution, LocationDescription, ItemGeneration, PlayerVitals, GameLogNarration, WorldProgression).
    These suggestions should guide the *style, tone, and content* of generations to align with the 'currentGameFocus'.

4.  Suggest 'gameplayParameterSuggestions' (optional adjustments):
    These are more direct tweaks. Only suggest parameters relevant to the 'currentGameFocus'.

5.  Provide 'reasoning' (optional): Briefly explain why you chose this focus and these directives.

IMPORTANT: The "Example Scenarios" below are for ILLUSTRATIVE PURPOSES ONLY, to show the type of thinking and output structure.
DO NOT copy-paste the examples. You MUST generate your own unique directives based ON THE CURRENT ACTUAL GAME STATE provided above. Your suggestions should be tailored and responsive to the player's specific situation and emergent narrative.

Example Scenarios & Desired Directives (Illustrative Examples - DO NOT COPY):
    - Scenario (Example): Player is low on health/energy, in a dangerous area, recently fought monsters.
      Focus: 'SurvivalHorror'
      Enhancement (EventGeneration): "Generate events that emphasize resource scarcity (food, medical supplies) and create a sense of dread or pursuit. Minor negative outcomes are more frequent."
      Parameter: 'focusOnResourceScarcity: true', 'adjustEnergyDecayRate: "increased"', 'triggerChanceModifierForBadEvents: 1.2'

    - Scenario (Example): Player is questioning multiple NPCs, examining notes, and exploring a series of interconnected clues related to a crime.
      Focus: 'DetectiveMystery'
      Enhancement (NPCInteraction): "NPCs should be more guarded with information, requiring persuasion or evidence. Dialogue should contain subtle clues of varying difficulty to uncover based on player skill (Perception, Persuasion)."
      Parameter: 'attentionToDetailLevel: "high"', 'dialogueStyle: "introspective"', 'preferredEventType: "DetectiveMystery"'

    - Scenario (Example): Player has a 'Football' item, is in a 'Stadium' location, and log shows commands like "kick football", "pass to teammate".
      Focus: 'SportsMatchFocus'
      CustomFocusDescription: "Player is in a critical football match, score is tied, final minutes."
      Enhancement (EventGeneration): "For events related to the football match, provide longer, more immersive narrations detailing plays, crowd reactions, and match progression."
      Enhancement (GameLogNarration): "Use more active and exciting language for game log entries related to the match."
      Parameter: 'increaseNarrativeLengthForScenario: "SportsMatchFocus_FinalMinutes"', 'preferredEventType: "SportsMatchFocus"', 'pacing: "fast"'

    - Scenario (Example): Player is at a royal ball, speaking to many nobles, trying to gain influence or uncover plots.
      Focus: 'SocialIntrigue'
      CustomFocusDescription: "Player is navigating a royal ball, attempting to gather secrets and influence key figures."
      Enhancement (NPCInteraction): "NPC dialogue should be layered with subtext. NPCs might react strongly to social faux pas or clever compliments. Player's Persuasion skill is key."
      Parameter: 'npcDispositionVolatility: "high"', 'triggerChanceModifierForGoodEvents: 1.1', 'triggerChanceModifierForBadEvents: 1.1', 'preferredEventType: "SocialIntrigue"'

    - Scenario (Example): Player is carefully searching ancient ruins, finding old inscriptions and avoiding traps.
      Focus: 'ExplorationAdventure'
      CustomFocusDescription: "Player is methodically exploring ancient, trap-laden ruins, seeking lost knowledge."
      Enhancement (LocationDescription): "Emphasize details about ancient architecture, potential hidden mechanisms, subtle environmental clues, and the passage of time in location descriptions. Make sure Perception skill can unlock more details."
      Enhancement (ItemGeneration): "Items found should be ancient relics, tools for exploration, or lore-rich fragments."
      Parameter: 'preferredEventType: "PuzzleSolving"', 'attentionToDetailLevel: "high"', 'focusOnResourceScarcity: false'

    - Scenario (Example): Player is in a prolonged, difficult fight with a powerful, unique enemy (e.g., a dragon).
      Focus: 'HighStakesCombat'
      CustomFocusDescription: "Player is engaged in a challenging boss battle against a legendary beast that has multiple phases or unique abilities."
      Enhancement (CombatResolution): "Make combat descriptions more vivid and cinematic. Emphasize the power of the boss and the impact of player's successful hits or misses. Describe the boss's reactions and changing tactics."
      Enhancement (EventGeneration): "Trigger small, dynamic events during the boss fight based on player actions or boss health thresholds (e.g., boss enrages, environment changes slightly)."
      Parameter: 'adjustHealthRegenRate: "none"', 'increaseNarrativeLengthForScenario: "BossBattlePhaseChange"', 'triggerChanceModifierForBadEvents: 1.3'

CRITICAL: Invoke the 'provide_game_direction_suggestions' tool. Ensure all outputs are consistent and logical.
Your suggestions should be subtle nudges to the game systems, not drastic overhauls unless the game state strongly indicates a major shift.
Consider the 'Previous Game Director Focus' to ensure smooth transitions or deliberate shifts, rather than rapidly oscillating directives.
If an active event is present, the game focus should heavily consider the nature of that event.
`;

  try {
    const result = await callLLMWithToolAndValidateArgs(
      prompt,
      PROVIDE_GAME_DIRECTION_SUGGESTIONS_TOOL,
      validateGameDirectorToolOutput,
      "Invalid Game Director directive structure.",
      "analyzeAndSuggestGameDirectives"
    );
    return result;
  } catch (error) {
    console.error("GameDirectorService: Error analyzing game state:", error);
    return null;
  }
};
