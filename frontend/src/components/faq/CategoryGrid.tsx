import React, { useRef, useState, type ReactNode } from 'react';
import type { Category } from '../../types/ui';

/**
 * Curated icon library — the set of category names that have hand-drawn
 * icons. Names are matched case-insensitively so the API can rename
 * categories slightly (e.g. "ViBe Platform" vs the original
 * "ViBe (Learning Platform)") without losing the icon.
 */
const ICON_BY_KEY: Record<string, ReactNode> = {
  'ViBe (Learning Platform)': (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 5h7a3 3 0 0 1 3 3v11H6a3 3 0 0 0-3 3z"/>
      <path d="M21 5h-7a3 3 0 0 0-3 3v11h7a3 3 0 0 1 3 3z"/>
    </svg>
  ),
  'Team Formation': (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="3"/>
      <circle cx="17" cy="9" r="2.5"/>
      <path d="M3 19a5 5 0 0 1 10 0"/>
      <path d="M14 19a4 4 0 0 1 7 0"/>
    </svg>
  ),
  Timings: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8"/>
      <path d="M12 8v4l3 2"/>
    </svg>
  ),
  'Timing and dates': (
    // Same icon as Timings — the curated key is the legacy short name,
    // the API uses the longer "Timing and dates".
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8"/>
      <path d="M12 8v4l3 2"/>
    </svg>
  ),
  NOC: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3h6l4 4v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/>
      <path d="M14 3v4h4"/>
      <path d="M9 14l2 2 4-4"/>
    </svg>
  ),
  'NOC (No Objection Certificate)': (
    // Same icon as the legacy "NOC" key — the API uses the full name.
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3h6l4 4v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/>
      <path d="M14 3v4h4"/>
      <path d="M9 14l2 2 4-4"/>
    </svg>
  ),
  'Offer Letter': (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="6" width="18" height="12" rx="2"/>
      <path d="M3 8l9 6 9-6"/>
    </svg>
  ),
  'Selection, offer letter, and certificate': (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="6" width="18" height="12" rx="2"/>
      <path d="M3 8l9 6 9-6"/>
    </svg>
  ),
  Projects: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
    </svg>
  ),
  'Work, mentorship, and projects': (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
    </svg>
  ),
  Rosetta: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l2.3 4.7L19 9l-3.5 3.4L16.7 17 12 14.6 7.3 17l1.2-4.6L5 9l4.7-1.3z"/>
    </svg>
  ),
  'Rosetta — your internship journal': (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l2.3 4.7L19 9l-3.5 3.4L16.7 17 12 14.6 7.3 17l1.2-4.6L5 9l4.7-1.3z"/>
    </svg>
  ),
  Certificate: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="9" r="4"/>
      <path d="M8 13l-2 6 4-2 2 2 2-2 4 2-2-6"/>
    </svg>
  ),
  Interviews: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/>
      <path d="M7 10h6M7 13h9"/>
    </svg>
  ),
  'Interviews Related': (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/>
      <path d="M7 10h6M7 13h9"/>
    </svg>
  ),
};

const DEFAULT_ICON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1"/>
    <rect x="14" y="3" width="7" height="7" rx="1"/>
    <rect x="3" y="14" width="7" height="7" rx="1"/>
    <rect x="14" y="14" width="7" height="7" rx="1"/>
  </svg>
);

/**
 * Resolve the icon for a given category name. Tries:
 *  1. Exact match against the curated library
 *  2. Case-insensitive substring match (handles minor rename drift between
 *     the hardcoded list and the actual API category names)
 *  3. Fallback to a generic grid icon
 */
const resolveIconForName = (name: string): ReactNode => {
  if (ICON_BY_KEY[name]) return ICON_BY_KEY[name];
  const lower = name.toLowerCase();
  for (const [key, icon] of Object.entries(ICON_BY_KEY)) {
    if (lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) {
      return icon;
    }
  }
  return DEFAULT_ICON;
};

interface CategoryGridProps {
  activeCategory?: string;
  onSelect?: (category: string) => void;
  className?: string;
  /**
   * List of categories to render. Each item is augmented with a curated
   * icon (or a default grid icon) inside the component — consumers do
   * not need to attach an icon themselves.
   */
  categories?: Array<{ name: string; count?: number }>;
}

/**
 * @deprecated The `categoryPills` export is kept only for the deprecated
 * HomePage. New consumers should pass `categories` (sourced from the API)
 * and let this component resolve icons internally.
 */
export const categoryPills: Category[] = Object.entries(ICON_BY_KEY).map(([name, icon]) => ({
  name,
  icon,
}));

export default function CategoryGrid({
  activeCategory,
  onSelect,
  className = '',
  categories: categoriesProp,
}: CategoryGridProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);

  // When no `categories` prop is provided, fall back to the original
  // curated short-name list (kept for the deprecated HomePage that still
  // imports this component). The deprecated page renders a static
  // "explore categories" view; the live FAQPage now passes API categories
  // so pills match the data exactly and the click → filter chain works.
  const LEGACY_PILL_NAMES = [
    'ViBe (Learning Platform)',
    'Team Formation',
    'Timings',
    'NOC',
    'Offer Letter',
    'Projects',
    'Rosetta',
    'Certificate',
    'Interviews',
    'Others',
  ];
  const categories: Array<{ name: string; count?: number }> = (categoriesProp ?? LEGACY_PILL_NAMES.map((name) => ({ name })));

  const updateFades = () => {
    const el = scrollerRef.current;
    if (!el) return;
    setShowLeftFade(el.scrollLeft > 8);
    setShowRightFade(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
  };

  const handleScroll = (direction: number) => {
    if (!scrollerRef.current) return;
    scrollerRef.current.scrollBy({
      left: direction * 240,
      behavior: 'smooth',
    });
  };

  return (
    <div className={`w-full ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-ink-faint uppercase tracking-wide">
          Quick filters
        </p>
        {/* "Browse all" clears the active category (and the ?category= URL
            param via the parent sync). Previously this navigated to /faq
            which is a no-op when already there, leaving the user stuck on
            the filtered view. We now expect a parent-supplied onClear
            callback; if none, the link renders as a non-clickable label. */}
        {onSelect ? (
          <button
            onClick={() => onSelect('')}
            className="text-xs font-medium text-ink-soft hover:text-accent transition-colors"
          >
            Browse all
          </button>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => handleScroll(-1)}
          className="shrink-0 w-8 h-8 rounded-full border border-border/80 bg-card/90 backdrop-blur-sm shadow-subtle flex items-center justify-center text-ink-faint hover:text-ink hover:border-ink/20 hover:bg-cream transition-all"
          aria-label="Scroll categories left"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <div
          ref={scrollerRef}
          onScroll={updateFades}
          className="relative flex-1 flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide scroll-smooth"
        >
          {showLeftFade && (
            <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-bg/90 to-transparent pointer-events-none z-10" />
          )}
          {showRightFade && (
            <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-bg/90 to-transparent pointer-events-none z-10" />
          )}
          {categories.map((cat) => {
            const isActive = !!(activeCategory
              && activeCategory.toLowerCase() === cat.name.toLowerCase());
            return (
              <button
                key={cat.name}
                onClick={() => onSelect?.(cat.name)}
                aria-pressed={isActive}
                className={`flex items-center gap-2 px-4 py-2 rounded-full border text-xs font-semibold whitespace-nowrap transition-all duration-200 flex-shrink-0
                  ${isActive
                    ? 'bg-accent text-accent-text border-accent/50 shadow-[0_10px_26px_rgba(90,122,90,0.25)]'
                    : 'bg-card/80 text-ink border-border/70 hover:bg-cream hover:-translate-y-0.5 hover:shadow-subtle'
                  }`}
              >
                <span className={`${isActive ? 'text-accent-text' : 'text-ink-faint'}`}>
                  {resolveIconForName(cat.name)}
                </span>
                <span>{cat.name}</span>
                {typeof cat.count === 'number' && (
                  <span className="text-ink-faint text-[10px]">({cat.count})</span>
                )}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => handleScroll(1)}
          className="shrink-0 w-8 h-8 rounded-full border border-border/80 bg-card/90 backdrop-blur-sm shadow-subtle flex items-center justify-center text-ink-faint hover:text-ink hover:border-ink/20 hover:bg-cream transition-all"
          aria-label="Scroll categories right"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}