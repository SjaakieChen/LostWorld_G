
// utils/textUtils.tsx
import React from 'react';

// Utility to parse [lore] tags into styled spans
export const parseLoreTagsToReactNode = (text: string | undefined): React.ReactNode => {
  if (!text) return '';
  // FIX: Changed parts array type to React.ReactNode for broader compatibility
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  // Updated regex to be slightly more robust with potential internal newlines in content, though ideally content is single-line.
  const regex = /\[lore entity_type="([^"]*)" entity_name="([^"]*)"\]([\s\S]*?)\[\/lore\]/g;
  let match;
  let keyIndex = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    // Variables entityType, entityName, and contentValue are correctly destructured from the regex match.
    const [, entityType, entityName, contentValue] = match;
    // FIX: Replaced JSX span with React.createElement to avoid JSX parsing issues in a .ts file.
    // This resolves "Cannot find name 'span'", "Cannot find name 'key'", "Cannot find name 'className'", "Cannot find name 'title'",
    // and the shorthand property error for 'content'.
    parts.push(
      React.createElement(
        'span',
        {
          key: `lore-${keyIndex++}-${entityName}`,
          className: "text-yellow-400 hover:text-yellow-300 font-medium",
          title: `Lore: ${entityName} (${entityType})`
        },
        contentValue // contentValue is passed as children
      )
    );
    // FIX: regex.lastIndex is a standard property. Errors related to it were likely due to prior JSX parsing failures.
    lastIndex = regex.lastIndex;
  }

  // FIX: text and lastIndex are correctly used. Errors related to them were likely due to prior JSX parsing failures.
  if (lastIndex < text.length) {
    // FIX: parts, text, and lastIndex are correctly used.
    parts.push(text.substring(lastIndex));
  }
  // FIX: Replaced JSX Fragment with React.createElement call.
  // This ensures the function returns React.ReactNode compatible output without using JSX syntax directly.
  return React.createElement(React.Fragment, null, ...parts);
};
