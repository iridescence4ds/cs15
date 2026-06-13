import mongoose, { Document, Schema as MongooseSchema } from 'mongoose';

export interface IOrientation extends Document {
  title: string;
  description: string;
  videoUrl: string;
  transcript: string;
  completionThreshold: number; // 0-100, percentage of video that must be watched
  createdAt: Date;
  updatedAt: Date;
}

const orientationSchema = new MongooseSchema<IOrientation>(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    videoUrl: { type: String, required: true },
    transcript: { type: String, default: '' },
    completionThreshold: { type: Number, default: 90, min: 0, max: 100 },
  },
  { timestamps: true }
);

export default mongoose.model<IOrientation>('Orientation', orientationSchema, 'yaksha_faq_orientations');
