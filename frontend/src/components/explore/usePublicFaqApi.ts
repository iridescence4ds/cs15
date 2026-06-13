// Hooks for the public FAQ page. All endpoints are unauthenticated; the
// public FAQ page never sets an Authorization header.

import { useEffect, useMemo, useRef, useState } from 'react';
import api from '../../utils/api';
import type {
  CategoriesResponse,
  PopularResponse,
  PublicFaq,
  RecentResponse,
  SearchResponse,
  TrackReadingResponse,
  TrackViewResponse,
} from './types';

interface FetchState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/**
 * Generic GET hook with cancel-on-unmount + lightweight in-memory caching.
 * The cache key includes the URL + params so different filter combinations
 * (including batchId) don't collide.
 */
function usePublicGet<T>(url: string | null, params?: Record<string, unknown>): FetchState<T> {
  const [state, setState] = useState<FetchState<T>>({ data: null, loading: !!url, error: null });
  const cacheRef = useRef<Map<string, T>>(usePublicGet.cache);

  useEffect(() => {
    if (!url) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    const key = `${url}::${JSON.stringify(params ?? {})}`;
    const cached = cacheRef.current.get(key);
    if (cached) {
      setState({ data: cached, loading: false, error: null });
      return;
    }
    const controller = new AbortController();
    setState({ data: null, loading: true, error: null });
    api
      .get<T>(url, { params, signal: controller.signal })
      .then((res) => {
        cacheRef.current.set(key, res.data);
        setState({ data: res.data, loading: false, error: null });
      })
      .catch((err) => {
        if (err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') return;
        setState({ data: null, loading: false, error: 'Could not load. Please try again.' });
      });
    return () => controller.abort();
  }, [url, JSON.stringify(params ?? {})]);

  return state;
}

// Cross-hook cache, shared across all usePublicGet callers in the app.
usePublicGet.cache = new Map();

/** Build a memoised params object that only changes when batchId/limit change. */
function useBatchParams(batchId: string | null, extra?: Record<string, unknown>): Record<string, unknown> {
  return useMemo(() => {
    const p: Record<string, unknown> = {};
    if (batchId) p.batchId = batchId;
    if (extra) Object.assign(p, extra);
    return p;
  }, [batchId, JSON.stringify(extra ?? {})]);
}

export function usePopularFaqs(batchId: string | null, limit = 5) {
  const params = useBatchParams(batchId, { limit });
  // Don't fetch until we have a batch — backend returns empty for unscoped
  return usePublicGet<PopularResponse>(batchId ? '/public/popular-faqs' : null, params);
}

export function useRecentFaqs(batchId: string | null, limit = 6) {
  const params = useBatchParams(batchId, { limit });
  return usePublicGet<RecentResponse>(batchId ? '/public/recent-faqs' : null, params);
}

export function useCategories(batchId: string | null, includeTop = false, topN = 3) {
  const params = useBatchParams(
    batchId,
    includeTop ? { withTop: topN } : undefined,
  );
  return usePublicGet<CategoriesResponse>(batchId ? '/public/categories' : null, params);
}

export function usePublicFaqSearch(batchId: string | null, query: string, category: string | null) {
  const params: Record<string, unknown> = { q: query };
  if (category) params.category = category;
  const enabled = !!batchId && query.length >= 2;
  return usePublicGet<SearchResponse>(enabled ? '/public/search' : null, useBatchParams(batchId, params));
}

export function usePublicFaqById(id: string | null) {
  return usePublicGet<PublicFaq>(id ? `/public/faqs/${id}` : null);
}

// ─── Tracking helpers (fire-and-forget) ──────────────────────────────────────
//
// These use navigator.sendBeacon on `pagehide` to survive tab close. For
// non-final tracking (e.g. the `view` event), a plain POST is fine.

export function trackPublicView(faqId: string, sessionId: string, batchId: string): void {
  try {
    const payload = JSON.stringify({ faqId, sessionId, batchId });
    // Use sendBeacon if available — non-blocking and survives unload.
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([payload], { type: 'application/json' });
      navigator.sendBeacon('/api/public/track-view', blob);
    } else {
      void api.post<TrackViewResponse>('/public/track-view', { faqId, sessionId, batchId }).catch(() => {});
    }
  } catch { /* tracking is best-effort, never block the UI */ }
}

export function trackPublicReading(
  faqId: string,
  sessionId: string,
  batchId: string,
  payload: { dwellMs: number; scrollPct: number; faqLength: number },
): void {
  try {
    const body = JSON.stringify({ faqId, sessionId, batchId, ...payload });
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon('/api/public/track-reading', blob);
    } else {
      void api
        .post<TrackReadingResponse>('/public/track-reading', { faqId, sessionId, batchId, ...payload })
        .catch(() => {});
    }
  } catch { /* best-effort */ }
}
