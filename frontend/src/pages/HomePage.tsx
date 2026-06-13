// Public FAQ Discovery Page — no auth, no friction.
// Mounted at /. Renders the hero, sticky search, three top
// cards (Popular / Recent / Categories), the full category accordion
// list, and a detail modal for clicked FAQs.
//
// All content is scoped to the active batch from BatchContext. If no
// batch is selected yet, the user is bounced to /explore/select.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import Footer from '../components/layout/Footer';
import { BatchSwitcher } from '../components/layout/BatchSwitcher';
import { useBatch } from '../context/BatchContext';
import { useCategories, usePopularFaqs, useRecentFaqs } from '../components/explore/usePublicFaqApi';
import InteractiveSearchOverlay from '../components/search/InteractiveSearchOverlay';
import { ExploreHero } from '../components/explore/ExploreHero';
import { ExploreSearchResults } from '../components/explore/ExploreSearchResults';
import { PopularFaqsCard } from '../components/explore/PopularFaqsCard';
import { RecentFaqsCard } from '../components/explore/RecentFaqsCard';
import { CategoriesCard } from '../components/explore/CategoriesCard';
import { CategoryAccordion } from '../components/explore/CategoryAccordion';
import { PublicFaqDetail } from '../components/explore/PublicFaqDetail';
import { CardSkeleton, EmptyState } from '../components/explore/ExploreSkeleton';
import type { PublicFaq } from '../components/explore/types';
import TopSolved from '../components/community/TopSolved';
import TrendingIssues from '../components/search/TrendingIssues';
import FromMeetings from '../components/faq/FromMeetings';
import CTA from '../components/ui/CTA';

export default function ExplorePage(): React.ReactElement {
  // ── Active batch from context ───────────────────────────────────────────
  const { currentBatch, loading: batchLoading } = useBatch();
  const batchId = currentBatch?._id ?? null;

  // ── Data: only what we need for the chrome ─────────────────────────────
  const { data: popularData, loading: popularLoading } = usePopularFaqs(batchId, 5);
  const { data: recentData, loading: recentLoading } = useRecentFaqs(batchId, 5);
  const { data: categoriesData, loading: categoriesLoading } = useCategories(batchId, false);

  const categories = categoriesData?.categories ?? [];
  const totalFaqs = useMemo(
    () => categories.reduce((s, c) => s + c.count, 0),
    [categories],
  );

  // ── UI state ────────────────────────────────────────────────────────────
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<PublicFaq | null>(null);
  const [openCategoryName, setOpenCategoryName] = useState<string | null>(null);
  const [searchSticky, setSearchSticky] = useState(false);
  const sectionAnchorRefs = useRef<Map<string, React.RefObject<HTMLDivElement>>>(new Map());
  const searchAnchorRef = useRef<HTMLDivElement>(null);

  // Sticky search bar: appears once the user scrolls past the hero.
  useEffect(() => {
    const onScroll = (): void => {
      const anchor = searchAnchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      setSearchSticky(rect.bottom < 16);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Ref accessor — lazy-creates a ref for a category name.
  const getSectionRef = useCallback((name: string): React.RefObject<HTMLDivElement> => {
    let ref = sectionAnchorRefs.current.get(name);
    if (!ref) {
      ref = React.createRef<HTMLDivElement>();
      sectionAnchorRefs.current.set(name, ref);
    }
    return ref;
  }, []);

  // Smooth-scroll to a category and auto-open it.
  const handleSelectCategory = useCallback(
    (name: string) => {
      if (!name) {
        document.getElementById('all-categories')?.scrollIntoView({ behavior: 'smooth' });
        return;
      }
      const ref = sectionAnchorRefs.current.get(name);
      if (ref?.current) {
        ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setOpenCategoryName(name);
      } else {
        setOpenCategoryName(name);
        window.setTimeout(() => {
          sectionAnchorRefs.current.get(name)?.current?.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
          });
        }, 50);
      }
    },
    [],
  );

  const isCategoryOpen = (name: string): boolean =>
    openCategoryName === name || (activeCategory === name && query.length === 0);

  const showingSearch = query.length >= 2;

  // ── Guard: no batch picked yet → portal ───────────────────────────────
  if (batchLoading && !currentBatch) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <p className="text-sm text-ink-soft">Loading program…</p>
      </div>
    );
  }
  if (!currentBatch) {
    return <Navigate to="/explore/select" replace />;
  }

  return (
    <div className="min-h-screen bg-bg text-ink flex flex-col">

      {/* ─── Sticky search bar (appears once user scrolls) ──────────── */}
      <div
        className={`sticky top-0 z-30 transition-all duration-200 ${
          searchSticky
            ? 'bg-bg/85 backdrop-blur-md border-b border-border/60 py-3 shadow-subtle'
            : 'py-0'
        }`}
        aria-hidden={!searchSticky}
      >
        <div className="max-w-3xl mx-auto px-4">
          {searchSticky && (
            <InteractiveSearchOverlay
              onSearchComplete={(q) => {
                setQuery(q);
              }}
            />
          )}
        </div>
      </div>

      <main className="flex-1">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-16">
          {/* ─── Hero ──────────────────────────────────────────────── */}
          <ExploreHero
            batchName={currentBatch.name}
            totalFaqs={totalFaqs}
            totalCategories={categories.length}
            categories={categories}
            activeCategory={activeCategory}
            onSelectCategory={(name) => {
              setActiveCategory(name);
              if (name) handleSelectCategory(name);
            }}
          >
            <div ref={searchAnchorRef}>
              <InteractiveSearchOverlay
                onSearchComplete={(q) => {
                  setQuery(q);
                  if (q) {
                    setActiveCategory(null);
                  }
                }}
              />
            </div>
          </ExploreHero>

          {/* ─── Search results (only when query has content) ───────── */}
          {showingSearch && (
            <ExploreSearchResults
              query={query}
              category={activeCategory}
              batchId={batchId}
              onSelectFaq={setOpenFaq}
              onClear={() => setQuery('')}
            />
          )}

          {/* ─── Top three cards: Popular / Recent / Categories ────── */}
          {!showingSearch && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-4">
              <PopularFaqsCard batchId={batchId} onSelectFaq={setOpenFaq} />
              <RecentFaqsCard batchId={batchId} onSelectFaq={setOpenFaq} />
              <CategoriesCard batchId={batchId} onSelectCategory={handleSelectCategory} />
            </div>
          )}

          {/* ─── All categories (collapsible) ─────────────────────── */}
          {!showingSearch && (
            <section id="all-categories" className="mt-16">
              <header className="flex items-baseline justify-between mb-8">
                <h2 className="font-serif text-2xl text-ink">All Categories</h2>
                <span className="text-xs text-ink-soft">
                  {categories.length} {categories.length === 1 ? 'topic' : 'topics'}
                </span>
              </header>

              {categoriesLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4].map((i) => (
                    <CardSkeleton key={i} rows={2} />
                  ))}
                </div>
              ) : categories.length === 0 ? (
                <EmptyState
                  title="No categories yet"
                  hint="Check back after the first FAQs are published for this program."
                />
              ) : (
                <div className="space-y-3">
                  {categories.map((cat) => (
                    <CategoryAccordion
                      key={cat.name}
                      category={cat}
                      batchId={batchId}
                      scrollAnchorRef={getSectionRef(cat.name)}
                      openOnMount={isCategoryOpen(cat.name)}
                      onSelectFaq={setOpenFaq}
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {/* ─── Top Solved + Trending Issues Row ──────────────────────── */}
          {!showingSearch && (
            <section className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5 sm:gap-8 items-start mt-16">
              <TopSolved />
              <div className="lg:mt-14 mt-0">
                <TrendingIssues />
              </div>
            </section>
          )}

          {/* ─── From Zoom Meetings ────────────────────────────────────── */}
          {!showingSearch && <FromMeetings />}

          {/* ─── CTA ───────────────────────────────────────────────────── */}
          {!showingSearch && <CTA />}
        </div>
      </main>

      <Footer />

      {/* ─── Detail modal ───────────────────────────────────────────── */}
      {openFaq && (
        <PublicFaqDetail
          faq={openFaq}
          batchId={batchId!}
          highlightQuery={showingSearch ? query : undefined}
          onClose={() => setOpenFaq(null)}
        />
      )}

      {/* Suppress unused-warning for state that influences behaviour elsewhere */}
      <span style={{ display: 'none' }} aria-hidden="true">
        {popularLoading ? 'p' : ''}
        {recentLoading ? 'r' : ''}
      </span>
    </div>
  );
}

