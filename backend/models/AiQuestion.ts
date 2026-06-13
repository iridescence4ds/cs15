import mongoose, { Document, Schema as MongooseSchema } from 'mongoose';

export interface IAiQuestion extends Document {
  userId: mongoose.Types.ObjectId;
  orientationId: mongoose.Types.ObjectId;
  question: string;
  answer: string;
  createdAt: Date;
  updatedAt: Date;
}

const aiQuestionSchema = new MongooseSchema<IAiQuestion>(
  {
    userId: { type: MongooseSchema.Types.ObjectId, ref: 'User', required: true },
    orientationId: { type: MongooseSchema.Types.ObjectId, ref: 'Orientation', required: true },
    question: { type: String, required: true },
    answer: { type: String, required: true },
  },
  { timestamps: true }
);

aiQuestionSchema.index({ orientationId: 1 });
aiQuestionSchema.index({ userId: 1 });

export default mongoose.model<IAiQuestion>('AiQuestion', aiQuestionSchema, 'yaksha_faq_ai_questions');
