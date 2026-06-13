import mongoose, { Document, Schema as MongooseSchema, Types } from 'mongoose';

/**
 * AttendanceGuidance — admin-editable troubleshooting checklist per
 * issue type. One row per (issueType); the controller self-seeds from
 * the in-code defaults in SupportRequest.ts on first read.
 */

export interface IAttendanceGuidance extends Document {
  issueType: string;
  steps: string[];
  updatedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const attendanceGuidanceSchema = new MongooseSchema<IAttendanceGuidance>(
  {
    issueType: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 60,
    },
    steps:     { type: [String], default: [] },
    updatedBy: { type: MongooseSchema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

export default mongoose.model<IAttendanceGuidance>(
  'AttendanceGuidance',
  attendanceGuidanceSchema,
  'yaksha_faq_attendance_guidance',
);
