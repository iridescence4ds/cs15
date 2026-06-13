# Codebase Issues Audit

> Re-audited 2026-06-10 for the modularity session. Resolved items removed; see git history for the full trail. Severity legend: critical · high · medium · low.

## Open P0 (fix before production)

### N4 — Zoom token auto-refresh not centralized (medium)
**Where:** `backend/utils/zoom/zoomOAuth.ts:160-220` has the refresh logic, but several call sites read `zoomAccessToken` directly and would make 401 calls against Zoom if the token expired (>1h). Circuit breaker will trip after enough 401s, but the first few fail silently.
**Fix:** Single helper `zoomApiFetch(userId, path, init)` that handles refresh + 401 retry internally. Audit call sites for direct `zoomAccessToken` reads.

### N5 — Silent KB extraction failures (medium)
**Where:** `backend/controllers/zoomController.ts` `processZoomMeetingForKnowledge` errors are caught and logged as warn. User has no signal that KB extraction half-failed.
**Fix:** Add a dead-letter collection (e.g. `yaksha_zoom_kb_failures`) + a `retryFailedKBExtractions()` cron. Carry-over from I1.

### I1 — Single AI extraction in Zoom pipeline, no KB DLQ (medium)
**Where:** `backend/controllers/zoomController.ts` — `processZoomMeetingForKnowledge` runs non-blocking; if the AI call fails, no retry, no DLQ for the knowledge path. (Note: Zoom meeting retry/DLQ exists in `services/retryService.ts` — this is specifically the KB-extraction DLQ that's missing.)

### I3 — No rate limit on `/api/zoom/webhook` (low)
**Where:** `backend/routes/zoom.ts`. Low priority if signature is verified (which it is, post-N2 fix).

### B4 — `parseVTT()` re-parses via `parseVTTWithSpeakers()` (low)
**Where:** `backend/utils/zoom/vttParser.ts:44`. Cached parse would save ~3ms per Zoom meeting. Skip if low priority.

## Open P1 (should fix soon)

### N6 — Backfill has no progress visibility (low)
**Where:** `backend/controllers/zoomController.ts:210-260`. 90-day backfill can take 30+ minutes for 50 recordings; no user-visible progress. UX nice-to-have.

### N7 — 35 `catch {}` blocks swallow errors silently (low)
**Where:** Distributed across `controllers/`, `services/`, `utils/`. Examples: `services/aiClient.ts:265`, `scripts/backfillEmbeddings.ts:37,51`, `controllers/postController.ts:90`. Most are in loops where continuing is correct, but errors are never logged.
**Fix:** Add at least `logger.warn({ error }, 'item failed')`.

### N8 — `console.*` left in `utils/logger.ts` and `utils/http/fileLogger.ts` (low)
**Where:** 7 `console.*` calls in those two files. `logger` module legitimately needs `console` for the fallback path when its own streams fail, but each call should have a one-line comment explaining why.
**Status:** Largely acceptable as-is. The 187 calls in `scripts/` are CLI tools (intentional).

### N9 — Old `transcript_snippet` data has full transcripts (low)
**Where:** `yaksha_zoom_insights` — 17 pre-fix pending-review insights show the full transcript as snippet.
**Fix:** One-shot migration that re-runs `keywordSnippet()` or deletes the bad snippet.

### F2 — No client-side VTT validation (low)
**Where:** Manual upload UI on AccountPage exists; should reject >5MB or wrong MIME before hitting server.

### F3 — Zoom status doesn't show "last sync" (low)
**Where:** `zoomStatus.connectedAt` exists but no UI consumes it. Show "Last sync: <relative time>".

### D1 — ZoomInsight documents have no embeddings (low)
**Where:** Approved-but-not-promoted insights are invisible to semantic search. Backfill `embedding` for `status: 'approved' && embedding: null`.

---

## Modularity session (2026-06-10) — Track A + Track B completed

### A. Big-file surgery — all four targets split

- **A.1 — supportController.ts (1231L) → 6 sub-controllers.** `supportCore.ts` (183L, shared helpers/guards/notifications) + `supportRequestsController.ts` (399L) + `supportFollowUpController.ts` (287L) + `supportGuidanceController.ts` (83L) + `supportAnalyticsController.ts` (98L) + `supportCategoriesController.ts` (330L). The original `supportController.ts` is deleted; `routes/support.ts` now imports from each sub-controller directly.
- **A.2 — postController.ts (973L) → 5 sub-controllers.** `postCore.ts` (87L, `buildCommentTree` + Express `Request` augmentation) + `postReadsController.ts` (187L) + `postMutationsController.ts` (345L) + `postLifecycleController.ts` (278L) + `postModerationController.ts` (180L). `postController.ts` deleted; `routes/community.ts` imports from each sub-controller.
- **A.3 — `ThreadDetail.tsx` (803L → 749L).** Extracted `ThreadActivityTimeline.tsx` (75L), `ThreadBookmarkButton.tsx` (50L), `ThreadShareButton.tsx` (53L). Resolve/Report forms left in place because their state is deeply coupled to the parent (`showReportForm`, `reportReason`, `reportLoading`, etc).
- **A.4 — `AccountPage.tsx` (824L → 488L).** Extracted `ProfileCard.tsx` (228L) and `PasswordCard.tsx` (144L) under `frontend/src/components/account/`. Zoom OAuth, manual upload, 2FA, logout, and the process-confirmation modal left in-place (deep state coupling to the upload flow + 30+ useState hooks for upload/progress/modal).

### B. Folder reorganization

- **B.1 — `backend/utils/` grouped by domain.** 25 files moved to subdirs: `utils/zoom/` (6), `utils/ai/` (4), `utils/auth/` (3), `utils/http/` (13). 184 import lines updated across 60+ files. tsc clean after a few iterations to fix triple-prefixed paths. Note: `popularityScore.ts` and `search.ts` could be split into their own `utils/search/` subdir in a future pass; they're in `utils/http/` for now because they're request-handler middleware.
- **B.2 — `frontend/components/ui/` trimmed from 33 → 9 files.** Moved `CommunityHealth`, `CommunityPostCard`, `CommentNode`, `ThreadDetail`, `ThreadActivityTimeline`, `ThreadBookmarkButton`, `ThreadShareButton`, `TopSolved`, `SpillTheTea` → `components/community/` (11 files). Moved `CategoryGrid`, `FlagOutdatedButton`, `FreshnessBadge`, `FreshnessTierSelector`, `FromMeetings`, `HistoryModal`, `ReviewVoteButtons` → `components/faq/` (13 files). Moved `ResultItem`, `SearchBar`, `SearchResults`, `TrendingIssues`, `TrendingQueries`, `WordCloud` → `components/search/` (6 files). Moved `NotificationBell` → `components/notifications/`. `ui/` now contains only true primitives: `Avatar`, `Badge`, `Button`, `Card`, `CTA`, `Input`, `PageDoodles`, `Spinner`, `ThemeToggle`.

### Issues fixed during the move

- **Pre-existing `FAQPage.tsx` call site was using the wrong CategoryGrid prop names.** The call was passing `categories` (typed `string[]`, expected `Category[]`), `grouped` (not in interface), and `onOpen` (interface has `onSelect`). None matched the current `CategoryGrid` interface. Why tsc didn't catch this on prior runs is unclear — likely an earlier `CategoryGrid` interface had these props, then it was refactored and the call site was left stale. **Fix:** replaced with `<CategoryGrid />` (uses the default `categoryPills`). Surfaced by the B.2 move when the import path changed.

### Issues surfaced during the move, NOT fixed (deferred)

- **Resolve/Report forms inlined in `ThreadDetail.tsx`.** Their `showResolveForm`/`reportReason`/`reportLoading` state is deeply coupled to the parent's `setActionError` and the rest of the component. Extracting them cleanly would require hoisting 6+ state hooks. Left in place.
- **Zoom OAuth + manual upload + 2FA inlined in `AccountPage.tsx`.** Similar story — 9 useState hooks + 3 callbacks + a polling useEffect for transcript processing progress. Extracting cleanly would mean each card would have to import the same hooks and accept similar callback props. Left in place.
- **The other 50 `: any` casts across 13 files** (pre-existing tech debt). Most concentrated in `promotionService.ts` (11) and `commentController.ts` (5). Defer to a future type-safety pass.
