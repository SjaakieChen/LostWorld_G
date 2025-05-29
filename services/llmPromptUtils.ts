// services/llmPromptUtils.ts
import { Skill, Limb } from './gameTypes';

export const SKILL_LEVEL_INTERPRETATION_GUIDE = `
SKILL LEVEL INTERPRETATION:
When considering skill levels, use this guide:
- 0 (Untrained): High chance of failure, clumsy, basic understanding.
- 1-2 (Novice): Can perform basic tasks with effort, inconsistent results.
- 3-4 (Apprentice): Reliable at simple tasks, competent.
- 5-6 (Adept): Proficient, good quality, handles moderate complexity.
- 7-8 (Expert): Highly skilled, excellent results, can innovate.
- 9 (Virtuoso): Near peak, remarkable feats, master of nuance.
- 10 (Master): Legendary, defines the art, flawless.
Outcomes and narrations should reflect these skill levels where relevant.`;

export const formatSkillsForLLM = (skills: Skill[]): string => {
  if (!skills || skills.length === 0) return "No specific skills noted.";
  const notableSkills = skills.filter(s => s.level > 0);
  if (notableSkills.length === 0) return "No skills above level 0.";
  return notableSkills.map(s => `${s.name} (Lvl ${s.level})`).join(', ');
};

export const formatEquippedItemsForLLM = (limbs: Limb[]): string => {
  if (!limbs || limbs.length === 0) return "No limb data to determine equipped items.";
  
  const equippedStrings: string[] = [];
  let hasAnyEquipped = false;

  limbs.forEach(limb => {
    if (limb.equippedItems && limb.equippedItems.length > 0) {
      hasAnyEquipped = true;
      const itemNames = limb.equippedItems.map(item => `${item.name} (${item.rarity})`).join(', ');
      equippedStrings.push(`${limb.name}: [${itemNames}]`);
    }
  });

  if (!hasAnyEquipped) {
    return "Equipped: Nothing significant.";
  }
  
  return `Equipped Items: ${equippedStrings.join('; ')}.`;
};

export const formatCharacterLimbDetailsForLLM = (limbs: Limb[]): string => {
  if (!limbs || limbs.length === 0) return "No limb data.";
  return limbs.map(l => 
    `${l.name} (Status: ${l.status}, Health: ${l.health}HP, Equipped: ${l.equippedItems?.map(ei => `${ei.name} (${ei.rarity})`).join(', ') || 'None'})`
  ).join('; ');
};
