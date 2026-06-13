# Architecture Overview

Complete map of the Shamagama codebase — every layer, every file, every pattern.

---

## Table of Contents

1. [Directory Structure](#1-directory-structure)
2. [Backend — Routes](#2-backend--routes)
3. [Backend — Controllers](#3-backend--controllers)
4. [Backend — Models](#4-backend--models)
5. [Backend — Services & Utils](#5-backend--services--utils)
6. [Frontend — Pages & Components](#6-frontend--pages--components)
7. [Frontend — Hooks & State](#7-frontend--hooks--state)
8. [Middleware Layer](#8-middleware-layer)
9. [Key Patterns](#9-key-patterns)
10. [Env Variables Reference](#10-env-variables-reference)

---

## 1. Directory Structure

```
shamagama/
├── backend/
│   ├── __tests__/              # Vitest unit tests
│   │   ├── authorize.test.ts
│   │   ├── cloudinary.test.ts
│   │   ├── jwtRevocation.test.ts
│   │   └── search.test.ts
│   ├── config/
│   │   └── db.ts               # Lazy MongoDB connection (cached across requests)
│   ├── controllers/            # Request handlers (44 files)
│   ├── middleware/
│   │   ├── admin.ts            # adminOnly — RBAC guard
│   │   ├── auth.ts             # protect + authorize()
│   │   └── authShared.ts       # verifyAndLoadUser (shared auth logic)
│   ├── models/                 # Mongoose schemas (27 files)
│   ├── routes/                 # Express routers (21 files)
│   ├── scripts/                # One-time migrations, seeders, utilities
│   ├── services/               # Business logic services
│   │   ├── aiClient.ts         # AI API client (Anthropic/OpenAI/XAI/MiniMax)
│   │   ├── knowledgeBase.ts    # FAQ + TranscriptKnowledge management
│   │   ├── promotionService.ts # Expert/user promotion logic
│   │   └── rag.ts              # RAG (Retrieval-Augmented Generation) pipeline
│   ├── types/
│   │   └── express.d.ts        # Extended Express Request type
│   ├── utils/                  # Utilities (18 files)
│   │   ├── aiProvider.ts       # Per-pipeline AI provider resolution
│   │   ├── cache.ts            # In-memory LRU cache
│   │   ├── circuitBreaker.ts   # Circuit breaker for external services
│   │   ├── cloudinary.ts       # Cloudinary config + signature generation
│   │   ├── crypto.ts           # AES-256-GCM encryption for tokens
│   │   ├── duplicateDetector.ts # AI-powered duplicate detection
│   │   ├── embeddings.ts       # Xenova/transformers embedding generation
│   │   ├── fileLogger.ts        # Structured file-based logging
│   │   ├── jobQueue.ts         # Background job queue (lightweight)
│   │   ├── logger.ts           # Central logger (Morgan + custom)
│   │   ├── metrics.ts           # Prometheus metrics (counters, gauges, histograms)
│   │   ├── notificationDispatcher.ts # Notification dispatch
│   │   ├── pipelineCommon.ts   # Shared pipeline utilities
│   │   ├── rateLimit.ts        # express-rate-limit wrapper
│   │   ├── requestContext.ts    # Request-scoped context (requestId, userId)
│   │   ├── requestLogger.ts     # HTTP request logging
│   │   ├── sanitize.ts          # Text sanitization (XSS prevention)
│   │   ├── search.ts            # RRF merge + search threshold
│   │   ├── validation.ts        # Zod validateBody middleware
│   │   ├── vttParser.ts         # Zoom VTT transcript parser
│   │   ├── zoomCache.ts         # Zoom OAuth token cache
│   │   ├── zoomExtractor.ts     # AI-powered Q&A extraction from transcripts
│   │   ├── zoomFallback.ts      # Zoom OAuth fallback handling
│   │   ├── zoomHealth.ts        # Zoom service health checks
│   │   └── zoomOAuth.ts         # Per-user Zoom OAuth + token encryption
│   ├── server.ts               # Express app entry point
│   ├── vitest.config.ts
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── admin/
│   │   │   ├── components/
│   │   │   │   └── ui/
│   │   │   │       ├── AdminCard.tsx
│   │   │   │       ├── AdminStatCard.tsx
│   │   │   │       └── AdminTable.tsx
│   │   │   └── pages/
│   │   │       ├── AdminAutoAnswerQueue.tsx
│   │   │       ├── AdminFAQAudit.tsx
│   │   │       ├── AdminFAQs.tsx
│   │   │       ├── AdminCommunity.tsx
│   │   │       ├── AdminDashboard.tsx
│   │   │       ├── AdminModeration.tsx
│   │   │       ├── AdminZoomInsights.tsx
│   │   │       ├── AdminZoomMeetings.tsx
│   │   │       ├── AdminAISettings.tsx
│   │   │       ├── AdminLeaderboard.tsx
│   │   │       ├── AdminSettings.tsx
│   │   │       ├── AdminUnresolvedSearch.tsx
│   │   │       ├── AdminUsers.tsx
│   │   │       └── FaqReview.tsx
│   │   ├── components/
│   │   │   ├── ui/
│   │   │   │   ├── Button.tsx
│   │   │   │   ├── CommentNode.tsx
│   │   │   │   ├── Modal.tsx
│   │   │   │   ├── Navbar.tsx
│   │   │   │   ├── PostDetailDialog.tsx
│   │   │   │   ├── SearchBar.tsx
│   │   │   │   ├── SearchDropdown.tsx
│   │   │   │   ├── SkeletonLoader.tsx
│   │   │   │   ├── ThreadDetail.tsx
│   │   │   │   └── ...
│   │   │   ├── faq/
│   │   │   ├── community/
│   │   │   └── layout/
│   │   ├── hooks/
│   │   │   └── useAuth.tsx      # Auth context + JWT persistence
│   │   ├── pages/
│   │   │   ├── AccountPage.tsx
│   │   │   ├── CommunityPage.tsx
│   │   │   ├── FAQPage.tsx
│   │   │   ├── HomePage.tsx
│   │   │   └── SavedKnowledgePage.tsx
│   │   ├── styles/
│   │   │   └── index.css       # Global styles + CSS custom properties
│   │   └── utils/
│   │       └── api.ts          # Axios instance + API helpers
│   └── package.json
├── docs/                        # This documentation
│   ├── README.md                # Entry point
│   ├── ARCHITECTURE.md          # This file
│   ├── PIPELINES.md             # Pipeline documentation
│   ├── MCP.md                   # MCP integration guide
│   ├── AI_PROVIDERS.md          # AI provider configuration
│   ├── context.md               # Legacy project overview
│   ├── openapi.yaml             # Swagger API spec
│   ├── issues.md                # Issue tracking
│   └── wire.md                  # Wire protocol reference
└── package.json                  # Workspace root
```

---

## 2. Backend — Routes

All routes are mounted in `server.ts`. Admin routes are prefixed `/api/admin`.

| File | Mount | Auth | Purpose |
|------|-------|------|---------|
| `auth.ts` | `/api/auth` | public + protected | Register, login, getMe, profile, password |
| `faq.ts` | `/api/faq` | public + protected | FAQ CRUD, check-match, flag, vote-review |
| `community.ts` | `/api/community` | public + protected | Posts, comments, bookmarks, review-queue |
| `search.ts` | `/api/search` | public | Hybrid search, suggest, trending |
| `support.ts` | `/api/support` | protected | Session support: troubleshoot, requests, follow-ups, status, guidance, analytics, categories, golden ticket endpoints |
| `publicFaq.ts` | `/api/public` | public | Anonymous FAQ browse (recent, popular, categories, detail, by-batch) |
| `batch.ts` | `/api/batches` | public + protected | Batch list, current batch, FAQ/category scoping |
| `appSettings.ts` | `/api/app-settings` | public + admin | Read-only public settings (cooldown hours etc.) + admin CRUD |
| `featureFlag.ts` | `/api/feature-flags` | protected | List + toggle experimental features |
| `admin.ts` | `/api/admin` | admin only | Dashboard stats, user management, reports |
| `adminAutoAnswer.ts` | `/api/admin` | admin only | Auto-answer queue + review |
| `adminAudit.ts` | `/api/admin` | admin only | FAQ audit stats + results |
| `reputation.ts` | `/api/reputation` | mixed | Leaderboard (public), points/badges (admin) |
| `moderation.ts` | `/api/moderation` | admin only | Ban, suspend, warn, soft-delete |
| `analytics.ts` | `/api/analytics` | admin/mod | Search analytics, failed queries |
| `notification.ts` | `/api/notifications` | protected | List, mark read, delete |
| `tea.ts` | `/api/notifications/tea` | protected | SpillTheTea notifications |
| `zoom.ts` | `/api/zoom` | mixed | OAuth, webhook, manual upload, status |
| `knowledge.ts` | `/api/knowledge` | protected | TranscriptKnowledge management |
| `askAi.ts` | `/api/ask-ai` | public (quota) | RAG-powered AI assistant |
| `upload.ts` | `/api/upload` | protected | Cloudinary signed upload URL |

### Route prefix pitfall

Admin route files are mounted at `/api/admin`. The route paths in the router file MUST include the full path:

```ts
// CORRECT — frontend calls /api/admin/auto-answer/queue
router.get('/auto-answer/queue', getQueue);

// WRONG — silently returns 404
router.get('/queue', getQueue);
```

---

## 3. Backend — Controllers

Each controller handles a set of related operations. Controllers are imported by routes and called with `(req, res)`. The support system and community posts are split into focused sub-controllers (modularity refactor, see [issues.md](issues.md)).

### Auth & users

| Controller | Responsibility |
|---|---|
| `authController.ts` | Register, login, getMe, updateProfile, changePassword, deleteUser (soft), exportUserData |
| `adminController.ts` | Dashboard stats, user/FAQ/report management |
| `admin2faController.ts` | Admin two-factor authentication (TOTP enroll + verify) |

### FAQ

| Controller | Responsibility |
|---|---|
| `faqController.ts` | CRUD, check-match (duplicate), flag, vote-review |
| `faqAuditController.ts` | FAQ audit scheduler + stats |
| `freshnessController.ts` | FAQ freshness: flag-outdated, peer vote, review queue, moderator escalation + dismissal, `runFreshnessCheck` cron |

### Community posts (split into 5 sub-controllers + core)

| Controller | Responsibility |
|---|---|
| `postCore.ts` | Shared helpers — `buildCommentTree`, Express `Request` augmentation |
| `postReadsController.ts` | Get post, list posts, related |
| `postMutationsController.ts` | Create / edit / vote / resolve |
| `postLifecycleController.ts` | Open / close / reopen |
| `postModerationController.ts` | Report, take-down, restore |
| `postDuplicateController.ts` | AI duplicate detection |
| `commentController.ts` | Comment CRUD, verify, accept-answer, edit, delete |
| `commentVoteController.ts` | Comment upvotes/downvotes (reverses reputation on removal) |
| `bookmarkController.ts` | Toggle bookmark, list bookmarks |
| `communitySearchController.ts` | Community-only search |
| `communityStatsController.ts` | Community stats |
| `escalationController.ts` | Community post escalation handling (scheduler) |

### Search & discovery

| Controller | Responsibility |
|---|---|
| `searchController.ts` | Hybrid semantic + keyword search, suggest, trending, search log buffering (see `routes/search.ts`) |
| `analyticsController.ts` | Search analytics, unresolved query tracking |
| `publicFaqController.ts` | Anonymous public FAQ browse (recent, popular, categories, detail) |
| `batchController.ts` | Batch + Category CRUD, current-batch lookup, batch-scoped FAQ/category reads |

### Pipelines

| Controller | Responsibility |
|---|---|
| `autoAnswerController.ts` | Auto-answer scheduler + review endpoints |
| `aiPromotionController.ts` | Expert promotion, promote to FAQ |
| `aiController.ts` | AI config management |
| `aiConfigController.ts` | AI configuration |
| `knowledgeController.ts` | TranscriptKnowledge management |

### Support tickets (split into 6 sub-controllers + core)

| Controller | Responsibility |
|---|---|
| `supportCore.ts` | Shared helpers/guards/notifications + `requireFeatureOn` |
| `supportRequestsController.ts` | Create / list / get / self-delete support requests; submit-time Golden Ticket gate; cooldown stamp |
| `supportFollowUpController.ts` | Add student/admin follow-ups; admin status update (resolve/reject) |
| `supportGuidanceController.ts` | Issue-type guidance (admin-editable troubleshooting steps) |
| `supportAnalyticsController.ts` | Support ticket analytics |
| `supportCategoriesController.ts` | Support category + per-category context field schema CRUD |
| `supportGoldenController.ts` | Golden Ticket (user-driven): SP balance, Escalation Queue, admin convert/award-SP |

### Moderation & reputation

| Controller | Responsibility |
|---|---|
| `moderationController.ts` | Ban, suspend, warn, soft-delete, moderation logs |
| `reputationController.ts` | Points, badges, leaderboard |

### Notifications

| Controller | Responsibility |
|---|---|
| `notificationController.ts` | List, mark read, delete notifications |
| `teaNotificationController.ts` | SpillTheTea notification creation + delivery |

### Meta

| Controller | Responsibility |
|---|---|
| `featureFlagController.ts` | List + toggle experimental features; cached `isFeatureEnabled` lookup |
| `appSettingsController.ts` | App settings (e.g. `goldenCooldownHours`) — public read + admin write |

---

## 4. Backend — Models

| Model | Collection | Purpose |
|---|---|---|
| `User.ts` | `yaksha_faq_users` | User accounts, roles, auth, Zoom OAuth tokens, Spurti Points (`sp`), Golden cooldown provenance |
| `FAQ.ts` | `yaksha_faq_faqs` | FAQ entries with 768-dim embedding, batch + category scoping, freshness tier + review status |
| `Batch.ts` | `yaksha_faq_batches` | Cohort/program/term scoping for FAQs, categories, analytics |
| `Category.ts` | `yaksha_faq_categories` | First-class category model (replaces the old free-text `FAQ.category` string) |
| `CommunityPost.ts` | `yaksha_faq_communityposts` | Posts + embedded comments sub-schema |
| `SearchLog.ts` | `yaksha_faq_searchlogs` | Search analytics (TTL 90 days) |
| `Notification.ts` | `yaksha_faq_notifications` | User notifications |
| `NotificationSettings.ts` | `yaksha_faq_notification_settings` | Per-user per-event-type notification preferences |
| `TeaNotification.ts` | `yaksha_faq_tea_notifications` | SpillTheTea events |
| `AdminLog.ts` | `yaksha_faq_admin_logs` | Admin action audit log |
| `ModerationLog.ts` | `yaksha_faq_moderation_logs` | Moderation action logs |
| `ReputationLog.ts` | `yaksha_faq_reputation_logs` | Reputation change history |
| `Badge.ts` | `yaksha_faq_badges` | Badge definitions |
| `RevokedToken.ts` | `yaksha_faq_revoked_tokens` | JWT revocation (short TTL) |
| `ZoomMeeting.ts` | `yaksha_faq_zoom_meetings` | Zoom meeting records + progress |
| `TranscriptKnowledge.ts` | `yaksha_faq_transcript_knowledge` | Auto-approved transcript Q&A (zero-human) |
| `PipelineResult.ts` | `yaksha_faq_pipeline_results` | Unified pipeline result log (TTL 30 days) |
| `AiConfig.ts` | `yaksha_faq_ai_configs` | AI provider configuration overrides |
| `FreshReviewLog.ts` | `yaksha_faq_fresh_review_logs` | FAQ freshness flag/vote event log |
| `FreshReviewVote.ts` | `yaksha_faq_fresh_review_votes` | Peer-vote freshness votes (unique per `faqId+cycle+voterId`) |
| `FeatureFlag.ts` | `yaksha_faq_feature_flags` | Experimental feature flags (`sessionSupport`, `goldenTicket`, ...) |
| `AppSetting.ts` | `yaksha_faq_app_settings` | Singleton admin-editable app settings (e.g. `goldenCooldownHours`) |
| `SupportCategory.ts` | `yaksha_faq_support_categories` | Support issue types + admin-editable per-category context field schema |
| `SupportRequest.ts` | `yaksha_faq_support_requests` | Support tickets: troubleshooting, follow-ups, status, Golden Ticket fields |
| `GuestEvent.ts` | `yaksha_faq_guest_events` | Anonymous (no-account) user analytics |
| `AttendanceGuidance.ts` | `yaksha_faq_attendance_guidance` | Admin-editable attendance/session guidance content |
| `UnresolvedSearch.ts` | `yaksha_faq_unresolved_searches` | Unresolved search query tracking |

### Key schema decisions

- `CommunityPost.comments[]` is an **embedded sub-schema** — not a referenced collection. Simpler for read-heavy workloads.
- `FAQ.embedding` is `select: false` — never returned in normal queries, only explicitly fetched for search.
- `User` has soft-delete fields: `isDeleted`, `deletedAt`. `deleteUser` now anonymizes instead of hard-deleting.
- `ZoomMeeting` stores `sourcing` ('webhook' | 'manual_vtt' | 'manual_txt' | 'manual_raw') and `status` ('pending' | 'processing' | 'completed' | 'failed').

---

## 5. Backend — Services & Utils

### Services

| File | Purpose |
|---|---|
| `aiClient.ts` | Unified AI API client (Anthropic/OpenAI/XAI/MiniMax). Wraps `chat()` function. |
| `knowledgeBase.ts` | `processZoomMeetingForKnowledge()` — zero-human transcript approval path. `promoteToFAQ()` — promote TranscriptKnowledge to FAQ. |
| `promotionService.ts` | Expert/user promotion checks — `checkPromotionEligibility()`, `startPromotionReview()` |
| `rag.ts` | RAG pipeline — `runRag()` for the `/ask-ai` endpoint |

### Utils

| File | Purpose |
|---|---|
| `aiProvider.ts` | Per-pipeline AI provider resolution. `getPipelineProviderConfig()`, `chatWithConfig()` |
| `pipelineCommon.ts` | Shared pipeline utilities — `searchKnowledgeWithFallback()`, `triageByScore()`, `buildAuditMetaUpdate()`, `logPipelineEvent()`, `isSensitiveContent()` |
| `embeddings.ts` | `generateEmbedding()` via Xenova/transformers |
| `search.ts` | `computeRRF()` (Reciprocal Rank Fusion), `applySearchThreshold()` |
| `validation.ts` | `validateBody(ZodSchema)` — express middleware factory |
| `rateLimit.ts` | `createIdentityLimiter()` — per-user/IP rate limiters |
| `cache.ts` | In-memory LRU cache for search results |
| `circuitBreaker.ts` | `CircuitOpenError` + circuit state for Zoom OAuth + API calls |
| `cloudinary.ts` | `getCloudinaryConfig()` — startup validation, `generateUploadSignature()` |
| `crypto.ts` | `encrypt()`, `decrypt()` — AES-256-GCM for token storage |
| `duplicateDetector.ts` | AI-powered duplicate FAQ/post detection |
| `fileLogger.ts` | Structured file-based logging (rotating) |
| `logger.ts` | Central logger instance (Morgan + custom) |
| `metrics.ts` | Prometheus metrics — counters, gauges, histograms |
| `notificationDispatcher.ts` | Notification dispatch (push, email) |
| `sanitize.ts` | `sanitizeText()` — XSS prevention |
| `zoomOAuth.ts` | Per-user Zoom OAuth token management + auto-refresh |
| `zoomExtractor.ts` | `extractInsightsFromTranscript()` — AI Q&A extraction |
| `vttParser.ts` | `parseVTT()`, `parseVTTWithSpeakers()`, `isEmptyTranscript()` |
| `zoomHealth.ts` | `getZoomHealth()` — health check + error recording |
| `zoomCache.ts` | Zoom token cache |
| `zoomFallback.ts` | Zoom OAuth fallback handling |
| `requestContext.ts` | Request-scoped context (requestId, userId for logging) |
| `requestLogger.ts` | HTTP request logging |
| `jobQueue.ts` | Lightweight background job queue |

---

## 6. Frontend — Pages & Components

### Pages

| Page | Route | Purpose |
|---|---|---|
| `HomePage.tsx` | `/` | Hero search + trending + category grid |
| `FAQPage.tsx` | `/faq` | FAQ category browser + search |
| `BatchPortalPage.tsx` | `/explore/select` | Guest batch picker (anonymous-friendly entry) |
| `CommunityPage.tsx` | `/community` | Community Q&A board |
| `SavedKnowledgePage.tsx` | `/saved` | Bookmarked knowledge |
| `AccountPage.tsx` | `/account` | Profile + Zoom OAuth connect |
| `LeaderboardPage.tsx` | `/leaderboard` | Public reputation leaderboard |
| `SupportIndexPage.tsx` | `/support` | Session support landing — list of own tickets, new-ticket CTA |
| `NewSupportRequestPage.tsx` | `/support/new` | New session support ticket form (troubleshoot + dynamic context fields) |
| `SupportTicketPage.tsx` | `/support/:id` | Single ticket view: follow-ups, status timeline, admin reply |
| `GoldenTicketPage.tsx` | `/golden` | Golden Ticket (Spurti Points escalation) form + live Escalation Queue + cooldown UX |
| `AdminPage.tsx` | `/admin` | Admin dashboard (many sub-routes) |

### Admin sub-pages

| Page | Route | Purpose |
|---|---|---|
| `AdminDashboard.tsx` | `/admin` | Overview stats |
| `AdminFAQs.tsx` | `/admin/faqs` | FAQ management (create, edit, archive, batch/category scoping, FreshnessTierSelector) |
| `FaqReview.tsx` | `/admin/faqs/review` | Flagged FAQ review queue (audit + freshness) |
| `AdminFAQAudit.tsx` | `/admin/faq-audit` | AI audit results |
| `AdminAutoAnswerQueue.tsx` | `/admin/auto-answer` | Auto-answer review |
| `AdminCommunity.tsx` | `/admin/community` | Post management |
| `AdminUsers.tsx` | `/admin/users` | User management |
| `AdminModeration.tsx` | `/admin/moderation` | Moderation logs + queue |
| `AdminZoomMeetings.tsx` | `/admin/zoom-meetings` | Zoom meeting records |
| `AdminZoomInsights.tsx` | `/admin/zoom-insights` | Zoom insight review |
| `AdminLeaderboard.tsx` | `/admin/leaderboard` | Reputation leaderboard |
| `AdminUnresolvedSearch.tsx` | `/admin/unresolved-search` | Unresolved query tracking |
| `AdminAISettings.tsx` | `/admin/ai-settings` | Per-pipeline AI provider config |
| `AdminSettings.tsx` | `/admin/settings` | App settings (incl. GoldenTicketSettingsCard: cooldown hours) |
| `AdminBatches.tsx` | `/admin/batches` | Batch + category management (cohort, term, FAQ scoping) |
| `AdminFeatures.tsx` | `/admin/features` | Experimental feature flag toggles (`sessionSupport`, `goldenTicket`, ...) |
| `AdminSupportInbox.tsx` | `/admin/support` | Support ticket inbox (admin triage queue) |
| `AdminSupportTicket.tsx` | `/admin/support/:id` | Single support ticket detail (admin reply, status, Golden convert) |
| `AdminSupportCategories.tsx` | `/admin/support/categories` | Support category + dynamic context field schema CRUD |
| `AdminSupportGuidance.tsx` | `/admin/support/guidance` | Per-issue-type troubleshooting guidance editor |
| `AdminSupportAnalytics.tsx` | `/admin/support/analytics` | Support ticket analytics (volume, resolution time, by-category) |
| `AdminLogin.tsx` | `/admin/login` | Dedicated admin login (separate from user auth) |

### Key components

| Component | Location | Purpose |
|---|---|---|
| `SearchBar.tsx` | `components/search/` | Floating bottom-center search bar |
| `SearchDropdown.tsx` | `components/search/` | FAQ autocomplete dropdown |
| `ThreadDetail.tsx` | `components/community/` | Community post modal with comments |
| `PostDetailDialog.tsx` | `components/community/` | Post + comments dialog |
| `CommentNode.tsx` | `components/community/` | Individual comment with edit/delete |
| `CreatePostDialog.tsx` | `components/community/` | Post creation with duplicate detection |
| `CategoryCardGrid.tsx` | `components/faq/` | Sage-green FAQ category card grid (homepage hero) |
| `CategoryCard.tsx` | `components/faq/` | Single category card |
| `CategoryGrid.tsx` | `components/faq/` | Category pill grid (FAQ browser) |
| `QuestionList.tsx` | `components/faq/` | FAQ accordion list |
| `FreshnessBadge.tsx` | `components/faq/` | `✓ Verified` / `⏳ Under review` / `⚠ Update requested` indicator |
| `FlagOutdatedButton.tsx` | `components/faq/` | Per-FAQ manual flag-outdated (modal + reason) |
| `FreshnessTierSelector.tsx` | `components/faq/` | Tier radio (evergreen/seasonal/volatile) + interval input |
| `ReviewVoteButtons.tsx` | `components/faq/` | Peer-vote `still_accurate` / `needs_update` + suggestion |
| `ReportFAQButton.tsx` | `components/faq/` | Report a FAQ (different from flag-outdated) |
| `FromMeetings.tsx` | `components/faq/` | "From Zoom meetings" related-FAQ block |
| `DynamicFieldInput.tsx` | `components/support/` | Renders one admin-defined support context field |
| `ContextFieldsDisplay.tsx` | `components/support/` | Renders all context field values for a ticket |
| `FeatureGate.tsx` | `components/support/` | Page-level gate: shows the disabled panel if a feature flag is off |
| `SpurtiChip.tsx` | `components/layout/` | Sage pill: flame icon + `X SP` (current Spurti Points balance) |
| `ExploreHero.tsx`, `ExploreSearchBar.tsx` | `components/explore/` | Public explore page hero + search bar |
| `PublicFaqDetail.tsx` | `components/explore/` | Public FAQ detail with related-from-meetings |
| `usePublicFaqApi.ts` | `components/explore/` | Hook for `/api/public/*` (anonymous, batch-scoped) |
| `useReadingTracker.ts` | `components/explore/` | Hook that logs a `GuestEvent` after a 5s read |
| `useAuth.tsx` | `hooks/` | Auth context + JWT + isAuthenticated guard |
| `FeatureFlagContext` | `context/` | Live feature-flag state, exposes `useFeatureFlag(key)` + `useFeatureFlags()` |

### `components/ui/` — UI primitives only

After the modularity refactor, `components/ui/` contains only true UI primitives (no feature logic): `Avatar`, `Badge`, `Button`, `Card`, `CTA`, `Input`, `PageDoodles`, `Spinner`, `ThemeToggle`. All feature components (thread detail, post dialog, comments, category grid, search, freshness, support, etc.) live in their own domain folders (`community/`, `faq/`, `search/`, `support/`, `explore/`, `notifications/`).

---

## 7. Frontend — Hooks & State

### `useAuth` (`hooks/useAuth.tsx`)

Central auth state management. Critical pattern:

```tsx
// ✅ CORRECT — guard on isAuthenticated (from /auth/me confirmation)
const { isAuthenticated, user } = useAuth();
if (!isAuthenticated) return <Navigate to="/login" />;

// ❌ WRONG — race condition, fires before /auth/me resolves
const { user } = useAuth();
if (!user) return <Navigate to="/login" />;
```

### API layer (`utils/api.ts`)

Axios instance with:
- Base URL from env (`VITE_API_URL`)
- JWT interceptor (reads from localStorage `token`)
- `isAuthenticated` flag that only flips `true` after `/auth/me` confirms the token
- Error interceptor for 401 (redirect to login)

### Key state patterns

- **Auth race condition**: Pages that call protected API endpoints on mount must guard on `isAuthenticated`, not `user !== null`.
- **Optimistic updates**: Upvotes/downvotes update local state immediately, rollback on error.
- **AI quota tracking**: `localStorage` tracks `/ask-ai` usage (5/day for anonymous, unlimited for authenticated).

---

## 8. Middleware Layer

```
Request
  │
  ▼
requestLogger          ← HTTP request logging
  │
  ▼
cors                   ← Cross-origin policy
  │
  ▼
helmet                 ← Security headers
  │
  ▼
morgan('dev')          ← Request logging
  │
  ▼
express.json()         ← Body parsing
  │
  ▼
rateLimit (global)     ← Global rate limiter
  │
  ▼
protect / authorize    ← Auth + RBAC (per-route)
  │
  ▼
Controller handler
  │
  ▼
Error handler          ← Global error catch
```

### `protect` middleware (`middleware/auth.ts`)

Verifies JWT from `Authorization: Bearer <token>` header. Checks:
1. Token is valid and not expired
2. Token not revoked (`RevokedToken` collection)
3. User `isBanned === false`
4. User `isDeleted === false`
5. User not suspended (`suspendedUntil > now`)

Attaches `req.user` and `req.auth` on success.

### `authorize(...roles)` middleware

Role guard — returns 403 directly (not 500) if user lacks required role.

```ts
router.get('/admin-only', protect, authorize('admin'), handler);
router.patch('/mod-action', protect, authorize('admin', 'moderator'), handler);
```

### `adminOnly` middleware (`middleware/admin.ts`)

Shorthand for `protect, authorize('admin', 'moderator')`.

---

## 9. Key Patterns

### ESM + TypeScript

All backend files use ESM (`"type": "module"` in package.json). Imports require `.js` extension:
```ts
import { chat } from '../utils/aiProvider.js';  // ✅
import { chat } from '../utils/aiProvider';     // ❌
```

### Dynamic require (ESM anti-pattern)

Never use `require('mongoose')` or `require('crypto')` inside functions — ESM doesn't support dynamic requires. Use static imports at the top of the file:
```ts
import mongoose from 'mongoose';   // ✅ static import
import crypto from 'crypto';        // ✅ static import

// ❌ NEVER: const mongoose = require('mongoose');
```

### Zod validation

All mutation endpoints use `validateBody(ZodSchema)` middleware from `utils/validation.ts`:
```ts
router.post('/', protect, validateBody(createPostSchema), createPost);
```

### Soft delete

User deletion anonymizes the account rather than hard-deleting:
```ts
target.isDeleted = true;
target.deletedAt = new Date();
target.name = 'Deleted User';
target.email = `deleted-${target._id}@yaksha.invalid`;
target.password = uuidv4(); // break login
```

### Pipeline result logging

All pipeline outcomes write to `PipelineResult`:
```ts
await PipelineResult.create({
  pipeline: 'auto_answer',
  targetModel: 'CommunityPost',
  targetId: post._id,
  targetTitle: post.title,
  score: confidence,
  verdict: 'approved',
  flagged: false,
  checkedAt: new Date(),
});
```

### Circuit breaker

External service calls (Zoom OAuth, AI APIs) wrapped in circuit breakers:
```ts
try {
  result = await zoomApiCircuit.execute(() => downloadTranscript());
} catch (err) {
  if (err instanceof CircuitOpenError) {
    // Fail fast, circuit is open
  }
}
```

---

## 10. Env Variables Reference

### Core

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `PORT` | No | `6767` | Server port |
| `NODE_ENV` | No | `development` | `development` / `production` |
| `MONGODB_URI` | Yes | — | MongoDB connection string |
| `JWT_SECRET` | Yes | — | JWT signing secret |
| `FRONTEND_URL` | No | `http://localhost:5173` | CORS allowed origin |

### AI Providers

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic API key (priority 1) |
| `OPENAI_API_KEY` | OpenAI API key (priority 2) |
| `XAI_API_KEY` | XAI/Grok API key (priority 3) |
| `MINIMAX_API_KEY` | MiniMax API key (priority 4) |

### Per-pipeline AI overrides

| Variable | Default | Purpose |
|---|---|---|
| `FAQ_AUDIT_PROVIDER` | auto-detect | AI provider for FAQ audit |
| `FAQ_AUDIT_MODEL` | provider default | Model for FAQ audit |
| `AUTO_ANSWER_PROVIDER` | auto-detect | AI provider for auto-answer |
| `AUTO_ANSWER_MODEL` | provider default | Model for auto-answer |

### Pipeline thresholds

| Variable | Default | Purpose |
|---|---|---|
| `PIPELINE_APPROVE_THRESHOLD` | `0.85` | Auto-approve confidence |
| `PIPELINE_QUEUE_THRESHOLD` | `0.60` | Queue-for-review confidence |
| `PIPELINE_MIN_CONFIDENCE` | `0.35` | Skip below this |
| `PIPELINE_RESULT_TTL_DAYS` | `30` | PipelineResult TTL |

### FAQ Freshness (see [PIPELINES.md §5](PIPELINES.md#5-faq-freshness-pipeline))

| Variable | Default | Purpose |
|---|---|---|
| `FAQ_FRESHNESS_CRON_SCHEDULE` | `0 6 * * *` | Daily cron for `runFreshnessCheck()` (currently unwired — see implementation gap note) |
| `FAQ_VERIFY_THRESHOLD` | `3` | Peer `still_accurate` votes needed to auto-verify |
| `FAQ_ESCALATION_DAYS` | `3` | Days of inactivity before auto-escalation to mod |
| `FAQ_SEASONAL_DAYS` | `15` | Default review interval for `freshness_tier: seasonal` |
| `FAQ_VOLATILE_DAYS` | `4` | Default review interval for `freshness_tier: volatile` |

### Golden Ticket (Spurti Points escalation)

The cooldown duration is a singleton admin setting (`AppSetting.goldenCooldownHours`, range `0-720`, default `48`), not an env var. Tweak from `/admin/settings`. `0` disables the cooldown entirely.

### Zoom

| Variable | Required | Purpose |
|---|---|---|
| `ZOOM_CLIENT_ID` | Yes | OAuth app client ID |
| `ZOOM_CLIENT_SECRET` | Yes | OAuth app client secret |
| `ZOOM_REDIRECT_URI` | No | OAuth callback URI |
| `ZOOM_WEBHOOK_SECRET_TOKEN` | Yes (prod) | Webhook HMAC verification |
| `ZOOM_TOPIC_BLACKLIST` | No | CSV regex — skip matching meetings |

### Cloudinary

| Variable | Required | Purpose |
|---|---|---|
| `CLOUDINARY_CLOUD_NAME` | Yes | Cloud name |
| `CLOUDINARY_API_KEY` | Yes | API key |
| `CLOUDINARY_API_SECRET` | Yes | API secret |
| `CLOUDINARY_FOLDER` | No | `yaksha` |

### Notification

| Variable | Purpose |
|---|---|
| `TWILIO_ACCOUNT_SID` | Twilio SMS |
| `TWILIO_AUTH_TOKEN` | Twilio auth |
| `TWILIO_PHONE_NUMBER` | Twilio sender |
| `EMAIL_HOST` | SMTP host |
| `EMAIL_PORT` | SMTP port |
| `EMAIL_USER` | SMTP user |
| `EMAIL_PASS` | SMTP password |

### Upstash Redis (optional — search cache)

| Variable | Purpose |
|---|---|
| `UPSTASH_REDIS_REST_URL` | Redis REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | Redis auth token |