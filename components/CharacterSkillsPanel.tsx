// components/CharacterSkillsPanel.tsx
import React, { useState, useRef, useEffect } from 'react';
import { Skill } from '../services/gameTypes';

interface CharacterSkillsPanelProps {
  skills: Skill[];
}

const SKILL_SUMMARIES: Record<string, string> = {
  'Combat': "Improves effectiveness in fights, influencing attack success and damage dealt.",
  'Crafting': "Determines the quality and complexity of crafted items. Higher skill can result in rarer or more potent creations.",
  'Survival': "Aids in navigating the world and enduring its challenges. May affect energy consumption during exploration.",
  'Perception': "Increases the likelihood of finding hidden items or people, and discerning subtle details or lore.",
  'Persuasion': "Enhances ability to influence NPCs through dialogue, potentially leading to more favorable outcomes.",
  'Mobility': "Represents agility and ease of movement. Currently enhances narrative flavor, may impact future actions like evasion or traversing difficult terrain."
};


const CharacterSkillsPanel: React.FC<CharacterSkillsPanelProps> = ({ skills }) => {
  const [activeSkillInfo, setActiveSkillInfo] = useState<Skill | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const iconButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const handleInfoClick = (event: React.MouseEvent, skill: Skill) => {
    event.stopPropagation(); // Prevent click from bubbling to document listener
    setActiveSkillInfo(prev => (prev?.id === skill.id ? null : skill));
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // If popover is open and click is outside the popover and not on any info icon
      let clickedOnAnInfoIcon = false;
      Object.values(iconButtonRefs.current).forEach(buttonRef => {
        if (buttonRef && buttonRef.contains(event.target as Node)) {
          clickedOnAnInfoIcon = true;
        }
      });

      if (popoverRef.current && !popoverRef.current.contains(event.target as Node) && !clickedOnAnInfoIcon) {
        setActiveSkillInfo(null);
      }
    };

    if (activeSkillInfo) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [activeSkillInfo]);

  if (!skills || skills.length === 0) {
    return <p className="text-slate-400 mt-3 text-sm italic">No skill data available.</p>;
  }

  return (
    <div className="mt-4">
      <h3 className="text-xl font-semibold mb-3 text-teal-300">Skills</h3>
      <div className="space-y-3">
        {skills.map((skill) => (
          <div 
            key={skill.id} 
            className="bg-slate-600/40 p-2.5 rounded-md shadow-sm group relative" // Added relative for popover positioning
          >
            <div className="flex justify-between items-center mb-1">
              <div className="flex items-center">
                <span className="text-sm font-medium text-teal-200">{skill.name}</span>
                <button
// GDE FIX: Changed ref assignment to not return a value, satisfying React's ref callback type.
                  ref={el => { iconButtonRefs.current[skill.id] = el; }}
                  onClick={(e) => handleInfoClick(e, skill)}
                  className="ml-2 text-teal-400 hover:text-teal-200 focus:outline-none p-0.5 rounded-full hover:bg-slate-700/50"
                  aria-label={`More information about ${skill.name}`}
                  title={`Info about ${skill.name}`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                  </svg>
                </button>
              </div>
              <span className="text-xs text-teal-400 font-mono">Lvl {skill.level}</span>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-2.5 shadow-inner">
              <div
                className="bg-teal-500 h-2.5 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${skill.experienceToNextLevel > 0 ? (skill.experience / skill.experienceToNextLevel) * 100 : (skill.level > 0 ? 100 : 0)}%` }}
                role="progressbar"
                aria-valuenow={skill.experience}
                aria-valuemin={0}
                aria-valuemax={skill.experienceToNextLevel}
                aria-label={`${skill.name} experience: ${skill.experience} out of ${skill.experienceToNextLevel}`}
              ></div>
            </div>
            <p className="text-xs text-slate-400 text-right mt-0.5">
              {skill.experience} / {skill.experienceToNextLevel > 0 ? skill.experienceToNextLevel : 'MAX'} XP
            </p>

            {activeSkillInfo?.id === skill.id && (
              <div
                ref={popoverRef}
                className="absolute left-full top-0 ml-2 w-64 z-20 p-3 rounded-md bg-slate-800 shadow-xl ring-1 ring-slate-600 text-sm"
                role="tooltip"
                // Simple positioning, might need adjustment based on actual layout
              >
                <h4 className="font-semibold text-teal-200 mb-1.5">{activeSkillInfo.name}</h4>
                <p className="text-slate-300 leading-snug">
                  {SKILL_SUMMARIES[activeSkillInfo.name] || activeSkillInfo.description}
                </p>
                 <p className="text-xs text-slate-400 mt-2">
                  Current Level: {activeSkillInfo.level}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default CharacterSkillsPanel;