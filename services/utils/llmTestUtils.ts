// services/utils/llmTestUtils.ts
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { VisualStyleType } from '../types/commonTypes';
import { API_KEY, TEXT_MODEL_NAME, IMAGE_MODEL_NAME, ai } from '../geminiClient'; // Assuming ai instance is exported from geminiClient

export const generateTestDescription = async (): Promise<string> => {
  if (!API_KEY) {
    throw new Error("Gemini API key is not configured.");
  }
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
  if (!API_KEY) {
    throw new Error("Gemini API key is not configured.");
  }
  try {
    const prompt = `A highly detailed, ${visualStyle} style image of a glowing, intricately carved wooden staff, pulsating with soft blue ethereal energy, resting on ancient, moss-covered stones in a misty forest. Cinematic lighting. Clean ${visualStyle} style.`;

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
