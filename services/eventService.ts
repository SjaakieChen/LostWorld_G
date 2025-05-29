
// services/eventService.ts
import { API_KEY, ai, callLLMWithToolAndValidateArgs, TEXT_MODEL_NAME, Tool, Type, FunctionDeclaration, Schema } from './geminiClient';
import {
  CharacterData, FullLocationData, GameItem, GameNPC, GameLogEntry, EventEffects, PlayerActionParseResult,
  CharacterEffectForEvent, ItemEffectForEvent, LocationEffectForEvent, NpcEffectForEvent,
  GameItemSuggestionForEvent, SuggestedNPCForEvent, PlayerInitiatedActionEventDetails, ItemRarity, EventResolutionResult, PotentialDiscovery,
  PotentialDiscoveryType, MemorableEntityRarity, PotentialDiscoverySourceType, VisualStyleType
} from './gameTypes';
import { formatSkillsForLLM, SKILL_LEVEL_INTERPRETATION_GUIDE, formatEquippedItemsForLLM, formatCharacterLimbDetailsForLLM } from './llmPromptUtils';

// --- Tool for Spontaneous Random Events ---
const validateCharacterEffectForEvent = (data: any): data is CharacterEffectForEvent => {
    if (!data) return true; // Optional
    // Add more specific validation if needed, e.g., check for valid limb names if limbEffects are present.
    return true;
};
const validateItemEffectForEvent = (data: any): data is ItemEffectForEvent => {
    if (!data) return true; // Optional
     if (data.itemsAddedToInventory && !Array.isArray(data.itemsAddedToInventory)) return false;
    if (data.itemsRemovedFromInventoryByName && !Array.isArray(data.itemsRemovedFromInventoryByName)) return false;
    if (data.itemsAddedToLocation && !Array.isArray(data.itemsAddedToLocation)) return false;
    if (data.itemsRemovedFromLocationByName && !Array.isArray(data.itemsRemovedFromLocationByName)) return false;
    return true;
};
const validateLocationEffectForEvent = (data: any): data is LocationEffectForEvent => {
    if (!data) return true; // Optional
    // Add more specific validation if needed
    return true;
};
const validateNpcEffectForEventArray = (data: any): data is NpcEffectForEvent[] => {
    if (!data) return true; // Optional
    if (!Array.isArray(data)) return false;
    return data.every(effect => typeof effect.npcIdTargeted === 'string' &&
      (effect.isHiddenDuringEvent === undefined || typeof effect.isHiddenDuringEvent === 'boolean')
      // Add checks for other NpcEffectForEvent fields if necessary
    );
};

const validatePotentialDiscoveriesGenerated = (data: any): data is Omit<PotentialDiscovery, 'id' | 'status' | 'firstMentionedTimestamp' | 'firstMentionedLocationKey' | 'fulfilledById'>[] => {
    if (!data) return true; // Optional
    if (!Array.isArray(data)) return false;
    const validTypes: PotentialDiscoveryType[] = ['item', 'npc', 'location'];
    const validSourceTypes: PotentialDiscoverySourceType[] = ['event_narration']; // For events, source is always event_narration
    const validRarities: MemorableEntityRarity[] = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Lore', 'Character_Self', undefined as any]; // undefined for optional

    return data.every(pd =>
        typeof pd.name === 'string' &&
        validTypes.includes(pd.type) &&
        typeof pd.descriptionHint === 'string' &&
        (pd.rarityHint === undefined || validRarities.includes(pd.rarityHint)) &&
        typeof pd.sourceTextSnippet === 'string' &&
        validSourceTypes.includes(pd.sourceType) &&
        typeof pd.sourceEntityId === 'string' // Should be the event title
    );
};


const validateEventEffectsStructure = (data: any): data is EventEffects => {
  return (
    data &&
    typeof data.eventTitle === 'string' && data.eventTitle.trim() !== '' &&
    typeof data.narration === 'string' && data.narration.trim() !== '' &&
    (data.combatNarration === undefined || data.combatNarration === null || typeof data.combatNarration === 'string') &&
    validateCharacterEffectForEvent(data.characterEffects) &&
    validateItemEffectForEvent(data.itemEffects) &&
    validateLocationEffectForEvent(data.locationEffects) &&
    validateNpcEffectForEventArray(data.npcEffects) &&
    (data.worldEffects === undefined || data.worldEffects === null || typeof data.worldEffects === 'object') &&
    (data.majorPlotPointSummary === undefined || data.majorPlotPointSummary === null || typeof data.majorPlotPointSummary === 'string') &&
    (data.visualPromptHintForEventImage === undefined || data.visualPromptHintForEventImage === null || typeof data.visualPromptHintForEventImage === 'string') &&
    (data.requiresPlayerActionToResolve === undefined || typeof data.requiresPlayerActionToResolve === 'boolean') &&
    (data.resolutionCriteriaPrompt === undefined || data.resolutionCriteriaPrompt === null || typeof data.resolutionCriteriaPrompt === 'string') &&
    (data.resolutionNpcDispositionChange === undefined || data.resolutionNpcDispositionChange === null || (typeof data.resolutionNpcDispositionChange === 'object' && typeof data.resolutionNpcDispositionChange.npcId === 'string')) &&
    (data.resolutionItemsAwardedToPlayer === undefined || data.resolutionItemsAwardedToPlayer === null || Array.isArray(data.resolutionItemsAwardedToPlayer)) &&
    validatePotentialDiscoveriesGenerated(data.potentialDiscoveriesGenerated)
  );
};

const GENERATE_COMPLEX_EVENT_DETAILS_TOOL: Tool = {
  functionDeclarations: [{
    name: "generate_complex_event_with_effects",
    description: "Generates an unexpected event based on an optional concept and intensity. An event MUST be a single, uninterrupted interaction or sequence that concludes within the current context (time and place). It should NOT automatically transition to a new location or a significantly later time. Provides initial narrative details, optional effects, image hint, resolution needs, NPC visibility, and potential new discoveries (leads). Events aim to introduce leads. Considers game context, setting, thematic consistency. Prioritizes narrative value and player engagement. Visual prompt hints for event/items must be for the game's current visual style (e.g., 'Pixel Art', 'Anime', or 'black and white traditional Chinese ink painting style' if 'Ink Painting' is the game style).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        eventTitle: { type: Type.STRING, description: "A short, catchy, and impactful title (typically 3-7 words) that captures the essence of the event. If no significant event occurs (based on low intensity input), use a mundane title like 'A Fleeting Sensation' or 'The Moment Passes'. MUST strongly align with the provided eventConcept if any." },
        narration: { type: Type.STRING, description: "An atmospheric and cinematic description of the INITIAL STATE and progression of the event, concluding with its natural end for the current scene (2-4 sentences). This narration MUST describe what is *actively happening* TO THE PLAYER or how the environment/NPCs are *dynamically changing*. Focus on setting the scene with an emphasis on a developing PLOT, a concrete SITUATION, or an unfolding CHALLENGE. Convey tension or new circumstances. MUST strongly align with the provided eventConcept if any. Example: If eventConcept is 'discussing a war plan', narration describes the discussion and its conclusion (e.g., 'The generals agree on the pincer maneuver. The meeting adjourns, thoughts heavy with the coming battle.')." },
        visualPromptHintForEventImage: {
            type: Type.STRING,
            description: "If the event's INITIAL STATE warrants a specific visual, provide a descriptive prompt for a DYNAMIC, FIRST-PERSON perspective [CURRENT_GAME_STYLE] image, blending location essence with event action/mood. Example for [CURRENT_GAME_STYLE]=Anime: 'First-person view of a war map, a general's finger decisively tracing a route through mountains.' Null if mundane/low intensity or visual not central. Suitable for the specified [CURRENT_GAME_STYLE]. (Optional, can be null)"
        },
        requiresPlayerActionToResolve: { type: Type.BOOLEAN, description: "True if player must actively address/interact to resolve/progress the event WITHIN THE CURRENT SCENE. False if self-contained, effects immediate, or event stage naturally concludes (e.g., meeting ends). If false, event considered over from interactive standpoint in this scene. Defaults false for mundane events. (Optional)" },
        resolutionCriteriaPrompt: { type: Type.STRING, description: "If 'requiresPlayerActionToResolve' is true, hint for player actions to progress event INITIALLY. If 'requiresPlayerActionToResolve' was true and is now false (event concluding), this can guide player on how to act on 'majorPlotPointSummary' and 'potentialDiscoveriesGenerated' (e.g., 'The war council has ended. Will you investigate the Northern Pass or gather more intelligence?'). Null if event simply narrates to a conclusion. MUST strongly align with eventConcept. Example: for 'football match', criteria 'Make a decisive play' or 'Score a goal'. (Optional, can be null)" },
        majorPlotPointSummary: { type: Type.STRING, description: "ESSENTIAL for context. If event is plot-significant or reveals important lore, summarize the key OUTCOME, DECISION, or significant LORE revealed by THIS CONCLUDED EVENT (1-2 sentences) for the game's chronicle. This summary, combined with leads, provides context for future LLM decisions when player explores related areas or acts on leads. Example: 'War plan XYZ was decided, targeting the Northern Pass.' (Optional)" },
        potentialDiscoveriesGenerated: {
            type: Type.ARRAY,
            description: "CRITICAL for story progression. If the event's outcome or revealed information logically suggests a next step, a related location, a key NPC, or a consequential item, generate 1-2 actionable leads. These leads, combined with chronicle entries, form the context for future, player-driven discoveries or subsequent emergent events. Each discovery details name, type (item, npc, location), descriptionHint, optional rarityHint, sourceTextSnippet (from narration), sourceEntityId (event title), and sourceType ('event_narration'). AIM FOR AT LEAST ONE. Especially important for dialogue-triggered lore reveals.",
            items: {
                type: Type.OBJECT,
                properties: {
                    name: { type: Type.STRING, description: "Name of the potential discovery." },
                    type: { type: Type.STRING, description: "Type: 'item', 'npc', 'location'." },
                    descriptionHint: { type: Type.STRING, description: "Brief hint about this discovery." },
                    rarityHint: { type: Type.STRING, description: "Optional rarity: 'Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Lore', 'Character_Self'. (Optional, null)" },
                    sourceTextSnippet: { type: Type.STRING, description: "Exact phrase from event narration hinting at this." },
                    sourceType: { type: Type.STRING, description: "MUST be 'event_narration'." },
                    sourceEntityId: { type: Type.STRING, description: "The title of this event."}
                },
                required: ["name", "type", "descriptionHint", "sourceTextSnippet", "sourceType", "sourceEntityId"]
            }
        },
        resolutionNpcDispositionChange: {
            type: Type.OBJECT,
            description: "Optional: Define an NPC's disposition change upon FINAL successful resolution of the event. New disposition. Must be one of: 'Neutral', 'Friendly', 'Hostile', 'Afraid'.",
            properties: {
                npcId: {type:Type.STRING},
                newDisposition: {type: Type.STRING, description: "New disposition: 'Neutral', 'Friendly', 'Hostile', 'Afraid'."}
            },
            required: ["npcId", "newDisposition"]
        },
        resolutionItemsAwardedToPlayer: {
            type: Type.ARRAY,
            description: "Optional: List items awarded to player upon FINAL successful event resolution. Rarity: 'Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'.",
            items: {
                type: Type.OBJECT,
                properties: {
                    name: {type: Type.STRING},
                    description: {type: Type.STRING},
                    itemTypeGuess: {type: Type.STRING},
                    rarity: {type: Type.STRING, description: "Rarity: 'Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'."},
                    visualPromptHint: { type: Type.STRING, description: "Visual prompt for item, suitable for game's style. (Optional, null)" }
                } ,
                required: ["name", "description", "itemTypeGuess", "rarity"]
            }
        },
        characterEffects: {
            type: Type.OBJECT,
            description: "Initial effects on player from event's start. Contribute to story/challenge, or reflect skills being tested. (Optional)",
            properties: {
                healthChange: {type: Type.NUMBER, description: "(Optional)"},
                energyChange: {type: Type.NUMBER, description: "(Optional)"},
                limbEffects: {
                    type: Type.ARRAY, description: "(Optional)",
                    items: {
                        type: Type.OBJECT, properties: {
                            limbName: {type: Type.STRING},
                            healthChange: {type: Type.NUMBER, description: "(Optional)"},
                            newStatus: {type: Type.STRING, description: "(Optional)"},
                            newHealthAbsolute: {type: Type.NUMBER, description: "(Optional)"}
                        }, required: ["limbName"]
                    }
                },
                skillXpGains: {
                    type: Type.ARRAY, description: "(Optional)",
                    items: { type: Type.OBJECT, properties: { skillName: {type: Type.STRING}, amount: {type: Type.NUMBER}}, required: ["skillName", "amount"]}
                },
                statusEffectAdded: {type: Type.STRING, description: "(Optional)"},
                statusEffectRemoved: {type: Type.STRING, description: "(Optional)"}
            }
        },
        itemEffects: {
            type: Type.OBJECT, description: "Effects on items (player/location) that advance story or present challenge. (Optional)",
            properties: {
                itemsAddedToInventory: { type: Type.ARRAY, description: "(Optional)", items: { type: Type.OBJECT, properties: { name: {type: Type.STRING}, description: {type: Type.STRING}, itemTypeGuess: {type: Type.STRING}, rarity: {type: Type.STRING, description: "Rarity: 'Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'."}, visualPromptHint: {type:Type.STRING, description: "(Optional)"} }, required: ["name", "description", "itemTypeGuess", "rarity"]} },
                itemsRemovedFromInventoryByName: { type: Type.ARRAY, description: "(Optional)", items: { type: Type.STRING } },
                itemsAddedToLocation: { type: Type.ARRAY, description: "(Optional)", items: { type: Type.OBJECT, properties: { name: {type: Type.STRING}, description: {type: Type.STRING}, itemTypeGuess: {type: Type.STRING}, rarity: {type: Type.STRING, description: "Rarity: 'Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'."}, visualPromptHint: {type:Type.STRING, description: "(Optional)"} }, required: ["name", "description", "itemTypeGuess", "rarity"]} },
                itemsRemovedFromLocationByName: { type: Type.ARRAY, description: "(Optional)", items: { type: Type.STRING } }
            }
        },
        locationEffects: {
            type: Type.OBJECT, description: "Effects on current location driving story/challenge, making environment dynamic. (Optional)",
            properties: {
                descriptionChange: {type: Type.STRING, description: "(Optional)"},
                newTemporaryNpc: {
                    type: Type.OBJECT, description: "(Optional)",
                    properties: {
                        name: { type: Type.STRING }, description: { type: Type.STRING }, appearanceDetails: { type: Type.STRING },
                        dialogueGreeting: { type: Type.STRING }, rarity: { type: Type.STRING, description: "Rarity: 'Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'."}, 
                        visualPromptHint: { type: Type.STRING },
                        initialInventoryInstructions: { type: Type.STRING, description: "(Optional)" },
                        skillSuggestions: { type: Type.ARRAY, description: "(Optional)", items: { type: Type.OBJECT, properties: { skillName: { type: Type.STRING }, level: { type: Type.NUMBER } }, required: ["skillName", "level"] } }
                    }, required: ["name", "description", "appearanceDetails", "dialogueGreeting", "rarity", "visualPromptHint"]
                },
                environmentTagAdded: { type: Type.STRING, description: "(Optional)" },
                environmentTagRemoved: { type: Type.STRING, description: "(Optional)" }
            }
        },
        npcEffects: {
            type: Type.ARRAY, description: "Effects on existing NPCs in location that are part of story/challenge, making them react dynamically. (Optional)",
            items: {
                type: Type.OBJECT, properties: {
                    npcIdTargeted: {type: Type.STRING, description:"ID of NPC affected."},
                    healthChange: {type: Type.NUMBER, description: "(Optional)"},
                    isDefeated: {type: Type.BOOLEAN, description: "(Optional)"},
                    dispositionChange: {type: Type.STRING, description: "New disposition: 'Neutral', 'Friendly', 'Hostile', 'Afraid'. (Optional)"},
                    dialogueOverride: {type: Type.STRING, description: "Specific line NPC says. (Optional)"},
                    isHiddenDuringEvent: {type: Type.BOOLEAN, description: "If true, NPC becomes temporarily hidden/non-interactive. (Optional)"}
                }, required: ["npcIdTargeted"]
            }
        },
        worldEffects: { type: Type.OBJECT, description: "Broader world effects. (Optional)", properties: { timePasses: { type: Type.STRING, description: "(Optional)" }, weatherChanges: { type: Type.STRING, description: "(Optional)" } } },
        involvedEntityIdsForPlotPoint: { type: Type.ARRAY, description: "Relevant entity IDs for plot point. (Optional)", items: { type: Type.STRING } }
      },
      required: ["eventTitle", "narration"],
    }
  } as FunctionDeclaration],
};


export const generateDynamicEventDetails = async (
  characterData: CharacterData,
  locationData: FullLocationData,
  playerInventory: GameItem[],
  recentGameLogEntries: GameLogEntry[],
  eventConcept: string | null, 
  eventIntensity: 'low' | 'medium' | 'high' | null, 
  memoryContextString: string = ""
): Promise<EventEffects> => {
  if (!API_KEY) {
    throw new Error("Gemini API key not configured for event generation.");
  }

  const playerSkillsString = formatSkillsForLLM(characterData.skills);
  const playerLimbsString = formatCharacterLimbDetailsForLLM(characterData.limbs);
  const playerInventoryString = playerInventory.map(item => `${item.name} (Rarity: ${item.rarity})`).join(', ') || 'empty';
  const recentLogString = recentGameLogEntries.slice(-3).map(e => e.text).join('\n');
  const visualStyle = characterData.visualStyle;

  let eventGuidance = "Generate a spontaneous, unexpected event.";
  if (eventConcept && eventIntensity) {
      eventGuidance = `Generate an event based on the concept: "${eventConcept}" with an intensity of "${eventIntensity}". The generated event (title, narration, resolution criteria, etc.) MUST be thematically consistent with this concept and intensity.`;
  }


  let settingSpecificInstruction = "";
  if (characterData.gameSettingType === "Historical" && characterData.initialHistoricalContext) {
    settingSpecificInstruction = `Game Setting: HISTORICAL - ${characterData.initialHistoricalContext}. Event MUST be plausible for this period/culture. NPC reactions, item appearances, etc., must be authentic. Visual prompts for event/items must be for a ${visualStyle === 'Ink Painting' ? 'black and white traditional Chinese ink painting style' : visualStyle} rendering.`;
  } else if (characterData.gameSettingType === "Fictional") {
    if (characterData.fictionalUniverseContext) {
        settingSpecificInstruction = `Game Setting: FICTIONAL universe: "${characterData.fictionalUniverseContext}". Event MUST be consistent with its lore, themes, and known character statuses. Visual prompts for event/items must be for a ${visualStyle === 'Ink Painting' ? 'black and white traditional Chinese ink painting style' : visualStyle} rendering.`;
    } else {
        settingSpecificInstruction = `Game Setting: General FICTIONAL. Event should fit character/location themes. Visual prompts for event/items must be for a ${visualStyle === 'Ink Painting' ? 'black and white traditional Chinese ink painting style' : visualStyle} rendering.`;
    }
  }

  const prompt = `You are an AI game master. ${eventGuidance}
CONTEXT:
Player: ${characterData.characterConcept} (Health: ${characterData.overallHealth}, Energy: ${characterData.currentEnergy}, Skills: ${playerSkillsString}, Limbs: ${playerLimbsString}, Rarity: ${characterData.characterRarity}, Visual Style: ${visualStyle}).
Location: ${locationData.name} (Rarity: ${locationData.rarity}, Desc: ${locationData.description}, Tags: ${locationData.environmentTags.join(', ')}).
Inventory: ${playerInventoryString}.
Recent Log: "${recentLogString}".
${memoryContextString}
${settingSpecificInstruction}
${SKILL_LEVEL_INTERPRETATION_GUIDE}

TASK: Define event details using 'generate_complex_event_with_effects' tool.
EVENT SCOPE: An event MUST be a single, uninterrupted interaction or sequence that concludes within the current context (time and place). It should NOT automatically transition to a new location or a significantly later time. For example, if an event is a 'discussion about a war plan,' it concludes when the discussion ends. The actual attack is a *separate* potential future event, likely triggered by the player acting on leads generated from this discussion.
- Title: Catchy, 3-7 words. If truly mundane (for low intensity), title like "A Fleeting Sensation". MUST align with provided 'eventConcept'.
- Narration: An atmospheric and cinematic description of the INITIAL STATE and progression of the event, concluding with its natural end for the current scene (2-4 sentences). This narration MUST describe what is *actively happening* TO THE PLAYER or how the environment/NPCs are *dynamically changing*. Focus on setting the scene with an emphasis on a developing PLOT, a concrete SITUATION, or an unfolding CHALLENGE. Convey tension or new circumstances. MUST strongly align with the provided eventConcept if any. For example, if the eventConcept is 'Guan Yu outlines a bold maneuver', the narration should detail THE MANEUVER ITSELF or the IMMEDIATE NEXT STEP/IMPLICATION, not just him leaning over a map.
- Visual Prompt Hint: Optional, for event's FIRST-PERSON visual, merging location & event. MUST specify "a detailed ${visualStyle === 'Ink Painting' ? 'black and white traditional Chinese ink painting style' : visualStyle} style illustration of...". Null if mundane/low intensity.
- Resolution: 'requiresPlayerActionToResolve' (boolean), 'resolutionCriteriaPrompt' (string hint, optional). If event stage naturally concludes (e.g., meeting ends), 'requiresPlayerActionToResolve' should be 'false'. Criteria should guide meaningful interaction/challenges or, if event is concluding, guide player towards using generated leads/chronicle info. MUST align with 'eventConcept'.
- majorPlotPointSummary: ESSENTIAL for context. If event is plot-significant or reveals important lore, summarize the key OUTCOME, DECISION, or significant LORE revealed by THIS CONCLUDED EVENT (1-2 sentences) for the game's chronicle. This summary, combined with leads, provides context for future LLM decisions. If the event introduces significant lore from its inception (e.g. reading a prophecy), this field can capture that.
- potentialDiscoveriesGenerated: CRITICAL for story progression. If the event's outcome logically suggests a next step (related location, NPC, item), generate 1-2 actionable leads. These leads, combined with chronicle entries, form the context for future, player-driven discoveries or subsequent emergent events. AIM FOR AT LEAST ONE.
- Effects: Character, item, location, NPC effects should contribute to STORY or CHALLENGE. Reflect potential consequences (positive/negative/mixed) based on context and player skills.
- Consistency & Challenge: Ensure thematic coherence. Events should present meaningful gameplay, a twist, a problem to solve, or significant lore reveal. Avoid purely observational events unless 'low' intensity. Player skills and choices should matter for outcomes if event becomes interactive. The event's theme and challenges MUST strongly reflect the input 'eventConcept' and 'eventIntensity'.
NARRATIVE FOCUS FOR DIALOGUE-TRIGGERED EVENTS: If the 'eventConcept' clearly stems from a dialogue interaction (e.g., "NPC Enraged", "Secret Revealed", "Prophecy Uncovered", "Strategy Outlined"):
    - 'narration' should vividly describe THE SPECIFIC DETAILS of the situation developing FROM THE DIALOGUE (e.g., if a strategy is outlined, the narration should summarize the core elements of that strategy or the immediate next step it implies, and its conclusion).
    - 'majorPlotPointSummary' is HIGHLY ENCOURAGED if the event significantly alters the story, reveals critical lore, or changes character relationships/statuses. This summary MUST capture the key details for a chronicle entry, including relevant lore details.
    - 'potentialDiscoveriesGenerated' should be considered if the event uncovers new leads (items, locations, NPCs, or further lore hints related to the dialogue).
    - 'npcEffects' should reflect the NPC's reaction and any change in disposition or actions.
    - 'resolutionCriteriaPrompt' (if event was interactive and is now concluding) should be thematically linked to the dialogue trigger and its consequences, prompting specific follow-up related to the revealed information or situation.

CRITICAL: Invoke 'generate_complex_event_with_effects' tool. Adhere to schema. Tool call is ONLY valid output. If no significant event, make 'eventTitle' mundane, 'narration' brief, 'requiresPlayerActionToResolve' false, and omit most effects.
Replace '[CURRENT_GAME_STYLE]' in tool schema descriptions with '${visualStyle === 'Ink Painting' ? 'black and white traditional Chinese ink painting style' : visualStyle}'.`;

  return callLLMWithToolAndValidateArgs(
    prompt,
    GENERATE_COMPLEX_EVENT_DETAILS_TOOL,
    validateEventEffectsStructure,
    "Invalid event effects structure (check title, narration, resolution, discoveries, effects, consistency with context/setting/universe/style/eventConcept, event scope)",
    "generateDynamicEventDetails"
  );
};


// --- Tool for Player-Initiated Attack on NPC ---
const GENERATE_ATTACK_CONSEQUENCES_TOOL: Tool = {
  functionDeclarations: [{
    name: "generate_attack_consequences",
    description: "Determines consequences of player attacking an NPC. Considers combat skills of both, NPC rarity/status, memory context, game setting/universe. Provides combat narration, effects on both, and resolution needs if combat continues. Visual prompts hints for items/event must be for game's current visual style (e.g., 'Pixel Art', 'Anime', or 'black and white traditional Chinese ink painting style' if 'Ink Painting' is the game style).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        eventTitle: { type: Type.STRING, description: "E.g., 'Skirmish with [NPC Name]', 'Assault on [NPC Name]'." },
        narration: { type: Type.STRING, description: "Initial cinematic narration of player's attack action and NPC's immediate reaction (2-3 sentences). Reflects skills. Focus on IMPACT and STORY, not just visual detail." },
        combatNarration: {type: Type.STRING, nullable: true, description: "Detailed blow-by-blow of this combat round. (Optional)"},
        visualPromptHintForEventImage: { type: Type.STRING, nullable: true, description: "Optional: Prompt for dynamic [CURRENT_GAME_STYLE] image of combat. E.g., 'First-person view: narrowly dodging a goblin's rusty scimitar swing in a dark cave.' Null if not visually distinct." },
        requiresPlayerActionToResolve: { type: Type.BOOLEAN, description: "True if combat continues, false if NPC defeated or player defeated/flees." },
        resolutionCriteriaPrompt: { type: Type.STRING, nullable: true, description: "If combat continues, hint for next player action (e.g., 'Press the attack!', 'Defend yourself!', 'Look for an escape!'). (Optional)" },
        characterEffects: {
            type: Type.OBJECT,
            nullable: true,
            description: "Effects on player. (Optional)",
            properties: {
                healthChange: {type: Type.NUMBER, nullable: true, description: "Numeric change in health. (Optional)"},
                energyChange: {type: Type.NUMBER, nullable: true, description: "Numeric change in energy. (Optional)"},
                limbEffects: {
                    type: Type.ARRAY, nullable: true, description: "Effects on specific limbs. (Optional)",
                    items: {
                        type: Type.OBJECT, properties: {
                            limbName: {type: Type.STRING},
                            healthChange: {type: Type.NUMBER, nullable: true, description: "Change in limb health. (Optional)"},
                            newStatus: {type: Type.STRING, nullable: true, description: "New status for the limb. (Optional)"},
                            newHealthAbsolute: {type: Type.NUMBER, nullable: true, description: "Absolute new health (0-100) for the limb. (Optional)"}
                        }, required: ["limbName"]
                    }
                },
                skillXpGains: {
                    type: Type.ARRAY, nullable: true, description: "XP gains for skills. (Optional)",
                    items: { type: Type.OBJECT, properties: { skillName: {type: Type.STRING}, amount: {type: Type.NUMBER}}, required: ["skillName", "amount"]}
                },
                statusEffectAdded: {type: Type.STRING, nullable: true, description: "Descriptive status effect added. (Optional)"},
                statusEffectRemoved: {type: Type.STRING, nullable: true, description: "Descriptive status effect removed. (Optional)"}
            }
        },
        npcEffects: {
            type: Type.ARRAY,
            nullable: true,
            description: "Effects on NPCs (target NPC primarily). (Optional)",
            items: {
                type: Type.OBJECT, properties: {
                    npcIdTargeted: {type: Type.STRING, description:"ID of the NPC affected."},
                    healthChange: {type: Type.NUMBER, nullable: true, description: "(Optional)"},
                    isDefeated: {type: Type.BOOLEAN, nullable: true, description: "(Optional)"},
                    dispositionChange: {type: Type.STRING, nullable: true, description: "New disposition. Must be one of: 'Neutral', 'Friendly', 'Hostile', 'Afraid'. (Optional)"}, // Enum in description
                    dialogueOverride: {type: Type.STRING, nullable: true, description: "A specific line NPC says. (Optional)"},
                    isHiddenDuringEvent: {type: Type.BOOLEAN, nullable: true, description: "If true, this NPC becomes temporarily hidden or non-interactive during the event. (Optional)"}
                }, required: ["npcIdTargeted"]
            }
        },
        itemEffects: {
            type: Type.OBJECT,
            nullable: true,
            description: "Items dropped by NPC, etc. (Optional)",
            properties: {
                 itemsAddedToInventory: { type: Type.ARRAY, nullable: true, description: "Items added to player inventory. (Optional)", items: { type: Type.OBJECT, properties: { name: {type: Type.STRING}, description: {type: Type.STRING}, itemTypeGuess: {type: Type.STRING}, rarity: {type: Type.STRING, description: "Rarity. Must be one of: 'Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'."}, visualPromptHint: {type:Type.STRING, nullable: true, description: "(Optional)"} }, required: ["name", "description", "itemTypeGuess", "rarity"]} },
                itemsRemovedFromInventoryByName: { type: Type.ARRAY, nullable: true, description: "Names of items removed from inventory. (Optional)", items: { type: Type.STRING } },
                itemsAddedToLocation: { type: Type.ARRAY, nullable: true, description: "Items added to current location. (Optional)", items: { type: Type.OBJECT, properties: { name: {type: Type.STRING}, description: {type: Type.STRING}, itemTypeGuess: {type: Type.STRING}, rarity: {type: Type.STRING, description: "Rarity. Must be one of: 'Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'."}, visualPromptHint: {type:Type.STRING, nullable: true, description: "(Optional)"} }, required: ["name", "description", "itemTypeGuess", "rarity"]} },
                itemsRemovedFromLocationByName: { type: Type.ARRAY, nullable: true, description: "Names of items removed from location. (Optional)", items: { type: Type.STRING } }
            }
        },
        majorPlotPointSummary: { type: Type.STRING, nullable: true, description: "If attack is plot-significant (e.g., a key NPC defeated). This should capture chronicle-worthy details." }, // Enhanced description
        involvedEntityIdsForPlotPoint: { type: Type.ARRAY, nullable: true, description: "Player, NPC ID, etc. (Optional)", items: {type: Type.STRING} },
        potentialDiscoveriesGenerated: {
            type: Type.ARRAY,
            nullable: true,
            description: "Leads revealed by combat. (Optional)",
            items: {
                 type: Type.OBJECT,
                properties: {
                    name: { type: Type.STRING, description: "Name of the potential discovery." },
                    type: { type: Type.STRING, description: "Type of the discovery. Must be one of: 'item', 'npc', 'location'." }, // Enum in description
                    descriptionHint: { type: Type.STRING, description: "A brief hint about this discovery." },
                    rarityHint: { type: Type.STRING, nullable: true, description: "Implied rarity. Must be one of: 'Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Lore', 'Character_Self'. (Optional)" }, // Enum in description
                    sourceTextSnippet: { type: Type.STRING, description: "The exact phrase from event narration hinting at this." },
                    sourceType: { type: Type.STRING, description: "MUST be 'event_narration'." }, // Enum in description
                    sourceEntityId: { type: Type.STRING, description: "The title of this event."}
                },
                required: ["name", "type", "descriptionHint", "sourceTextSnippet", "sourceType", "sourceEntityId"]
            }
        },
      },
      required: ["eventTitle", "narration", "requiresPlayerActionToResolve"],
    },
  } as FunctionDeclaration],
};

export const generatePlayerAttackNpcConsequences = async (
  characterData: CharacterData,
  targetNpc: GameNPC,
  actionDetails: PlayerInitiatedActionEventDetails,
  memoryContextString: string = ""
): Promise<EventEffects> => {
  if (!API_KEY) {
    throw new Error("Gemini API key not configured for combat event generation.");
  }

  const playerSkillsString = formatSkillsForLLM(characterData.skills);
  const playerCombatSkill = characterData.skills.find(s => s.name === 'Combat')?.level || 0;
  const playerLimbsString = formatCharacterLimbDetailsForLLM(characterData.limbs);
  const npcSkillsString = formatSkillsForLLM(targetNpc.skills);
  const npcCombatSkill = targetNpc.skills.find(s => s.name === 'Combat')?.level || 0;
  const visualStyle = characterData.visualStyle;

  let settingSpecificInstruction = "";
  if (characterData.gameSettingType === "Historical" && characterData.initialHistoricalContext) {
    settingSpecificInstruction = `Game Setting: HISTORICAL - ${characterData.initialHistoricalContext}. Combat outcomes, NPC reactions, items must be plausible for this era/culture. Visuals in ${visualStyle === 'Ink Painting' ? 'black and white traditional Chinese ink painting style' : visualStyle}.`;
  } else if (characterData.gameSettingType === "Fictional") {
     if (characterData.fictionalUniverseContext) {
        settingSpecificInstruction = `Game Setting: FICTIONAL universe: "${characterData.fictionalUniverseContext}". Combat consistent with its lore/power levels. Visuals in ${visualStyle === 'Ink Painting' ? 'black and white traditional Chinese ink painting style' : visualStyle}.`;
    } else {
        settingSpecificInstruction = `Game Setting: General FICTIONAL. Combat outcomes fit theme. Visuals in ${visualStyle === 'Ink Painting' ? 'black and white traditional Chinese ink painting style' : visualStyle}.`;
    }
  }

  const prompt = `You are an AI game master simulating combat.
Player Character: ${characterData.characterConcept} (Combat Lvl ${playerCombatSkill}, Health: ${characterData.overallHealth}, Limbs: ${playerLimbsString}, Rarity: ${characterData.characterRarity}, Visual Style: ${visualStyle}).
Target NPC: ${targetNpc.name} (Combat Lvl ${npcCombatSkill}, Health: ${targetNpc.currentHealth || 100}, Rarity: ${targetNpc.rarity}, Disposition: ${targetNpc.disposition || 'Neutral'}, Skills: ${npcSkillsString}). NPC ID: ${targetNpc.id}.
Player Action: ${actionDetails.actionType} on NPC ID ${actionDetails.targetNpcId}.
${memoryContextString}
${settingSpecificInstruction}
${SKILL_LEVEL_INTERPRETATION_GUIDE}

TASK: Determine combat outcome using 'generate_attack_consequences' tool.
- Title: E.g., "Skirmish with [NPC Name]".
- Narration: Cinematic description of player's attack & NPC's immediate reaction. Reflect skills. Focus on IMPACT and STORY, not just visual detail. This interaction is self-contained; do not describe subsequent rounds unless combat ends here.
- Combat Narration: Optional detailed blow-by-blow of this combat round.
- Visual Prompt: Optional, for dynamic FIRST-PERSON view of combat, suitable for ${visualStyle === 'Ink Painting' ? 'black and white traditional Chinese ink painting style' : visualStyle}.
- Resolution: 'requiresPlayerActionToResolve' (true if combat continues, false if NPC defeated or player defeated/flees in this single exchange). 'resolutionCriteriaPrompt' (hint for next player action, potential challenges if combat continues).
- Effects: On player (health/energy/limb changes) & NPC (health/status, potential defeat). NPC effect MUST target ID: ${targetNpc.id}. These should reflect a CHALLENGE or consequence.
- Item Effects: NPC might drop items if defeated (context-appropriate rarity/type).
- majorPlotPointSummary: IF the attack is plot-significant (e.g., a key NPC is defeated, a major betrayal occurs, a critical quest item is fought over), provide a concise summary (1-2 sentences) of this specific outcome for the game's chronicle. This should capture the narrative weight of the event.
- Consistency: Coherent with skills, rarities, setting/universe/style. Outcome depends on relative combat skills and context.

CRITICAL: Invoke 'generate_attack_consequences'. Tool call is ONLY valid output.
Replace '[CURRENT_GAME_STYLE]' in tool schema descriptions with '${visualStyle === 'Ink Painting' ? 'black and white traditional Chinese ink painting style' : visualStyle}'.`;

  return callLLMWithToolAndValidateArgs(
    prompt,
    GENERATE_ATTACK_CONSEQUENCES_TOOL,
    validateEventEffectsStructure, // Same validator as general events
    "Invalid attack consequences structure (check title, narration, NPC effects targeting correct ID, consistency with context/skills/setting/universe/style)",
    `generatePlayerAttackNpcConsequences (Target: ${targetNpc.name})`
  );
};

// --- Tool for Event Resolution/Progression ---
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

const EVALUATE_EVENT_RESOLUTION_TOOL: Tool = {
  functionDeclarations: [{
    name: "evaluate_event_resolution_attempt",
    description: "Evaluates player's attempt to resolve/progress an event. Determines if action leads to full resolution, progression to new stage, or no change. Considers event's current criteria, player skills, items, game setting/universe. Outcomes (positive/negative/mixed) reflected in narration, effects, and story progression. Visual prompts for event/items must be for game's current visual style (e.g., 'Pixel Art', 'Anime', or 'black and white traditional Chinese ink painting style' if 'Ink Painting' is current style). The event's progression should allow for player agency and be thematically consistent with the original event concept.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        resolved: { type: Type.BOOLEAN, description: "True if player's action FULLY resolves the event. False otherwise." },
        resolutionNarration: { type: Type.STRING, description: "Briefly narrate the *direct impact and consequence* of the player's action on the event (1-2 sentences), not just a description of the action itself. E.g., 'The ancient mechanism shudders and a hidden door grinds open...' or 'Your attempt to reason with the spirit fails; it becomes more agitated.'. This narration should be CHRONICLE-FRIENDLY, summarizing the key outcome of the resolution." },
        majorPlotPointSummary: { type: Type.STRING, nullable: true, description: "If the resolution itself has distinct chronicle-worthy details not covered by resolutionNarration (e.g., a specific lore reveal during resolution), provide it here. (Optional)" },
        progressed: { type: Type.BOOLEAN, description: "True if action causes event to change state or progress to a new stage, but isn't fully resolved. False if action fully resolves or has no significant impact. (Optional, defaults false)"},
        nextStageNarration: {type: Type.STRING, nullable: true, description: "CRITICAL: If 'progressed' is true, describe the *story progression* and how the event *evolves* (2-3 sentences), CONSIDERING THE PLAYER'S ACTION AND THE ORIGINAL EVENT CONCEPT. Introduce new story elements, challenges, dangers, NPC reactions, or lore revelations that are thematically consistent. What happens TO PLAYER or what CHANGES AROUND THEM? This should be DENSE with lore/change and actively involve the player. It's not a static re-description. (Optional)"},
        updatedVisualPromptHintForEventImage: { type: Type.STRING, nullable: true, description: "If 'progressed' is true AND the visual scene changes significantly, prompt for a new [CURRENT_GAME_STYLE] image reflecting the event's new state. (Optional)" },
        updatedResolutionCriteriaPrompt: { type: Type.STRING, nullable: true, description: "If 'progressed' is true, new criteria/hint/challenge for resolving the event from its new stage. This new criteria MUST remain thematically consistent with the player's successful thematic action and the original event concept. (Optional)" },
        updatedNpcDisposition: { type: Type.OBJECT, nullable: true, description: "If FULLY resolved AND causes NPC disposition change. (Optional)", properties: { npcId: { type: Type.STRING }, newDisposition: { type: Type.STRING, description: "New disposition. Must be one of: 'Neutral', 'Friendly', 'Hostile', 'Afraid'." } }, required: ["npcId", "newDisposition"] }, // Enum in description
        itemsAwardedToPlayer: { type: Type.ARRAY, nullable: true, description: "If FULLY resolved AND items awarded. (Optional)", items: { type: Type.OBJECT, properties: { name: {type: Type.STRING}, description: {type: Type.STRING}, itemTypeGuess: {type: Type.STRING}, rarity: {type: Type.STRING, description: "Rarity. Must be one of: 'Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'."}, visualPromptHint: {type:Type.STRING, nullable: true, description:"(Optional)"} }, required: ["name", "description", "itemTypeGuess", "rarity"]} } // Enum in description
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
  const originalEventConceptHint = `Original Event Concept Hint: The event '${eventDetails.eventTitle}' started with the narration: '${eventDetails.narration.substring(0,100)}...'`; // Include a hint of original concept

  let settingSpecificInstruction = "";
  if (characterData.gameSettingType === "Historical" && characterData.initialHistoricalContext) {
    settingSpecificInstruction = `Game Setting: HISTORICAL - ${characterData.initialHistoricalContext}. Event resolution, NPC reactions, items must be plausible for this era/culture. Visuals in ${visualStyle === 'Ink Painting' ? 'black and white traditional Chinese ink painting style' : visualStyle}.`;
  } else if (characterData.gameSettingType === "Fictional") {
     if (characterData.fictionalUniverseContext) {
        settingSpecificInstruction = `Game Setting: FICTIONAL universe: "${characterData.fictionalUniverseContext}". Resolution consistent with its lore/power levels. Visuals in ${visualStyle === 'Ink Painting' ? 'black and white traditional Chinese ink painting style' : visualStyle}.`;
    } else {
        settingSpecificInstruction = `Game Setting: General FICTIONAL. Resolution fits theme. Visuals in ${visualStyle === 'Ink Painting' ? 'black and white traditional Chinese ink painting style' : visualStyle}.`;
    }
  }

  const prompt = `You are an AI game master. Player is trying to resolve/progress an event.
EVENT DETAILS:
Title: "${eventDetails.eventTitle}"
Current Narration/State: "${eventDetails.narration}"
Current Resolution Criteria Hint: "${eventDetails.resolutionCriteriaPrompt || 'No specific hint available.'}"
${originalEventConceptHint} 
Event Visual Style Context: ${visualStyle}

PLAYER & CONTEXT:
Player: ${characterData.characterConcept} (Health: ${characterData.overallHealth}, Energy: ${characterData.currentEnergy}, Skills: ${playerSkillsString}, Limbs: ${playerLimbsString}).
Inventory: ${playerInventoryString}.
Involved NPCs: ${involvedNpcsString}.
Player Command: "${playerCommandText}"
Parsed Action: ${JSON.stringify(parsedPlayerAction)}
${memoryContextString}
${settingSpecificInstruction}
${SKILL_LEVEL_INTERPRETATION_GUIDE}

TASK: Evaluate player's action. Determine if it resolves, progresses, or has no effect on event.
1.  Analyze Action: Does player's action (parsed: ${parsedPlayerAction.action}) and targets/params align with 'Resolution Criteria Hint'? OR, is the action a THEMATICALLY APPROPRIATE attempt to interact with the ORIGINAL EVENT CONCEPT (${originalEventConceptHint}) even if not perfectly matching the current hint? Consider skills, items. The OUTCOME (positive/negative/mixed) should depend on these factors and player's ingenuity. Not all attempts should succeed or be beneficial. Player's skills should DIRECTLY influence plausibility and success.
2.  Resolution ('resolved'): True if action FULLY ends event. False otherwise.
3.  Progression ('progressed'): True if action changes event state, moves to new stage, but not fully resolved. False if fully resolved or no significant impact. If the event has naturally reached its conclusion based on player's action (e.g., a meeting ends, a performance concludes), then 'resolved' can be true and 'progressed' false.
4.  Narrations:
    - 'resolutionNarration': IMPACT and CONSEQUENCE of player's action on event (1-2 sentences). Reflect success/failure/partial success based on skill checks, context, and THEMATIC RELEVANCE of the action. This narration should be CHRONICLE-FRIENDLY, summarizing the key outcome.
    - 'majorPlotPointSummary': If the resolution action itself introduces a new, distinct piece of lore or plot not covered by the main narration, summarize it here for the chronicle.
    - 'nextStageNarration': CRITICAL. If 'progressed' is true, describe STORY PROGRESSION (2-3 sentences). How does event EVOLVE *based on the player's specific (and potentially creative but thematic) action*? Introduce new story elements, challenges, dangers, NPC reactions, or lore revelations. What happens TO PLAYER or what CHANGES AROUND THEM? This should be DENSE with lore/change and actively involve the player. It's not a static re-description. If the player tries a valid thematic action, the event should progress ALONG THAT THEMATIC LINE. THIS FIELD IS NULL IF NOT PROGRESSED.
5.  Updates if Progressed:
    - 'updatedVisualPromptHintForEventImage': If scene changes significantly, prompt for NEW ${visualStyle === 'Ink Painting' ? 'black and white traditional Chinese ink painting style' : visualStyle} image.
    - 'updatedResolutionCriteriaPrompt': New hint/challenge if goalposts shift. This new criteria MUST remain thematically consistent with the player's successful thematic action and the original event concept.
6.  Rewards if Fully Resolved: 'updatedNpcDisposition', 'itemsAwardedToPlayer'.
7.  Consistency & Challenge: All outputs thematically coherent, fit event, context, game setting/universe. Event should feel challenging and outcomes earned (or consequences faced). The narrative should reflect the density of lore and the impact of change. Player agency in choosing a thematic path (if valid) should be respected.
8.  Potential Discoveries: If the event progression or resolution reveals new lore, entities, or clues, implicitly suggest them in the narration. The system handles generating explicit leads from these narrative hints.

CRITICAL: Invoke 'evaluate_event_resolution_attempt' tool. Tool call is ONLY valid output.
Replace '[CURRENT_GAME_STYLE]' in tool schema descriptions with '${visualStyle === 'Ink Painting' ? 'black and white traditional Chinese ink painting style' : visualStyle}'.`;

  return callLLMWithToolAndValidateArgs(
    prompt,
    EVALUATE_EVENT_RESOLUTION_TOOL,
    validateEventResolutionResult,
    "Invalid event resolution structure (check resolved, narration, progression fields, consistency, challenge, lore density, thematic relevance, majorPlotPointSummary)",
    `checkEventResolution (Event: ${eventDetails.eventTitle})`
  );
};


// New Tool and Service for Deciding Event Trigger
type EventDecisionFromTool = {
  shouldTriggerEvent: boolean;
  eventConcept: string | null; // e.g., "a strange glow from the nearby ruins", "an ambush by bandits"
  eventIntensity: 'low' | 'medium' | 'high' | null; // Suggested impact/complexity
};

const validateEventDecisionStructure = (data: any): data is EventDecisionFromTool => {
  const validIntensities: Array<'low' | 'medium' | 'high' | null> = ['low', 'medium', 'high', null];
  return (
    data &&
    typeof data.shouldTriggerEvent === 'boolean' &&
    (data.eventConcept === null || (typeof data.eventConcept === 'string' && data.eventConcept.trim() !== '')) &&
    (validIntensities.includes(data.eventIntensity)) &&
    // If shouldTriggerEvent is true, concept and intensity should ideally be non-null
    (data.shouldTriggerEvent ? (data.eventConcept !== null && data.eventIntensity !== null) : true)
  );
};

const DECIDE_EVENT_TRIGGER_TOOL: Tool = {
  functionDeclarations: [{
    name: "decide_event_trigger_and_concept",
    description: "Decides if an event should trigger based on player action and game context. Provides a concept and intensity if an event is warranted. Considers significance of trigger (rarity of involved entities: Epic/Legendary), character skills (Perception), location, inventory, recent logs, memory, and game setting. CRITICAL: Mundane actions or those involving Common/Uncommon entities should NOT trigger events unless context is exceptional. Events should be STORY-DRIVEN and impactful. If trigger context involves 'dialogue_interaction_with_', consider the dialogue content from Recent Log/Memory for significance.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        shouldTriggerEvent: { type: Type.BOOLEAN, description: "True if an event is warranted (primarily for Epic/Legendary triggers, or significant dialogue with Epic/Legendary NPCs), false otherwise. False for mundane triggers." },
        eventConcept: { type: Type.STRING, nullable: true, description: "If true, a brief (3-10 word) evocative concept for the event, focusing on STORY or CHALLENGE. E.g., 'The ground trembles ominously', 'NPC Enraged by Insult', 'Secret Revealed to the Council'. Null if false. (Nullable)" },
        eventIntensity: { type: Type.STRING, nullable: true, description: "If true, suggested intensity: 'low' (atmospheric, minor choice), 'medium' (direct interaction, some consequence), 'high' (significant challenge/plot). Null if false. (Nullable, Enum: low, medium, high)" } // Enum in description
      },
      required: ["shouldTriggerEvent", "eventConcept", "eventIntensity"]
    }
  } as FunctionDeclaration]
};

export const decideIfEventShouldTrigger = async (
  triggerContext: string, // e.g., "player_entered_new_location_ancient_ruins", "player_picked_up_cursed_idol_epic", "dialogue_interaction_with_epic_npc_elminster"
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
  const recentLogString = recentGameLogEntries.slice(-3).map(e => e.text).join('\n'); // This contains the recent dialogue
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
