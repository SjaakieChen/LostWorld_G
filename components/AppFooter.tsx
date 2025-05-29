
import React from 'react';

const AppFooter: React.FC = () => {
  return (
    <div className="w-full bg-slate-900/80 border-t border-slate-700/60">
      <div className="p-4 w-full max-w-7xl mx-auto">
        <footer className="text-center text-slate-500 text-sm">
          <p>&copy; {new Date().getFullYear()} LostWorld Project. All rights reserved (not really).</p>
          <p>API Key for Gemini is expected to be in `process.env.API_KEY`.</p>
        </footer>
      </div>
    </div>
  );
};

export default AppFooter;
