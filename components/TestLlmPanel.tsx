

import React, { useState, useCallback } from 'react';
import { generateTestDescription, generateTestImage } from '../services/geminiClient'; // Updated import
import Spinner from './Spinner';
import Alert from './Alert';
import { VisualStyleType } from '../services/gameTypes'; // Added import

const TestLlmPanel: React.FC = () => {
  const [description, setDescription] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isLoadingDescription, setIsLoadingDescription] = useState<boolean>(false);
  const [isLoadingImage, setIsLoadingImage] = useState<boolean>(false);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [selectedStyle, setSelectedStyle] = useState<VisualStyleType>('Pixel Art'); // Added state for style

  const handleGenerateDescription = useCallback(async () => {
    setIsLoadingDescription(true);
    setDescriptionError(null);
    setDescription(null);
    try {
      const desc = await generateTestDescription();
      setDescription(desc);
    } catch (error: any) {
      console.error("Error generating description:", error);
      setDescriptionError(error.message || "Failed to generate description. Check console for details and ensure API key is set.");
    } finally {
      setIsLoadingDescription(false);
    }
  }, []);

  const handleGenerateImage = useCallback(async () => {
    setIsLoadingImage(true);
    setImageError(null);
    setImageUrl(null);
    try {
      // Pass the selected style to generateTestImage
      const url = await generateTestImage(selectedStyle); 
      setImageUrl(url);
    } catch (error: any) {
      console.error("Error generating image:", error);
      setImageError(error.message || "Failed to generate image. Check console for details and ensure API key is set.");
    } finally {
      setIsLoadingImage(false);
    }
  }, [selectedStyle]); // Added selectedStyle to dependencies

  return (
    <div className="bg-slate-800 shadow-2xl rounded-lg p-6 md:p-8 space-y-8 ring-1 ring-slate-700">

      {/* Test Description Section */}
      <section>
        <h2 className="text-2xl font-semibold mb-4 text-sky-400">Test Text Generation</h2>
        <button
          onClick={handleGenerateDescription}
          disabled={isLoadingDescription}
          className="w-full bg-sky-600 hover:bg-sky-500 text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-opacity-75 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
        >
          {isLoadingDescription ? (
            <>
              <Spinner className="w-5 h-5 mr-2" />
              Generating...
            </>
          ) : (
            'Generate Test Description'
          )}
        </button>
        {descriptionError && <Alert type="error" message={descriptionError} className="mt-4" />}
        {description && !isLoadingDescription && (
          <div className="mt-6 p-4 bg-slate-700 rounded-md prose prose-invert max-w-none prose-p:text-slate-300">
            <h3 className="text-lg font-medium text-slate-200 mb-2">Generated Description:</h3>
            <p className="whitespace-pre-wrap font-mono text-sm">{description}</p>
          </div>
        )}
      </section>

      <div className="border-t border-slate-700"></div>

      {/* Test Image Generation Section */}
      <section>
        <h2 className="text-2xl font-semibold mb-4 text-teal-400">Test Image Generation</h2>
        
        {/* Style Selector for Image Generation */}
        <div className="mb-4">
          <label htmlFor="test-visual-style" className="block text-sm font-medium text-slate-300 mb-1">Select Style for Test Image:</label>
          <select
            id="test-visual-style"
            value={selectedStyle}
            onChange={(e) => setSelectedStyle(e.target.value as VisualStyleType)}
            className="w-full bg-slate-700 text-slate-200 border border-slate-600 rounded-lg py-2.5 px-3 focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
          >
            <option value="Pixel Art">Pixel Art</option>
            <option value="Anime">Anime</option>
            <option value="Ink Painting">Ink Painting</option>
            <option value="Low Poly">Low Poly</option>
            <option value="Oil Painting">Oil Painting</option>
            <option value="Water Painting">Water Painting</option>
          </select>
        </div>

        <button
          onClick={handleGenerateImage}
          disabled={isLoadingImage}
          className="w-full bg-teal-600 hover:bg-teal-500 text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-teal-400 focus:ring-opacity-75 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
        >
          {isLoadingImage ? (
            <>
              <Spinner className="w-5 h-5 mr-2" />
              Generating...
            </>
          ) : (
            'Generate Test Image'
          )}
        </button>
        {imageError && <Alert type="error" message={imageError} className="mt-4" />}
        {imageUrl && !isLoadingImage && (
          <div className="mt-6 p-4 bg-slate-700 rounded-md text-center">
            <h3 className="text-lg font-medium text-slate-200 mb-3">Generated Image:</h3>
            <img
              src={imageUrl}
              alt="Generated by AI"
              className="max-w-full h-auto rounded-md shadow-lg mx-auto border-2 border-slate-600"
              style={{ maxWidth: '512px', maxHeight: '512px' }}
            />
          </div>
        )}
      </section>
    </div>
  );
};

export default TestLlmPanel;