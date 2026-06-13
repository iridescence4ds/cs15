import mongoose, { Document, Schema as MongooseSchema, Types } from 'mongoose';

// Admin action enum
export type AdminAction =
  | 'approve_faq'
  | 'reject_faq'
  | 'edit_faq'
  | 'delete_faq'
  | 'create_faq'
  | 'login'
  | 'settings_update'
  | 'onboarding_override';

// Target type enum
export type TargetType = 'faq' | 'user' | 'system' | null;

// Interface for the AdminLog document
export interface IAdminLog extends Document {
  adminId: Types.ObjectId;
  action: AdminAction;
  targetId: Types.ObjectId | null;
  targetType: TargetType;
  details: string;
  changes?: any;
}

const adminLogSchema = new MongooseSchema(
  {
    adminId: {
      type: MongooseSchema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    action: {
      type: String,
      required: true,
      enum: ['approve_faq', 'reject_faq', 'edit_faq', 'delete_faq', 'create_faq', 'login', 'settings_update', 'onboarding_override'] as AdminAction[],
    },
    targetId: {
      type: MongooseSchema.Types.ObjectId,
      default: null,
    },
    targetType: {
      type: String,
      enum: ['faq', 'user', 'system', null] as TargetType[],
      default: null,
    },
    details: {
      type: String,
      default: '',
    },
    changes: {
      type: MongooseSchema.Types.Mixed,
      default: null,
    },
  },
  { timestamps: true }
);

export default mongoose.model<IAdminLog>('AdminLog', adminLogSchema, 'yaksha_faq_adminlogs');