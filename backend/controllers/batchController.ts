import { Request, Response } from 'express';
import { Types } from 'mongoose';
import Batch from '../models/Batch.js';
import FAQ from '../models/FAQ.js';
import { logger } from '../utils/http/logger.js';
import { z } from 'zod';
import { invalidatePublicCaches } from './publicFaqController.js';

// ─── Validation ──────────────────────────────────────────────────────────────

const createBatchSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(1000).optional().default(''),
  startDate: z.string().datetime().or(z.date()),
  endDate:   z.string().datetime().or(z.date()),
  isActive:  z.boolean().optional().default(true),
});

const updateBatchSchema = createBatchSchema.partial();

// ─── Public list (active only) ──────────────────────────────────────────────

export async function listPublicBatches(_req: Request, res: Response): Promise<void> {
  try {
    const batches = await Batch.aggregate<{
      _id: Types.ObjectId;
      name: string;
      description: string;
      startDate: Date;
      endDate: Date;
      isActive: boolean;
      faqCount: number;
    }>([
      { $match: { isActive: true } },
      { $sort: { startDate: -1 } },
      {
        $lookup: {
          from: 'yaksha_faq_faqs',
          localField: '_id',
          foreignField: 'batchId',
          as: '_faqs',
        },
      },
      { $addFields: { faqCount: { $size: { $filter: { input: '$_faqs', as: 'f', cond: { $eq: ['$$f.status', 'approved'] } } } } } },
      { $project: { _faqs: 0 } },
    ]);

    res.json({
      batches: batches.map((b) => ({
        _id: b._id,
        name: b.name,
        description: b.description,
        startDate: b.startDate,
        endDate: b.endDate,
        isActive: b.isActive,
        faqCount: b.faqCount,
      })),
    });
  } catch (err) {
    logger.error(`[batch] listPublicBatches failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to load batches.' });
  }
}

// ─── Admin list (all) ───────────────────────────────────────────────────────

export async function listAdminBatches(_req: Request, res: Response): Promise<void> {
  try {
    const batches = await Batch.aggregate<{
      _id: Types.ObjectId;
      name: string;
      description: string;
      startDate: Date;
      endDate: Date;
      isActive: boolean;
      faqCount: number;
      createdAt: Date;
      updatedAt: Date;
    }>([
      { $sort: { startDate: -1 } },
      {
        $lookup: {
          from: 'yaksha_faq_faqs',
          localField: '_id',
          foreignField: 'batchId',
          as: '_faqs',
        },
      },
      {
        $addFields: {
          faqCount: { $size: '$_faqs' },
          approvedCount: { $size: { $filter: { input: '$_faqs', as: 'f', cond: { $eq: ['$$f.status', 'approved'] } } } },
        },
      },
      { $project: { _faqs: 0 } },
    ]);
    res.json({ batches });
  } catch (err) {
    logger.error(`[batch] listAdminBatches failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to load batches.' });
  }
}

// ─── Single batch ───────────────────────────────────────────────────────────

export async function getBatch(req: Request, res: Response): Promise<void> {
  const rawId = req.params.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id || !Types.ObjectId.isValid(id)) {
    res.status(400).json({ message: 'Invalid batch id.' });
    return;
  }
  try {
    const batch = await Batch.findById(id).lean();
    if (!batch) {
      res.status(404).json({ message: 'Batch not found.' });
      return;
    }
    const faqCount = await FAQ.countDocuments({ batchId: id, status: 'approved' });
    res.json({ ...batch, faqCount });
  } catch (err) {
    logger.error(`[batch] getBatch failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to load batch.' });
  }
}

// ─── Create ─────────────────────────────────────────────────────────────────

export async function createBatch(req: Request, res: Response): Promise<void> {
  const parsed = createBatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid input.', issues: parsed.error.issues });
    return;
  }
  const { name, description, startDate, endDate, isActive } = parsed.data;
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    res.status(400).json({ message: 'Invalid date.' });
    return;
  }
  if (end <= start) {
    res.status(400).json({ message: 'End date must be after start date.' });
    return;
  }
  try {
    const created = await Batch.create({ name: name.trim(), description, startDate: start, endDate: end, isActive });
    invalidatePublicCaches();
    res.status(201).json(created);
  } catch (err) {
    const e = err as Error & { code?: number };
    if (e.code === 11000) {
      res.status(409).json({ message: 'A batch with this name already exists.' });
      return;
    }
    logger.error(`[batch] createBatch failed: ${e.message}`);
    res.status(500).json({ message: 'Failed to create batch.' });
  }
}

// ─── Update ─────────────────────────────────────────────────────────────────

export async function updateBatch(req: Request, res: Response): Promise<void> {
  const rawId = req.params.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id || !Types.ObjectId.isValid(id)) {
    res.status(400).json({ message: 'Invalid batch id.' });
    return;
  }
  const parsed = updateBatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid input.', issues: parsed.error.issues });
    return;
  }
  try {
    const update: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) update.name = parsed.data.name.trim();
    if (parsed.data.description !== undefined) update.description = parsed.data.description;
    if (parsed.data.startDate !== undefined) update.startDate = new Date(parsed.data.startDate);
    if (parsed.data.endDate !== undefined) update.endDate = new Date(parsed.data.endDate);
    if (parsed.data.isActive !== undefined) update.isActive = parsed.data.isActive;

    if (update.startDate && update.endDate && new Date(update.endDate as string) <= new Date(update.startDate as string)) {
      res.status(400).json({ message: 'End date must be after start date.' });
      return;
    }

    const updated = await Batch.findByIdAndUpdate(id, { $set: update }, { new: true });
    if (!updated) {
      res.status(404).json({ message: 'Batch not found.' });
      return;
    }
    invalidatePublicCaches();
    res.json(updated);
  } catch (err) {
    const e = err as Error & { code?: number };
    if (e.code === 11000) {
      res.status(409).json({ message: 'A batch with this name already exists.' });
      return;
    }
    logger.error(`[batch] updateBatch failed: ${e.message}`);
    res.status(500).json({ message: 'Failed to update batch.' });
  }
}

// ─── Archive (soft delete) ──────────────────────────────────────────────────

export async function archiveBatch(req: Request, res: Response): Promise<void> {
  const rawId = req.params.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id || !Types.ObjectId.isValid(id)) {
    res.status(400).json({ message: 'Invalid batch id.' });
    return;
  }
  try {
    const updated = await Batch.findByIdAndUpdate(id, { $set: { isActive: false } }, { new: true });
    if (!updated) {
      res.status(404).json({ message: 'Batch not found.' });
      return;
    }
    invalidatePublicCaches();
    res.json(updated);
  } catch (err) {
    logger.error(`[batch] archiveBatch failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to archive batch.' });
  }
}

// ─── Hard delete (admin only — cascades FAQs) ───────────────────────────────

export async function deleteBatch(req: Request, res: Response): Promise<void> {
  const rawId = req.params.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id || !Types.ObjectId.isValid(id)) {
    res.status(400).json({ message: 'Invalid batch id.' });
    return;
  }
  try {
    const faqCount = await FAQ.countDocuments({ batchId: id });
    await FAQ.deleteMany({ batchId: id });
    await Batch.findByIdAndDelete(id);
    invalidatePublicCaches();
    res.json({ deleted: true, cascadedFaqs: faqCount });
  } catch (err) {
    logger.error(`[batch] deleteBatch failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to delete batch.' });
  }
}
