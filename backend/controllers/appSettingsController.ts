/**
 * appSettingsController.ts — admin-editable global app settings.
 *
 * v1.65 — Golden Ticket feature introduced `goldenCooldownHours`
 * (default 48) and `goldenPenaltyMultiplier` (default 1.25). Both
 * are stored in the singleton AppSetting document and read by
 * `supportCore.ts` helpers at request time.
 *
 * Endpoints:
 *   GET  /api/admin/settings    (admin only — full settings)
 *   PUT  /api/admin/settings    (admin only — body: { key, value })
 *   GET  /api/public/settings   (any authed user — public-safe copy)
 *
 * The public endpoint exposes only the values the frontend needs to
 * render UI (cooldown hours, so it can compute "next available" copy
 * without round-tripping). SP penalty math stays server-side.
 */

import { Request, Response } from 'express';
import { Types } from 'mongoose';
import AppSetting, { readSetting, type SettingKey } from '../models/AppSetting.js';
import { getAuthedUserId } from './supportCore.js';
import { logger } from '../utils/http/logger.js';

/** Public-safe subset returned to non-admin callers. */
const PUBLIC_KEYS: SettingKey[] = ['goldenCooldownHours'];

function adminOnly(req: Request, res: Response): { userId: Types.ObjectId } | null {
  const userId = getAuthedUserId(req);
  if (!userId) { res.status(401).json({ message: 'Authentication required.' }); return null; }
  const role = (req as Request & { user?: { role?: string } }).user?.role;
  if (role !== 'admin' && role !== 'moderator') {
    res.status(403).json({ message: 'Admin only.' });
    return null;
  }
  return { userId };
}

/**
 * GET /api/admin/settings
 * Returns the full settings object for the admin UI to render.
 */
export async function adminGetSettings(_req: Request, res: Response): Promise<void> {
  try {
    let doc = await AppSetting.findById('singleton').lean();
    if (!doc) {
      // First-time seed — let the schema defaults populate the doc.
      await AppSetting.create({ _id: 'singleton' });
      doc = await AppSetting.findById('singleton').lean();
    }
    res.json({ settings: doc?.settings ?? {} });
  } catch (err) {
    logger.error(`[appSettings] adminGetSettings failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to load settings.' });
  }
}

/**
 * PUT /api/admin/settings
 * Body: { key: SettingKey, value: number | string | boolean }
 * Validates the value against the schema-level min/max for known
 * keys. Unknown keys are accepted but stored as-is (so the model
 * stays forward-compatible with new settings).
 */
export async function adminUpdateSetting(req: Request, res: Response): Promise<void> {
  const auth = adminOnly(req, res);
  if (!auth) return;
  const body = (req.body ?? {}) as { key?: string; value?: unknown };
  const key = String(body.key ?? '').trim() as SettingKey;
  if (!key) {
    res.status(400).json({ message: 'key is required.' });
    return;
  }
  // Schema-level validation lives on the model, but we mirror it here
  // for friendlier 400s on common cases.
  if (key === 'goldenCooldownHours') {
    const n = Number(body.value);
    if (!Number.isFinite(n) || n < 0 || n > 720 || !Number.isInteger(n)) {
      res.status(400).json({ message: 'goldenCooldownHours must be an integer between 0 and 720.' });
      return;
    }
  } else if (key === 'goldenPenaltyMultiplier') {
    const n = Number(body.value);
    if (!Number.isFinite(n) || n < 0 || n > 5) {
      res.status(400).json({ message: 'goldenPenaltyMultiplier must be a number between 0 and 5.' });
      return;
    }
  } else {
    res.status(400).json({ message: `Unknown setting key: ${key}` });
    return;
  }

  try {
    const update: Record<string, unknown> = { updatedBy: auth.userId };
    update[`settings.${key}`] = body.value;
    const doc = await AppSetting.findByIdAndUpdate(
      'singleton',
      { $set: update },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).lean();
    res.json({ settings: doc?.settings ?? {} });
  } catch (err) {
    logger.error(`[appSettings] adminUpdateSetting failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to update setting.' });
  }
}
/**
 * GET /api/public/settings
 * Returns only the public-safe subset. Used by the Golden Ticket
 * page to compute the cooldown countdown copy without exposing the
 * penalty multiplier (which the server applies, the UI never needs
 * to show).
 */
export async function publicGetSettings(_req: Request, res: Response): Promise<void> {
  try {
    const out: Record<string, unknown> = {};
    for (const k of PUBLIC_KEYS) {
      // readSetting handles missing doc / missing field gracefully.
      if (k === 'goldenCooldownHours') {
        out[k] = await readSetting('goldenCooldownHours', 48);
      }
    }
    res.json({ settings: out });
  } catch (err) {
    logger.error(`[appSettings] publicGetSettings failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to load settings.' });
  }
}
