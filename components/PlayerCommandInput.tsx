
import React, { useState } from 'react';
import Spinner from './Spinner';

interface PlayerCommandInputProps {
  onSubmit: (command: string) => void;
  isProcessing: boolean;
}

const PlayerCommandInput: React.FC<PlayerCommandInputProps> = ({ onSubmit, isProcessing }) => {
  const [command, setCommand] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (command.trim() && !isProcessing) {
      onSubmit(command.trim());
      setCommand('');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-4 flex items-center gap-3">
      <label htmlFor="command-input" className="sr-only">Enter command</label>
      <input
        id="command-input"
        type="text"
        value={command}
        onChange={(e) => setCommand(e.target.value)}
        placeholder="What do you do?"
        disabled={isProcessing}
        className="flex-grow bg-slate-700 text-slate-200 placeholder-slate-500 border border-slate-600 rounded-lg py-2.5 px-4 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow duration-150 ease-in-out shadow-sm disabled:opacity-70"
        aria-label="Player command input"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck="false"
      />
      <button
        type="submit"
        disabled={isProcessing || !command.trim()}
        className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2.5 px-6 rounded-lg transition-colors duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-opacity-75 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shadow-md hover:shadow-lg"
        aria-label="Submit command"
      >
        {isProcessing ? (
          <>
            <Spinner className="w-5 h-5 mr-2" />
            Sending...
          </>
        ) : (
          'Send'
        )}
      </button>
    </form>
  );
};

export default PlayerCommandInput;