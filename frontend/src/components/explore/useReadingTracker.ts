// Session + tracking hooks for the public FAQ page.
//
// Session ID is a per-tab UUID stored in sessionStorage — discarded when
// the tab closes. Combined with the guest cookie (server-side), this
// gives us deduplication per (guest, faq, 30-min-window) without ever
// touching localStorage or persistent identifiers.

import { useEffect, useMemo, useRef, useState } from 'react';
import { trackPublicReading, trackPublicView } from './usePublicFaqApi';

const SESSION_KEY = 'yaksha_explore_session';

/** Get-or-create a session id stored in sessionStorage. */
export function useExploreSession(): string {
  return useMemo(() => {
    if (typeof window === 'undefined') return 'ssr';
    try {
      const existing = sessionStorage.getItem(SESSION_KEY);
      if (existing && existing.length >= 8) return existing;
    } catch { /* sessionStorage disabled */ }
    const fresh =
      'tab-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    try { sessionStorage.setItem(SESSION_KEY, fresh); } catch { /* ignore */ }
    return fresh;
  }, []);
}

/**
 * Fire a single "view" event when the component mounts with a given faqId.
 * The server dedupes within 30 min, so this is safe to remount without
 * inflating counts.
 */
export function useViewTracker(faqId: string | null, sessionId: string, batchId: string | null): void {
  const firedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!faqId || !batchId || firedRef.current === faqId) return;
    firedRef.current = faqId;
    trackPublicView(faqId, sessionId, batchId);
  }, [faqId, sessionId, batchId]);
}

interface ReadingTrackerOptions {
  /** Server-side expected read time in ms — used to compute time-ratio. */
  expectedReadMs: number;
}

interface ReadingTrackerReturn {
  /** Current scroll progress 0..1 (throttled to rAF). */
  scrollPct: number;
  /** Total dwell time in ms since mount. */
  dwellMs: number;
  /** Convenience: did the reader make it past 85% of the article. */
  hasCompleted: boolean;
}

/**
 * Observe scroll depth and dwell time for the wrapped article.
 * Flushes a `read` event on `pagehide` / `visibilitychange→hidden`.
 */
export function useReadingTracker(
  faqId: string | null,
  sessionId: string,
  batchId: string | null,
  contentRef: React.RefObject<HTMLElement>,
  options: ReadingTrackerOptions,
): ReadingTrackerReturn {
  const [scrollPct, setScrollPct] = useState(0);
  const [dwellMs, setDwellMs] = useState(0);

  // Refs let the unload handler read fresh values without re-binding.
  const stateRef = useRef({ scrollPct: 0, dwellMs: 0, sent: false });
  const mountedAtRef = useRef<number>(Date.now());

  // Throttle scroll updates to rAF — avoids per-scroll-event re-renders.
  useEffect(() => {
    if (!faqId) return;
    const node = contentRef.current;
    if (!node) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = node.getBoundingClientRect();
      const total = node.offsetHeight - window.innerHeight;
      if (total <= 0) {
        stateRef.current.scrollPct = 1;
        setScrollPct(1);
        return;
      }
      const scrolled = Math.max(0, -rect.top);
      const pct = Math.min(1, scrolled / total);
      stateRef.current.scrollPct = pct;
      setScrollPct(pct);
    };
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(update);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    update();

    // Dwell ticker — every 5s update displayed value; the actual interval
    // for flushing is 15s, controlled in the flush effect below.
    const dwellInterval = window.setInterval(() => {
      const ms = Date.now() - mountedAtRef.current;
      stateRef.current.dwellMs = ms;
      setDwellMs(ms);
    }, 5000);

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.clearInterval(dwellInterval);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [faqId, contentRef]);

  // Flush on unload / tab hide. We track only once per faqId.
  useEffect(() => {
    if (!faqId || !batchId) return;
    const flush = () => {
      if (stateRef.current.sent) return;
      // Skip noise: < 2s reads with < 5% scroll
      if (stateRef.current.dwellMs < 2000 && stateRef.current.scrollPct < 0.05) return;
      stateRef.current.sent = true;
      trackPublicReading(faqId, sessionId, batchId, {
        dwellMs: stateRef.current.dwellMs,
        scrollPct: stateRef.current.scrollPct,
        faqLength: Math.max(1, Math.round(options.expectedReadMs / (60_000 / 200))),
      });
    };

    const onPageHide = () => flush();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [faqId, sessionId, batchId, options.expectedReadMs]);

  return {
    scrollPct,
    dwellMs,
    hasCompleted: scrollPct >= 0.85,
  };
}
