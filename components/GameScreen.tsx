// components/GameScreen.tsx
import React from 'react';
import MainGameContent from './MainGameContent';
import GameOverScreen from './GameOverScreen';
import { CharacterData, FullLocationData, GameLogEntry, VisualStyleType } from '../services/gameTypes';
import { GameInterfaceProps } from './GameInterface';

interface GameScreenProps {
  isGlobalBlockingLoad: boolean;
  loadingMessage: string | null;
  error: string | null;
  gameStarted: boolean;
  apiKeyMissing: boolean;
  characterData: CharacterData | null;
  locationData: FullLocationData | null;
  gameLog: GameLogEntry[];
  gameInterfaceProps: GameInterfaceProps;
  onQuickStart: () => void;
  onCustomStart: (settingType: 'Fictional' | 'Historical', userIdea: string, visualStyle: VisualStyleType) => void;
  onTryAgain: () => void;
}

const GameScreen: React.FC<GameScreenProps> = ({
  isGlobalBlockingLoad,
  loadingMessage,
  error,
  gameStarted,
  apiKeyMissing,
  characterData,
  locationData,
  gameLog,
  gameInterfaceProps,
  onQuickStart,
  onCustomStart,
  onTryAgain,
}) => {
  if (characterData?.isDefeated) {
    return (
      <GameOverScreen
        characterData={characterData}
        gameLog={gameLog}
        onTryAgain={onTryAgain}
      />
    );
  }

  return (
    <MainGameContent
      isGlobalBlockingLoad={isGlobalBlockingLoad}
      loadingMessage={loadingMessage}
      error={error}
      gameStarted={gameStarted}
      apiKeyMissing={apiKeyMissing}
      characterData={characterData}
      locationData={locationData}
      gameInterfaceProps={gameInterfaceProps}
      handleStartNewGame={onQuickStart}
      handleCustomStartGame={onCustomStart}
    />
  );
};

export default GameScreen;
