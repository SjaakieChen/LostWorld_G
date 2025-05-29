// services/config/gameConstants.ts
import { Skill } from '../types/characterTypes';

export const PREDEFINED_SKILLS_CONFIG: Omit<Skill, 'level' | 'experience' | 'experienceToNextLevel' | 'id'>[] = [
  { name: 'Combat', description: 'Proficiency in physical confrontations, including using weapons and unarmed techniques. Affects attack accuracy, damage, and defensive maneuvers.' },
  { name: 'Crafting', description: 'Ability to create and repair items from raw materials. Influences quality and complexity of crafted items.' },
  { name: 'Survival', description: 'Knowledge of tracking, foraging, and enduring harsh environments. Affects finding resources, navigating hazards, and effectiveness of certain consumables.' },
  { name: 'Perception', description: 'Acuity in noticing details, hidden objects, or subtle clues. Helps in finding items, spotting danger, and discerning information.' },
  { name: 'Persuasion', description: 'Skill in influencing others through dialogue, negotiation, or charm. Affects NPC reactions, quest outcomes, and trading.' },
  { name: 'Mobility', description: 'Represents agility, nimbleness, and ease of movement. May influence future actions like evasion or navigating difficult terrain.' },
];
