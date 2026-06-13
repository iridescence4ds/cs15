import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { protect, authorize } from '../middleware/auth.js';
import {
  listPublicBatches,
  listAdminBatches,
  getBatch,
  createBatch,
  updateBatch,
  archiveBatch,
  deleteBatch,
} from '../controllers/batchController.js';

const router = Router();

// Soft cap on the public list — same shape as the other public reads
const listLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests.' },
});

// ─── Public ────────────────────────────────────────────────────────────────

router.get('/', listLimiter, listPublicBatches);

// ─── Admin (guarded) ───────────────────────────────────────────────────────

router.get('/admin/all', protect, authorize('admin', 'moderator'), listAdminBatches);
router.get('/:id', listLimiter, getBatch);
router.post('/', protect, authorize('admin', 'moderator'), createBatch);
router.patch('/:id', protect, authorize('admin', 'moderator'), updateBatch);
router.post('/:id/archive', protect, authorize('admin', 'moderator'), archiveBatch);
router.delete('/:id', protect, authorize('admin', 'moderator'), deleteBatch);

export default router;
