// services/item/itemGenerationService.ts
import { API_KEY, ai, callLLMWithToolAndValidateArgs, IMAGE_MODEL_NAME, TEXT_MODEL_NAME, Tool, Type, FunctionDeclaration, Schema } from '../geminiClient';
import { GameItem, SuggestedItemFromLLM, FullLocationData, CharacterData, ItemRarity, PotentialDiscovery, VisualStyleType } from '../types'; // Assuming a Barrel file for types
import { SKILL_LEVEL_INTERPRETATION_GUIDE, formatSkillsForLLM } from '../llmPromptUtils';

const getStyleForItemIconPrompt = (visualStyle: VisualStyleType): string => {
  switch (visualStyle) {
    case 'Pixel Art': return "Pixel Art icon";
    case 'Anime': return "Anime style icon";
    case 'Ink Painting': return "black and white traditional Chinese ink painting style icon";
    case 'Oil Painting': return "distinctive impasto oil painting style icon";
    case 'Water Painting': return "luminous watercolor painting style icon";
    case 'Low Poly': return "stylized low-poly 3D render style icon";
    default: return `${visualStyle} icon`; // Fallback
  }
};

export const generateAndFetchItemIcon = async (
    itemVisualPromptHint: string,
    itemName: string,
    visualStyle: VisualStyleType,
    _locationVisualPromptHint?: string | null
): Promise<string> => {
    let iconUrl = `https://via.placeholder.com/64x64/777/fff?text=${encodeURIComponent(itemName.substring(0,3))}`;
    if (!API_KEY) { console.warn(`API key not configured. Using placeholder icon for ${itemName}.`); return iconUrl; }

    const itemStyleDescriptor = getStyleForItemIconPrompt(visualStyle);
    let backgroundInstruction = "";

    switch (visualStyle) {
        case 'Pixel Art':
            backgroundInstruction = "on a simple, clean pixel art background suitable for an inventory icon, or a subtle thematic pixel art surface related to the item. The item is the SOLE FOCUS, front and center.";
            break;
        case 'Anime':
            backgroundInstruction = "with a clean, minimalist anime-style background, or a soft, out-of-focus thematic backdrop appropriate for the item. Item is sharply detailed, front and center, and the SOLE FOCUS.";
            break;
        case 'Ink Painting':
            backgroundInstruction = "on a simple, clean black and white Chinese ink painting style background, like textured paper or subtle ink wash, focusing on minimalism and traditional aesthetics. The item is the SOLE FOCUS, front and center, rendered with clear, expressive brush strokes.";
            break;
        case 'Oil Painting':
            backgroundInstruction = "on a background that subtly evokes a Caspar David Friedrich atmosphere (e.g., a hint of misty texture, a muted color palette suggestive of his landscapes) but keeps the item as the SOLE FOCUS. The item itself should be rendered with the detail and lighting characteristic of a Romantic era oil painting, emphasizing its texture and form.";
            break;
        case 'Water Painting':
            backgroundInstruction = "on a clean, light background, possibly suggesting textured watercolor paper, to complement the soft, translucent watercolor style. The item is the SOLE FOCUS, with characteristic soft edges, transparent washes, and a sense of light fluidity.";
            break;
        case 'Low Poly':
            backgroundInstruction = "on a clean, minimalist background that complements the low-poly aesthetic. The item is the SOLE FOCUS, highlighting its geometric forms and stylized rendering.";
            break;
        default:
            backgroundInstruction = `on a neutral background suitable for a ${itemStyleDescriptor}, item is the SOLE FOCUS, front and center.`;
    }

    const finalImagePrompt = `A high-quality ${itemStyleDescriptor} of: ${itemVisualPromptHint}. ${backgroundInstruction} The item MUST be front and center, clear, and distinct. IMPORTANT: Image MUST ONLY contain the icon itself on its described background. NO text, watermarks, labels, UI elements. Clean ${itemStyleDescriptor}. Suitable for a 64x64 game inventory slot.`;

    try {
        const imageResponse = await ai.models.generateImages({ model: IMAGE_MODEL_NAME, prompt: finalImagePrompt, config: { numberOfImages: 1, outputMimeType: 'image/png' } });
        if (imageResponse.generatedImages?.[0]?.image?.imageBytes) iconUrl = `data:image/png;base64,${imageResponse.generatedImages[0].image.imageBytes}`;
        else console.warn(`No icon image data for ${itemName} (Prompt: ${finalImagePrompt}). Using placeholder.`);
    } catch (error: any) { console.error(`Error generating icon for ${itemName} (Prompt: ${finalImagePrompt}):`, error.message || error); }
    return iconUrl;
};

export const SUGGEST_ITEMS_TOOL: Tool = {
  functionDeclarations: [{
    name: "suggest_items_for_location",
    description: "Suggests 1-4 plausible items for a location. Considers character Perception, location context, game setting (Historical/Fictional universe), memory context, AND active item-related leads. Epic/Legendary items should be distinct from memory unless fulfilling a lead. Descriptions are factual. Visual prompt hints MUST be for the game's current visual style (e.g., 'Pixel Art icon', 'Anime style icon', 'black and white traditional Chinese ink painting style icon', 'distinctive impasto oil painting style icon', 'luminous watercolor painting style icon', 'stylized low-poly 3D render style icon'), focusing on the item itself with a simple/neutral background.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        items: {
          type: Type.ARRAY,
          description: "Array of 1-4 items. Items should be contextually relevant. Prioritize fulfilling an item-related lead if plausible. Epic/Legendary items must be distinct from known entities in memory unless matching a lead. Descriptions must be factual (what the item IS, what's written on textual items, etc.).",
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING, description: "Item name. If fulfilling a lead, this MUST match the lead's item name." },
              description: { type: Type.STRING, description: "Factual description (1-2 sentences). What IS it? Appearance? For textual items: summarize content/what's written. If fulfilling a lead, description should align with the lead's hint." },
              itemTypeGuess: { type: Type.STRING, description: "Category (e.g., 'key', 'weapon', 'food', 'document')." },
              rarity: { type: Type.STRING, enum: ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'], description: `Rarity. Influenced by character Perception and location significance. If fulfilling a lead, rarity should match/be consistent with the lead's rarity hint. Epic/Legendary items must be distinct from known entities in memory (unless fulfilling a lead for such an item) and align with setting/universe.` },
              visualPromptHint: { type: Type.STRING, description: "Detailed visual description of THE ITEM ITSELF, suitable for a [CURRENT_GAME_STYLE_ICON] (e.g., 'Pixel Art icon of a gleaming steel longsword with a sapphire', 'Anime style icon of a swirling crimson potion', 'black and white traditional Chinese ink painting style icon of an ancient scroll', 'distinctive impasto oil painting style icon of a jeweled crown', 'luminous watercolor painting style icon of a delicate flower', 'stylized low-poly 3D render style icon of a crystal shard'). Item should be front and center. Background implied should be simple/neutral or subtly thematic TO THE ITEM for that style, item is SOLE focus." },
            },
            required: ["name", "description", "itemTypeGuess", "rarity", "visualPromptHint"],
          },
        },
      },
      required: ["items"],
    },
  } as FunctionDeclaration],
};

type SuggestedItemsFromTool = { items: SuggestedItemFromLLM[] };

const validateSuggestedItemsStructure = (data: any): data is SuggestedItemsFromTool => {
  const rarities: ItemRarity[] = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];
  return data && Array.isArray(data.items) &&
    data.items.every((item: any) =>
      item && typeof item.name === 'string' && item.name.trim() !== '' &&
      typeof item.description === 'string' && item.description.trim() !== '' &&
      typeof item.itemTypeGuess === 'string' && item.itemTypeGuess.trim() !== '' &&
      typeof item.rarity === 'string' && rarities.includes(item.rarity as ItemRarity) &&
      typeof item.visualPromptHint === 'string' && item.visualPromptHint.trim() !== ''
    );
};

export const generateItemsForLocation = async (
  location: FullLocationData,
  characterData: CharacterData,
  potentialDiscoveries: PotentialDiscovery[],
  memoryContextString: string = ""
): Promise<GameItem[]> => {
  if (!API_KEY) { console.warn("Cannot generate items: API key not configured."); return []; }
  const perceptionSkill = characterData.skills.find(s => s.name === 'Perception'); const perceptionLevel = perceptionSkill?.level || 0;
  const visualStyle = characterData.visualStyle;
  const itemStyleIconString = getStyleForItemIconPrompt(visualStyle);

  let settingSpecificInstruction = "";
  let loreContextInstruction = "";
  if (characterData.gameSettingType === "Historical" && characterData.initialHistoricalContext) {
    settingSpecificInstruction = `Game Setting: HISTORICAL - ${characterData.initialHistoricalContext}. All suggested items MUST be historically plausible and authentic for this period and culture. Epic/Legendary items should be actual known artifacts or highly significant cultural objects, distinct from any existing in memory unless fulfilling a lead. Descriptions must be factual. Item visual prompt hints must describe the item itself, suitable for a ${itemStyleIconString}.`;
    loreContextInstruction = `Historical Context: ${characterData.initialHistoricalContext}. Current Visual Style: ${visualStyle}.`;
  } else if (characterData.gameSettingType === "Fictional") {
    if (characterData.fictionalUniverseContext) {
        settingSpecificInstruction = `Game Setting: FICTIONAL within universe: "${characterData.fictionalUniverseContext}". Items MUST be consistent with this universe's lore, technology, and themes. Epic/Legendary items could be known artifacts from this universe, distinct from memory unless fulfilling a lead. Item visual prompt hints must describe the item itself, suitable for a ${itemStyleIconString}.`;
        loreContextInstruction = `Fictional Universe: ${characterData.fictionalUniverseContext}. Current Visual Style: ${visualStyle}.`;
    } else {
        settingSpecificInstruction = `Game Setting: General FICTIONAL. Items should fit the character concept and location theme. Epic/Legendary items should be unique, lore-rich artifacts, distinct from memory unless fulfilling a lead. You may subtly draw inspiration from common fantasy/sci-fi/pop-culture tropes if they naturally fit and enhance the experience. Item visual prompt hints must describe the item itself, suitable for a ${itemStyleIconString}.`;
        loreContextInstruction = `Current Visual Style: ${visualStyle}.`;
    }
  }

  const locationContextInstruction = `Current Location: "${location.name}" (Description: "${location.description}", Tags: [${location.environmentTags.join(', ')}], Rarity: ${location.rarity}). Items found MUST be thematically and functionally relevant to this specific location.`;

  let leadsContext = "No specific item-related leads are currently active.";
  const itemLeads = potentialDiscoveries.filter(pd => pd.type === 'item' && pd.status === 'mentioned');
  if (itemLeads.length > 0) {
    leadsContext = `Active Item-Related Leads (Rumors):\n${itemLeads.map(lead => `- Rumored Item: "${lead.name}" (Type: ${lead.type}, Hint: ${lead.descriptionHint}, Rarity Hint: ${lead.rarityHint || 'Unknown'}). Source: ${lead.sourceTextSnippet.substring(0, 50)}...`).join('\n')}`;
  }

  const prompt = `You are an AI game assistant. Your task is to suggest items for a location.
Context:
- ${locationContextInstruction}
- Character: ${characterData.characterConcept} (Perception Level: ${perceptionLevel}).
- ${loreContextInstruction}
- ${leadsContext}
- ${memoryContextString}
- ${SKILL_LEVEL_INTERPRETATION_GUIDE}

PRIMARY DIRECTIVE: Items found MUST be thematically and functionally relevant to this specific location and consistent with the overall game setting (Historical context or Fictional Universe lore). Adherence to the established setting is PARAMOUNT. ${settingSpecificInstruction}

Guidelines for Item Suggestion:
1.  Quantity: Suggest 1-4 plausible items.
2.  Relevance & Consistency: Items must be thematically/functionally relevant to the specific location and character context, and game setting/universe. This is the PRIMARY consideration.
3.  Lead Fulfillment (Secondary Consideration): If an active item-related lead from "${leadsContext}" can be FULFILLED *WITHOUT violating the PRIMARY DIRECTIVE* (contextual relevance, setting consistency), then you MAY suggest an item that fulfills it.
    - If fulfilling a lead, the generated item's name, description, and rarity MUST align closely with the lead's details.
    - However, if fulfilling a lead would result in an item that is out of place, anachronistic, or lore-breaking for the current location/setting, DO NOT fulfill that lead. Instead, generate other contextually appropriate items or no items if none fit. Leads are rumors, not guarantees.
4.  Rarity: Higher character Perception may increase chance of finding Uncommon/Rare items. Epic/Legendary items are very rare and typically found in significant locations or via high Perception, OR by fulfilling a lead for such an item. They must be distinct from entities in memory unless matching a lead for an Epic/Legendary item and align with setting/universe context.
5.  Descriptions: Item descriptions must be FACTUAL (e.g., what the item IS, what is written on a scroll).
6.  Visual Prompt Hint for Item: Provide a DETAILED visual description of THE ITEM ITSELF, suitable for a ${itemStyleIconString}. Item should be front and center. Any implied background should be simple, neutral, or subtly thematic TO THE ITEM, in ${visualStyle} style, but item is SOLE focus. Replace '[CURRENT_GAME_STYLE_ICON]' in the tool schema with '${itemStyleIconString}'. For example, for a potion in ${visualStyle}: 'a swirling crimson liquid in a clear glass vial with a silver stopper'.

CRITICAL: You MUST invoke the tool named 'suggest_items_for_location'. The arguments you provide to this tool MUST adhere strictly to its schema.
DO NOT output the item details as plain text or a JSON string within a text part. The tool call is the ONLY valid way to provide this information.`;

  const suggested = await callLLMWithToolAndValidateArgs(prompt, SUGGEST_ITEMS_TOOL, validateSuggestedItemsStructure,
    "Invalid item suggestion (check rarity, description, distinction from memory, lead fulfillment, visual prompt for item, visual appeal, setting/universe consistency, contextual relevance)", "generateItemsForLocation");
  if (!suggested.items?.length) return [];
  return Promise.all(suggested.items.map(async (itemDetails): Promise<GameItem> => {
      const iconUrl = await generateAndFetchItemIcon(itemDetails.visualPromptHint, itemDetails.name, visualStyle, location.visualPromptHint);
      return { ...itemDetails, id: crypto.randomUUID(), iconUrl };
  }));
};