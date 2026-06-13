import mongoose, { Document, Schema as MongooseSchema } from 'mongoose';

export interface IOnboardingAuditLog extends Document {
  changedBy: mongoose.Types.ObjectId;
  entityType: 'timeline_step' | 'project' | 'mentor' | 'orientation' | 'checklist' | 'resource';
  entityId: mongoose.Types.ObjectId;
  action: 'create' | 'update' | 'delete' | 'reorder' | 'archive' | 'activate';
  previousValue?: any;
  newValue?: any;
  timestamp: Date;
}

const onboardingAuditLogSchema = new MongooseSchema<IOnboardingAuditLog>(
  {
    changedBy: { type: MongooseSchema.Types.ObjectId, ref: 'User', required: true },
    entityType: {
      type: String,
      enum: ['timeline_step', 'project', 'mentor', 'orientation', 'checklist', 'resource'],
      required: true,
    },
    entityId: { type: MongooseSchema.Types.ObjectId, required: true },
    action: {
      type: String,
      enum: ['create', 'update', 'delete', 'reorder', 'archive', 'activate'],
      required: true,
    },
    previousValue: { type: MongooseSchema.Types.Mixed },
    newValue: { type: MongooseSchema.Types.Mixed },
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

onboardingAuditLogSchema.index({ entityType: 1, timestamp: -1 });
onboardingAuditLogSchema.index({ changedBy: 1, timestamp: -1 });

export default mongoose.model<IOnboardingAuditLog>(
  'OnboardingAuditLog',
  onboardingAuditLogSchema,
  'yaksha_faq_onboarding_audit_logs'
);
