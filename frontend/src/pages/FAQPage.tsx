import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Footer from '../components/layout/Footer';
import SearchBar from '../components/search/SearchBar';
import { FAQDoodles } from '../components/ui/PageDoodles';
import axios from 'axios';
import api, { friendlyError } from '../utils/api';

// Modular components
import {
  FAQItem,
  getCategoryIcon,
  getCategoryDescription,
  formatCategoryName,
  getCategoryTone,
  IconGrid,
  getQuestionTitle,
} from '../components/faq/faqUtils';
import SearchDropdown from '../components/faq/SearchDropdown';
import SearchFeedback from '../components/faq/SearchFeedback';
import CategoryCardGrid from '../components/faq/CategoryCardGrid';
import QuestionList from '../components/faq/QuestionList';
import QuestionDetail from '../components/faq/QuestionDetail';

// Sub-component props interfaces
interface CategoryPillsProps {
  categories: string[];
  activeCategory: string;
  onSelect: (name: string) => void;
}

// Sub-components
function CategoryPills({ categories, activeCategory, onSelect }: CategoryPillsProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  const handleScroll = (direction: number) => {
    if (!scrollerRef.current) return;
    scrollerRef.current.scrollBy({ left: direction * 240, behavior: 'smooth' });
  };

  const allActive = !activeCategory;

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-6">
        <p className="text-xs font-semibold text-ink-faint uppercase tracking-wide">
          Browse categories
        </p>
        <span className="text-xs text-ink-soft">{categories.length} categories</span>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => handleScroll(-1)}
          className="shrink-0 w-8 h-8 rounded-full border border-border/80 bg-card/90 shadow-subtle flex items-center justify-center text-ink-faint hover:text-ink hover:border-ink/20 hover:bg-cream transition-all"
          aria-label="Scroll categories left"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <div
          ref={scrollerRef}
          className="flex-1 flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide scroll-smooth"
        >
          <button
            onClick={() => onSelect('')}
            className={`flex items-center gap-2 px-4 py-2 rounded-full border text-xs font-semibold whitespace-nowrap transition-all duration-200 flex-shrink-0
              ${allActive
                ? 'bg-accent text-accent-text border-accent/60 shadow-[0_10px_26px_rgba(90,122,90,0.25)]'
                : 'bg-card/80 text-ink border-border/70 hover:bg-cream hover:-translate-y-0.5 hover:shadow-subtle'
              }`}
          >
            <span className={allActive ? 'text-accent-text' : 'text-ink-faint'}>
              <IconGrid />
            </span>
            All
          </button>

          {categories.map((name) => {
            const isActive = activeCategory?.toLowerCase() === name.toLowerCase();
            const tone = getCategoryTone(name);
            return (
              <button
                key={name}
                onClick={() => onSelect(name)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full border text-xs font-semibold whitespace-nowrap transition-all duration-200 flex-shrink-0
                  ${isActive
                    ? 'bg-accent text-accent-text border-accent/60 shadow-[0_10px_26px_rgba(90,122,90,0.25)]'
                    : 'bg-card/80 text-ink border-border/70 hover:bg-cream hover:-translate-y-0.5 hover:shadow-subtle'
                  }`}
              >
                <span className={isActive ? 'text-accent-text' : tone.accent}>
                  {getCategoryIcon(name)}
                </span>
                {formatCategoryName(name)}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => handleScroll(1)}
          className="shrink-0 w-8 h-8 rounded-full border border-border/80 bg-card/90 shadow-subtle flex items-center justify-center text-ink-faint hover:text-ink hover:border-ink/20 hover:bg-cream transition-all"
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



export default function FAQPage() {
  const [grouped, setGrouped] = useState<Record<string, FAQItem[]>>({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeCategory, setActiveCategory] = useState('');
  const [activeQuestion, setActiveQuestion] = useState<FAQItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FAQItem[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [sortOption, setSortOption] = useState('relevant');
  const [visibleCount, setVisibleCount] = useState(8);
  const searchBarRef = useRef<HTMLInputElement>(null);

  const [resultFaqId, setResultFaqId] = useState<string | undefined>(undefined);
  const { id: urlFaqId } = useParams<string>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // Two-way sync between `activeCategory` and the `?category=` URL param.
  //
  // Two effects would race on first mount — the first reads the URL and
  // schedules a setActiveCategory, but the second sees the stale
  // activeCategory='' and the old searchParams (still carrying the
  // category), then strips it from the URL before the first effect's
  // state update lands. Result: a deep link like /faq?category=NOC
  // gets wiped to /faq on load, and a Maximum update depth warning.
  //
  // Combine into one effect with a ref guard so each render does at
  // most ONE direction of sync.
  const hasInitializedCategoryFromUrlRef = useRef(false);
  useEffect(() => {
    const fromUrl = searchParams.get('category') || '';
    if (!hasInitializedCategoryFromUrlRef.current) {
      // First render after mount: seed state from the URL.
      hasInitializedCategoryFromUrlRef.current = true;
      if (fromUrl) setActiveCategory(fromUrl);
      return;
    }
    // Subsequent renders: push state to the URL, but only when it
    // actually changed (otherwise we'd loop on every URLSearchParams
    // identity change).
    if (activeCategory === fromUrl) return;
    const next = new URLSearchParams(searchParams);
    if (activeCategory) next.set('category', activeCategory);
    else next.delete('category');
    setSearchParams(next, { replace: true });
  }, [activeCategory, searchParams, setSearchParams]);

  // Scroll to top when a question detail is opened
  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Track top result FAQ ID when search results arrive
  useEffect(() => {
    if (Array.isArray(searchResults) && searchResults.length > 0) {
      setResultFaqId((searchResults[0] as FAQItem)._id);
    }
  }, [searchResults]);

  useEffect(() => {
    // AbortController scoped to this mount. If the user navigates away
    // (or React StrictMode unmounts the first instance in dev), the cleanup
    // function below fires and aborts the in-flight request so we never
    // call setTrendingWords on an unmounted component.
    const controller = new AbortController();
    const { signal } = controller;

    api.get('/faq', { signal })
      .then((res) => {
        setGrouped(res.data.grouped || {});
        setTotal(res.data.total || 0);
      })
      .catch((err: unknown) => {
        if (axios.isCancel(err)) return; // expected on unmount — silent
        const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to load FAQs. Please try again.';
        setError(message);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, []);

  const categories = useMemo(() => Object.keys(grouped).sort(), [grouped]);

  /**
   * Sorted list of category names for the pill scroller. Sorted with
   * the same numeric-aware comparator as CategoryCardGrid so the pill
   * row and the card grid stay in lockstep ("10." after "9.", not
   * lexicographic).
   */
  const quickFilterCategories = useMemo(
    () => Object.entries(grouped)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, items]) => ({ name, count: items.length })),
    [grouped],
  );

  const flatQuestions = useMemo(() => (
    categories.flatMap((name) => (grouped[name] || []).map((item) => ({
      ...item,
      category: item.category || name,
      source: item.source || 'faq',
    })))
  ), [categories, grouped]);

  useEffect(() => {
    // Check for pre-selected FAQ from HomePage search navigation
    // Guard: only run once grouped data is actually available (race condition fix)
    if (!grouped || Object.keys(grouped).length === 0) return;

    const highlightStr = sessionStorage.getItem('yaksha_faq_highlight');
    if (highlightStr) {
      try {
        const highlight = JSON.parse(highlightStr) as FAQItem;
        sessionStorage.removeItem('yaksha_faq_highlight');
        const category = highlight.category || '';
        if (category && grouped[category]) {
          const found = grouped[category].find((item) => item._id === highlight._id);
          if (found) {
            setActiveQuestion({ ...found, category });
            setActiveCategory(category);
          }
        }
      } catch {
        sessionStorage.removeItem('yaksha_faq_highlight');
      }
    }
  }, [grouped]);

  // If user landed on /faq/:id directly, open that FAQ immediately
  useEffect(() => {
    if (!urlFaqId) return;
    // Search all categories for the FAQ with this ID
    if (grouped && Object.keys(grouped).length > 0) {
      for (const [cat, items] of Object.entries(grouped)) {
        const found = items.find((item) => item._id === urlFaqId);
        if (found) {
          setActiveQuestion({ ...found, category: cat });
          setActiveCategory(cat);
          return;
        }
      }
    }
    // Not in cache — fetch directly from API. AbortController scoped to
    // this effect so an unmount (or grouped arriving mid-request) doesn't
    // fire setActiveQuestion on stale data.
    const controller = new AbortController();
    api.get(`/faq/${urlFaqId}`, { signal: controller.signal })
      .then((res) => {
        const faq = res.data;
        if (faq && faq._id) {
          setActiveQuestion({ ...faq, category: faq.category || '' });
          setActiveCategory(faq.category || '');
        }
      })
      .catch((err: unknown) => {
        if (axios.isCancel(err)) return;
        /* FAQ not found or access denied */
        if ((err as { response?: { status?: number } })?.response?.status !== 404) {
          console.warn('[FAQPage] direct FAQ fetch failed:', friendlyError(err, 'Could not load FAQ.'));
        }
      });
    return () => controller.abort();
  }, [urlFaqId, grouped]);

  useEffect(() => {
    setVisibleCount(8);
  }, [activeCategory, searchResults, searchQuery]);

  useEffect(() => {
    if (searchQuery.trim().length === 0) {
      setSearchResults(null);
      setSearchLoading(false);
    }
  }, [searchQuery]);

  const activeCategoryItems = useMemo(
    () => (activeCategory ? (grouped[activeCategory] || []) : []),
    [activeCategory, grouped],
  );
  const activeCategoryMeta = useMemo(
    () => getCategoryDescription(activeCategoryItems),
    [activeCategoryItems],
  );

  const searchActive = searchQuery.trim().length >= 3 && Array.isArray(searchResults);
  const showDropdown = searchQuery.trim().length > 0 && !searchActive;

  const retryFaqLoad = useCallback(() => {
    setError('');
    setLoading(true);
    api.get('/faq')
      .then((res) => {
        setGrouped(res.data.grouped || {});
        setTotal(res.data.total || 0);
      })
      .catch((err: unknown) => {
        if (axios.isCancel(err)) return;
        const m = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to load FAQs.';
        setError(m);
      })
      .finally(() => setLoading(false));
  }, []);

  const dropdownItems = useMemo(() => {
    if (Array.isArray(searchResults) && searchQuery.trim().length >= 3) {
      return searchResults;
    }
    if (!searchQuery.trim()) {
      return flatQuestions.slice(0, 5);
    }
    const normalized = searchQuery.trim().toLowerCase();
    return flatQuestions.filter((item) => (
      getQuestionTitle(item).toLowerCase().includes(normalized)
    )).slice(0, 5);
  }, [flatQuestions, searchResults, searchQuery]);

  const relatedItems = useMemo(() => {
    if (!activeQuestion?.category) return [];
    const pool = grouped[activeQuestion.category] || [];
    return pool.filter((item) => item._id !== activeQuestion._id).slice(0, 5);
  }, [activeQuestion, grouped]);

  const runSearch = async (q: string) => {
    const queryStr = q.trim();
    if (queryStr.length < 3) return;

    setSearchLoading(true);
    setError('');
    try {
      const res = await api.post('/search', { query: queryStr });
      setSearchResults(res.data.results || []);
    } catch {
      setSearchResults([]);
      setError('Search failed. Please try again.');
    } finally {
      setSearchLoading(false);
    }
  };

  const handleWordClick = (wordQuery: string) => {
    setSearchQuery(wordQuery);
    setActiveCategory('');
    setActiveQuestion(null);
    runSearch(wordQuery);
  };

  const handleCategoryOpen = (name: string) => {
    // Use functional update to batch all state changes in one render cycle,
    // preventing intermediate render flashes (e.g. activeQuestion=null briefly visible)
    setActiveCategory(name);
    setActiveQuestion(null);
    setSearchQuery('');
    setSearchResults(null);
    setSearchLoading(false);
    setVisibleCount(8);
  };

  const handleQuestionOpen = (item: FAQItem) => {
    setActiveQuestion(item);
    setSearchQuery('');
    setSearchResults(null);
  };

  const handleBackToCategories = () => {
    setActiveCategory('');
    setActiveQuestion(null);
  };

  const handleBackFromDetail = () => {
    // Detect whether the user came from the homepage via a highlighted card
    // (clicked from "Solved Recently" or similar on the HomePage).
    // If so, navigate back to '/' instead of relying on browser history.
    const fromHomepage = !!sessionStorage.getItem('yaksha_faq_highlight');
    sessionStorage.removeItem('yaksha_faq_highlight');

    if (fromHomepage) {
      navigate('/');
      return;
    }
    // Otherwise just close the detail panel — the conditional rendering
    // will show the correct prior state (search results or category list)
    setActiveQuestion(null);
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (value.trim()) {
      setActiveCategory('');
      setActiveQuestion(null);
      setSearchResults(null);
    }
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setSearchResults(null);
    setSearchLoading(false);
  };

  return (
    <div className="min-h-screen bg-bg text-ink flex flex-col">
      <FAQDoodles />

      <main className="max-w-[1200px] mx-auto px-4 sm:px-6 pt-[112px] sm:pt-[128px] pb-10 relative z-10">
        <div className="mb-6 text-center">
          <h1 className="text-2xl sm:text-3xl font-serif text-ink tracking-tight">
            Intern FAQs — <span className="text-accent">solved</span>
          </h1>
          {total > 0 && (
            <p className="mt-2 text-sm text-ink-soft">
              {total} questions across {categories.length} categories
            </p>
          )}
        </div>

        {/* Backdrop blur overlay when search is active */}
        {showDropdown && (
          <div
            className="search-overlay"
            onClick={handleClearSearch}
            aria-hidden="true"
          />
        )}

        <section className="relative mb-6">
          <div className={`relative max-w-3xl mx-auto ${showDropdown ? 'z-40' : 'z-20'}`}>
            <SearchBar
              ref={searchBarRef}
              value={searchQuery}
              onQueryChange={handleSearchChange}
              onResults={(res) => setSearchResults(res as unknown as FAQItem[])}
              onLoading={setSearchLoading}
              onError={(err) => setError(err || '')}
              placeholder="Search for topics, keywords, or questions..."
              disableSuggestions={true}
            />

            {showDropdown && (
              <SearchDropdown
                query={searchQuery}
                items={dropdownItems}
                categories={categories}
                onSelectQuestion={handleQuestionOpen}
                onSelectCategory={handleCategoryOpen}
                onClear={handleClearSearch}
                loading={searchLoading}
              />
            )}
          </div>

          <div className={`mt-10 transition-all duration-300 ${
            showDropdown ? 'opacity-70 translate-y-1' : 'opacity-100'
          }`}>
            <CategoryPills
              categories={categories}
              activeCategory={activeCategory}
              onSelect={handleCategoryOpen}
            />
          </div>
        </section>

        {loading && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-[220px] rounded-2xl border border-border bg-card/70 animate-pulse" />
            ))}
          </div>
        )}

        {error && !loading && (
          <div className="rounded-2xl bg-danger-light border border-danger/15 p-6 text-center space-y-3">
            <p className="text-sm text-danger font-medium">{error}</p>
            <button
              onClick={retryFaqLoad}
              className="px-5 py-2 text-sm font-medium bg-danger text-accent-text rounded-full hover:bg-danger/90 transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && activeQuestion && (
          <QuestionDetail
            item={activeQuestion}
            relatedItems={relatedItems}
            onBack={handleBackFromDetail}
            onSelectRelated={handleQuestionOpen}
            backLabel={
              searchActive
                ? 'Back to Search Results'
                : activeCategory
                ? `Back to ${formatCategoryName(activeCategory)}`
                : 'Back to Categories'
            }
          />
        )}

        {!loading && !error && !activeQuestion && searchActive && (
          <section className="max-w-4xl mx-auto">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
              <div>
                <p className="text-xs font-semibold text-ink-faint uppercase tracking-wide">Search results</p>
                <h2 className="text-lg font-semibold text-ink">Results for &quot;{searchQuery}&quot;</h2>
              </div>
              <button
                onClick={handleClearSearch}
                className="text-xs font-semibold text-ink-soft hover:text-ink transition-colors"
              >
                Clear search
              </button>
            </div>

            <QuestionList
              items={searchResults || []}
              loading={searchLoading}
              sortOption={sortOption}
              onSortChange={setSortOption}
              visibleCount={visibleCount}
              onLoadMore={() => setVisibleCount((prev) => prev + 6)}
              emptyMessage="No results yet. Try another keyword or browse a category."
            />
          </section>
        )}

        {!loading && !error && !activeQuestion && !searchActive && activeCategory && (
          <section className="max-w-4xl mx-auto">
            {/* Header */}
            <div className="mb-6">
              <button
                onClick={handleBackToCategories}
                className="inline-flex items-center gap-2 text-xs font-semibold text-ink-soft hover:text-ink transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
                Back to categories
              </button>
              <h2 className="mt-3 text-xl font-semibold text-ink flex items-center gap-2">
                <span className="w-9 h-9 rounded-xl bg-mist flex items-center justify-center text-ink-faint">
                  {getCategoryIcon(activeCategory)}
                </span>
                {formatCategoryName(activeCategory)}
              </h2>
              {activeCategoryMeta && (
                <p className="mt-2 text-sm text-ink-soft max-w-2xl">
                  {activeCategoryMeta}
                </p>
              )}
            </div>

            <QuestionList
              items={activeCategoryItems.map((item) => ({
                ...item,
                category: activeCategory,
                source: item.source || 'faq',
              }))}
              loading={false}
              sortOption={sortOption}
              onSortChange={setSortOption}
              visibleCount={visibleCount}
              onLoadMore={() => setVisibleCount((prev) => prev + 6)}
              emptyMessage="No questions in this category yet."
            />
          </section>
        )}

        {!loading && !error && !activeQuestion && !searchActive && !activeCategory && (
          <section className="max-w-6xl mx-auto">
            {/* Category card grid — the "All" view. Each card is a clickable
                tile that opens its category (same handler as the pill scroller
                above). Sorting is handled inside CategoryCardGrid (numeric
                order, not lexicographic) so "10." comes after "9." */}
            <CategoryCardGrid
              grouped={grouped}
              onSelect={handleCategoryOpen}
            />
          </section>
        )}
      </main>

      <Footer />

      {searchActive && searchResults && searchResults.length > 0 && (
        <SearchFeedback searchQuery={searchQuery} resultFaqId={resultFaqId} />
      )}
    </div>
  );
}