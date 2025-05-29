// hooks/useGameDirector.ts
import { useState, useCallback, useEffect } from 'react';
import { useGameContext } from '../contexts/GameContext';
import { analyzeAndSuggestGameDirectives } from '../services/gameDirectorService';
import { GameDirectorDirective } from '../services/gameTypes';

const ANALYSIS_COMMAND_INTERVAL = 21; // Analyze every N player commands
const MIN_TIME_BETWEEN_ANALYSIS_MS = 6 * 60 * 1000; // 6 minutes

export interface UseGameDirectorReturn {
  currentDirectives: GameDirectorDirective | null;
  triggerGameDirectorAnalysis: (forceAnalysis?: boolean) => Promise<void>;
  lastAnalysisCommandCount: number;
}

export const useGameDirector = (): UseGameDirectorReturn => {
  const {
    characterData, locationData, playerInventory, gameLog,
    getMemoryContextString,
    currentEventDetails,
    setCurrentDirectives: setContextDirectives,
    currentDirectives: contextDirectives,
    playerCommandCount,
    addLogEntry,
    gameStarted 
  } = useGameContext();

  const [lastAnalysisTimestamp, setLastAnalysisTimestamp] = useState<number>(0);
  const [lastAnalysisCommandCount, setLastAnalysisCommandCount] = useState<number>(0);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [hasRunInitialAnalysis, setHasRunInitialAnalysis] = useState(false);

  const triggerGameDirectorAnalysis = useCallback(async (forceAnalysis: boolean = false) => {
    if (isAnalyzing) {
      // console.log("GameDirector: Already analyzing.");
      return;
    }
    if (!characterData || !locationData) {
      // console.log("GameDirector: Missing character or location data for analysis.");
      return;
    }

    const now = Date.now();
    const commandsSinceLastAnalysis = playerCommandCount - lastAnalysisCommandCount;

    const enoughTimePassed = (now - lastAnalysisTimestamp > MIN_TIME_BETWEEN_ANALYSIS_MS);
    const enoughCommandsPassed = (commandsSinceLastAnalysis >= ANALYSIS_COMMAND_INTERVAL);

    if (!forceAnalysis && (!enoughTimePassed || !enoughCommandsPassed) && hasRunInitialAnalysis) {
      // console.log(`GameDirector: Conditions not met. Force: ${forceAnalysis}, TimePassed: ${enoughTimePassed}, CmdsPassed: ${enoughCommandsPassed}, InitialRun: ${hasRunInitialAnalysis}`);
      return;
    }

    setIsAnalyzing(true);
    // Use addLogEntry for game-visible messages
    addLogEntry('system', "The winds of fate shift... (Game Director is contemplating...)");

    try {
      const memoryString = getMemoryContextString();
      const newDirectivesOutput = await analyzeAndSuggestGameDirectives(
        characterData,
        locationData,
        playerInventory,
        gameLog,
        memoryString,
        currentEventDetails,
        contextDirectives 
      );

      if (newDirectivesOutput) {
        const directiveWithMetadata: GameDirectorDirective = {
          ...newDirectivesOutput,
          directiveId: crypto.randomUUID(),
          timestamp: now,
          analyzedCommandCount: playerCommandCount,
          lastGameLogEntryIdAnalyzed: gameLog.length > 0 ? gameLog[gameLog.length - 1].id : "none"
        };
        setContextDirectives(directiveWithMetadata);
        setLastAnalysisTimestamp(now);
        setLastAnalysisCommandCount(playerCommandCount);
        
        // Use addLogEntry for game-visible messages
        let focusMessage = `Game Director's Focus: ${directiveWithMetadata.currentGameFocus}`;
        if (directiveWithMetadata.currentGameFocus === 'CustomScenario' && directiveWithMetadata.gameplayParameterSuggestions.customFocusDescription) {
          focusMessage += ` (${directiveWithMetadata.gameplayParameterSuggestions.customFocusDescription.substring(0, 50)}...)`;
        }
        if (directiveWithMetadata.reasoning) {
          focusMessage += ` Reasoning: ${directiveWithMetadata.reasoning.substring(0, 100)}...`;
        }
        addLogEntry('system', focusMessage);

      } else {
        addLogEntry('system', "Game Director's contemplation yielded no new directives at this moment.");
      }
    } catch (error) {
      console.error("GameDirector: Error during analysis:", error);
      addLogEntry('error', "Game Director encountered an issue during contemplation.");
    } finally {
      setIsAnalyzing(false);
      if (!hasRunInitialAnalysis) {
        setHasRunInitialAnalysis(true); // Mark initial analysis as done after the first attempt
      }
    }
  }, [
    isAnalyzing, characterData, locationData, playerInventory, gameLog, currentEventDetails,
    getMemoryContextString, contextDirectives, playerCommandCount,
    lastAnalysisTimestamp, lastAnalysisCommandCount, addLogEntry, setContextDirectives, hasRunInitialAnalysis
  ]);
  
  // Effect for initial analysis on game start
  useEffect(() => {
    if (gameStarted && !hasRunInitialAnalysis && characterData && locationData && !isAnalyzing) {
      // console.log("GameDirector: Triggering initial analysis.");
      triggerGameDirectorAnalysis(true); // Force analysis on game start
    }
  }, [gameStarted, hasRunInitialAnalysis, characterData, locationData, triggerGameDirectorAnalysis, isAnalyzing]);


  // Effect to potentially trigger analysis based on command count changes (after initial analysis)
  useEffect(() => {
    if (gameStarted && hasRunInitialAnalysis && playerCommandCount > 0 && (playerCommandCount % ANALYSIS_COMMAND_INTERVAL === 0) && playerCommandCount !== lastAnalysisCommandCount) {
      // console.log(`GameDirector: Triggering analysis due to command count. Current: ${playerCommandCount}, Last: ${lastAnalysisCommandCount}`);
      triggerGameDirectorAnalysis();
    }
  }, [playerCommandCount, gameStarted, hasRunInitialAnalysis, lastAnalysisCommandCount, triggerGameDirectorAnalysis]);


  return {
    currentDirectives: contextDirectives,
    triggerGameDirectorAnalysis,
    lastAnalysisCommandCount
  };
};
