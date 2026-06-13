import mongoose, { Document, Schema as MongooseSchema, Types } from 'mongoose';

/**
 * Batch — a program run (e.g. "Summer Internship 2026").
 *
 * Every FAQ, Category, and GuestEvent in the platform is scoped to
 * exactly one Batch. Admins create / edit / archive batches in the
 * admin panel; the public portal lists active batches for the
 * "pick a program" picker.
 *
 * Analytics are computed per batch by the existing popularityScore job.
 */

export interface IBatch extends Document {
  name: string;
  description: string;
  startDate: Date;
  endDate: Date;
  /** Admins can disable a batch without deleting it (hides from public). */
  isActive: boolean;
  createdBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const batchSchema = new MongooseSchema<IBatch>(
  {
    name: {
      type: String,
      required: [true, 'Batch name is required'],
      trim: true,
      maxlength: 120,
    },
    description: {
      type: String,
      default: '',
      maxlength: 1000,
    },
    startDate: { type: Date, required: [true, 'Start date is required'] },
    endDate:   { type: Date, required: [true, 'End date is required'] },
    isActive:  { type: Boolean, default: true, index: true },
    createdBy: { type: MongooseSchema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// Name uniqueness — case-insensitive to prevent "Summer 2026" vs "summer 2026"
batchSchema.index(
  { name: 1 },
  { unique: true, collation: { locale: 'en', strength: 2 } },
);

// Most-used query: list active batches sorted by start date desc (newest first)
batchSchema.index({ isActive: 1, startDate: -1 });

export default mongoose.model<IBatch>('Batch', batchSchema, 'yaksha_faq_batches');
