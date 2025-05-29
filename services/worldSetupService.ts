
// services/worldSetupService.ts
// Fix: Add Tool and Type to the import from ./geminiClient
import { API_KEY, ai, TEXT_MODEL_NAME, Tool, Type, callLLMForValidatedJsonText } from './geminiClient'; 
import { GenerateContentResponse } from "@google/genai";
import { CharacterData, FullLocationData, GameLogEntry, UnexpectedEventDetails, GameItem, MajorPlotPoint, MemorableEntity, EventEffects, VisualStyleType } from './gameTypes'; // Added EventEffects
import { formatSkillsForLLM, SKILL_LEVEL_INTERPRETATION_GUIDE } from './llmPromptUtils';
// Fix: Import decideIfEventShouldTrigger and generateDynamicEventDetails from eventService
import { generateDynamicEventDetails, decideIfEventShouldTrigger } from './eventService'; 


interface RefinedConceptsFromTool {
  refinedCharName?: string;
  refinedCharConcept: string;
  refinedStartLocationConcept: string;
  fictionalUniverseContext?: string | null; // Added
}

// Validator remains the same
const validateRefinedConceptsStructure = (data: any): data is RefinedConceptsFromTool => {
  if (!data) { console.error("Validation failed: data object is null or undefined."); return false; }
  if (!(typeof data.refinedCharConcept === 'string' && data.refinedCharConcept.trim() !== '')) {
    console.error("Validation failed: refinedCharConcept is not a non-empty string. Received:", data.refinedCharConcept);
    return false;
  }
  const charConceptWords = data.refinedCharConcept.trim().split(/\s+/).length;
  if (!(charConceptWords >= 5)) {
    console.error(`Validation failed: refinedCharConcept word count is ${charConceptWords} (requires >= 5). Content: "${data.refinedCharConcept}"`);
    return false;
  }
  if (!(typeof data.refinedStartLocationConcept === 'string' && data.refinedStartLocationConcept.trim() !== '')) {
    console.error("Validation failed: refinedStartLocationConcept is not a non-empty string. Received:", data.refinedStartLocationConcept);
    return false;
  }
  const locConceptWords = data.refinedStartLocationConcept.trim().split(/\s+/).length;
  if (!(locConceptWords >= 2)) {
    console.error(`Validation failed: refinedStartLocationConcept word count is ${locConceptWords} (requires >= 2). Content: "${data.refinedStartLocationConcept}"`);
    return false;
  }
  if (data.refinedCharName !== undefined && data.refinedCharName !== null && !(typeof data.refinedCharName === 'string')) {
    console.error("Validation failed: refinedCharName is present but not a string. Received:", data.refinedCharName);
    return false;
  }
  // Validate new optional field
  if (data.fictionalUniverseContext !== undefined && data.fictionalUniverseContext !== null && typeof data.fictionalUniverseContext !== 'string') {
    console.error("Validation failed: fictionalUniverseContext is present but not a string or null. Received:", data.fictionalUniverseContext);
    return false;
  }
  return true;
};

// Removed local callLLMForValidatedJsonText function

export const refineUserStartInputs = async (
  settingType: 'Fictional' | 'Historical',
  userWorldAndCharacterIdea: string,
  memoryContextString: string = ""
): Promise<RefinedConceptsFromTool> => {
  if (!API_KEY) throw new Error("Gemini API key is not configured.");

  const historicalContextInstruction = settingType === "Historical"
    ? `This is a HISTORICAL setting. Ensure outputs are plausible for history. If user mentioned a specific historical figure or period, align with that.`
    : `This is a FICTIONAL setting. Be creative.`;
  
  const fictionalUniverseInstruction = settingType === "Fictional"
    ? `If the "User Idea" clearly implies a well-known fictional universe (e.g., "Star Wars", "Middle-earth", "Game of Thrones" if 'John Snow' is mentioned), provide the name of that universe in "fictionalUniverseContext". Otherwise, "fictionalUniverseContext" MUST be null. Ensure "refinedCharConcept" and "refinedStartLocationConcept" are consistent with this identified universe if one is provided.`
    : `The "fictionalUniverseContext" field MUST be null.`;


  const prompt = `
You are an AI assistant for a game. The user provides an idea for their character and world.
Your task is to refine this idea into specific JSON fields.

User Idea: "${userWorldAndCharacterIdea}"
Setting Type: ${settingType}
${memoryContextString} 
${historicalContextInstruction}
${fictionalUniverseInstruction}

Output ONLY a valid JSON string with the following structure:
{
  "refinedCharName": "CHARACTER_NAME_HERE_OR_NULL",
  "refinedCharConcept": "CHARACTER_CONCEPT_HERE",
  "refinedStartLocationConcept": "LOCATION_CONCEPT_HERE",
  "fictionalUniverseContext": "UNIVERSE_NAME_OR_NULL"
}

REQUIREMENTS:
1.  "refinedCharName": (String or Null)
    - If the user's idea clearly specifies a character name (especially a known historical/fictional one), use that name.
    - If not, you can generate a fitting name OR provide null if the character concept is a unique identifier.
    - If the user idea is too vague, invent a plausible name for the '${settingType}' setting or use null.
2.  "refinedCharConcept": (String - MANDATORY)
    - A descriptive character concept.
    - MUST be a non-empty string, MINIMUM 5 words.
    - If the user's idea is too vague, YOU MUST INVENT a suitable character concept for the '${settingType}' setting.
3.  "refinedStartLocationConcept": (String - MANDATORY)
    - A descriptive starting location concept (a phrase or 1-2 sentences).
    - MUST be a non-empty string, MINIMUM 2 words.
    - Must align with the character concept and setting type.
    - If the user's idea is too vague, YOU MUST INVENT a suitable location concept for the '${settingType}' setting.
4.  "fictionalUniverseContext": (String or Null)
    - Only for 'Fictional' settingType: If a known fictional universe is clearly implied by the "User Idea", provide its name (e.g., "Star Wars", "Game of Thrones"). Otherwise, MUST be null.
    - For 'Historical' settingType: This MUST always be null.

Your entire response MUST be ONLY the JSON object described above. No other text, explanations, or markdown.
Ensure "refinedCharConcept" and "refinedStartLocationConcept" are ALWAYS provided and are non-empty strings meeting the minimum word counts.
If the user input is very vague (e.g., "I don't know"), invent plausible defaults for the '${settingType}' setting.
Example for vague input like "fantasy":
{
  "refinedCharName": "Elara Meadowlight",
  "refinedCharConcept": "A nimble elven archer seeking an ancient artifact in a sun-dappled forest.",
  "refinedStartLocationConcept": "An ancient, overgrown elven ruin at the edge of a sprawling, mystical forest.",
  "fictionalUniverseContext": null
}
Example for HISTORICAL vague input like "Roman times":
{
  "refinedCharName": "Marcus Drusus",
  "refinedCharConcept": "A tough Roman legionary stationed at a remote fort on the empire's northern frontier.",
  "refinedStartLocationConcept": "A windswept Roman auxiliary fort built of timber and earth, overlooking a misty barbarian forest.",
  "fictionalUniverseContext": null
}
`;

  const refinedConcepts = await callLLMForValidatedJsonText( // Use imported function
    prompt,
    validateRefinedConceptsStructure,
    "Validation failed: refinedCharConcept and/or refinedStartLocationConcept are missing, empty, or too short. Or refinedCharName is not a string if present. Check fictionalUniverseContext.",
    "refineUserStartInputs"
  );

  if (!refinedConcepts.refinedCharName?.trim() && refinedConcepts.refinedCharConcept) {
    const conceptParts = refinedConcepts.refinedCharConcept.split(/[,.]|\s-\s/); 
    if (conceptParts.length > 0) {
        const potentialName = conceptParts[0].trim();
        if (potentialName.split(/\s+/).length <= 3 && potentialName.length > 1 && !potentialName.endsWith('.')) {
            refinedConcepts.refinedCharName = potentialName;
        }
    }
    if (!refinedConcepts.refinedCharName?.trim()) { 
        refinedConcepts.refinedCharName = (settingType === "Historical" ? "Citizen" : "Adventurer");
    }
  } else if (!refinedConcepts.refinedCharName?.trim()) {
      refinedConcepts.refinedCharName = (settingType === "Historical" ? "Citizen" : "Adventurer");
  }


  return {
    refinedCharName: refinedConcepts.refinedCharName,
    refinedCharConcept: refinedConcepts.refinedCharConcept,
    refinedStartLocationConcept: refinedConcepts.refinedStartLocationConcept,
    fictionalUniverseContext: refinedConcepts.fictionalUniverseContext // Pass it through
  };
};


/**
 * Generates details for an unexpected event based on game state and context.
 * This function now calls the more specialized generateDynamicEventDetails from eventService.
 */
export const generateUnexpectedEvent = async (
  characterData: CharacterData,
  locationData: FullLocationData,
  playerInventory: GameItem[],
  recentGameLogEntries: GameLogEntry[],
  triggerContext: string,
  memoryContextString: string = ""
): Promise<EventEffects> => { 
  if (!API_KEY) {
    throw new Error("Gemini API key not configured for event generation.");
  }

  // Decide if an event should trigger and get its concept/intensity
  // Fix: Call decideIfEventShouldTrigger to get concept and intensity
  const decision = await decideIfEventShouldTrigger(
    triggerContext,
    characterData,
    locationData,
    playerInventory,
    recentGameLogEntries,
    memoryContextString
  );

  if (!decision.shouldTriggerEvent || !decision.eventConcept || !decision.eventIntensity) {
    throw new Error("NO_MAJOR_EVENT"); // Signal that no significant event should occur
  }

  // If an event should trigger, generate its full details
  try {
    // Fix: Pass decision.eventConcept and decision.eventIntensity to generateDynamicEventDetails
    // Fix: ensure eventIntensity type is correct
    const eventEffects = await generateDynamicEventDetails(
      characterData,
      locationData,
      playerInventory,
      recentGameLogEntries,
      decision.eventConcept,      
      decision.eventIntensity as 'low' | 'medium' | 'high', // Cast to specific types    
      memoryContextString
    );
    
    const noEventTitles = ["a fleeting sensation", "the moment passes", "all remains calm", "nothing noteworthy", "nothing unusual"];
    if (noEventTitles.some(t => eventEffects.eventTitle.toLowerCase().includes(t)) && 
        !eventEffects.characterEffects && 
        !eventEffects.itemEffects && 
        !eventEffects.locationEffects &&
        !eventEffects.npcEffects &&
        !eventEffects.majorPlotPointSummary) {
      throw new Error("NO_MAJOR_EVENT"); 
    }
      
    return eventEffects;
  } catch (error: any) {
    if (error.message === "NO_MAJOR_EVENT") {
      throw error;
    }
    console.error("Error in generateUnexpectedEvent (worldSetupService calling eventService):", error);
    throw new Error(`Failed to generate dynamic event: ${error.message || "Unknown error from event service"}`);
  }
};
