// services/geminiClient.ts
import { GoogleGenAI, GenerateContentResponse, Type, Tool } from "@google/genai";
import { VisualStyleType } from './gameTypes'; // Added import

export const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  console.error("Gemini API key is missing. Please set the API_KEY environment variable.");
}

export const ai = new GoogleGenAI({ apiKey: API_KEY || "MISSING_API_KEY" });

export const TEXT_MODEL_NAME = 'gemini-2.5-flash-preview-04-17';
export const IMAGE_MODEL_NAME = 'imagen-3.0-generate-002';

// --- Gemini API Tool/Function Calling Types (based on common usage) ---
export { Type };

export interface Schema {
  type: Type;
  description?: string;
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema;
  additionalProperties?: boolean | Schema;
}

export interface FunctionDeclaration {
  name: string;
  description: string;
  parameters: Schema;
}

export type { Tool };

interface FunctionCall {
    name: string;
    args: Record<string, any>;
}

interface FunctionCallPart {
    functionCall: FunctionCall;
    text?: never;
}

interface TextPart {
    text: string;
    functionCall?: never;
    thought?: boolean;
}

export async function callLLMWithToolAndValidateArgs<TArgs>(
  prompt: string,
  tool: Tool,
  structureValidator: (data: any) => data is TArgs,
  validationErrorMessage: string,
  contextForErrorMessage: string,
  maxRetries: number = 1
): Promise<TArgs> {
  let attempts = 0;

  while (attempts <= maxRetries) {
    try {
      const response: GenerateContentResponse = await ai.models.generateContent({
        model: TEXT_MODEL_NAME,
        contents: [{role: "user", parts: [{text: prompt}]}],
        config: {
          tools: [tool],
        }
      });

      const parts = response.candidates?.[0]?.content?.parts;
      if (!parts || parts.length === 0) {
        // console.error(`No parts received from API for ${contextForErrorMessage} (attempt ${attempts + 1}). Response:`, JSON.stringify(response, null, 2));
        throw new Error(`No parts received from API for ${contextForErrorMessage}.`);
      }
      
      // console.log(`[${contextForErrorMessage}] LLM RAW RESPONSE PARTS (Attempt ${attempts + 1}):`, JSON.stringify(parts, null, 2));

      let args: any = null;

      const functionCallPart = parts.find(
        (part): part is FunctionCallPart => !!(part as FunctionCallPart).functionCall
      );

      if (functionCallPart?.functionCall?.args) {
        args = functionCallPart.functionCall.args;
      } else {
        // console.error(`LLM did not return a function call for ${contextForErrorMessage} when tool was provided. Parts received:`, JSON.stringify(parts, null, 2));
        throw new Error(`LLM failed to use the provided tool for ${contextForErrorMessage}. Review LLM's understanding of the tool or prompt.`);
      }

      // console.log(`[${contextForErrorMessage}] PARSED ARGS BEFORE VALIDATION (Attempt ${attempts + 1}):`, JSON.stringify(args, null, 2));

      if (args === null) {
        let message = `No function call arguments received from API for ${contextForErrorMessage}.`;
        // console.error(`${message} (attempt ${attempts + 1}). Response:`, JSON.stringify(response, null, 2));
        throw new Error(message);
      }

      if (!structureValidator(args)) {
        // console.error(`${validationErrorMessage} (${contextForErrorMessage}). Raw args from LLM just before validation:`, args);
        throw new Error(`${validationErrorMessage} (${contextForErrorMessage})`);
      }
      return args;

    } catch (error: any) {
      attempts++;
      const message = error.message || "Unknown API error";

      if (attempts > maxRetries) {
        // console.error(`Error during ${contextForErrorMessage} (attempt ${attempts}/${maxRetries + 1}):`, error);
        throw new Error(`Failed to get valid tool response for ${contextForErrorMessage} after ${attempts} attempts. Last error: ${message}.`);
      }
      console.warn(`Attempt ${attempts}/${maxRetries + 1} failed for ${contextForErrorMessage}. Error: ${message}. Retrying...`);
      await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
    }
  }
  throw new Error(`Exhausted retries for ${contextForErrorMessage}.`);
}

export async function callLLMForValidatedJsonText<TArgs>(
  prompt: string,
  validator: (data: any) => data is TArgs,
  validationErrorMessage: string,
  contextForErrorMessage: string,
  maxRetries: number = 1
): Promise<TArgs> {
  let attempts = 0;
  while (attempts <= maxRetries) {
    try {
      const response: GenerateContentResponse = await ai.models.generateContent({
        model: TEXT_MODEL_NAME, // Ensure using the correct model constant
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { responseMimeType: "application/json" } 
      });
      
      // console.log(`[${contextForErrorMessage}] LLM RAW RESPONSE (Attempt ${attempts + 1}):`, response.text);

      let jsonStr = response.text?.trim();
      if (!jsonStr) {
        throw new Error("LLM returned empty text response.");
      }
      const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
      const match = jsonStr.match(fenceRegex);
      if (match && match[2]) {
        jsonStr = match[2].trim();
      }
      // console.log(`[${contextForErrorMessage}] TRIMMED JSON STRING (Attempt ${attempts + 1}):`, jsonStr);
      
      let parsedData;
      try {
        parsedData = JSON.parse(jsonStr);
      } catch (e: any) {
        // console.error(`[${contextForErrorMessage}] JSON PARSE FAILED (Attempt ${attempts + 1}):`, e.message, "Raw string:", jsonStr);
        throw new Error(`Failed to parse JSON response: ${e.message}`);
      }

      // console.log(`[${contextForErrorMessage}] PARSED ARGS BEFORE VALIDATION (Attempt ${attempts + 1}):`, JSON.stringify(parsedData, null, 2));

      if (!validator(parsedData)) {
        // console.error(`${validationErrorMessage} (${contextForErrorMessage}). Raw args from LLM:`, JSON.stringify(parsedData, null, 2));
        throw new Error(`${validationErrorMessage} (${contextForErrorMessage})`);
      }
      return parsedData;

    } catch (error: any) {
      attempts++;
      const message = error.message || "Unknown API error";
      if (attempts > maxRetries) {
        // console.error(`Error during ${contextForErrorMessage} (attempt ${attempts}/${maxRetries + 1}):`, error);
        throw new Error(`Failed to get valid JSON response for ${contextForErrorMessage} after ${attempts} attempts. Last error: ${message}.`);
      }
      console.warn(`Attempt ${attempts}/${maxRetries + 1} failed for ${contextForErrorMessage}. Error: ${message}. Retrying...`);
      await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
    }
  }
  throw new Error(`Exhausted retries for ${contextForErrorMessage}.`);
}


// --- Test Functions ---
export const generateTestDescription = async (): Promise<string> => {
  try {
    const prompt = "Generate a one-paragraph fantastical description of a newly discovered magical artifact, suitable for a text-based adventure game. Be creative and evocative.";

    const response: GenerateContentResponse = await ai.models.generateContent({
        model: TEXT_MODEL_NAME, 
        contents: prompt,
    });

    const text = response.text;
    if (text) {
      return text;
    } else {
      throw new Error("No text content received from Gemini API for description.");
    }
  } catch (error) {
    console.error("Error in generateTestDescription:", error);
    if (error instanceof Error) {
        throw new Error(`Gemini API error (description): ${error.message}`);
    }
    throw new Error("An unknown error occurred while generating description.");
  }
};

export const generateTestImage = async (visualStyle: VisualStyleType = 'Pixel Art'): Promise<string> => {
  try {
    let styleDescriptor = "Pixel Art style";
    switch (visualStyle) {
        case 'Anime':
            styleDescriptor = "Anime style";
            break;
        case 'Ink Painting':
            styleDescriptor = "black and white traditional Chinese ink painting style";
            break;
        case 'Low Poly':
            styleDescriptor = "stylized low-poly 3D render style";
            break;
        case 'Oil Painting':
            styleDescriptor = "oil painting in the style of Caspar David Friedrich";
            break;
        case 'Water Painting':
            styleDescriptor = "luminous watercolor painting style with transparent washes, soft blended edges, and a sense of light and fluidity";
            break;
        // Default is 'Pixel Art style'
    }

    const prompt = `A highly detailed, ${styleDescriptor} image of a glowing, intricately carved wooden staff, pulsating with soft blue ethereal energy, resting on ancient, moss-covered stones in a misty forest. Cinematic lighting. Clean ${styleDescriptor}.`;

    const response = await ai.models.generateImages({
        model: IMAGE_MODEL_NAME, 
        prompt: prompt,
        config: { numberOfImages: 1, outputMimeType: 'image/jpeg' },
    });

    if (response.generatedImages && response.generatedImages.length > 0 && response.generatedImages[0].image?.imageBytes) {
      const base64ImageBytes = response.generatedImages[0].image.imageBytes;
      return `data:image/jpeg;base64,${base64ImageBytes}`;
    } else {
      throw new Error("No image data received from Gemini API or image data is invalid.");
    }
  } catch (error) {
    console.error("Error in generateTestImage:", error);
    if (error instanceof Error) {
        throw new Error(`Gemini API error (image): ${error.message}`);
    }
    throw new Error("An unknown error occurred while generating image.");
  }
};