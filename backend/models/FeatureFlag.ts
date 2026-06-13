import mongoose, { Document, Schema as MongooseSchema, Types } from 'mongoose';

/**
 * FeatureFlag — admin-toggleable experimental / optional features.
 *
 * A single document per feature key, identified by a stable string
 * `key` (e.g. 'sessionSupport'). Documents are upserted lazily by the
 * backend on first use; admins toggle via the dedicated admin endpoint
 * and the admin UI surfaces the current state.
 *
 * This model is intentionally generic — it is NOT specific to the
 * Session Support feature. Future experimental features can register
 * their own keys and reuse the same toggle infrastructure.
 *
 * Per-flag access is server-enforced. The /api/feature-flags GET
 * endpoint returns the live state to authenticated users (so the
 * frontend can hide / show the feature); the PUT endpoint is admin
 * only.
 */

export type FeatureFlagKey = 'sessionSupport';

export interface IFeatureFlag extends Document {
  /** Stable, machine-readable identifier. */
  key: FeatureFlagKey | string;
  /** Whether the feature is currently enabled for end users. */
  enabled: boolean;
  /** Short label for admin UI. */
  label: string;
  /** Longer description for the admin "what does this do" tooltip. */
  description: string;
  /** Last admin to flip the switch. */
  updatedBy: Types.ObjectId | null;
  /** Last flip timestamp. */
  updatedAt: Date;
  /** When the feature was first enabled (if ever). */
  firstEnabledAt: Date | null;
  /** When the feature was most recently disabled (if ever). */
  lastDisabledAt: Date | null;
  /** When this document was created (for audit). */
  createdAt: Date;
}

const featureFlagSchema = new MongooseSchema<IFeatureFlag>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 60,
    },
    enabled: { type: Boolean, default: false, index: true },
    label: { type: String, required: true, maxlength: 100 },
    description: { type: String, default: '', maxlength: 500 },
    updatedBy: { type: MongooseSchema.Types.ObjectId, ref: 'User', default: null },
    firstEnabledAt: { type: Date, default: null },
    lastDisabledAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Hottest read path: list all flags for the navbar / sidebar to decide
// what to show. Kept as a single `key` index so `findOne({ key: 'X' })`
// is O(1) and `find({ enabled: true })` is fast for the rare
// "show me everything that's on" admin query.
featureFlagSchema.index({ key: 1 }, { unique: true });

export default mongoose.model<IFeatureFlag>('FeatureFlag', featureFlagSchema, 'yaksha_faq_feature_flags');
