// App.tsx
import React from 'react';
import { GameProvider } from './contexts/GameContext';
import AppContent from './components/AppContent'; // Updated import

const App: React.FC = () => {
  return (
    <GameProvider>
      <AppContent />
    </GameProvider>
  );
};
export default App;