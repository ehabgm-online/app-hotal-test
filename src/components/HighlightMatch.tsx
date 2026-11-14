import React, { useMemo } from 'react';
import { parseSearchQuery } from '../utils/bilingualSearch';

interface HighlightMatchProps {
  text: string;
  query?: string;
  className?: string;
}

export const HighlightMatch: React.FC<HighlightMatchProps> = React.memo(
  ({ text, query, className = '' }) => {
    const trimmedQuery = query?.trim() || '';

    const compiled = useMemo(() => {
      if (!trimmedQuery) return null;

      const parsed = parseSearchQuery(trimmedQuery);
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

      if (terms.length === 0) return null;

      const uniqueTerms = Array.from(new Set(terms)).sort((a, b) => b.length - a.length);
      const lowerSet = new Set(uniqueTerms.map((t) => t.toLowerCase()));
      const escaped = uniqueTerms
        .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('|');

      try {
        return {
          regex: new RegExp(`(${escaped})`, 'gi'),
          lowerSet,
        };
      } catch {
        return null;
      }
    }, [trimmedQuery]);

    if (!text) return null;
    if (!compiled) {
      return <span className={className}>{text}</span>;
    }

    const parts = text.split(compiled.regex);

    return (
      <span className={className}>
        {parts.map((part, idx) => {
          const isHit = compiled.lowerSet.has(part.toLowerCase());
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
  }
);

