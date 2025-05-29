// hooks/useAppLoadingState.ts
import { useMemo } from 'react';
import { useGameContext } from '../contexts/GameContext'; // Import to access isConsoleBusy

interface UseAppLoadingStateProps {
  contextIsLoading: boolean; // This is GameContext's isLoading (for global blocking loads)
  contextLoadingMessage: string | null;
  hookIsLoadingItems: boolean;
  hookIsLoadingNPCs: boolean;
  isGeneratingEvent: boolean;
  eventLoadingMessage: string | null;
  isCharacterDefeated: boolean;
}

interface AppLoadingState {
  appHeaderIsLoading: boolean;
  appHeaderLoadingMessage: string | null;
  consoleIsProcessing: boolean;
}

export const useAppLoadingState = ({
  contextIsLoading,
  contextLoadingMessage,
  hookIsLoadingItems,
  hookIsLoadingNPCs,
  isGeneratingEvent,
  eventLoadingMessage,
  isCharacterDefeated,
}: UseAppLoadingStateProps): AppLoadingState => {
  const { isConsoleBusy } = useGameContext(); // Get isConsoleBusy from context

  const appHeaderIsLoading = useMemo(() => {
    // AppHeader should show loading for global context loads, item/NPC searches, and event generation.
    // It should NOT show loading just because the console is busy with a non-blocking command.
    return contextIsLoading || hookIsLoadingItems || hookIsLoadingNPCs || isGeneratingEvent;
  }, [contextIsLoading, hookIsLoadingItems, hookIsLoadingNPCs, isGeneratingEvent]);

  const appHeaderLoadingMessage = useMemo(() => {
    if (contextIsLoading && contextLoadingMessage) { // Global blocking load from game init, item use, etc.
      return contextLoadingMessage;
    }
    if (hookIsLoadingItems) {
      return "Searching for items...";
    }
    if (hookIsLoadingNPCs) {
      return "Looking for people...";
    }
    if (isGeneratingEvent && eventLoadingMessage) {
      return eventLoadingMessage;
    }
    // If only isConsoleBusy is true, no appHeaderLoadingMessage should be shown.
    return null; 
  }, [
    contextIsLoading, contextLoadingMessage, 
    hookIsLoadingItems, hookIsLoadingNPCs, 
    isGeneratingEvent, eventLoadingMessage
  ]);

  const consoleIsProcessing = useMemo(() => {
    // Console input should be disabled if:
    // 1. A global blocking action is happening (contextIsLoading).
    // 2. The console itself is busy processing a command (isConsoleBusy).
    // 3. An unexpected event is generating.
    // 4. The character is defeated.
    // It should NOT be disabled just because items/NPCs are loading in the background from their respective buttons.
    return contextIsLoading || isConsoleBusy || isGeneratingEvent || isCharacterDefeated;
  }, [contextIsLoading, isConsoleBusy, isGeneratingEvent, isCharacterDefeated]);

  return {
    appHeaderIsLoading,
    appHeaderLoadingMessage,
    consoleIsProcessing,
  };
};
