/**
 * postModerationController.ts — Moderation actions on community posts.
 *
 * Routes (from routes/community.ts):
 *   POST  /api/community/:id/object-to-promotion   — objectToPromotion (admin/mod)
 *   POST  /api/community/:id/confirm-spam          — confirmSpam (admin/mod)
 *   POST  /api/community/:id/hide                  — hidePost (admin/mod)
 *   POST  /api/community/:id/unhide                — unhidePost (admin/mod)
 *   POST  /api/community/:id/lock                  — lockPost (admin/mod)
 *   POST  /api/community/:id/unlock                — unlockPost (admin/mod)
 */

import { Request, Response } from 'express';
import { Types } from 'mongoose';
import CommunityPost from '../models/CommunityPost.js';
import User, { calculateTier } from '../models/User.js';
import ReputationLog from '../models/ReputationLog.js';
import { logger } from '../utils/http/logger.js';

// POST /api/community/:id/object-to-promotion — Moderator blocks promotion of a post
export const objectToPromotion = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ message: 'Not authorized' }); return; }
  try {
    const { reason } = req.body as { reason?: string };
    if (!reason?.trim()) { res.status(400).json({ message: 'Reason is required' }); return; }

    const post = await CommunityPost.findById(req.params.id);
    if (!post) { res.status(404).json({ message: 'Post not found.' }); return; }

    post.promotionObjectedBy = req.user._id;
    post.promotionObjectedAt = new Date();
    post.promotionObjectionReason = reason.trim();
    post.eligibleForPromotion = false;
    post.promotionPendingAt = null;
    await post.save();

    res.json({ message: 'Promotion objected. Post removed from promotion queue.' });
  } catch (error) {
    logger.error(`[post] objectToPromotion failed: ${(error as Error).message}`);
    res.status(500).json({ message: 'Server error' });
  }
};

// POST /api/community/:id/confirm-spam — Admin: confirm spam report → -20 pts to author
// Per spec: "Spam Report Confirmed: -20 points"
export const confirmSpam = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ message: 'Not authorized' }); return; }
  try {
    const post = await CommunityPost.findById(req.params.id);
    if (!post) { res.status(404).json({ message: 'Post not found.' }); return; }

    const offenderId = post.author?.toString();
    if (offenderId) {
      const offender = await User.findById(offenderId);
      if (offender) {
        offender.points = Math.max(0, offender.points - 20);
        offender.reputation = offender.points;
        offender.tier = calculateTier(offender.points);
        await offender.save();

        await ReputationLog.create({
          userId: new Types.ObjectId(offenderId),
          delta: -20,
          reason: `Spam report confirmed on post "${post.title.slice(0, 40)}"`,
          action: 'spam_confirmed',
          targetId: post._id as Types.ObjectId,
          targetType: 'community_post',
          awardedBy: req.user._id,
        });
      }
    }

    // Soft-clear: mark as resolved; keep the post for audit trail
    post.escalationStatus = 'resolved';
    post.escalationResolvedAt = new Date();
    post.escalationResolvedBy = req.user._id;
    post.escalationOutcome = 'spam_confirmed';
    post.lifecycle ??= { status: 'open', statusHistory: [] };
    post.lifecycle.statusHistory.push({
      from: post.lifecycle.status,
      to: post.lifecycle.status,
      changedBy: req.user._id,
      changedAt: new Date(),
      note: 'Spam confirmed — author penalized -20 pts',
    });
    await post.save();

    res.json({ message: 'Spam confirmed. -20 points deducted from author.' });
  } catch (error) {
    logger.error(`[post] confirmSpam failed: ${(error as Error).message}`);
    res.status(500).json({ message: 'Server error' });
  }
};

// POST /api/community/:id/hide — Admin/Mod: hide a post from public lists
// (Per spec moderation actions: Hide / Lock / Merge / Delete)
export const hidePost = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ message: 'Not authorized' }); return; }
  try {
    const { reason } = req.body as { reason?: string };
    const post = await CommunityPost.findById(req.params.id);
    if (!post) { res.status(404).json({ message: 'Post not found.' }); return; }
    post.isHidden = true;
    post.hiddenAt = new Date();
    post.hiddenBy = req.user._id;
    post.hiddenReason = reason?.trim() || null;
    post.lifecycle ??= { status: 'open', statusHistory: [] };
    post.lifecycle.statusHistory.push({
      from: post.lifecycle.status, to: post.lifecycle.status,
      changedBy: req.user._id, changedAt: new Date(),
      note: `Hidden by admin${reason ? `: ${reason}` : ''}`,
    });
    await post.save();
    res.json({ message: 'Post hidden.' });
  } catch (error) {
    logger.error(`[post] hidePost failed: ${(error as Error).message}`);
    res.status(500).json({ message: 'Server error' });
  }
};

// POST /api/community/:id/unhide — Admin/Mod: reverse a hide
export const unhidePost = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ message: 'Not authorized' }); return; }
  try {
    const post = await CommunityPost.findById(req.params.id);
    if (!post) { res.status(404).json({ message: 'Post not found.' }); return; }
    post.isHidden = false;
    post.hiddenAt = null;
    post.hiddenBy = null;
    post.hiddenReason = null;
    await post.save();
    res.json({ message: 'Post unhidden.' });
  } catch (error) {
    logger.error(`[post] unhidePost failed: ${(error as Error).message}`);
    res.status(500).json({ message: 'Server error' });
  }
};

// POST /api/community/:id/lock — Admin/Mod: lock a thread (no new comments)
export const lockPost = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ message: 'Not authorized' }); return; }
  try {
    const { reason } = req.body as { reason?: string };
    const post = await CommunityPost.findById(req.params.id);
    if (!post) { res.status(404).json({ message: 'Post not found.' }); return; }
    post.isLocked = true;
    post.lockedAt = new Date();
    post.lockedBy = req.user._id;
    post.lockedReason = reason?.trim() || null;
    post.lifecycle ??= { status: 'open', statusHistory: [] };
    post.lifecycle.statusHistory.push({
      from: post.lifecycle.status, to: post.lifecycle.status,
      changedBy: req.user._id, changedAt: new Date(),
      note: `Locked by admin${reason ? `: ${reason}` : ''}`,
    });
    await post.save();
    res.json({ message: 'Post locked.' });
  } catch (error) {
    logger.error(`[post] lockPost failed: ${(error as Error).message}`);
    res.status(500).json({ message: 'Server error' });
  }
};

// POST /api/community/:id/unlock — Admin/Mod: reverse a lock
export const unlockPost = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ message: 'Not authorized' }); return; }
  try {
    const post = await CommunityPost.findById(req.params.id);
    if (!post) { res.status(404).json({ message: 'Post not found.' }); return; }
    post.isLocked = false;
    post.lockedAt = null;
    post.lockedBy = null;
    post.lockedReason = null;
    await post.save();
    res.json({ message: 'Post unlocked.' });
  } catch (error) {
    logger.error(`[post] unlockPost failed: ${(error as Error).message}`);
    res.status(500).json({ message: 'Server error' });
  }
};
