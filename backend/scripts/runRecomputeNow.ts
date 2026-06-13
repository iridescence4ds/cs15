import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import { recomputePopularity, invalidatePublicCaches } from '../controllers/publicFaqController.js';

await connectDB();
invalidatePublicCaches();
const r = await recomputePopularity();
console.log('recompute result:', r);
await mongoose.disconnect();
