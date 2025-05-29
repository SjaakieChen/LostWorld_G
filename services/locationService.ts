
// services/locationService.ts
import { API_KEY, ai, IMAGE_MODEL_NAME, TEXT_MODEL_NAME, Tool, Type, callLLMWithToolAndValidateArgs as callLLMWithTool, callLLMForValidatedJsonText } from './geminiClient'; 
import { LocationDetails, FullLocationData, MovementContext, NewLocationGenerationResult, Skill, CharacterData, LocationRarity, PotentialDiscovery, EventEffects, ContextualExaminationResult, VisualStyleType } from './gameTypes';
import { SKILL_LEVEL_INTERPRETATION_GUIDE, formatSkillsForLLM } from './llmPromptUtils';
import { GenerateContentResponse } from "@google/genai";
import { identifyPotentialDiscoveriesInText, ProcessedTextWithDiscoveries } from './loreService';


const VALID_DIRECTIONS = ["north", "south", "east", "west"];
const VALID_RARITIES: LocationRarity[] = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];

type InitialLocationDetailsFromTool = {
  name: string;
  description: string;
  environmentTags: string[];
  visualPromptHint: string;
  validExits: string[];
  rarity: LocationRarity;
};

const getStyleForPromptInstruction = (visualStyle: VisualStyleType): string => {
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

const getStyleSpecificVisualPromptDetails = (visualStyle: VisualStyleType): string => {
  switch (visualStyle) {
    case 'Ink Painting':
      return "This style emphasizes expressive brush strokes, minimalism, the interplay of black ink and white space (negative space), and often depicts subjects with a focus on their spirit or essence (shen). Backgrounds might be textured paper, subtle ink washes, or stylized traditional Chinese landscape elements if thematic.";
    case 'Oil Painting':
      return "This style should evoke a Caspar David Friedrich oil painting. Focus on sublime, atmospheric landscapes: vast mountains, stormy seas, ancient forests, ruins, often veiled in mist or fog. Lighting should be dramatic (twilight, dawn, moonlight) creating a contemplative or melancholic mood. Emphasize depth and perspective. Colors are rich but can be subdued. Textures should suggest detailed brushwork characteristic of oil painting from the Romantic period.";
    case 'Water Painting':
      return "This style should feature soft, flowing colors and transparent washes typical of watercolor. Emphasize light, airy qualities, and a sense of fluidity in the scene. Edges may be soft or bleed slightly, characteristic of wet-on-wet or wet-on-dry techniques. Preservation of paper white for highlights is key. The overall feel should be luminous and somewhat ethereal due to the watery medium.";
    case 'Low Poly':
      return "Render with a stylized low-polygon 3D aesthetic. Use flat shading or simple gradients. Emphasize geometric forms and a clean, modern look for all elements in the scene.";
    default:
      return ""; 
  }
};

const validateInitialLocationDetailsStructure = (data: any): data is InitialLocationDetailsFromTool => {
  return (
    data &&
    typeof data.name === 'string' && data.name.trim() !== '' &&
    typeof data.description === 'string' && data.description.trim() !== '' &&
    Array.isArray(data.environmentTags) && data.environmentTags.every(tag => typeof tag === 'string' && tag.trim() !== '') &&
    typeof data.visualPromptHint === 'string' && data.visualPromptHint.trim() !== '' && 
    Array.isArray(data.validExits) && data.validExits.every(exit => typeof exit === 'string' && VALID_DIRECTIONS.includes(exit.toLowerCase())) &&
    typeof data.rarity === 'string' && VALID_RARITIES.includes(data.rarity as LocationRarity)
  );
};

export const generateLocationImage = async (visualPromptHint: string, locationName: string, visualStyle: VisualStyleType): Promise<string> => {
  let imageUrl = `https://via.placeholder.com/512x512/334155/ffffff?text=${encodeURIComponent(locationName)}`;
  if (!API_KEY) {
    console.warn("API key not configured. Using placeholder image for new location.");
    return imageUrl;
  }
  const styleForPrompt = getStyleForPromptInstruction(visualStyle);
  try {
    const finalImagePrompt = `${visualPromptHint.replace("[CHOSEN_STYLE]", styleForPrompt)} IMPORTANT: Image MUST ONLY contain scene. NO text, watermarks, labels, icons, borders, UI elements. Clean ${styleForPrompt} style. Visually appealing and interesting.`;
    const imageResponse = await ai.models.generateImages({
      model: IMAGE_MODEL_NAME,
      prompt: finalImagePrompt,
      config: { numberOfImages: 1, outputMimeType: 'image/jpeg' },
    });
    if (imageResponse.generatedImages?.[0]?.image?.imageBytes) {
      imageUrl = `data:image/jpeg;base64,${imageResponse.generatedImages[0].image.imageBytes}`;
    } else {
      console.warn(`No image data from Gemini API for location ${locationName}. Using placeholder.`);
    }
  } catch (error) {
    console.error(`Error generating image for location ${locationName}:`, error);
  }
  return imageUrl;
};


export const generateLocationDetailsAndImage = async (
  locationConcept: string,
  characterForTheme: CharacterData, 
  memoryContextString: string = ""
): Promise<FullLocationData> => {
  if (!API_KEY) throw new Error("Gemini API key is not configured.");
  const visualStyle = characterForTheme.visualStyle; 
  const styleForPromptInstruction = getStyleForPromptInstruction(visualStyle);
  const styleSpecificDetails = getStyleSpecificVisualPromptDetails(visualStyle);

  let settingSpecificInstruction = "";
  if (characterForTheme.gameSettingType === "Historical" && characterForTheme.initialHistoricalContext) {
    settingSpecificInstruction = `This is a HISTORICAL setting: ${characterForTheme.initialHistoricalContext}. All location details (name, description, tags, visual prompt hint, rarity) MUST be historically plausible and consistent with this context. For Rare/Epic/Legendary rarity, consider actual known historical sites or significant features from this period, referencing your knowledge base. Visual prompt must emphasize historical accuracy and be suitable for a ${styleForPromptInstruction} style rendering.`;
  } else if (characterForTheme.gameSettingType === "Fictional") {
    if (characterForTheme.fictionalUniverseContext) {
        settingSpecificInstruction = `This is a FICTIONAL setting within the universe: "${characterForTheme.fictionalUniverseContext}". Location details (name, description, tags, visual prompt, rarity) MUST be consistent with this universe's lore, aesthetic, and themes, suitable for a ${styleForPromptInstruction} style rendering. Epic/Legendary locations could be known places from this universe, distinct from memory.`;
    } else {
        settingSpecificInstruction = `This is a general FICTIONAL setting. Generate a location fitting the concept and character theme, suitable for a ${styleForPromptInstruction} style rendering. For Rare/Epic/Legendary locations, invent places with strong lore or significance, distinct from memory context.`;
    }
  }

  const prompt = `
You are an AI game world generator.
Player wants to start in a location based on this concept: "${locationConcept}"
Character providing thematic context: "${characterForTheme.characterConcept}" (Game Setting: ${characterForTheme.gameSettingType}, Visual Style: ${visualStyle})
${memoryContextString} 
${settingSpecificInstruction}

Output ONLY a valid JSON string with the following structure:
{
  "name": "EVOCATIVE_LOCATION_NAME",
  "description": "ATMOSPHERIC_DESCRIPTION_2_TO_3_SENTENCES",
  "environmentTags": ["TAG_1", "TAG_2", "TAG_3", "TAG_4", "TAG_5"],
  "visualPromptHint": "DETAILED_PROMPT_FOR_AI_IMAGE_GENERATION_IN_${styleForPromptInstruction.toUpperCase().replace(/\s+/g, '_')}_STYLE",
  "validExits": ["EXIT_DIRECTION_1", "EXIT_DIRECTION_2"],
  "rarity": "RARITY_LEVEL"
}

REQUIREMENTS FOR JSON FIELDS (ALL ARE MANDATORY AND MUST BE NON-EMPTY):
1.  "name": (String) Evocative name for the location.
2.  "description": (String) Atmospheric and descriptive text, 2-3 sentences long.
3.  "environmentTags": (Array of Strings) Exactly 3 to 5 descriptive tags.
4.  "visualPromptHint": (String) A detailed prompt for an AI image generator.
    - MUST start with "A detailed ${styleForPromptInstruction} style illustration of...". ${styleSpecificDetails}
    - MUST explicitly forbid text, UI elements, or watermarks in the generated image.
    - Describe the scene, lighting, key elements, and mood. Ensure the image is visually appealing, clear, and interesting, fitting the game's aesthetic and the chosen ${visualStyle}.
5.  "validExits": (Array of Strings) 1 to 3 valid cardinal directions for exits. Values MUST be from: "north", "south", "east", "west".
6.  "rarity": (String) The location's rarity. MUST be one of: "Common", "Uncommon", "Rare", "Epic", "Legendary". Rarity should reflect significance and be distinct from memory unless appropriate.

Your entire response MUST be ONLY the JSON object described above. No other text, explanations, or markdown.
Ensure ALL fields are present and contain plausible, non-empty values according to the requirements.
If "${locationConcept}" is vague, invent details fitting the character theme, visual style (${visualStyle}), and setting/universe context.
Example for ${visualStyle} (imagine visualStyle is Pixel Art):
{
  "name": "Whispering Caves Entrance (Pixel Art)",
  "description": "A narrow fissure in the cliff face, draped with ancient vines, whispers secrets on the wind. The air grows cooler as one ventures deeper, and strange echoes rebound from unseen depths, rendered in a Pixel Art style.",
  "environmentTags": ["cave", "dark", "ancient", "hidden", "echoing"],
  "visualPromptHint": "A detailed Pixel Art style illustration of a dark cave entrance in a rocky cliff, covered with vines. A faint mysterious glow emanates from within. Eerie atmosphere. Ensure the image is visually appealing. Forbid any text, numbers, or UI elements.",
  "validExits": ["south", "east"],
  "rarity": "Uncommon"
}
`;

  const locDetailsResult = await callLLMForValidatedJsonText( 
    prompt,
    validateInitialLocationDetailsStructure,
    "Invalid initial location JSON (check name, desc, tags, visual prompt, exits, rarity; visual prompt must start with 'A detailed [CHOSEN_STYLE] style illustration of...', exits valid, rarity valid, consistency with context)",
    "generateLocationDetailsAndImage (Initial - JSON Text)"
  );

  const imageUrl = await generateLocationImage(locDetailsResult.visualPromptHint, locDetailsResult.name, visualStyle);
  return { ...locDetailsResult, imageUrl };
};


const GENERATE_NEW_LOCATION_TOOL: Tool = {
  functionDeclarations: [{
    name: "describe_new_location_and_movement_with_exits",
    description: "Generates details for a new location based on movement. Considers character skills, memory context, game setting (Historical/Fictional universe), visual style (e.g., 'Pixel Art', 'Anime', 'distinctive impasto oil painting', 'luminous watercolor painting'), AND active location-related leads and player's intended location hint. Epic/Legendary locations distinct unless fulfilling lead/intent. Narration reflects Survival skill. Visual prompt hint for 'newLocationVisualPromptHint' MUST be for the specified game visual style.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        newLocationName: { type: Type.STRING, description: "Evocative name. If fulfilling lead/intent, this MUST match/align." },
        newLocationDescription: { type: Type.STRING, description: "Atmospheric description (2-3 sentences). If fulfilling lead/intent, aligns with hint." },
        newLocationEnvironmentTags: { type: Type.ARRAY, description: "3-5 tags.", items: { type: Type.STRING } },
        newLocationVisualPromptHint: { type: Type.STRING, description: "Detailed prompt for AI image generation. Crucially, this prompt MUST start with 'A detailed [CURRENT_VISUAL_STYLE_NAME] style illustration of...' where [CURRENT_VISUAL_STYLE_NAME] is the actual name of the game's visual style (e.g., 'Pixel Art', 'Anime', 'distinctive impasto oil painting', 'luminous watercolor painting'). Forbid text/UI. Ensure visually appealing, clear, interesting, and consistent with the specified style." },
        newLocationValidExits: { type: Type.ARRAY, description: "1-3 cardinal exits. One MUST lead back. Others plausible.", items: { type: Type.STRING, enum: VALID_DIRECTIONS } },
        newLocationRarity: { type: Type.STRING, enum: VALID_RARITIES, description: "Rarity. If fulfilling lead/intent, consistent. Epic/Legendary distinct from memory (unless matching lead/intent), influenced by Perception/plot points and game setting/universe." },
        movementNarration: { type: Type.STRING, description: "Narration (1-2 sentences) of movement, reflecting Survival skill." },
      },
      required: ["newLocationName", "newLocationDescription", "newLocationEnvironmentTags", "newLocationVisualPromptHint", "newLocationValidExits", "newLocationRarity", "movementNarration"],
    },
  }],
};

type NewLocationGenerationFromTool = {
  newLocationName: string; newLocationDescription: string; newLocationEnvironmentTags: string[];
  newLocationVisualPromptHint: string; newLocationValidExits: string[]; newLocationRarity: LocationRarity;
  movementNarration: string;
};

const validateNewLocationGenerationStructure = (data: any, visualStyle: VisualStyleType): data is NewLocationGenerationFromTool => {
  const styleNameForValidation = getStyleForPromptInstruction(visualStyle).toLowerCase();
  return data && typeof data.newLocationName === 'string' && data.newLocationName.trim() !== '' &&
    typeof data.newLocationDescription === 'string' && data.newLocationDescription.trim() !== '' &&
    Array.isArray(data.newLocationEnvironmentTags) && data.newLocationEnvironmentTags.every(tag => typeof tag === 'string') &&
    typeof data.newLocationVisualPromptHint === 'string' && data.newLocationVisualPromptHint.trim() !== '' && data.newLocationVisualPromptHint.toLowerCase().startsWith(`a detailed ${styleNameForValidation} style illustration of`) &&
    Array.isArray(data.newLocationValidExits) && data.newLocationValidExits.length > 0 && data.newLocationValidExits.every(exit => typeof exit === 'string' && VALID_DIRECTIONS.includes(exit.toLowerCase())) &&
    typeof data.newLocationRarity === 'string' && VALID_RARITIES.includes(data.newLocationRarity as LocationRarity) &&
    typeof data.movementNarration === 'string' && data.movementNarration.trim() !== '';
};


export const generateNewLocationDetailsAndNarration = async (
  context: MovementContext, 
  memoryContextString: string = ""
): Promise<NewLocationGenerationResult> => {
  if (!API_KEY) throw new Error("Gemini API key is not configured.");
  
  const visualStyle = context.visualStyle; 
  const styleNameForLLMPrompt = getStyleForPromptInstruction(visualStyle);
  const styleSpecificDetailsForHint = getStyleSpecificVisualPromptDetails(visualStyle);

  const oppositeDirectionMap: Record<string, string> = { north: "south", south: "north", east: "west", west: "east" };
  const requiredExitBack = oppositeDirectionMap[context.direction.toLowerCase()] || context.direction;
  const survivalSkill = context.skills.find(s => s.name === 'Survival'); const survivalLevel = survivalSkill?.level || 0;
  const perceptionSkill = context.skills.find(s => s.name === 'Perception'); const perceptionLevel = perceptionSkill?.level || 0;

  let settingSpecificInstruction = "";
  let loreContextInstruction = "";
  if (context.gameSettingType === "Historical" && context.initialHistoricalContext) {
    settingSpecificInstruction = `The game setting is HISTORICAL: ${context.initialHistoricalContext}. The NEW location (name, desc, tags, visual, RARITY) MUST be plausible and historically consistent. For Rare/Epic/Legendary, consider actual known sites or significant features from this period if they fit, otherwise invent plausibly. Avoid anachronisms. All visual descriptions should be suitable for a ${styleNameForLLMPrompt} style rendering.`;
    loreContextInstruction = `Historical Context: ${context.initialHistoricalContext}. Visual Style: ${visualStyle}.`;
  } else if (context.gameSettingType === "Fictional") {
    if (context.fictionalUniverseContext) {
        settingSpecificInstruction = `The game setting is FICTIONAL within universe: "${context.fictionalUniverseContext}". The NEW location MUST be consistent with this universe's established lore, geography, and themes, suitable for a ${styleNameForLLMPrompt} style rendering. Epic/Legendary locations could be iconic places from this universe, distinct from memory unless fulfilling a lead or a very plausible player intent.`;
        loreContextInstruction = `Fictional Universe: ${context.fictionalUniverseContext}. Visual Style: ${visualStyle}.`;
    } else {
        settingSpecificInstruction = `The game setting is general FICTIONAL. The NEW location should fit the character and prior location's theme, suitable for a ${styleNameForLLMPrompt} style rendering. For Rare/Epic/Legendary, invent lore-rich places, distinct from memory unless fulfilling a lead or a very plausible player intent.`;
        loreContextInstruction = `Visual Style: ${visualStyle}.`;
    }
  }

  let leadsContext = "No specific location-related leads are currently active.";
  const locationLeads = context.potentialDiscoveries?.filter(pd => pd.type === 'location' && pd.status === 'mentioned') || [];
  if (locationLeads.length > 0) {
    leadsContext = `Active Location-Related Leads (Rumors):\n${locationLeads.map(lead => `- Rumored Location: "${lead.name}" (Type: ${lead.type}, Hint: ${lead.descriptionHint}, Rarity Hint: ${lead.rarityHint || 'Unknown'}). Source: ${lead.sourceTextSnippet.substring(0, 50)}...`).join('\n')}`;
  }
  
  let playerIntentContext = "";
  if (context.intendedLocationTypeHint) {
    playerIntentContext = `Player has expressed a WEAK INTENT to find a location like: "${context.intendedLocationTypeHint}".`;
  }

  const prompt = `Character ${context.characterConcept} (Survival Lvl ${survivalLevel}, Perception Lvl ${perceptionLevel}) moves ${context.direction.toLowerCase()} from "${context.previousLocation.name}" (Rarity: ${context.previousLocation.rarity}). Game Visual Style: ${visualStyle}.
Skills: ${formatSkillsForLLM(context.skills)}. ${SKILL_LEVEL_INTERPRETATION_GUIDE}
Prev Loc: "${context.previousLocation.description}", Tags: [${context.previousLocation.environmentTags.join(', ')}], Exits: [${context.previousLocation.validExits.join(', ')}].
${loreContextInstruction}
${leadsContext}
${playerIntentContext}
${memoryContextString}
${context.recentStorySummary ? `Recent context: ${context.recentStorySummary}` : ''}

PRIMARY DIRECTIVE (Overrules everything else): The NEW location MUST be a logically plausible and geographically coherent continuation from the previous location, given the direction of travel. Adherence to the game's established setting (${context.gameSettingType === "Historical" ? "Historical context" : "Fictional Universe lore, including its known geography and travel limitations"}) and VISUAL STYLE (${visualStyle}) is PARAMOUNT. ${settingSpecificInstruction} Player cannot "will" locations into existence if they don't make sense.

Generate NEW location details:
1.  CONTEXT & CONSISTENCY: Logical continuation from previous location, considering direction and character skills. New location makes sense as adjacent area.
2.  LEAD/INTENT FULFILLMENT (Secondary, WEAK Considerations):
    - Consider Player's Intent: If an 'intendedLocationTypeHint' ("${context.intendedLocationTypeHint || 'None'}") is provided, you MAY try to generate a location of that type IF AND ONLY IF it perfectly aligns with the PRIMARY DIRECTIVE.
    - Consider Leads: If an active location-related lead from "${leadsContext}" can be FULFILLED *WITHOUT violating the PRIMARY DIRECTIVE*, then you MAY fulfill it.
    - PRIORITY: If both player intent and lead are plausible, lean towards one creating compelling narrative or aligning better with lore/setting/style, while adhering to PRIMARY DIRECTIVE.
    - REFUSAL: If fulfilling player intent or lead is implausible, DO NOT fulfill it. Generate a different, more fitting location based on the PRIMARY DIRECTIVE.
3.  VARIETY: Distinct from previous location, unless logically similar or fulfilling lead/plausible intent.
4.  RARITY: Influenced by prev rarity, direction, Perception, plot points, game setting/universe. If fulfilling lead/intent, rarity matches/consistent with hint. Epic/Legendary distinct from memory unless matching lead/plausible intent.
5.  EXITS: MUST include exit towards "${requiredExitBack}". 0-2 additional plausible exits. Total 1-3.
6.  NARRATION & VISUAL PROMPT:
    - Movement Narration: Journey/arrival (1-2 sentences). MUST reflect Survival skill Lvl ${survivalLevel}.
    - New Location Visual Prompt Hint: This is for the 'newLocationVisualPromptHint' tool parameter. It MUST be a detailed prompt for an AI image generator. It MUST start with 'A detailed ${styleNameForLLMPrompt} style illustration of...'. ${styleSpecificDetailsForHint}. Ensure the image would be visually appealing, clear, interesting, and consistent with the ${styleNameForLLMPrompt} style. Forbid text/UI elements in the image.

DO NOT include 'unexpectedEventDetails'.

CRITICAL: You MUST invoke the tool named 'describe_new_location_and_movement_with_exits'. Arguments MUST adhere strictly to its schema. For 'newLocationVisualPromptHint', ensure it starts with 'A detailed ${styleNameForLLMPrompt} style illustration of...' as required by the schema, where '${styleNameForLLMPrompt}' is used as the actual style name.
DO NOT output details as plain text/JSON. Tool call is ONLY valid way.`;

  const result = await callLLMWithTool(
    prompt, GENERATE_NEW_LOCATION_TOOL, (data): data is NewLocationGenerationFromTool => validateNewLocationGenerationStructure(data, visualStyle), 
    `Invalid new location (check exits, rarity, lead/intent fulfillment, Survival in narration, known entity conflicts, visual prompt for ${styleNameForLLMPrompt} style, visual appeal, setting/universe/style consistency, logical continuation)`,
    "generateNewLocationDetailsAndNarration"
  );
  if (!result.newLocationValidExits.map(e => e.toLowerCase()).includes(requiredExitBack)) {
    console.warn(`LLM failed to include required exit '${requiredExitBack}'. Adding manually.`);
    if (!result.newLocationValidExits.map(e => e.toLowerCase()).includes(requiredExitBack)) result.newLocationValidExits.push(requiredExitBack);
  }
  return {
    newLocationDetails: { name: result.newLocationName, description: result.newLocationDescription, environmentTags: result.newLocationEnvironmentTags, visualPromptHint: result.newLocationVisualPromptHint, validExits: [...new Set(result.newLocationValidExits.map(e => e.toLowerCase()))], rarity: result.newLocationRarity },
    movementNarration: result.movementNarration,
  };
};

export const elaborateOnLocationDescription = async (
  location: FullLocationData, 
  characterData: CharacterData, 
  currentLocationKey: string, 
  memoryContextString: string = ""
): Promise<ProcessedTextWithDiscoveries> => {
  if (!API_KEY) throw new Error("Gemini API key is not configured.");
  const perceptionSkill = characterData.skills.find(s => s.name === 'Perception'); const perceptionLevel = perceptionSkill?.level || 0;
  const visualStyle = characterData.visualStyle;
  const styleContext = getStyleForPromptInstruction(visualStyle); 
  const characterContext = `Character: ${characterData.characterConcept} (Perception Lvl ${perceptionLevel}). Game Setting: ${characterData.gameSettingType}. Visual Style: ${visualStyle}.`;
  
  let settingSpecificElaborationInstruction = "";
  if (characterData.gameSettingType === 'Historical' && characterData.initialHistoricalContext) {
    settingSpecificElaborationInstruction = `Elaboration MUST be consistent with historical context: ${characterData.initialHistoricalContext} and presented as if observed in a ${styleContext} world. If location is a known historical site, draw from its history.`;
  } else if (characterData.gameSettingType === 'Fictional') {
    if (characterData.fictionalUniverseContext) {
        settingSpecificElaborationInstruction = `Elaboration MUST be consistent with the lore of the fictional universe: "${characterData.fictionalUniverseContext}" and the game's ${styleContext} style. If location is a known place in this universe, expand on its lore.`;
    } else {
        settingSpecificElaborationInstruction = `Elaboration should be consistent with a general fantasy/sci-fi theme fitting the location and character, and the game's ${styleContext} style.`;
    }
  }

  let elaborationInstruction = `Provide more detailed description of this location (history, points of interest, lore). Build upon existing info. 2-4 paragraphs.`;
  if (location.rarity === 'Epic' || location.rarity === 'Legendary') elaborationInstruction += ` As location is ${location.rarity}, details reflect significance/history/lore.`;
  
  const prompt = `Player learns more about location.
Name: ${location.name}, Current Desc: ${location.description}, Tags: ${location.environmentTags.join(', ')}, Rarity: ${location.rarity}. Game Visual Style: ${visualStyle}.
${characterContext} ${SKILL_LEVEL_INTERPRETATION_GUIDE} (Perception Lvl ${perceptionLevel} might reveal more).
${memoryContextString}
Task: ${elaborationInstruction} ${settingSpecificElaborationInstruction} Output ONLY rich, descriptive factual text. No markdown.
If you mention any specific named items, people, or locations that sound important, unique, or part of a legend/quest, make a mental note but DO NOT use any special formatting or markup in your direct speech output. The game system will handle identifying these hints separately.`;
  try {
    const response = await ai.models.generateContent({ model: TEXT_MODEL_NAME, contents: prompt });
    const rawLocationElaborationText = response.text;
    if (rawLocationElaborationText?.trim()) {
      const loreProcessingResult: ProcessedTextWithDiscoveries = await identifyPotentialDiscoveriesInText(
        rawLocationElaborationText,
        'item_text', 
        currentLocationKey, 
        characterData,
        currentLocationKey,
        memoryContextString
      );
      return loreProcessingResult;
    }
    console.warn(`Elaboration for location ${location.name} resulted in empty response.`, response);
    const fallbackText = "Further observation reveals no additional significant details.";
    return { rawText: fallbackText, processedText: fallbackText, potentialDiscoveries: [] };
  } catch (error: any) {
    console.error(`Error elaborating on location ${location.name}:`, error);
    const errorText = `Error recalling more about ${location.name}. (Error: ${error.message || 'Unknown'})`;
     return { rawText: errorText, processedText: errorText, potentialDiscoveries: [] };
  }
};


const EXAMINE_CONTEXTUAL_DETAIL_TOOL: Tool = {
  functionDeclarations: [{
    name: "describe_contextual_detail_examination",
    description: "Describes player's examination of a non-object detail mentioned in location/event text. Provides narration. May reveal lore hints. Considers Perception skill, game setting/universe, and visual style (e.g., 'Pixel Art', 'Anime', 'distinctive impasto oil painting', 'luminous watercolor painting').",
    parameters: {
      type: Type.OBJECT,
      properties: {
        narration: { type: Type.STRING, description: "Descriptive narration (1-3 sentences) of what player observes when examining the detail. Reflects Perception skill, game setting/universe, and visual style. If detail isn't truly present or significant, narration indicates this (e.g., 'You look closer at the fissure, but it seems to be a common crack in the rock.')." },
      },
      required: ["narration"],
    },
  }]
};

type ExamineContextualDetailFromTool = { narration: string };

const validateExamineContextualDetailStructure = (data: any): data is ExamineContextualDetailFromTool => {
  return data && typeof data.narration === 'string' && data.narration.trim() !== '';
};


export const examineContextualDetail = async (
  detailToExamine: string,
  characterData: CharacterData, 
  locationData: FullLocationData,
  eventDetails: EventEffects | null,
  currentLocationKey: string,
  memoryContextString: string
): Promise<ContextualExaminationResult> => {
  if (!API_KEY) throw new Error("Gemini API key is not configured.");
  
  const perceptionSkill = characterData.skills.find(s => s.name === 'Perception');
  const perceptionLevel = perceptionSkill?.level || 0;
  const visualStyle = characterData.visualStyle;
  const styleContext = getStyleForPromptInstruction(visualStyle); 
  const charCtx = `Player: ${characterData.characterConcept} (Perception Lvl ${perceptionLevel}). Setting: ${characterData.gameSettingType}. Visual Style: ${visualStyle}.`;
  
  let locationContext = `Current Location: "${locationData.name}". Description: "${locationData.description}". Tags: [${locationData.environmentTags.join(', ')}].`;
  if (eventDetails) {
    locationContext += `\nOngoing Event: "${eventDetails.eventTitle}". Event Narration: "${eventDetails.narration}".`;
  }
  
  let settingSpecificInstruction = "";
  if (characterData.gameSettingType === 'Historical' && characterData.initialHistoricalContext) {
    settingSpecificInstruction = `HISTORICAL setting: ${characterData.initialHistoricalContext}. Examination results must be plausible for this era and the ${styleContext} style world.`;
  } else if (characterData.gameSettingType === 'Fictional' && characterData.fictionalUniverseContext) {
    settingSpecificInstruction = `FICTIONAL setting in universe: "${characterData.fictionalUniverseContext}". Examination results must be consistent with this universe's lore and the ${styleContext} style world.`;
  } else {
    settingSpecificInstruction = `Examination results should fit the general theme and the ${styleContext} style world.`;
  }

  const prompt = `Player is examining a detail: "${detailToExamine}".
${charCtx}
${locationContext}
${memoryContextString}
${settingSpecificInstruction}
${SKILL_LEVEL_INTERPRETATION_GUIDE}

Task: Provide a descriptive narration of what the player observes.
-   Consider if "${detailToExamine}" is plausibly part of the location description or active event narration.
-   Player's Perception skill (Lvl ${perceptionLevel}) influences detail observed. Higher perception might reveal more, or link to lore.
-   Narration should be 1-3 sentences and reflect the game's visual style (${styleContext}).
-   If the detail isn't truly present, significant, or examinable in a meaningful way, the narration should reflect that (e.g., "You look closer at the [detail], but it seems to be just a common [feature/shadow/sound].").
-   If the examination reveals information that could lead to a new discovery (item, NPC, location), hint at it within the narration. The system will process this narration for potential leads.

CRITICAL: You MUST invoke the tool 'describe_contextual_detail_examination'. Adhere strictly to schema.
`;

  try {
    const result = await callLLMWithTool(
      prompt,
      EXAMINE_CONTEXTUAL_DETAIL_TOOL,
      validateExamineContextualDetailStructure,
      "Invalid contextual examination structure. Must return narration.",
      `examineContextualDetail (Detail: ${detailToExamine})`
    );

    const loreProcessingResult = await identifyPotentialDiscoveriesInText(
      result.narration,
      'contextual_examination', 
      `location_${currentLocationKey}_detail_${detailToExamine.replace(/\s+/g, '_')}`, 
      characterData,
      currentLocationKey,
      memoryContextString
    );
    
    return {
      narration: loreProcessingResult.processedText, 
      potentialDiscoveries: loreProcessingResult.potentialDiscoveries,
    };

  } catch (error: any) {
    console.error(`Error examining contextual detail "${detailToExamine}":`, error);
    const errorNarration = `You try to examine the "${detailToExamine}", but find nothing more of note.`;
    return { narration: errorNarration, potentialDiscoveries: [] };
  }
};
