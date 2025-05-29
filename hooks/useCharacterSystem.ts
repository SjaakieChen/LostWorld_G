// hooks/useCharacterSystem.ts
import { useState, useCallback } from 'react';
import { CharacterData, Skill, GameLogEntry } from '../services/gameTypes';

export interface UseCharacterSystemReturn {
  characterData: CharacterData | null;
  setCharacterData: React.Dispatch<React.SetStateAction<CharacterData | null>>;
  consumeEnergyLogic: (
    amount: number, 
    addLogEntry: (type: GameLogEntry['type'], text: string) => void, 
    relevantSkillName?: string
  ) => { wasDefeated: boolean };
  gainSkillExperienceLogic: (
    skillName: string, 
    amount: number,
    addLogEntry: (type: GameLogEntry['type'], text: string) => void
  ) => void;
}

export const useCharacterSystem = (): UseCharacterSystemReturn => {
  const [characterData, setCharacterData] = useState<CharacterData | null>(null);

  const consumeEnergyLogic = useCallback((
    amount: number, 
    addLogEntry: (type: GameLogEntry['type'], text: string) => void, 
    relevantSkillName?: string
  ): { wasDefeated: boolean } => {
    let defeatedInThisAction = false;
    setCharacterData(prevCharData => {
      if (!prevCharData) return null;
      if (prevCharData.isDefeated) return prevCharData;

      const newEnergy = Math.max(0, prevCharData.currentEnergy - amount);
      let charUpdate = { ...prevCharData, currentEnergy: newEnergy };

      if (newEnergy === 0 && prevCharData.currentEnergy > 0) {
        const defeatMessage = relevantSkillName 
          ? `You've exhausted all your energy trying to use ${relevantSkillName}! You collapse, defeated.`
          : "You've run out of energy and collapse, defeated!";
        // This log entry is now handled by the GameContext wrapper
        // addLogEntry('error', defeatMessage); 
        charUpdate = { ...charUpdate, isDefeated: true, overallHealth: 0 };
        defeatedInThisAction = true;
      }
      return charUpdate;
    });
    return { wasDefeated: defeatedInThisAction };
  }, []);

  const gainSkillExperienceLogic = useCallback((
    skillName: string, 
    amount: number,
    addLogEntry: (type: GameLogEntry['type'], text: string) => void
  ) => {
    setCharacterData(prevCharData => {
      if (!prevCharData || amount <= 0) return prevCharData;
      let skillUpdated = false;
      const newSkills = prevCharData.skills.map(skill => {
        if (skill.name === skillName) {
          skillUpdated = true;
          let newExperience = skill.experience + amount;
          let newLevel = skill.level;
          let newExperienceToNextLevel = skill.experienceToNextLevel;

          if (newLevel === 0 && newExperience >= newExperienceToNextLevel) {
            newLevel = 1;
            newExperience -= skill.experienceToNextLevel;
            newExperienceToNextLevel = (newLevel * 100 + 100);
            // Log handled by GameContext wrapper
            // addLogEntry('game_event', `You learned ${skillName} (Level ${newLevel})!`);
          }

          while (newLevel > 0 && newExperience >= newExperienceToNextLevel) {
            newLevel++;
            newExperience -= newExperienceToNextLevel;
            newExperienceToNextLevel = (newLevel * 100 + 100);
            // Log handled by GameContext wrapper
            // addLogEntry('game_event', `${skillName} increased to Level ${newLevel}!`);
          }
          return { ...skill, level: newLevel, experience: newExperience, experienceToNextLevel: newExperienceToNextLevel };
        }
        return skill;
      });
      if (skillUpdated) {
        // Log handled by GameContext wrapper
        // addLogEntry('system', `Gained ${amount}XP in ${skillName}.`);
        return { ...prevCharData, skills: newSkills };
      }
      return prevCharData;
    });
  }, []);

  return {
    characterData,
    setCharacterData,
    consumeEnergyLogic,
    gainSkillExperienceLogic,
  };
};