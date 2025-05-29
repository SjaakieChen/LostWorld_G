
import React from 'react';

interface AlertProps {
  type: 'error' | 'success' | 'warning' | 'info';
  message: string;
  className?: string;
}

const Alert: React.FC<AlertProps> = ({ type, message, className = '' }) => {
  const baseClasses = 'p-4 rounded-md text-sm';
  let typeClasses = '';

  switch (type) {
    case 'error':
      typeClasses = 'bg-red-900/50 text-red-300 border border-red-700';
      break;
    case 'success':
      typeClasses = 'bg-green-900/50 text-green-300 border border-green-700';
      break;
    case 'warning':
      typeClasses = 'bg-yellow-900/50 text-yellow-300 border border-yellow-700';
      break;
    case 'info':
    default:
      typeClasses = 'bg-sky-900/50 text-sky-300 border border-sky-700';
      break;
  }

  return (
    <div className={`${baseClasses} ${typeClasses} ${className}`} role="alert">
      <p className="font-medium">{type.charAt(0).toUpperCase() + type.slice(1)}</p>
      <p>{message}</p>
    </div>
  );
};

export default Alert;
