// services/event/eventGenerationService.ts
import { API_KEY, ai, callLLMWithToolAndValidateArgs, Tool, Type, FunctionDeclaration, Schema } from '../geminiClient';
import { CharacterData, FullLocationData, GameItem, GameLogEntry, EventEffects, PlayerInitiatedActionEventDetails, CharacterEffectForEvent, ItemEffectForEvent, LocationEffectForEvent, NpcEffectForEvent, GameItemSuggestionForEvent, SuggestedNPCForEvent, ItemRarity, PotentialDiscovery, PotentialDiscoveryType, MemorableEntityRarity, PotentialDiscoverySourceType, VisualStyleType, GameNPC } from '../types';
import { formatSkillsForLLM, SKILL_LEVEL_INTERPRETATION_GUIDE, formatCharacterLimbDetailsForLLM } from '../llmPromptUtils';

// --- Validation functions for EventEffects sub-structures ---
const validateCharacterEffectForEvent = (data: any): data is CharacterEffectForEvent => {
    if (!data) return true; // Optional
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
    return true;
};
const validateNpcEffectForEventArray = (data: any): data is NpcEffectForEvent[] => {
    if (!data) return true; // Optional
    if (!Array.isArray(data)) return false;
    return data.every(effect => typeof effect.npcIdTargeted === 'string' &&
      (effect.isHiddenDuringEvent === undefined || typeof effect.isHiddenDuringEvent === 'boolean')
    );
};
const validatePotentialDiscoveriesGenerated = (data: any): data is Omit<PotentialDiscovery, 'id' | 'status' | 'firstMentionedTimestamp' | 'firstMentionedLocationKey' | 'fulfilledById'>[] => {
    if (!data) return true; // Optional
    if (!Array.isArray(data)) return false;
    const validTypes: PotentialDiscoveryType[] = ['item', 'npc', 'location'];
    const validSourceTypes: PotentialDiscoverySourceType[] = ['event_narration'];
    const validRarities: MemorableEntityRarity[] = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Lore', 'Character_Self', undefined as any];

    return data.every(pd =>
        typeof pd.name === 'string' &&
        validTypes.includes(pd.type) &&
        typeof pd.descriptionHint === 'string' &&
        (pd.rarityHint === undefined || validRarities.includes(pd.rarityHint)) &&
        typeof pd.sourceTextSnippet === 'string' &&
        validSourceTypes.includes(pd.sourceType) &&
        typeof pd.sourceEntityId === 'string'
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

// --- Tool for Spontaneous Random Events ---
export const GENERATE_COMPLEX_EVENT_DETAILS_TOOL: Tool = {
  functionDeclarations: [{
    name: "generate_complex_event_with_effects",
    description: "Generates an unexpected event based on an optional concept and intensity. An event MUST be a single, uninterrupted interaction or sequence that concludes within the current context (time and place). It should NOT automatically transition to a new location or a significantly later time. Provides initial narrative details, optional effects, image hint, resolution needs, NPC visibility, and potential new discoveries (leads). Events aim to introduce leads. Considers game context, setting, thematic consistency. Prioritizes narrative value and player engagement. Visual prompt hints for event/items must be for the game's current visual style (e.g., 'Pixel Art style', 'Anime style', 'distinctive impasto oil painting style', 'luminous watercolor painting style').",
    parameters: {
      type: Type.OBJECT,
      properties: {
        eventTitle: { type: Type.STRING, description: "A short, catchy, and impactful title (typically 3-7 words) that captures the essence of the event. If no significant event occurs (based on low intensity input), use a mundane title like 'A Fleeting Sensation' or 'The Moment Passes'. MUST strongly align with the provided eventConcept if any." },
        narration: { type: Type.STRING, description: "An atmospheric and cinematic description of the INITIAL STATE and progression of the event, concluding with its natural end for the current scene (2-4 sentences). This narration MUST describe what is *actively happening* TO THE PLAYER or how the environment/NPCs are *dynamically changing*. Focus on setting the scene with an emphasis on a developing PLOT, a concrete SITUATION, or an unfolding CHALLENGE. Convey tension or new circumstances. MUST strongly align with the provided eventConcept if any. Example: If eventConcept is 'discussing a war plan', narration describes the discussion and its conclusion (e.g., 'The generals agree on the pincer maneuver. The meeting adjourns, thoughts heavy with the coming battle.')." },
        visualPromptHintForEventImage: {
            type: Type.STRING,
            description: "If the event's INITIAL STATE warrants a specific visual, provide a descriptive prompt for a DYNAMIC, FIRST-PERSON perspective [CURRENT_GAME_STYLE] image, blending location essence with event action/mood. Example for [CURRENT_GAME_STYLE]=Anime style: 'First-person view of a war map, a general's finger decisively tracing a route through mountains.' Null if mundane/low intensity or visual not central. Suitable for the specified [CURRENT_GAME_STYLE]. (Optional, can be null)"
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
                    visualPromptHint: { type: Type.STRING, description: "Visual prompt for item, suitable for game's style (e.g. '[CURRENT_GAME_STYLE] icon of...'). (Optional, null)" }
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
                itemsAddedToInventory: { type: Type.ARRAY, description: "(Optional)", items: { type: Type.OBJECT, properties: { name: {type: Type.STRING}, description: {type: Type.STRING}, itemTypeGuess: {type: Type.STRING}, rarity: {type: Type.STRING, description: "Rarity: 'Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'."}, visualPromptHint: {type:Type.STRING, description: "(Optional, for a [CURRENT_GAME_STYLE] icon)"} }, required: ["name", "description", "itemTypeGuess", "rarity"]} },
                itemsRemovedFromInventoryByName: { type: Type.ARRAY, description: "(Optional)", items: { type: Type.STRING } },
                itemsAddedToLocation: { type: Type.ARRAY, description: "(Optional)", items: { type: Type.OBJECT, properties: { name: {type: Type.STRING}, description: {type: Type.STRING}, itemTypeGuess: {type: Type.STRING}, rarity: {type: Type.STRING, description: "Rarity: 'Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'."}, visualPromptHint: {type:Type.STRING, description: "(Optional, for a [CURRENT_GAME_STYLE] icon)"} }, required: ["name", "description", "itemTypeGuess", "rarity"]} },
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
  const currentGameStyleString = getStyleForEventImagePrompt(visualStyle);

  let eventGuidance = "Generate a spontaneous, unexpected event.";
  if (eventConcept && eventIntensity) {
      eventGuidance = `Generate an event based on the concept: "${eventConcept}" with an intensity of "${eventIntensity}". The generated event (title, narration, resolution criteria, etc.) MUST be thematically consistent with this concept and intensity.`;
  }

  let settingSpecificInstruction = "";
  if (characterData.gameSettingType === "Historical" && characterData.initialHistoricalContext) {
    settingSpecificInstruction = `Game Setting: HISTORICAL - ${characterData.initialHistoricalContext}. Event MUST be plausible for this period/culture. NPC reactions, item appearances, etc., must be authentic. Visual prompts for event/items must be for a ${currentGameStyleString} rendering.`;
  } else if (characterData.gameSettingType === "Fictional") {
    if (characterData.fictionalUniverseContext) {
        settingSpecificInstruction = `Game Setting: FICTIONAL universe: "${characterData.fictionalUniverseContext}". Event MUST be consistent with its lore, themes, and known character statuses. Visual prompts for event/items must be for a ${currentGameStyleString} rendering.`;
    } else {
        settingSpecificInstruction = `Game Setting: General FICTIONAL. Event should fit character/location themes. Visual prompts for event/items must be for a ${currentGameStyleString} rendering.`;
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

TASK: Based on the provided context and the 'eventGuidance', define the details of the event by calling the 'generate_complex_event_with_effects' tool.
Consider the following aspects when formulating the event details for the tool:
-   Event Scope: The event MUST be a single, uninterrupted interaction or sequence that concludes within the current context (time and place). It should NOT automatically transition to a new location or a significantly later time. For example, if an event is a 'discussion about a war plan,' it concludes when the discussion ends. The actual attack is a *separate* potential future event.
-   Narrative Focus: The 'narration' should describe what is *actively happening* TO THE PLAYER or how the environment/NPCs are *dynamically changing*. Focus on a developing PLOT, a concrete SITUATION, or an unfolding CHALLENGE. It must align with the provided 'eventConcept'.
-   Player Agency & Resolution: Determine if the event 'requiresPlayerActionToResolve'. If so, the 'resolutionCriteriaPrompt' should guide meaningful interaction.
-   Story Progression: If the event is plot-significant, provide a 'majorPlotPointSummary'. Crucially, generate 1-2 actionable 'potentialDiscoveriesGenerated' if the event's outcome suggests next steps.
-   Effects & Consistency: Any 'characterEffects', 'itemEffects', 'locationEffects', or 'npcEffects' should contribute to the story or challenge, reflecting context and player skills. Ensure thematic coherence and that the event presents meaningful gameplay. The event's theme and challenges MUST strongly reflect the input 'eventConcept' and 'eventIntensity'.
-   Dialogue-Triggered Events: If the 'eventConcept' stems from dialogue, ensure the narration, plot summary, and discoveries reflect the specifics of that dialogue.

CRITICAL: Invoke 'generate_complex_event_with_effects' tool. Adhere strictly to its schema, using the parameter descriptions within the tool's definition to guide your inputs. Tool call is ONLY valid output. If no significant event, make 'eventTitle' mundane, 'narration' brief, 'requiresPlayerActionToResolve' false, and omit most effects.
Replace '[CURRENT_GAME_STYLE]' in tool schema descriptions with '${currentGameStyleString}'.
For 'resolutionItemsAwardedToPlayer' and 'itemEffects.itemsAddedToInventory/itemsAddedToLocation', if a 'visualPromptHint' is provided, it should be for a '${currentGameStyleString} icon of...'.`;

  return callLLMWithToolAndValidateArgs(
    prompt,
    GENERATE_COMPLEX_EVENT_DETAILS_TOOL,
    validateEventEffectsStructure, 
    "Invalid event effects structure (check title, narration, resolution, discoveries, effects, consistency with context/setting/universe/style/eventConcept, event scope)",
    "generateDynamicEventDetails"
  );
};


// --- Tool for Player-Initiated Attack on NPC ---
export const GENERATE_ATTACK_CONSEQUENCES_TOOL: Tool = {
  functionDeclarations: [{
    name: "generate_attack_consequences",
    description: "Determines consequences of player attacking an NPC. Considers combat skills of both, NPC rarity/status, memory context, game setting/universe. Provides combat narration, effects on both, and resolution needs if combat continues. Visual prompts hints for items/event must be for game's current visual style (e.g., 'Pixel Art style', 'Anime style', 'distinctive impasto oil painting style', 'luminous watercolor painting style').",
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
                 itemsAddedToInventory: { type: Type.ARRAY, nullable: true, description: "Items added to player inventory. (Optional)", items: { type: Type.OBJECT, properties: { name: {type: Type.STRING}, description: {type: Type.STRING}, itemTypeGuess: {type: Type.STRING}, rarity: {type: Type.STRING, description: "Rarity. Must be one of: 'Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'."}, visualPromptHint: {type:Type.STRING, nullable: true, description:"(Optional, for a [CURRENT_GAME_STYLE] icon)"} }, required: ["name", "description", "itemTypeGuess", "rarity"]} },
                itemsRemovedFromInventoryByName: { type: Type.ARRAY, nullable: true, description: "Names of items removed from inventory. (Optional)", items: { type: Type.STRING } },
                itemsAddedToLocation: { type: Type.ARRAY, nullable: true, description: "Items added to current location. (Optional)", items: { type: Type.OBJECT, properties: { name: {type: Type.STRING}, description: {type: Type.STRING}, itemTypeGuess: {type: Type.STRING}, rarity: {type: Type.STRING, description: "Rarity. Must be one of: 'Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'."}, visualPromptHint: {type:Type.STRING, nullable: true, description:"(Optional, for a [CURRENT_GAME_STYLE] icon)"} }, required: ["name", "description", "itemTypeGuess", "rarity"]} },
                itemsRemovedFromLocationByName: { type: Type.ARRAY, nullable: true, description: "Names of items removed from location. (Optional)", items: { type: Type.STRING } }
            }
        },
        majorPlotPointSummary: { type: Type.STRING, nullable: true, description: "If attack is plot-significant (e.g., a key NPC defeated). This should capture chronicle-worthy details." }, 
        involvedEntityIdsForPlotPoint: { type: Type.ARRAY, nullable: true, description: "Player, NPC ID, etc. (Optional)", items: {type: Type.STRING} },
        potentialDiscoveriesGenerated: {
            type: Type.ARRAY,
            nullable: true,
            description: "Leads revealed by combat. (Optional)",
            items: {
                 type: Type.OBJECT,
                properties: {
                    name: { type: Type.STRING, description: "Name of the potential discovery." },
                    type: { type: Type.STRING, description: "Type of the discovery. Must be one of: 'item', 'npc', 'location'." }, 
                    descriptionHint: { type: Type.STRING, description: "A brief hint about this discovery." },
                    rarityHint: { type: Type.STRING, nullable: true, description: "Implied rarity. Must be one of: 'Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Lore', 'Character_Self'. (Optional)" }, 
                    sourceTextSnippet: { type: Type.STRING, description: "The exact phrase from event narration hinting at this." },
                    sourceType: { type: Type.STRING, description: "MUST be 'event_narration'." }, 
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
  const currentGameStyleString = getStyleForEventImagePrompt(visualStyle);

  let settingSpecificInstruction = "";
  if (characterData.gameSettingType === "Historical" && characterData.initialHistoricalContext) {
    settingSpecificInstruction = `Game Setting: HISTORICAL - ${characterData.initialHistoricalContext}. Combat outcomes, NPC reactions, items must be plausible for this era/culture. Visuals in ${currentGameStyleString}.`;
  } else if (characterData.gameSettingType === "Fictional") {
     if (characterData.fictionalUniverseContext) {
        settingSpecificInstruction = `Game Setting: FICTIONAL universe: "${characterData.fictionalUniverseContext}". Combat consistent with its lore/power levels. Visuals in ${currentGameStyleString}.`;
    } else {
        settingSpecificInstruction = `Game Setting: General FICTIONAL. Combat outcomes fit theme. Visuals in ${currentGameStyleString}.`;
    }
  }

  const prompt = `You are an AI game master simulating combat.
Player Character: ${characterData.characterConcept} (Combat Lvl ${playerCombatSkill}, Health: ${characterData.overallHealth}, Limbs: ${playerLimbsString}, Rarity: ${characterData.characterRarity}, Visual Style: ${visualStyle}).
Target NPC: ${targetNpc.name} (Combat Lvl ${npcCombatSkill}, Health: ${targetNpc.currentHealth || 100}, Rarity: ${targetNpc.rarity}, Disposition: ${targetNpc.disposition || 'Neutral'}, Skills: ${npcSkillsString}). NPC ID: ${targetNpc.id}.
Player Action: ${actionDetails.actionType} on NPC ID ${actionDetails.targetNpcId}.
${memoryContextString}
${settingSpecificInstruction}
${SKILL_LEVEL_INTERPRETATION_GUIDE}

TASK: Determine the combat outcome by calling the 'generate_attack_consequences' tool.
Consider the following aspects when formulating the combat details for the tool:
-   Narrative: Provide a cinematic 'narration' of the player's attack and the NPC's immediate reaction, focusing on impact and story. This interaction is self-contained.
-   Continuation: Determine if the combat 'requiresPlayerActionToResolve' or if it concludes in this exchange. If it continues, provide a 'resolutionCriteriaPrompt'.
-   Effects: Detail effects on both player ('characterEffects') and the target NPC ('npcEffects', ensuring the correct NPC ID is used). This includes health, status, and potential defeat. Consider if the NPC drops items ('itemEffects').
-   Plot Impact: If the attack is plot-significant, provide a 'majorPlotPointSummary'.
-   Consistency: Ensure the outcome is coherent with combat skills, rarities, and the game's setting/universe/style.

CRITICAL: Invoke 'generate_attack_consequences'. Adhere strictly to its schema, using the parameter descriptions within the tool's definition. Tool call is ONLY valid output.
Replace '[CURRENT_GAME_STYLE]' in tool schema descriptions with '${currentGameStyleString}'.
For item visual prompt hints in 'itemEffects', these should also specify the '[CURRENT_GAME_STYLE] icon of...'.`;

  return callLLMWithToolAndValidateArgs(
    prompt,
    GENERATE_ATTACK_CONSEQUENCES_TOOL,
    validateEventEffectsStructure, // Same validator as general events
    "Invalid attack consequences structure (check title, narration, NPC effects targeting correct ID, consistency with context/skills/setting/universe/style)",
    `generatePlayerAttackNpcConsequences (Target: ${targetNpc.name})`
  );
};