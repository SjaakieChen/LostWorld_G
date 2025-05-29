// services/characterService.ts
import { API_KEY, ai, callLLMWithToolAndValidateArgs, IMAGE_MODEL_NAME, TEXT_MODEL_NAME, Tool, Type } from './geminiClient';
import { CharacterData, Limb, Skill, SuggestedItemFromLLM, ItemRarity, MemorableEntityRarity, VisualStyleType } from './gameTypes'; 

type RawCharacterLimbFromTool = { name: string; status: string; health: number; };
type RawCharacterLimbs = RawCharacterLimbFromTool[];

type StartingSkillFromTool = { skillName: string; startingLevel: number }; 

type RawCharacterDetailsAndItemsFromTool = {
  characterName: string; 
  characterConcept: string;
  characterRarity: MemorableEntityRarity; 
  limbs: RawCharacterLimbs;
  startingSkills?: StartingSkillFromTool[];
  initialItemSuggestions?: SuggestedItemFromLLM[]; 
};

export type CharacterDetailsOnly = Omit<CharacterData, 'characterImageUrl'>;

export type CharacterGenerationResult = {
    characterDetails: CharacterDetailsOnly;
    initialItems?: SuggestedItemFromLLM[];
};


export const PREDEFINED_SKILLS_CONFIG: Omit<Skill, 'level' | 'experience' | 'experienceToNextLevel' | 'id'>[] = [
  { name: 'Combat', description: 'Proficiency in physical confrontations, including using weapons and unarmed techniques. Affects attack accuracy, damage, and defensive maneuvers.' },
  { name: 'Crafting', description: 'Ability to create and repair items from raw materials. Influences quality and complexity of crafted items.' },
  { name: 'Survival', description: 'Knowledge of tracking, foraging, and enduring harsh environments. Affects finding resources, navigating hazards, and effectiveness of certain consumables.' },
  { name: 'Perception', description: 'Acuity in noticing details, hidden objects, or subtle clues. Helps in finding items, spotting danger, and discerning information.' },
  { name: 'Persuasion', description: 'Skill in influencing others through dialogue, negotiation, or charm. Affects NPC reactions, quest outcomes, and trading.' },
  { name: 'Mobility', description: 'Represents agility, nimbleness, and ease of movement. May influence future actions like evasion or navigating difficult terrain.' },
];


const validateCharacterDetailsStructure = (data: any): data is RawCharacterDetailsAndItemsFromTool => {
  const validItemRarities: ItemRarity[] = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];
  const validMemorableRarities: MemorableEntityRarity[] = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Lore', 'Character_Self'];
  const charConceptWords = data.characterConcept ? data.characterConcept.trim().split(/\s+/).length : 0;

  return (
    data &&
    typeof data.characterName === 'string' && data.characterName.trim() !== '' && 
    typeof data.characterConcept === 'string' && data.characterConcept.trim() !== '' &&
    (charConceptWords >= 5 && charConceptWords <= 40) && 
    typeof data.characterRarity === 'string' && validMemorableRarities.includes(data.characterRarity as MemorableEntityRarity) && 
    Array.isArray(data.limbs) && data.limbs.length > 0 &&
    data.limbs.every((limb: any) =>
        limb && typeof limb.name === 'string' && limb.name.trim() !== '' &&
        typeof limb.status === 'string' && limb.status.trim() !== '' &&
        typeof limb.health === 'number' && limb.health >= 0 && limb.health <= 100) &&
    (data.startingSkills === undefined || (Array.isArray(data.startingSkills) && data.startingSkills.every((skill: any) =>
        skill && typeof skill.skillName === 'string' && PREDEFINED_SKILLS_CONFIG.some(s => s.name === skill.skillName) &&
        typeof skill.startingLevel === 'number' && skill.startingLevel >= 0 && skill.startingLevel <= 10 
    ))) &&
    (data.initialItemSuggestions === undefined || (Array.isArray(data.initialItemSuggestions) && data.initialItemSuggestions.every((item: any) =>
        item && typeof item.name === 'string' && item.name.trim() !== '' &&
        typeof item.description === 'string' && item.description.trim() !== '' &&
        typeof item.itemTypeGuess === 'string' && item.itemTypeGuess.trim() !== '' &&
        typeof item.rarity === 'string' && validItemRarities.includes(item.rarity as ItemRarity) &&
        typeof item.visualPromptHint === 'string' && item.visualPromptHint.trim() !== '' 
    )))
  );
};

// Helper to get the string like "Pixel Art icon" or "distinctive impasto oil painting style icon"
const getStyleForItemIconPromptType = (visualStyle: VisualStyleType): string => {
  switch (visualStyle) {
    case 'Pixel Art': return "Pixel Art icon";
    case 'Anime': return "Anime style icon";
    case 'Ink Painting': return "black and white traditional Chinese ink painting style icon";
    case 'Oil Painting': return "distinctive impasto oil painting style icon";
    case 'Water Painting': return "luminous watercolor painting style icon";
    case 'Low Poly': return "stylized low-poly 3D render style icon";
    default: return `${visualStyle} icon`;
  }
};


const CREATE_CHARACTER_DETAILS_TOOL: Tool = {
  functionDeclarations: [{
    name: "provide_character_details_and_initial_items",
    description: "Generates conceptual details for a new game character, including their name, concept, rarity, limb statuses, suggested starting skills (levels 0-10, appropriate to concept), and 0-3 fitting initial inventory items for a fantasy or historical adventure game. Avoids duplicating known Epic/Legendary entities from memory context. The game's visual style (e.g., 'Pixel Art', 'Ink Painting', 'distinctive impasto oil painting style', 'luminous watercolor painting style') will be provided in the main prompt context. Visual prompt hints for items MUST be phrased for generating an icon in that specific game visual style (e.g., if game style is 'Ink Painting', the hint would be for a 'black and white traditional Chinese ink painting style icon').",
    parameters: {
      type: Type.OBJECT,
      properties: {
        characterName: { 
            type: Type.STRING, 
            description: "A plausible name for the character. If the characterConcept itself IS a famous name, then this characterName should be that exact name. This field IS MANDATORY." 
        },
        characterConcept: { 
            type: Type.STRING, 
            description: "The character's core concept or archetype (10-40 words long). MUST directly reflect and preserve the core elements of the input character concept." 
        },
        characterRarity: {
            type: Type.STRING,
            enum: ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Character_Self'], 
            description: "The character's overall significance/rarity (Common, Uncommon, Rare, Epic, Legendary, Character_Self) based on their concept, name, and historical/fictional context. 'Einstein' or 'a dragon lord' should be Epic/Legendary. A simple 'young squire' would be Common/Uncommon. 'Character_Self' implies their self-perceived or narrative-defined importance."
        },
        limbs: {
          type: Type.ARRAY,
          description: "An array detailing the status of character's limbs (Head, Torso, Left Arm, Right Arm, Left Leg, Right Leg). All start with 100 health.",
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING, description: "Name of the limb." },
              status: { type: Type.STRING, description: "Current status, including health (e.g., 'Healthy (100HP)')." },
              health: {type: Type.NUMBER, description: "Numeric health (0-100). Should be 100 for new characters."}
            },
            required: ["name", "status", "health"],
          },
        },
        startingSkills: {
          type: Type.ARRAY,
          description: `Suggest 2-4 starting skills from predefined list: ${PREDEFINED_SKILLS_CONFIG.map(s => s.name).join(', ')}. Skill levels (0-10) MUST be highly appropriate for the character concept. **For most typical concepts, aim for a balanced distribution with many skills falling in the 2-6 (Novice to Adept) range.** Extreme values (0-1 or 9-10) should be reserved for concepts that explicitly suggest untrained/mastery in a skill, or for iconic figures. E.g., 'Lu Bu' concept gets Combat: 9-10. 'Young squire' gets Combat: 1-2. A 'seasoned traveler' might have Survival 4-5, Perception 3-4. Untrained skills are level 0. Skill proficiency scale: 0=Untrained, 1-2=Novice, 3-4=Apprentice, 5-6=Adept, 7-8=Expert, 9=Virtuoso, 10=Master. Omit if none fit.`,
          items: {
            type: Type.OBJECT,
            properties: {
              skillName: { type: Type.STRING, description: "Name of skill." },
              startingLevel: { type: Type.NUMBER, description: "Starting level (0-10) reflecting concept's proficiency." }
            },
            required: ["skillName", "startingLevel"]
          }
        },
        initialItemSuggestions: {
            type: Type.ARRAY,
            description: "Optional: Array of 0-3 suggested starting items. Must fit character concept and setting. If historical, items must be plausible. Rarity matches significance. If suggesting Epic/Legendary, ensure it's distinct from known entities in memory context unless they are iconic starting gear for a known character concept within a universe. Omit or empty array if none.",
            items: {
                type: Type.OBJECT,
                properties: {
                    name: { type: Type.STRING, description: "Item name." },
                    description: { type: Type.STRING, description: "Brief description." },
                    itemTypeGuess: { type: Type.STRING, description: "Category (e.g., 'weapon', 'tool')." },
                    rarity: { type: Type.STRING, enum: ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'], description: "Rarity." },
                    visualPromptHint: { 
                        type: Type.STRING, 
                        description: "Detailed visual description for a [GAME_STYLE_ICON_TYPE] of THE ITEM ITSELF. For example, if the game style is 'Pixel Art', the prompt might be 'Pixel Art icon of a gleaming steel longsword with a sapphire embedded in the pommel'. The specific [GAME_STYLE_ICON_TYPE] (e.g., 'Pixel Art icon', 'black and white traditional Chinese ink painting style icon', 'distinctive impasto oil painting style icon', 'luminous watercolor painting style icon') will be determined by the game's visual style provided in the main prompt context. Focus on the item's appearance; background should be simple/neutral or subtly thematic for an icon. DO NOT describe a full scene, only the item icon."
                    }
                },
                required: ["name", "description", "itemTypeGuess", "rarity", "visualPromptHint"]
            }
        }
      },
      required: ["characterName", "characterConcept", "characterRarity", "limbs"],
    },
  }],
};

const getStylePromptSegment = (visualStyle: VisualStyleType): string => {
  switch (visualStyle) {
    case 'Pixel Art': return "Pixel Art style";
    case 'Anime': return "Anime style";
    case 'Ink Painting': return "black and white traditional Chinese ink painting style";
    case 'Oil Painting': return "distinctive impasto oil painting style";
    case 'Water Painting': return "luminous watercolor painting style";
    case 'Low Poly': return "stylized low-poly 3D render style";
    default: return `${visualStyle} style`; // Fallback for any future styles
  }
};

const getStyleSpecificCharacterArtInstructions = (visualStyle: VisualStyleType): string => {
  switch (visualStyle) {
    case 'Ink Painting':
        return "Emphasize expressive brush strokes, minimalism, and the interplay of black ink and white space. Attire and features should reflect traditional Chinese aesthetics if culturally appropriate for the character, otherwise adapt the style to the character's concept.";
    case 'Oil Painting':
        return "Render in the style of a Caspar David Friedrich oil painting. Emphasize sublime, atmospheric landscapes (mist, mountains, dramatic skies) as the backdrop. If the character is present, consider a 'Rückenfigur' pose (seen from behind, contemplating nature), or a pose that evokes introspection and yearning. Lighting should be dramatic (e.g., twilight, dawn, moonlight) creating long shadows and highlighting textures. Colors should be rich yet potentially muted to convey a melancholic or contemplative mood. Attire and features should be detailed, fitting a Romantic era aesthetic if appropriate for the character concept, with a focus on how the figure interacts with the vastness of the natural world.";
    case 'Water Painting':
        return "Illustrate with soft, flowing colors and transparent washes typical of watercolor. Emphasize light and a sense of fluidity, with characteristic wet-on-wet or wet-on-dry techniques. Edges may be soft or bleed slightly. Paper white should be preserved for highlights. Attire and features should have a delicate, layered, and somewhat ethereal appearance due to the watery medium.";
    case 'Low Poly':
        return "Render with a stylized low-polygon 3D aesthetic. Use flat shading or simple gradients. Emphasize geometric forms and a clean, modern look.";
    default:
        return ""; 
  }
};


export const generatePlayerCharacterImage = async (characterData: CharacterData, locationVisualPromptHint: string): Promise<string | null> => {
  if (!API_KEY) {
    console.error("Gemini API key not configured, cannot generate player image.");
    return null;
  }
  try {
    const visualStyle = characterData.visualStyle || 'Pixel Art'; 
    const stylePromptSegment = getStylePromptSegment(visualStyle);
    const styleSpecifics = getStyleSpecificCharacterArtInstructions(visualStyle);

    let backgroundDescription = `a background that is thematically consistent with this environment: "${locationVisualPromptHint}" and rendered in a ${stylePromptSegment}.`;
    if (locationVisualPromptHint.toLowerCase().includes(`a detailed ${stylePromptSegment.replace(" style","")} illustration`)) { 
        backgroundDescription = `a background matching the style of: "${locationVisualPromptHint.replace(`A detailed ${stylePromptSegment.replace(" style","")} illustration for a fantasy adventure game.`, "").trim()}"`;
    }
    
    let attireInstruction = "";
    if (characterData.gameSettingType === "Historical" && characterData.initialHistoricalContext) {
        attireInstruction = `The character's attire, hairstyle, and any visible accessories MUST be historically appropriate for the period and culture implied by their name '${characterData.characterName}', their concept '${characterData.characterConcept}', and the game's historical context of "${characterData.initialHistoricalContext}". Prioritize authenticity. If the concept includes anachronistic elements (e.g., 'cyborg'), creatively interpret how such elements might appear or be disguised within the historical setting, all rendered in ${stylePromptSegment}.`;
    } else if (characterData.gameSettingType === "Fictional") {
        if (characterData.fictionalUniverseContext) {
            attireInstruction = `The character's attire, hairstyle, and accessories MUST be consistent with the established aesthetic of the fictional universe: "${characterData.fictionalUniverseContext}", rendered in ${stylePromptSegment}. If the character is a known entity from this universe, their appearance should match.`;
        } else {
             attireInstruction = `The character's attire should be fitting for their concept: "${characterData.characterConcept}", rendered in ${stylePromptSegment}.`;
        }
    } else { 
         const historicalKeywords = ["emperor", "dynasty", "roman", "viking", "qing", "tang", "legionary", "gladiator", "samurai", "medieval"];
         if (historicalKeywords.some(keyword => characterData.characterConcept.toLowerCase().includes(keyword) || characterData.characterName.toLowerCase().includes(keyword) || (characterData.initialHistoricalContext && characterData.initialHistoricalContext.toLowerCase().includes(keyword)) )) {
             attireInstruction = `The character's attire, hairstyle, and accessories SHOULD be historically appropriate if the concept implies a historical basis, rendered in ${stylePromptSegment}. Aim for authenticity. If the concept includes anachronistic elements (e.g., 'cyborg'), creatively interpret how such elements might appear or be disguised within the setting.`;
         }
    }
    const prompt = `Generate a full body ${stylePromptSegment} illustration/sprite of a character named "${characterData.characterName}" whose concept is: "${characterData.characterConcept}".
${attireInstruction} ${styleSpecifics}
A-pose or neutral standing pose, facing forward/slightly angled. Background: ${backgroundDescription}, character is focus. Ensure the overall image is visually appealing and interesting.
Style: ${stylePromptSegment} for character sheet.
CRITICAL: Image MUST ONLY contain the character sprite on the background. NO text, watermarks, labels, icons, borders, UI elements. Limbs correct and clear. Roughly square canvas, full figure visible.`;

    const response = await ai.models.generateImages({
        model: IMAGE_MODEL_NAME,
        prompt: prompt,
        config: { numberOfImages: 1, outputMimeType: 'image/png' },
    });
    if (response.generatedImages?.[0]?.image?.imageBytes) {
      return `data:image/png;base64,${response.generatedImages[0].image.imageBytes}`;
    } else {
      console.warn("No image data from Gemini API for player character. Response:", JSON.stringify(response, null, 2));
      return null;
    }
  } catch (error: any) {
    let errorMessage = "Unknown error during image generation";
    if (error instanceof Error) errorMessage = error.message;
    else if (typeof error === 'string') errorMessage = error;
    else if (error?.error?.message) errorMessage = error.error.message;
    console.error(`Error in generatePlayerCharacterImage (${errorMessage.includes("RESOURCE_EXHAUSTED") || errorMessage.includes("429") ? "Quota Exceeded" : "General Error"}):`, error);
    return null;
  }
};


export const generateCharacterDetails = async (
  initialCharacterConcept: string, 
  visualStyle: VisualStyleType,
  initialCharacterName?: string | null, 
  gameSetting: 'Fictional' | 'Historical' = 'Fictional',
  worldContext: string | null = null, 
  memoryContextString: string = ""
): Promise<CharacterGenerationResult> => {
  if (!API_KEY) throw new Error("Gemini API key is not configured.");
  
  const itemIconStyleString = getStyleForItemIconPromptType(visualStyle);

  let settingSpecificInstruction = "";
  if (gameSetting === "Historical" && worldContext) {
    settingSpecificInstruction = `Game setting: HISTORICAL. Specific historical context: ${worldContext}. All details (name, concept, skills, items, rarity) MUST be historically plausible and consistent with this context.`;
  } else if (gameSetting === "Fictional" && worldContext) {
    settingSpecificInstruction = `Game setting: FICTIONAL. Specific universe context: ${worldContext}. All details (name, concept, skills, items, rarity) MUST be consistent with this universe's lore and themes. Epic/Legendary items/skills should align with known powerful entities/artifacts from this universe, while remaining distinct from memory.`;
  } else if (gameSetting === "Fictional") {
    settingSpecificInstruction = `Game setting: FICTIONAL (Generic). Details should fit a general fantasy/sci-fi theme based on the character concept. You may subtly draw inspiration from common tropes but do not force it into a specific pre-existing IP if no universe context is provided.`;
  }

  const prompt = `You are an AI for a fantasy/adventure game. Your task is to finalize details for a new player character based on a pre-defined concept.
Context:
- Game's Visual Style: ${visualStyle}. For any item's 'visualPromptHint' in the tool call, you MUST provide a detailed visual description specifically for a '${itemIconStyleString}'. Focus on the item itself, with a simple/neutral background suitable for an icon. Do not describe a full scene.
- ${settingSpecificInstruction}
- Memory: ${memoryContextString || "No specific memorable entities or plot points yet."}
- Input Character Concept: "${initialCharacterConcept}"
- Input Character Name: "${initialCharacterName || 'Not specified, please generate one fitting the concept.'}"

Instructions for Character Detail Finalization:
1.  Character Identity:
    -   'characterName': Use the "Input Character Name" ("${initialCharacterName || 'Not specified'}") if provided and plausible for the "Input Character Concept" and setting. Otherwise, generate a name that FITS THE PRECISE "Input Character Concept" ("${initialCharacterConcept}") and game setting/universe context. If the concept implies a famous name from the context, use that.
    -   'characterConcept': This MUST be a direct, concise version or slight creative elaboration of the "Input Character Concept" ("${initialCharacterConcept}"). It must be 10-40 words and RETAIN ALL KEY ELEMENTS of the input. DO NOT change the core idea.
    -   'characterRarity': Assign a rarity (Common, Uncommon, Rare, Epic, Legendary, Character_Self) based on the character's concept, name, and context (historical/fictional universe if any). E.g., 'Einstein' or 'a dragon lord' or 'Luke Skywalker' should be Epic/Legendary. A 'young squire' Common/Uncommon.
2.  Limbs: Define standard limbs (Head, Torso, Left Arm, Right Arm, Left Leg, Right Leg). Each limb MUST start with 100 health and a status like "Healthy (100HP)".
3.  Starting Skills: Suggest 2-4 skills from ${PREDEFINED_SKILLS_CONFIG.map(s => s.name).join(', ')}.
    - Skill levels (0-10) MUST be highly appropriate for the "Input Character Concept" AND the game setting/universe context.
    - **For most standard character concepts, distribute starting skills primarily within the 2-6 (Novice to Adept) range. Avoid overly concentrating skills at the extreme ends (0-1 or 9-10) unless the character concept strongly dictates it (e.g., a renowned master or a completely unskilled individual in a specific area).**
    - Examples: 'Lu Bu' gets Combat: 9-10. 'Young squire' gets Combat: 1-2. 'A seasoned mercenary' might have Combat: 4-5, Survival: 3-4. 'An apprentice scholar' might have Perception: 3-4, Crafting (Scrolls): 2-3.
    - Untrained is 0. Proficiency scale: 0=Untrained, 1-2=Novice, 3-4=Apprentice, 5-6=Adept, 7-8=Expert, 9=Virtuoso, 10=Master.
4.  Initial Items: Suggest 0-3 starting items, fitting the "Input Character Concept" and game setting/universe context.
    - If Historical, items MUST be plausible. If Fictional with universe context, items should be lore-appropriate.
    - Rarity reflects significance. Epic/Legendary items must be distinct from memory context unless they are iconic starting gear for a known character concept within a universe.
    - Item 'visualPromptHint' should be a detailed description of THE ITEM ITSELF formatted for a '${itemIconStyleString}'. Do not describe background beyond simple/neutral for an icon or artistic style other than for the specified '${itemIconStyleString}'.

CRITICAL: You MUST invoke the tool named 'provide_character_details_and_initial_items'. The arguments you provide to this tool MUST adhere strictly to its schema.
The 'characterConcept' MUST be directly based on "${initialCharacterConcept}".
The 'characterName' should be consistent with "${initialCharacterName}" (if given) or the concept and universe.`;

  const charDetailsFromTool = await callLLMWithToolAndValidateArgs(
    prompt,
    CREATE_CHARACTER_DETAILS_TOOL,
    validateCharacterDetailsStructure,
    "Invalid character data (name, concept length/fidelity, rarity, limbs, skills levels, initial items). Check for known entity conflicts, skill level appropriateness (aim for 2-6 for typical concepts), and universe consistency.",
    "generateCharacterDetails"
  );

  const formattedLimbs: Limb[] = charDetailsFromTool.limbs.map(limb => ({
    id: crypto.randomUUID(), name: limb.name, status: limb.status, health: limb.health, equippedItems: [],
  }));
  const totalLimbHealth = formattedLimbs.reduce((sum, limb) => sum + limb.health, 0);
  const initialOverallHealth = formattedLimbs.length > 0 ? Math.round(totalLimbHealth / formattedLimbs.length) : 100;
  
  const initialSkills: Skill[] = PREDEFINED_SKILLS_CONFIG.map(skillConfig => {
    const suggestedSkill = charDetailsFromTool.startingSkills?.find(ss => ss.skillName === skillConfig.name);
    const level = suggestedSkill ? suggestedSkill.startingLevel : 0; 
    return { 
        id: crypto.randomUUID(), 
        name: skillConfig.name, 
        description: skillConfig.description, 
        level, 
        experience: 0, 
        experienceToNextLevel: level === 0 && skillConfig.name !== "Combat" ? 50 : (level * 100 + 100) 
    };
  });
  
  let finalCharacterName = charDetailsFromTool.characterName?.trim();
  if (!finalCharacterName) {
      finalCharacterName = initialCharacterName?.trim() || initialCharacterConcept.split(/[,.]|\s-\s/)[0].trim() || (gameSetting === "Historical" ? "Citizen" : "Adventurer");
      if (finalCharacterName.split(/\s+/).length > 4) { 
          finalCharacterName = gameSetting === "Historical" ? "Citizen" : "Adventurer";
      }
  }


  const characterDetails: CharacterDetailsOnly = {
    characterName: finalCharacterName, 
    characterConcept: charDetailsFromTool.characterConcept, 
    characterRarity: charDetailsFromTool.characterRarity, 
    overallHealth: initialOverallHealth, currentEnergy: 100, maxEnergy: 100, isDefeated: false,
    limbs: formattedLimbs, skills: initialSkills, 
    gameSettingType: gameSetting, 
    initialHistoricalContext: gameSetting === 'Historical' ? worldContext : null,
    fictionalUniverseContext: gameSetting === 'Fictional' ? worldContext : null,
    visualStyle: visualStyle, 
  };
  return { characterDetails, initialItems: charDetailsFromTool.initialItemSuggestions || [] };
};