// components/ImageViewModal.tsx
import React from 'react';

interface ImageViewModalProps {
  imageUrl: string;
  altText: string;
  onClose: () => void;
}

const ImageViewModal: React.FC<ImageViewModalProps> = ({ imageUrl, altText, onClose }) => {
  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-[60]" // Higher z-index than other modals
      aria-modal="true"
      role="dialog"
      onClick={onClose}
    >
      <div
        className="relative bg-slate-900 p-2 rounded-lg shadow-2xl max-w-3xl max-h-[90vh] w-auto h-auto flex items-center justify-center transform transition-all duration-300 ease-out scale-95 opacity-0 animate-modal-appear"
        onClick={(e) => e.stopPropagation()} // Prevent closing when clicking on the image/inner modal
        style={{
            animationName: 'modal-appear-animation',
            animationDuration: '0.3s',
            animationFillMode: 'forwards',
        }}
        aria-labelledby="image-view-modal-title"
      >
        <button
          onClick={onClose}
          className="absolute top-2 right-2 text-slate-300 hover:text-white bg-slate-800/70 hover:bg-slate-700 rounded-full p-1.5 leading-none z-10"
          aria-label={`Close image view for ${altText}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <img
          src={imageUrl}
          alt={altText}
          className="block max-w-full max-h-[85vh] object-contain rounded"
          style={{ imageRendering: 'pixelated' }}
          aria-describedby="image-view-modal-title"
        />
        <h3 id="image-view-modal-title" className="sr-only">{altText}</h3>
      </div>
      {/* Keyframes defined globally or in App.tsx/index.html usually handle this, but repeated for clarity if needed locally */}
      <style>{`
        @keyframes modal-appear-animation {
          to {
            transform: scale(1);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
};

export default ImageViewModal;
