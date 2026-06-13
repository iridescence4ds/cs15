/**
 * AppSetting — global app-level configuration values, admin-editable.
 *
 * v1.65 — Golden Ticket feature introduced the first such setting
 * (goldenCooldownHours). The model is intentionally generic so future
 * cross-cutting settings can register their own keys without needing
 * a new schema each time.
 *
 * Storage shape: a single document with id 'singleton'. The
 * `settings` field is a free-form map of { key: value } where value
 * is one of the types below. Validators on each key ensure admins
 * can't poison a number field with a string.
 *
 * Endpoints (see routes/appSettings.ts):
 *   GET /api/admin/settings  (admin only)
 *   PUT /api/admin/settings  (admin only, body: { key, value })
 *   GET /api/public/settings  (any authed user; returns only the
 *                             public-safe subset — used by the
 *                             frontend to display countdown copy)
 */

import mongoose, { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type SettingKey = 'goldenCooldownHours';

export interface IAppSetting extends Document<string> {
  /** Always 'singleton' — there is only one settings document. */
  _id: 'singleton';
  /** Map of admin-configurable settings. Validated per-key below. */
  settings: {
    /** v1.65.1 — Hours a user must wait after a Golden Ticket is
     *  closed (either by admin resolution or admin rejection)
     *  before they can submit another. Default 48. Range 0-720.
     *  This is the ONLY post-resolution consequence — the spec is
     *  "cooldown only, never ban, never deduct beyond the SP
     *  spend". 0 disables the gate entirely. */
    goldenCooldownHours?: number;
  };
  /** Last admin to edit. */
  updatedBy: Types.ObjectId | null;
  updatedAt: Date;
  createdAt: Date;
}

const appSettingSchema = new MongooseSchema<IAppSetting>(
  {
    _id: { type: String, default: 'singleton' },
    settings: {
      goldenCooldownHours: {
        type: Number,
        default: 48,
        min: 0,
        max: 720,
      },
    },
    updatedBy: { type: MongooseSchema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, _id: false }
);

/**
 * Read a single setting. Returns `defaultValue` if the document
 * doesn't exist yet (first boot, no admin has saved a value) or if
 * the key is unset on the document.
 *
 * Always seeds the singleton on read so the admin UI sees a value
 * even before anyone has explicitly saved.
 */
export async function readSetting<K extends SettingKey>(
  key: K,
  defaultValue: NonNullable<IAppSetting['settings'][K]>,
): Promise<NonNullable<IAppSetting['settings'][K]>> {
  const doc = await AppSetting.findById('singleton').lean();
  if (!doc) return defaultValue;
  const v = doc.settings?.[key];
  return (v ?? defaultValue) as NonNullable<IAppSetting['settings'][K]>;
}

const AppSetting = mongoose.model<IAppSetting>('AppSetting', appSettingSchema);
export default AppSetting;
