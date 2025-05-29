// components/CharacterVitalsPanel.tsx
import React from 'react';

interface CharacterVitalsPanelProps {
  overallHealth: number;
  currentEnergy: number;
  maxEnergy: number;
}

const CharacterVitalsPanel: React.FC<CharacterVitalsPanelProps> = ({ 
  overallHealth, 
  currentEnergy, 
  maxEnergy 
}) => {

  const healthPercentage = Math.max(0, Math.min(100, (overallHealth / 100) * 100));
  const energyPercentage = Math.max(0, Math.min(100, (currentEnergy / maxEnergy) * 100));

  const getHealthColor = (percentage: number): string => {
    if (percentage > 70) return 'bg-green-500';
    if (percentage > 30) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className="space-y-3 mb-4">
      <div>
        <div className="flex justify-between items-baseline mb-0.5">
          <h4 className="text-md font-semibold text-rose-400">Overall Health</h4>
          <span className="text-sm text-rose-300 font-mono">{overallHealth} / 100 HP</span>
        </div>
        <div className="w-full bg-slate-600 rounded-full h-3.5 shadow-inner">
          <div 
            className={`h-3.5 rounded-full transition-all duration-300 ease-out ${getHealthColor(healthPercentage)}`}
            style={{ width: `${healthPercentage}%` }}
            role="progressbar"
            aria-valuenow={overallHealth}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Overall health: ${overallHealth} out of 100`}
          ></div>
        </div>
      </div>

      <div>
        <div className="flex justify-between items-baseline mb-0.5">
          <h4 className="text-md font-semibold text-sky-400">Energy</h4>
          <span className="text-sm text-sky-300 font-mono">{currentEnergy} / {maxEnergy} EN</span>
        </div>
        <div className="w-full bg-slate-600 rounded-full h-3.5 shadow-inner">
          <div 
            className="bg-sky-500 h-3.5 rounded-full transition-all duration-300 ease-out"
            style={{ width: `${energyPercentage}%` }}
            role="progressbar"
            aria-valuenow={currentEnergy}
            aria-valuemin={0}
            aria-valuemax={maxEnergy}
            aria-label={`Current energy: ${currentEnergy} out of ${maxEnergy}`}
          ></div>
        </div>
      </div>
    </div>
  );
};

export default CharacterVitalsPanel;