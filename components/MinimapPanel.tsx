
// components/MinimapPanel.tsx
import React from 'react';
import { VisitedLocationEntry } from '../contexts/GameContext';
// Corrected import path for Coordinates
import { Coordinates } from '../contexts/GameContext';
import { FullLocationData, VisualStyleType } from '../services/gameTypes'; // Added VisualStyleType

interface MinimapPanelProps {
  visitedLocations: Map<string, VisitedLocationEntry>;
  currentCoordinates: Coordinates;
  onSelectLocationForModal: (location: FullLocationData, coordinateKey: string) => void; // Updated signature
  visualStyle: VisualStyleType; // Added visualStyle prop
}

const MAP_SIZE_RADIUS = 3; // Creates a (2*radius + 1) x (2*radius + 1) grid, e.g., 7x7 for radius 3

const MinimapPanel: React.FC<MinimapPanelProps> = ({ visitedLocations, currentCoordinates, onSelectLocationForModal, visualStyle }) => {
  const mapCells = [];
  const imageRenderingStyle: React.CSSProperties = {
    imageRendering: visualStyle === 'Pixel Art' ? 'pixelated' : 'auto',
  };

  for (let yOffset = MAP_SIZE_RADIUS; yOffset >= -MAP_SIZE_RADIUS; yOffset--) {
    const rowCells = [];
    for (let xOffset = -MAP_SIZE_RADIUS; xOffset <= MAP_SIZE_RADIUS; xOffset++) {
      const cellX = currentCoordinates.x + xOffset;
      const cellY = currentCoordinates.y + yOffset;
      const cellKey = `${cellX},${cellY}`;
      const visitedEntry = visitedLocations.get(cellKey);
      const isCurrentLocation = cellX === currentCoordinates.x && cellY === currentCoordinates.y;

      const cellElements: React.ReactNode[] = [];
      let cellWrapperClasses = "w-14 h-14 border border-slate-700 flex items-center justify-center relative text-xs"; 
      let title = `${cellX},${cellY}`;
      let buttonAriaLabel = `Location at ${cellX},${cellY}`;

      if (visitedEntry) {
        cellWrapperClasses += " bg-slate-600/50";
        title = `${visitedEntry.location.name} (${visitedEntry.location.rarity}) (${cellX},${cellY})`;
        buttonAriaLabel = `View details for ${visitedEntry.location.name} at ${cellX},${cellY}`;
        cellElements.push(
          <img 
            key={`${cellKey}-img`}
            src={visitedEntry.location.imageUrl} 
            alt={visitedEntry.location.name} 
            className="w-full h-full object-contain pointer-events-none" 
            style={imageRenderingStyle} // Apply dynamic style
          />
        );

        const exits = visitedEntry.location.validExits || [];
        const exitIndicatorBaseClasses = "absolute bg-lime-500/80 pointer-events-none";
        const neighborCoords = {
            north: `${cellX},${cellY + 1}`, south: `${cellX},${cellY - 1}`,
            east: `${cellX + 1},${cellY}`, west: `${cellX - 1},${cellY}`,
        };
        
        if (exits.includes("north")) cellElements.push(<div key={`${cellKey}-exit-n`} className={`${exitIndicatorBaseClasses} h-1.5 w-4 top-0 left-1/2 -translate-x-1/2 rounded-b-sm`} title={`Exit North to ${visitedLocations.get(neighborCoords.north)?.location.name || 'Unexplored'}`}></div>);
        if (exits.includes("south")) cellElements.push(<div key={`${cellKey}-exit-s`} className={`${exitIndicatorBaseClasses} h-1.5 w-4 bottom-0 left-1/2 -translate-x-1/2 rounded-t-sm`} title={`Exit South to ${visitedLocations.get(neighborCoords.south)?.location.name || 'Unexplored'}`}></div>);
        if (exits.includes("east")) cellElements.push(<div key={`${cellKey}-exit-e`} className={`${exitIndicatorBaseClasses} w-1.5 h-4 top-1/2 right-0 -translate-y-1/2 rounded-l-sm`} title={`Exit East to ${visitedLocations.get(neighborCoords.east)?.location.name || 'Unexplored'}`}></div>);
        if (exits.includes("west")) cellElements.push(<div key={`${cellKey}-exit-w`} className={`${exitIndicatorBaseClasses} w-1.5 h-4 top-1/2 left-0 -translate-y-1/2 rounded-r-sm`} title={`Exit West to ${visitedLocations.get(neighborCoords.west)?.location.name || 'Unexplored'}`}></div>);

      } else {
        cellWrapperClasses += " bg-slate-800"; 
        cellElements.push(<span key={`${cellKey}-fog`} className="text-slate-600 pointer-events-none">?</span>);
        title = `Unexplored (${cellX},${cellY})`;
        buttonAriaLabel = `Unexplored area at ${cellX},${cellY}`;
      }

      if (isCurrentLocation) {
        cellWrapperClasses += " ring-2 ring-amber-400 shadow-lg shadow-amber-500/30 z-10";
         cellElements.push(
            <div key={`${cellKey}-current-marker`} className="absolute inset-0 flex items-center justify-center text-amber-300 font-bold text-2xl pointer-events-none" aria-hidden="true">
                &#x25CE; 
            </div>
          );
      } else if (visitedEntry) {
        cellWrapperClasses += " ring-1 ring-slate-500 hover:ring-sky-400 transition-all";
      }


      rowCells.push(
        <button
          key={cellKey}
          type="button"
          className={`${cellWrapperClasses} focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-700 ${visitedEntry ? 'focus:ring-sky-500' : 'focus:ring-slate-500 cursor-default'}`}
          title={title}
          aria-label={buttonAriaLabel}
          onClick={() => visitedEntry && onSelectLocationForModal(visitedEntry.location, cellKey)} // Pass cellKey
          disabled={!visitedEntry}
        >
          {cellElements}
        </button>
      );
    }
    mapCells.push(<div key={`row-${yOffset}`} className="flex">{rowCells}</div>);
  }

  return (
    <div className="flex flex-col items-center p-2 bg-slate-700/30 rounded-md shadow-inner">
      <div className="grid grid-cols-1 gap-0">
        {mapCells}
      </div>
      {/* Removed local .pixelated-render style definition as it's now handled by inline styles */}
    </div>
  );
};

export default MinimapPanel;
