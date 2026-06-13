# Batch Management — Architecture Plan

> Multi-program support. Every FAQ, category, and analytics event is
> scoped to exactly one Batch (program run). Public users select a batch
> before seeing content; admins manage batches in the admin panel.

---

## 1. Goals & non-goals

**Goals**
- Multiple programs (Summer Internship 2026, ML Fellowship, etc.) coexist.
- Each program owns its FAQs, categories, contributors, and analytics.
- One-click batch switching with persisted selection.
- Public portal forces a batch pick before showing content.
- Migration of existing 130 FAQs into a default "Legacy / Yaksha 2025–26" batch with zero data loss.

**Non-goals**
- Cross-batch search in v1 (search is always batch-scoped).
- Per-batch user roles (existing role system stays global).
- Renaming a batch retroactively across audit logs.
- Re-aggregating analytics for batches created after go-live (a batch starts
  with empty analytics and accumulates from the first event).

---

## 2. Data model

### 2.1 New: `Batch`
```
{
  _id        : ObjectId
  name       : String   // "Summer Internship 2026"
  description: String
  startDate  : Date
  endDate    : Date
  isActive   : Boolean  // admins can disable without deleting
  createdBy  : ObjectId(User)
  createdAt  : Date
  updatedAt  : Date
}
```
Indexes: `{ isActive: 1, startDate: -1 }`, `{ name: 1 }` (unique).

### 2.2 New: `Category`
The existing `FAQ.category` was a free-text string. We're promoting it to
a first-class collection scoped to a batch.
```
{
  _id        : ObjectId
  batchId    : ObjectId(Batch), required
  name       : String
  slug       : String   // generated, lowercased, dash-separated
  description: String
  createdAt  : Date
  updatedAt  : Date
}
```
Indexes: `{ batchId: 1, slug: 1 }` (unique), `{ batchId: 1, name: 1 }` (unique).

**Migration behavior:** the existing `FAQ.category: string` field is kept
as a denormalised display name. Admins manage Category docs in the new
admin UI; new FAQs auto-create-or-link a Category. Old FAQs keep their
original string until a category edit happens (lazy migration).

### 2.3 Modify: `FAQ`
Add: `batchId: ObjectId(Batch), required, indexed`.
Add: `categoryId: ObjectId(Category) | null, optional` (newly created FAQs
get this; legacy ones will be filled in by a post-migration pass).

The existing `category: String` field is **kept** as a denormalised display
name so the existing FAQ listing UIs (which still show it) keep working.

Indexes added:
- `{ batchId: 1, status: 1, createdAt: -1 }`
- `{ batchId: 1, category: 1, status: 1, createdAt: -1 }`
- `{ batchId: 1, status: 1, popularityScore: -1 }`
- `{ batchId: 1, status: 1, category: 1, popularityScore: -1 }`

The existing un-scoped indexes stay — they're harmless and support the
admin's "all batches" view.

### 2.4 Modify: `GuestEvent`
Add: `batchId: ObjectId(Batch)`. Required for new events; existing events
left as-is (they belong to the legacy batch by inference during the
recompute job).

### 2.5 No changes to: User, AdminLog, CommunityPost, etc.
Community is **out of scope for v1** — posts remain global. They will be
batched in a follow-up.

---

## 3. Migration strategy

Two-phase, idempotent, safe to re-run.

**Phase 1 — Bootstrap legacy batch (idempotent)**
```
upsert Batch where name == "Yaksha 2025–26"
  set description = "Pre-batch migration cohort"
  set startDate = 2025-06-01
  set endDate = 2027-12-31
  set isActive = true
capture _id as LEGACY_BATCH_ID
```

**Phase 2 — Backfill FAQs**
```
FAQ.updateMany(
  { batchId: { $exists: false } },
  { $set: { batchId: LEGACY_BATCH_ID } }
)
```

**Phase 3 — Backfill Categories (one per distinct FAQ.category in legacy)**
```
distinct FAQ.category where batchId == LEGACY_BATCH_ID
for each name:
  upsert Category where batchId == LEGACY_BATCH_ID AND slug == slugify(name)
  capture _id
FAQ.updateMany(
  { batchId: LEGACY_BATCH_ID, categoryId: null },
  [{ $set: { categoryId: <looked-up id> } }]
)
```

The script lives at `backend/scripts/migrateBatches.ts` and is run
once: `npx tsx scripts/migrateBatches.ts`. It logs counts and is safe
to re-run (every step is upsert / set-if-missing).

---

## 4. API design

### 4.1 Batch CRUD
- `GET    /api/batches` — public; returns `{ batches: [...] }` with active
  only on public, all (incl. inactive) for admins
- `GET    /api/batches/:id` — public
- `POST   /api/batches` — admin only; create
- `PATCH  /api/batches/:id` — admin only; update
- `POST   /api/batches/:id/archive` — admin only; soft delete
- `DELETE /api/batches/:id` — admin only; hard delete (cascades FAQs)

### 4.2 Public endpoints — now batch-scoped
All `/api/public/*` endpoints gain an optional `?batchId=X` query param.
When the public portal passes a batch, the response is strictly filtered.
Without a batchId, endpoints return an empty list (forcing the portal
to pick a batch first).

- `GET /api/public/popular-faqs?batchId=X&limit=N`
- `GET /api/public/recent-faqs?batchId=X&limit=N`
- `GET /api/public/categories?batchId=X&withTop=N`
- `GET /api/public/search?batchId=X&q=...`
- `GET /api/public/faqs/:id` — returns the FAQ regardless of batch;
  client uses this for "I followed a link"
- `GET /api/public/batches` — list active batches for the portal picker
- `POST /api/public/track-view` body now requires `batchId`
- `POST /api/public/track-reading` body now requires `batchId`

### 4.3 Admin category management
- `GET    /api/admin/categories?batchId=X`
- `POST   /api/admin/categories` (admin)
- `PATCH  /api/admin/categories/:id`
- `DELETE /api/admin/categories/:id`

### 4.4 New admin page
`/admin/batches` — list + create + edit + archive.

---

## 5. Frontend

### 5.1 `BatchContext` (new, app-level)
Stores `{ currentBatch, setCurrentBatch, availableBatches }`. Persists
to `localStorage` under `yaksha_active_batch_id`. On boot, reads
available batches and either picks the last-used (if still active) or
the first available one.

### 5.2 `BatchSwitcher` (new component)
Dropdown in the topbar of every page. Shows current batch name + count
of FAQs in it. Dropdown = list of batches + "Create new" (admin only).
Selecting a batch calls `setCurrentBatch(id)` and triggers a re-render
of any page listening to it (no page reload).

### 5.3 `BatchPortal` (new page, mounted at `/explore/select`)
For anonymous visitors: if no batch is chosen (or the persisted one is
no longer active), redirect here. Shows a card grid of all active
batches with description + dates. Click → set + redirect to `/`.

### 5.4 Updates to existing pages
- `ExplorePage` — reads `currentBatch`; if null, `<Navigate to="/explore/select" />`.
  All API calls pass `?batchId=X`. The page header shows the batch name
  as the primary H1 ("Summer Internship 2026 FAQs" instead of generic).
- `PublicFaqDetail` — receives batch from context, included in tracking calls.
- `HomePage` (legacy /home) — batch switcher in nav, FAQ list filtered.
- `FAQPage` (existing /faq) — read-side already filters FAQ by status;
  we add `batchId` filter.
- Admin FAQ CRUD — add `batchId` selector; required.
- Admin sidebar — link to new `/admin/batches` page.

### 5.5 Mobile
Batch switcher collapses to a full-width pill button that opens a
bottom-sheet picker on small screens.

---

## 6. Security

- Public `GET /api/batches` returns only `{ _id, name, description, startDate, endDate, isActive, faqCount }`. No PII, no internal fields.
- Admin-only batch write endpoints guarded by existing `protect + authorize('admin', 'moderator')` middleware.
- Tracking endpoints now require `batchId` in body; reject 400 if missing or unknown.
- Cross-batch IDOR risk: a malicious user could pass a different batchId
  on the public search endpoint. The query simply filters — it never
  leaks data from other batches. We do not change permissions here, only
  scope. (Public users can already see all public FAQ data; batching is
  a UX feature, not a security boundary.)

---

## 7. Performance

- All new public endpoints index-hit on `batchId` first.
- LRU cache keys include batchId so cache survives batch switches without pollution.
- The `recomputePopularity` job is updated to group by `batchId` and
  recompute per-batch. The current per-FAQ pipeline changes slightly
  to include a `$match` on `batchId` for each pass.
- The migration script is O(N) and runs once; we also add a backfill
  path so re-running a recompute on legacy FAQs is safe.

---

## 8. Folder structure (delta only)

```
backend/
├── models/
│   ├── Batch.ts                  (new)
│   ├── Category.ts               (new)
│   ├── FAQ.ts                    (add batchId, categoryId)
│   └── GuestEvent.ts             (add batchId)
├── controllers/
│   ├── batchController.ts        (new)
│   ├── categoryAdminController.ts(new)
│   └── publicFaqController.ts    (filter by batchId)
├── routes/
│   ├── batch.ts                  (new)
│   ├── adminCategories.ts        (new)
│   └── publicFaq.ts              (add /batches route)
├── server.ts                     (mount)
└── scripts/
    └── migrateBatches.ts         (one-time backfill)

frontend/src/
├── context/
│   └── BatchContext.tsx          (new)
├── components/
│   ├── layout/
│   │   ├── Navbar.tsx            (add BatchSwitcher)
│   │   └── BatchSwitcher.tsx     (new)
│   └── explore/
│       └── ExplorePage.tsx       (use BatchContext, redirect when null)
├── pages/
│   └── BatchPortalPage.tsx       (new — /explore/select)
├── admin/
│   ├── components/layout/AdminSidebar.tsx (add link)
│   └── pages/AdminBatches.tsx    (new)
└── App.tsx                       (add routes)
```

---

## 9. Rollout

1. Backend models + migration script.
2. Run migration (idempotent — safe to run now on existing data).
3. Backend batch + category controllers.
4. Update public controllers + routes to require batchId.
5. Frontend BatchContext + BatchSwitcher.
6. BatchPortalPage + ExplorePage integration.
7. Admin Batches page + sidebar link.
8. Verify: backend tests, full e2e Playwright run.

---

## 10. What this does NOT do (v1 scope)

- No CommunityPost batching (separate ticket).
- No per-batch user roles.
- No batch-scoped User progress / reputation (those stay global).
- No public batch archives (admin-only list shows archived).
- No cross-batch analytics dashboard (admin analytics stays global).
