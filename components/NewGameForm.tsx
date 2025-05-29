// components/NewGameForm.tsx
import React, { useState, useEffect } from 'react';
import { VisualStyleType } from '../services/gameTypes';
import Alert from './Alert'; // If API key warning is shown here

interface NewGameFormProps {
  onCustomStart: (settingType: 'Fictional' | 'Historical', userIdea: string, visualStyle: VisualStyleType) => void;
  onQuickStart: () => void;
  isLoading: boolean;
  apiKeyMissing: boolean;
}

const NewGameForm: React.FC<NewGameFormProps> = ({
  onCustomStart,
  onQuickStart,
  isLoading,
  apiKeyMissing,
}) => {
  const [settingType, setSettingType] = useState<'Fictional' | 'Historical'>('Historical');
  const [userWorldAndCharacterIdea, setUserWorldAndCharacterIdea] = useState<string>('');
  const [visualStyle, setVisualStyle] = useState<VisualStyleType>('Pixel Art');

  const historicalPlaceholder = "e.g., Being Plato orating in the Parthenon. OR A eunuch in the Chinese imperial court. OR A farmer in Cleopatra's age. OR A knight at King Arthur's table.";
  const fictionalPlaceholder = "e.g., A lone cyborg scavenger in a neon-drenched metropolis. OR A young sorcerer discovering a hidden portal in an enchanted forest.";
  
  const [currentPlaceholderText, setCurrentPlaceholderText] = useState<string>(historicalPlaceholder);

  useEffect(() => {
    setCurrentPlaceholderText(settingType === 'Historical' ? historicalPlaceholder : fictionalPlaceholder);
  }, [settingType]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userWorldAndCharacterIdea.trim()) {
        // Basic validation, can be enhanced
        alert("Please describe your desired world and character.");
        return;
    }
    onCustomStart(settingType, userWorldAndCharacterIdea, visualStyle);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label htmlFor="settingType" className="block text-sm font-medium text-slate-300 mb-1">Setting Type</label>
        <select
          id="settingType"
          value={settingType}
          onChange={(e) => setSettingType(e.target.value as 'Fictional' | 'Historical')}
          className="w-full bg-slate-700 text-slate-200 border border-slate-600 rounded-lg py-2.5 px-3 focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
          aria-label="Choose game setting type: Historical or Fictional"
        >
          <option value="Historical">Historical</option>
          <option value="Fictional">Fictional</option>
        </select>
      </div>

      <div>
        <label htmlFor="visualStyle" className="block text-sm font-medium text-slate-300 mb-1">Visual Style</label>
        <select
          id="visualStyle"
          value={visualStyle}
          onChange={(e) => setVisualStyle(e.target.value as VisualStyleType)}
          className="w-full bg-slate-700 text-slate-200 border border-slate-600 rounded-lg py-2.5 px-3 focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
          aria-label="Choose visual style"
        >
          <option value="Pixel Art">Pixel Art</option>
          <option value="Anime">Anime</option>
          <option value="Ink Painting">Ink Painting</option>
          <option value="Low Poly">Low Poly</option>
          <option value="Oil Painting">Oil Painting</option>
          <option value="Water Painting">Water Painting</option>
        </select>
      </div>

      <div>
        <label htmlFor="userWorldAndCharacterIdea" className="block text-sm font-medium text-slate-300 mb-1">Describe Your Desired World & Character</label>
        <textarea
          id="userWorldAndCharacterIdea"
          value={userWorldAndCharacterIdea}
          onChange={(e) => setUserWorldAndCharacterIdea(e.target.value)}
          placeholder={currentPlaceholderText}
          rows={4}
          className="w-full bg-slate-700 text-slate-200 placeholder-slate-500 border border-slate-600 rounded-lg py-2.5 px-3 focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
          aria-label="Enter your desired world and character description"
          required
        />
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <button
          type="submit"
          disabled={isLoading || apiKeyMissing || !userWorldAndCharacterIdea.trim()}
          className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-6 rounded-lg transition-colors duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-lg"
          aria-label="Generate my custom world"
        >
          Generate My World
        </button>
        <button
          type="button"
          onClick={onQuickStart}
          disabled={isLoading || apiKeyMissing || settingType === 'Historical'}
          className="flex-1 bg-sky-600 hover:bg-sky-500 text-white font-bold py-3 px-6 rounded-lg transition-colors duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-sky-400 disabled:opacity-50 disabled:cursor-not-allowed text-lg"
          aria-label={settingType === 'Historical' ? "Quick Start is disabled for Historical settings" : "Start a new game with a random character and location"}
          title={settingType === 'Historical' ? "For Historical settings, please describe your world and character." : "Quick Start (Random Fictional)"}
        >
          Quick Start (Random)
        </button>
      </div>
    </form>
  );
};

export default NewGameForm;