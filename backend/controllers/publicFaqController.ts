import { Request, Response } from 'express';
import { Types } from 'mongoose';
import FAQ from '../models/FAQ.js';
import GuestEvent, { type GuestEventType } from '../models/GuestEvent.js';
import { logger } from '../utils/http/logger.js';
import { LRUCache } from 'lru-cache';
import { v4 as uuidv4 } from 'uuid';
import {
  popularityScore,
  buildScoreExpression,
  countWords,
  expectedReadMs,
} from '../utils/http/popularityScore.js';

// ─── Public FAQ constants ─────────────────────────────────────────────────────

const GUEST_COOKIE = 'yaksha_guest_id';
const GUEST_COOKIE_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

// Dedup window: a guest viewing the same FAQ within this many minutes
// is treated as a single view (prevents refresh-spam inflation).
const VIEW_DEDUP_WINDOW_MS = 30 * 60 * 1000; // 30 min

// In-process LRU caches for the high-traffic read endpoints. TTL is short
// (5 min) so the page always feels fresh; the popularity score itself is
// already a 5-min computation, so 5-min cache is consistent.
const popularCache = new LRUCache<string, { faqs: unknown[]; generatedAt: string }>({ max: 16, ttl: 5 * 60 * 1000 });
const recentCache = new LRUCache<string, { faqs: unknown[]; generatedAt: string }>({ max: 16, ttl: 5 * 60 * 1000 });
const categoriesCache = new LRUCache<string, { categories: unknown[]; totalCategories: number }>({ max: 4, ttl: 5 * 60 * 1000 });

// Invalidate all caches — call after a popularity recompute.
export function invalidatePublicCaches(): void {
  popularCache.clear();
  recentCache.clear();
  categoriesCache.clear();
}

// ─── Cookie helpers ──────────────────────────────────────────────────────────

function setGuestCookieIfMissing(req: Request, res: Response): string {
  // Express parses cookies; the frontend will get one minted on first hit.
  const existing = (req as Request & { cookies?: Record<string, string> }).cookies?.[GUEST_COOKIE];
  if (existing && /^[a-z0-9-]{8,64}$/i.test(existing)) {
    return existing;
  }
  const fresh = uuidv4();
  res.cookie(GUEST_COOKIE, fresh, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: GUEST_COOKIE_MAX_AGE_MS,
    path: '/',
  });
  return fresh;
}

// ─── Response shape helpers ──────────────────────────────────────────────────

const PUBLIC_PROJECTION = '-embedding -reports -suggestions -promotionMetadata -__v';

function shapeFaq(faq: Record<string, unknown>): Record<string, unknown> {
  return {
    _id: faq._id,
    question: faq.question,
    answer: faq.answer,
    category: faq.category,
    tags: faq.tags ?? [],
    createdAt: faq.createdAt,
    updatedAt: faq.updatedAt,
    trustLevel: faq.trustLevel,
    sourceType: faq.sourceType,
    // Public-page analytics (safe to expose — these are aggregate counters)
    popularityScore: faq.popularityScore ?? 0,
    guestViewCount: faq.guestViewCount ?? 0,
    avgReadCompletion: faq.avgReadCompletion ?? 0,
    avgTimeSpentRatio: faq.avgTimeSpentRatio ?? 0,
    wordCount: faq.wordCount ?? 0,
    expectedReadMs: faq.expectedReadMs ?? 0,
  };
}

// ─── GET /api/public/popular-faqs ─────────────────────────────────────────────
// Top N by pre-computed popularityScore. Cached for 5 min.

export async function getPopularFaqs(req: Request, res: Response): Promise<void> {
  // Mint a guest id on first visit (used by the tracking endpoints)
  setGuestCookieIfMissing(req, res);

  const limit = clampInt(req.query.limit, 1, 20, 5);
  const batchId = parseBatchId(req.query.batchId);
  if (req.query.batchId !== undefined && !batchId) {
    res.status(400).json({ message: 'Invalid batchId.' });
    return;
  }
  const cacheKey = `popular:${batchId ?? 'all'}:${limit}`;
  const cached = popularCache.get(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

  try {
    const filter: Record<string, unknown> = { status: 'approved' };
    if (batchId) filter.batchId = batchId;
    const faqs = await FAQ.find(filter)
      .select(PUBLIC_PROJECTION)
      .sort({ popularityScore: -1, createdAt: -1 })
      .limit(limit)
      .lean();

    const payload = {
      faqs: faqs.map(shapeFaq),
      batchId: batchId ? batchId.toString() : null,
      generatedAt: new Date().toISOString(),
    };
    popularCache.set(cacheKey, payload);
    res.json(payload);
  } catch (err) {
    logger.error(`[publicFaq] getPopularFaqs failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to load popular FAQs.' });
  }
}

// ─── GET /api/public/recent-faqs ──────────────────────────────────────────────

export async function getRecentFaqs(req: Request, res: Response): Promise<void> {
  setGuestCookieIfMissing(req, res);

  const limit = clampInt(req.query.limit, 1, 30, 6);
  const batchId = parseBatchId(req.query.batchId);
  if (req.query.batchId !== undefined && !batchId) {
    res.status(400).json({ message: 'Invalid batchId.' });
    return;
  }
  const cacheKey = `recent:${batchId ?? 'all'}:${limit}`;
  const cached = recentCache.get(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

  try {
    const filter: Record<string, unknown> = { status: 'approved' };
    if (batchId) filter.batchId = batchId;
    const faqs = await FAQ.find(filter)
      .select(PUBLIC_PROJECTION)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const payload = {
      faqs: faqs.map(shapeFaq),
      batchId: batchId ? batchId.toString() : null,
      generatedAt: new Date().toISOString(),
    };
    recentCache.set(cacheKey, payload);
    res.json(payload);
  } catch (err) {
    logger.error(`[publicFaq] getRecentFaqs failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to load recent FAQs.' });
  }
}

// ─── GET /api/public/categories ───────────────────────────────────────────────
// All categories with FAQ count. Optional `?withTop=3` to embed top FAQs per
// category (used by the accordion expansion on the frontend).

export async function getCategories(req: Request, res: Response): Promise<void> {
  setGuestCookieIfMissing(req, res);

  const includeTop = req.query.withTop !== undefined;
  const topN = clampInt(req.query.withTop, 1, 10, 3);
  const batchId = parseBatchId(req.query.batchId);
  if (req.query.batchId !== undefined && !batchId) {
    res.status(400).json({ message: 'Invalid batchId.' });
    return;
  }
  const cacheKey = `cats:${batchId ?? 'all'}:${includeTop ? topN : 0}`;
  const cached = categoriesCache.get(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

  try {
    // Aggregate: group by category, count, sort by count desc
    const matchStage: Record<string, unknown> = { status: 'approved' };
    if (batchId) matchStage.batchId = batchId;
    const grouped = await FAQ.aggregate<{ _id: string; count: number }>([
      { $match: matchStage },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
    ]);

    const categories: Array<{
      name: string;
      count: number;
      topFaqs?: ReturnType<typeof shapeFaq>[];
    }> = [];

    for (const g of grouped) {
      if (!g._id) continue;
      const catFilter: Record<string, unknown> = { status: 'approved', category: g._id };
      if (batchId) catFilter.batchId = batchId;
      const cat: { name: string; count: number; topFaqs?: ReturnType<typeof shapeFaq>[] } = {
        name: g._id,
        count: g.count,
      };
      if (includeTop) {
        const tops = await FAQ.find(catFilter)
          .select(PUBLIC_PROJECTION)
          .sort({ popularityScore: -1, createdAt: -1 })
          .limit(topN)
          .lean();
        cat.topFaqs = tops.map(shapeFaq);
      }
      categories.push(cat);
    }

    const payload = {
      categories,
      totalCategories: categories.length,
      batchId: batchId ? batchId.toString() : null,
    };
    categoriesCache.set(cacheKey, payload);
    res.json(payload);
  } catch (err) {
    logger.error(`[publicFaq] getCategories failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to load categories.' });
  }
}

// ─── GET /api/public/faqs/:id ────────────────────────────────────────────────
// Single FAQ for the public detail view. NOT cached — clicks are rare and the
// tracker depends on the call always landing.

export async function getPublicFaqById(req: Request, res: Response): Promise<void> {
  setGuestCookieIfMissing(req, res);

  const rawId = req.params.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id || !Types.ObjectId.isValid(id)) {
    res.status(400).json({ message: 'Invalid FAQ id.' });
    return;
  }

  try {
    const faq = await FAQ.findOne({ _id: id, status: 'approved' })
      .select(PUBLIC_PROJECTION)
      .lean();
    if (!faq) {
      res.status(404).json({ message: 'FAQ not found.' });
      return;
    }
    res.json(shapeFaq(faq));
  } catch (err) {
    logger.error(`[publicFaq] getPublicFaqById failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to load FAQ.' });
  }
}

// ─── GET /api/public/search ──────────────────────────────────────────────────
// Public text search — uses the existing FAQ text index. Optional category
// filter. NOT cached (filter dimensions are too varied for a hit-rate that
// would justify the complexity).

export async function searchPublicFaqs(req: Request, res: Response): Promise<void> {
  setGuestCookieIfMissing(req, res);

  const q = String(req.query.q ?? '').trim();
  const category = String(req.query.category ?? '').trim();
  const limit = clampInt(req.query.limit, 1, 30, 12);
  const batchId = parseBatchId(req.query.batchId);
  if (req.query.batchId !== undefined && !batchId) {
    res.status(400).json({ message: 'Invalid batchId.' });
    return;
  }

  if (q.length < 2) {
    res.status(400).json({ message: 'Query must be at least 2 characters.' });
    return;
  }
  if (q.length > 200) {
    res.status(400).json({ message: 'Query is too long.' });
    return;
  }

  try {
    // Use regex with escape so user input is treated literally — no
    // injection risk, and we don't have to depend on the text index
    // returning useful scores for very short queries.
    const escaped = escapeRegex(q);
    const filter: Record<string, unknown> = {
      status: 'approved',
      $or: [
        { question: { $regex: escaped, $options: 'i' } },
        { answer: { $regex: escaped, $options: 'i' } },
        { category: { $regex: escaped, $options: 'i' } },
        { tags: { $regex: escaped, $options: 'i' } },
      ],
    };
    if (category) filter.category = category;
    if (batchId) filter.batchId = batchId;

    const faqs = await FAQ.find(filter)
      .select(PUBLIC_PROJECTION)
      .sort({ popularityScore: -1, createdAt: -1 })
      .limit(limit)
      .lean();

    res.json({
      faqs: faqs.map(shapeFaq),
      query: q,
      category: category || null,
      batchId: batchId ? batchId.toString() : null,
      count: faqs.length,
    });
  } catch (err) {
    logger.error(`[publicFaq] searchPublicFaqs failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Search failed.' });
  }
}

// ─── POST /api/public/track-view ─────────────────────────────────────────────
// Records an anonymous view event. Idempotent within VIEW_DEDUP_WINDOW_MS per
// (guestId, faqId). On a fresh view, increments FAQ.guestViewCount inline
// (O(1) indexed update) — the aggregation job picks up the rest.

export async function trackPublicView(req: Request, res: Response): Promise<void> {
  const guestId = setGuestCookieIfMissing(req, res);

  const body = (req.body ?? {}) as { faqId?: unknown; sessionId?: unknown; batchId?: unknown };
  const faqId = typeof body.faqId === 'string' ? body.faqId : '';
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
  const batchId = typeof body.batchId === 'string' ? body.batchId : '';
  if (!faqId || !Types.ObjectId.isValid(faqId)) {
    res.status(400).json({ message: 'Invalid faqId.' });
    return;
  }
  if (!sessionId || sessionId.length < 4 || sessionId.length > 64) {
    res.status(400).json({ message: 'Invalid sessionId.' });
    return;
  }
  if (!batchId || !Types.ObjectId.isValid(batchId)) {
    res.status(400).json({ message: 'Invalid or missing batchId.' });
    return;
  }

  const objectFaqId = new Types.ObjectId(faqId);
  const objectBatchId = new Types.ObjectId(batchId);
  const since = new Date(Date.now() - VIEW_DEDUP_WINDOW_MS);

  try {
    // Dedup: was a 'view' event recorded for this (guestId, faqId) recently?
    const recent = await GuestEvent.findOne({
      guestId,
      faqId: objectFaqId,
      type: 'view',
      createdAt: { $gte: since },
    })
      .select('_id')
      .lean();

    if (recent) {
      res.json({ recorded: false, deduped: true });
      return;
    }

    // Fire-and-forget the event insert + counter bump. We return 202-style
    // success to the client immediately, but still wait briefly so the
    // response is reliable under load.
    await Promise.all([
      GuestEvent.create({ faqId: objectFaqId, guestId, sessionId, batchId: objectBatchId, type: 'view' }),
      FAQ.updateOne(
        { _id: objectFaqId, status: 'approved', batchId: objectBatchId },
        { $inc: { guestViewCount: 1, guestViewLast24h: 1 } },
      ),
    ]);

    res.json({ recorded: true, deduped: false });
  } catch (err) {
    logger.warn(`[publicFaq] trackPublicView failed: ${(err as Error).message}`);
    // Never block the user — return success-ish even on error.
    res.json({ recorded: false, error: 'tracking failed' });
  }
}

// ─── POST /api/public/track-reading ──────────────────────────────────────────
// Records dwell time + scroll depth. Fire-and-forget: we don't block the
// client. The aggregation job folds these into avgReadCompletion /
// avgTimeSpentRatio later.

export async function trackPublicReading(req: Request, res: Response): Promise<void> {
  const guestId = setGuestCookieIfMissing(req, res);

  const body = (req.body ?? {}) as {
    faqId?: unknown;
    sessionId?: unknown;
    batchId?: unknown;
    dwellMs?: unknown;
    scrollPct?: unknown;
    faqLength?: unknown;
  };

  const faqId = typeof body.faqId === 'string' ? body.faqId : '';
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
  const batchId = typeof body.batchId === 'string' ? body.batchId : '';
  const dwellMs = typeof body.dwellMs === 'number' ? body.dwellMs : NaN;
  const scrollPct = typeof body.scrollPct === 'number' ? body.scrollPct : NaN;
  const faqLength = typeof body.faqLength === 'number' ? body.faqLength : undefined;

  if (!faqId || !Types.ObjectId.isValid(faqId)) {
    res.status(400).json({ message: 'Invalid faqId.' });
    return;
  }
  if (!sessionId || sessionId.length < 4 || sessionId.length > 64) {
    res.status(400).json({ message: 'Invalid sessionId.' });
    return;
  }
  if (!batchId || !Types.ObjectId.isValid(batchId)) {
    res.status(400).json({ message: 'Invalid or missing batchId.' });
    return;
  }
  if (!Number.isFinite(dwellMs) || dwellMs < 0 || dwellMs > 60 * 60 * 1000) {
    res.status(400).json({ message: 'Invalid dwellMs.' });
    return;
  }
  if (!Number.isFinite(scrollPct) || scrollPct < 0 || scrollPct > 1) {
    res.status(400).json({ message: 'Invalid scrollPct.' });
    return;
  }

  // Skip noise: < 1s reads with < 5% scroll are accidental hits.
  if (dwellMs < 1000 && scrollPct < 0.05) {
    res.json({ recorded: false, reason: 'insufficient engagement' });
    return;
  }

  const objectFaqId = new Types.ObjectId(faqId);
  const objectBatchId = new Types.ObjectId(batchId);
  const eventType: GuestEventType = scrollPct >= 0.85 ? 'completion' : 'read';
  const safeFaqLength = typeof faqLength === 'number' && faqLength > 0 && faqLength < 50000
    ? Math.round(faqLength)
    : undefined;

  try {
    await GuestEvent.create({
      faqId: objectFaqId,
      guestId,
      sessionId,
      batchId: objectBatchId,
      type: eventType,
      dwellMs: Math.round(dwellMs),
      scrollPct,
      faqLength: safeFaqLength,
    });
    res.json({ recorded: true, type: eventType });
  } catch (err) {
    logger.warn(`[publicFaq] trackPublicReading failed: ${(err as Error).message}`);
    res.json({ recorded: false, error: 'tracking failed' });
  }
}

// ─── recomputePopularity ─────────────────────────────────────────────────────
// Background job — called every 5 min from server.ts. Single aggregation
// pipeline: derives per-FAQ mean engagement from GuestEvent, computes the
// score in Mongo, and $merges results back into FAQ. Also recomputes
// wordCount + expectedReadMs for any FAQ where they're stale (cheap, lets
// the read path skip a runtime word count).

const RECOMPUTE_INTERVAL_HOURS_MS = 5 * 60 * 1000;

export async function recomputePopularity(): Promise<{ updated: number; durationMs: number }> {
  const start = Date.now();

  try {
    // Step 1: aggregate engagement metrics from GuestEvent over the
    // last 7 days (matches the TTL window).
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const engagement = await GuestEvent.aggregate<{
      _id: Types.ObjectId;
      avgReadCompletion: number;
      avgTimeSpentRatio: number;
      sampleCount: number;
    }>([
      {
        $match: {
          createdAt: { $gte: cutoff },
          type: { $in: ['read', 'completion'] },
          dwellMs: { $exists: true, $gt: 0 },
        },
      },
      // Compute per-event ratios so we can average them meaningfully
      {
        $addFields: {
          ratio: {
            $cond: [
              { $gt: ['$faqLength', 0] },
              {
                $min: [
                  1,
                  { $divide: ['$dwellMs', { $multiply: ['$faqLength', 60_000 / 200] }] },
                ],
              },
              0,
            ],
          },
        },
      },
      {
        $group: {
          _id: '$faqId',
          avgReadCompletion: { $avg: '$scrollPct' },
          avgTimeSpentRatio: { $avg: '$ratio' },
          sampleCount: { $sum: 1 },
        },
      },
      // Require a minimum sample size to avoid noisy values
      { $match: { sampleCount: { $gte: 1 } } },
    ]);

    // Step 2: write the engagement back. Build the score server-side via
    // $expr so we don't roundtrip large docs to Node.
    const scoreExpr = buildScoreExpression('');

    // Build a per-faq update pipeline and bulk-write.
    const ops = engagement.map((e) => ({
      updateOne: {
        filter: { _id: e._id },
        update: [
          {
            $set: {
              avgReadCompletion:  { $ifNull: ['$avgReadCompletion', 0] },
              avgTimeSpentRatio:  { $ifNull: ['$avgTimeSpentRatio', 0] },
            },
          },
          { $set: { avgReadCompletion: e.avgReadCompletion, avgTimeSpentRatio: e.avgTimeSpentRatio } },
          { $set: { popularityScore: scoreExpr } },
          { $set: { popularityUpdatedAt: '$$NOW' } },
        ],
      },
    }));

    if (ops.length > 0) {
      await FAQ.bulkWrite(ops, { ordered: false });
    }

    // Step 3: refresh wordCount + expectedReadMs for FAQs that don't have
    // them yet. Cheap — typically a one-time pass after a fresh seed.
    const stale = await FAQ.find({ $or: [{ wordCount: 0 }, { expectedReadMs: 0 }] })
      .select('_id question answer')
      .lean();
    if (stale.length > 0) {
      const wcOps = stale.map((s) => {
        const wc = countWords(s.question) + countWords(s.answer);
        return {
          updateOne: {
            filter: { _id: s._id },
            update: { $set: { wordCount: wc, expectedReadMs: expectedReadMs(wc) } },
          },
        };
      });
      await FAQ.bulkWrite(wcOps, { ordered: false });
    }

    // Step 4: reset guestViewLast24h via a per-document decrement. To keep
    // this O(N) once per 5 min we just leave the field as a lifetime
    // counter on the FAQ doc, and let the page surface "trending" via
    // popularityScore's recency term instead. (Skipping a separate 24h
    // window keeps the aggregation job a single pass.)

    // Step 5: touch ALL FAQs with their score (not just those with
    // engagement data), so a brand-new FAQ gets a baseline score from
    // recency + trust alone.
    const baseline = await FAQ.find({
      status: 'approved',
      $or: [
        { popularityUpdatedAt: null },
        { popularityUpdatedAt: { $lt: new Date(Date.now() - RECOMPUTE_INTERVAL_HOURS_MS) } },
      ],
    })
      .select('_id question answer guestViewCount createdAt avgReadCompletion avgTimeSpentRatio trustLevel')
      .lean();

    if (baseline.length > 0) {
      const baselineOps = baseline.map((b) => {
        const score = popularityScore({
          guestViewCount: b.guestViewCount ?? 0,
          createdAt: b.createdAt,
          avgReadCompletion: b.avgReadCompletion ?? 0,
          avgTimeSpentRatio: b.avgTimeSpentRatio ?? 0,
          trustLevel: (b.trustLevel as 'expert' | 'high' | 'medium' | 'low') ?? 'high',
        });
        return {
          updateOne: {
            filter: { _id: b._id },
            update: { $set: { popularityScore: score, popularityUpdatedAt: new Date() } },
          },
        };
      });
      await FAQ.bulkWrite(baselineOps, { ordered: false });
    }

    // Invalidate in-memory caches so the next read picks up the new scores
    invalidatePublicCaches();

    const durationMs = Date.now() - start;
    const updated = ops.length + baseline.length;
    logger.info(`[publicFaq] recomputePopularity: ${updated} FAQs in ${durationMs}ms`);
    return { updated, durationMs };
  } catch (err) {
    const durationMs = Date.now() - start;
    logger.error(`[publicFaq] recomputePopularity failed after ${durationMs}ms: ${(err as Error).message}`);
    return { updated: 0, durationMs };
  }
}

// ─── utils ───────────────────────────────────────────────────────────────────

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = parseInt(String(v ?? ''), 10);
  if (isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

/** Parse and validate a batchId query param. Returns null if absent or invalid. */
function parseBatchId(v: unknown): Types.ObjectId | null {
  if (typeof v !== 'string' || v.length === 0) return null;
  if (!Types.ObjectId.isValid(v)) return null;
  return new Types.ObjectId(v);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
