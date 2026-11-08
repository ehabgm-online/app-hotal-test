import React from 'react';
import { parseSearchQuery } from '../utils/bilingualSearch';

interface HighlightMatchProps {
  text: string;
  query?: string;
  className?: string;
}

export const HighlightMatch: React.FC<HighlightMatchProps> = ({
  text,
  query,
  className = '',
}) => {
  if (!text) return null;
  if (!query || !query.trim()) {
    return <span className={className}>{text}</span>;
  }

  const parsed = parseSearchQuery(query);
  const terms: string[] = [];

  for (const k of parsed.keywords) {
    if (k.length >= 2) terms.push(k);
  }
  if (parsed.targetFileNumber !== undefined) {
    terms.push(String(parsed.targetFileNumber));
  }
  if (parsed.targetYear !== undefined) {
    terms.push(String(parsed.targetYear));
  }

  if (terms.length === 0) {
    return <span className={className}>{text}</span>;
  }

  // Remove duplicates and sort by length descending to match longest phrases first
  const uniqueTerms = Array.from(new Set(terms)).sort((a, b) => b.length - a.length);
  const escaped = uniqueTerms
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');

  try {
    const regex = new RegExp(`(${escaped})`, 'gi');
    const parts = text.split(regex);

    return (
      <span className={className}>
        {parts.map((part, idx) => {
          const isHit = uniqueTerms.some(
            (t) => t.toLowerCase() === part.toLowerCase()
          );
          return isHit ? (
            <mark
              key={idx}
              className="bg-amber-200/90 text-amber-950 font-bold px-1 py-0.5 rounded shadow-2xs mx-0.5"
            >
              {part}
            </mark>
          ) : (
            <React.Fragment key={idx}>{part}</React.Fragment>
          );
        })}
      </span>
    );
  } catch {
    return <span className={className}>{text}</span>;
  }
};
