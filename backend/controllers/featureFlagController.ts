import { Request, Response } from 'express';
import { Types } from 'mongoose';
import FeatureFlag from '../models/FeatureFlag.js';
import { logger } from '../utils/http/logger.js';
import { z } from 'zod';

// Known flag keys — the canonical list. Anything else posted to the
// PUT endpoint is rejected (closed allow-list). Adding a new flag
// means adding a key here + a one-line seed in ensureFlag().
export const FEATURE_FLAGS = {
  sessionSupport: {
    label: 'Session Support Tickets',
    description:
      "Lets students report issues that prevented them from attending a " +
      "session (internet outage, device failure, etc.) with a guided " +
      "troubleshooting checklist and proof upload. Admins get a unified " +
      "inbox to triage and reply. Experimental — toggle off if it's not " +
      "earning its keep.",
    defaultEnabled: false,
  },
  goldenTicket: {
    label: 'Golden Ticket (Spurti Points escalation)',
    description:
      "A premium escalation channel where students spend Spurti Points (SP) " +
      "to bump a time-sensitive query to the top of the admin queue. Higher " +
      "SP = higher leaderboard priority. Includes a 48h cooldown between " +
      "submissions (configurable from /admin/settings). No ban, no penalty " +
      "beyond the SP spend — admins resolve or reject, the user always " +
      "gets an answer. Experimental — toggle off to hide the /golden page " +
      "and gate the backend endpoints.",
    defaultEnabled: false,
  },
} as const;

export type FeatureFlagKey = keyof typeof FEATURE_FLAGS;

/** Lazily seed known flags so admins see them in the UI even if no
 *  one has ever toggled them. Idempotent. */
export async function ensureFlag(key: FeatureFlagKey): Promise<void> {
  const cfg = FEATURE_FLAGS[key];
  if (!cfg) return;
  await FeatureFlag.updateOne(
    { key },
    {
      $setOnInsert: {
        key,
        label: cfg.label,
        description: cfg.description,
        enabled: cfg.defaultEnabled,
      },
    },
    { upsert: true, setDefaultsOnInsert: true },
  );
}

export async function ensureAllFlags(): Promise<void> {
  await Promise.all(Object.keys(FEATURE_FLAGS).map((k) => ensureFlag(k as FeatureFlagKey)));
}

// ─── Routes ──────────────────────────────────────────────────────────────────

/** GET /api/feature-flags — list all flags + state. Any authenticated
 *  user can read this so the frontend can decide whether to show the
 *  feature. */
export async function listFeatureFlags(_req: Request, res: Response): Promise<void> {
  try {
    await ensureAllFlags();
    const flags = await FeatureFlag.find({}).select('-__v').lean();
    res.json({ flags });
  } catch (err) {
    logger.error(`[featureFlags] listFeatureFlags failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to load feature flags.' });
  }
}

/** Helper used by the support router — synchronous-feel check that
 *  returns true if the named feature is currently on. Cached for 30
 *  seconds in-process to spare Mongo on a hot read path. */
const _cache = new Map<string, { enabled: boolean; expiresAt: number }>();
const CACHE_TTL_MS = 30_000;

export async function isFeatureEnabled(key: FeatureFlagKey): Promise<boolean> {
  const cached = _cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.enabled;
  try {
    await ensureFlag(key);
    const flag = await FeatureFlag.findOne({ key }).select('enabled').lean();
    const enabled = !!(flag && flag.enabled);
    _cache.set(key, { enabled, expiresAt: Date.now() + CACHE_TTL_MS });
    return enabled;
  } catch {
    return false; // fail closed
  }
}

/** Invalidate the in-process cache — call after a flag flips. */
export function invalidateFeatureFlagCache(key?: string): void {
  if (key) _cache.delete(key);
  else _cache.clear();
}

const updateSchema = z.object({
  enabled: z.boolean(),
  note: z.string().max(500).optional(),
});

/** PATCH /api/feature-flags/:key — admin-only toggle. */
export async function toggleFeatureFlag(req: Request, res: Response): Promise<void> {
  const rawKey = req.params.key;
  const key = Array.isArray(rawKey) ? rawKey[0] : rawKey;
  if (!key || !(key in FEATURE_FLAGS)) {
    res.status(404).json({ message: 'Unknown feature flag.' });
    return;
  }
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid input.', issues: parsed.error.issues });
    return;
  }

  const now = new Date();
  const isEnabling = parsed.data.enabled;
  const userId = (req as Request & { user?: { _id?: Types.ObjectId | string } }).user?._id;

  try {
    await ensureFlag(key as FeatureFlagKey);
    const updated = await FeatureFlag.findOneAndUpdate(
      { key },
      {
        $set: {
          enabled: isEnabling,
          updatedBy: userId ? new Types.ObjectId(String(userId)) : null,
          updatedAt: now,
          ...(isEnabling ? { firstEnabledAt: now } : { lastDisabledAt: now }),
        },
      },
      { new: true },
    ).lean();
    invalidateFeatureFlagCache(key);
    logger.info(`[featureFlags] ${key} → ${isEnabling ? 'enabled' : 'disabled'}`);
    res.json({ flag: updated });
  } catch (err) {
    logger.error(`[featureFlags] toggleFeatureFlag failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to update feature flag.' });
  }
}
