/**
 * postLifecycleController.ts — Lifecycle transitions, expert escalation,
 * conversion to FAQ, and editable metadata (DNA, tags).
 *
 * Routes (from routes/community.ts):
 *   POST   /api/community/:id/resolve              — resolvePost (admin/mod)
 *   POST   /api/community/:id/request-expert       — requestExpertHelp
 *   POST   /api/community/:id/convert-to-faq      — convertCommunityPostToFAQ (admin)
 *   PATCH  /api/community/:id/dna                  — setPostDNA
 *   PATCH  /api/community/:id/tags                 — setPostTags
 */

import { Request, Response } from 'express';
import { Types } from 'mongoose';
import CommunityPost from '../models/CommunityPost.js';
import FAQ from '../models/FAQ.js';
import User from '../models/User.js';
import { generateEmbedding } from '../utils/ai/embeddings.js';
import { invalidateCache } from '../utils/http/cache.js';
import { dispatchNotification } from '../utils/http/notificationDispatcher.js';
import { createTeaDrop } from './teaNotificationController.js';
import { sanitizeHtml } from '../utils/http/sanitize.js';
import { logger } from '../utils/http/logger.js';

// POST /api/community/:id/resolve — Mark a community post as resolved (admin/mod only)
// When resolved, the post author is notified via the notification system
export const resolvePost = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ message: 'Not authorized' }); return; }
  try {
    const { answer } = req.body as { answer?: string };

    if (!answer || !answer.trim()) {
      res.status(400).json({ message: 'Answer text is required to resolve.' });
      return;
    }

    const post = await CommunityPost.findById(req.params.id);
    if (!post) {
      res.status(404).json({ message: 'Post not found.' });
      return;
    }

    post.status = 'answered';
    post.answer = sanitizeHtml(answer.trim());
    // Lifecycle: transition to 'answered' stage
    if (post.lifecycle?.status === 'open') {
      (post.lifecycle.statusHistory ??= []).push({
        from: 'open',
        to: 'answered',
        changedBy: req.user!._id,
        changedAt: new Date(),
        note: 'Post resolved / answer accepted',
      });
      post.lifecycle.status = 'answered';
    }
    // Clear any pending escalation — answering resolves the issue
    post.escalationStatus = 'none';
    post.escalatedAt = null;
    post.escalationReason = null;
    post.escalatedBy = null;
    // Set answerIsExpert flag when a moderator or admin resolves the post
    if (req.user?.role === 'moderator' || req.user?.role === 'admin' || req.user?.role === 'expert') {
      post.answerIsExpert = true;
    }
    await post.save();

    // Invalidate search cache so resolved answer reflects immediately
    await invalidateCache().catch((err) => {
      logger.warn(`[post] Failed to invalidate cache on post resolve: ${(err as Error).message}`);
    });

    // ── Check if post is now eligible for FAQ promotion ───────────────────────
    const { checkPromotionEligibility, startPromotionReview } = await import('../services/promotionService.js');
    try {
      const eligible = await checkPromotionEligibility(post);
      if (eligible) {
        await startPromotionReview(post, req.user!._id.toString());
        logger.info(`Resolved post ${post._id} entered promotion review`, { postId: post._id.toString() });
      }
    } catch (e) {
      logger.warn(`Promotion eligibility check failed for post ${post._id}: ${(e as Error).message}`);
    }

    // ── Notify post author ────────────────────────────────────────────────────
    dispatchNotification({
      recipientId: post.author,
      eventType: 'post_resolved',
      link: `/community?post=${post._id}`,
      title: 'Your question was resolved!',
    }).catch((err) => {
      logger.warn(`[post] Failed to dispatch post resolved notification: ${(err as Error).message}`);
    });

    // ── Tea drop: "your post was answered" ───────────────────────────────────
    // Only notify if the resolver is not the author themselves
    if (post.author.toString() !== req.user!._id.toString()) {
      createTeaDrop({
        userId: post.author,
        eventType: 'post_answered',
        postId: post._id as Types.ObjectId,
        postTitle: post.title,
        triggeredBy: req.user!._id,
        triggeredByName: req.user!.name,
        content: answer.trim().slice(0, 200),
      }).catch((err) => {
        logger.warn(`[post] Failed to create tea drop for post answer: ${(err as Error).message}`);
      });
    }

    res.json({ message: 'Post resolved.', post });
  } catch (error) {
    logger.error(`[post] resolvePost failed: ${(error as Error).message}`);
    res.status(500).json({ message: 'Server error' });
  }
};

// POST /api/community/:id/request-expert — Request expert help on an unanswered post (protected)
// Notifies all moderators and admins
export const requestExpertHelp = async (req: Request, res: Response): Promise<void> => {
  try {
    const post = await CommunityPost.findById(req.params.id);
    if (!post) {
      res.status(404).json({ message: 'Post not found.' });
      return;
    }

    if (post.status === 'answered') {
      res.status(400).json({ message: 'This post is already answered.' });
      return;
    }

    // Find all moderators and admins
    const moderatorsAndAdmins = await User.find({
      role: { $in: ['moderator', 'admin', 'expert'] },
    }).select('_id');

    // Create notifications for each moderator/admin
    const notificationPromises = moderatorsAndAdmins.map((mod) =>
      import('./notificationController.js').then((n) =>
        n.createNotification({
          recipient: mod._id,
          type: 'expert_request',
          title: 'Expert help requested!',
          message: `A student is waiting for help: "${post.title}"`,
          link: `/community?post=${post._id}`,
        })
      ).catch((err) => {
        logger.warn(`[post] Failed to notify mod/admin ${mod._id} on expert request: ${(err as Error).message}`);
      })
    );

    await Promise.all(notificationPromises);

    res.json({ message: 'Expert help requested. Moderators have been notified.' });
  } catch (error) {
    logger.error(`[post] requestExpertHelp failed: ${(error as Error).message}`);
    res.status(500).json({ message: 'Server error' });
  }
};

// POST /api/community/:id/convert-to-faq — Admin-only: create FAQ from resolved community post
export const convertCommunityPostToFAQ = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ message: 'Not authorized' }); return; }
  try {
    const post = await CommunityPost.findById(req.params.id);
    if (!post) {
      res.status(404).json({ message: 'Post not found.' });
      return;
    }

    if (!post.answer || !post.answer.trim()) {
      res.status(400).json({ message: 'Post has no answer yet. Resolve it before converting to FAQ.' });
      return;
    }

    // Generate embedding for the new FAQ
    let embedding: number[] | undefined;
    try {
      embedding = await generateEmbedding(`Question: ${post.title}. Answer: ${post.answer}`);
    } catch (err) {
      logger.warn(`Failed to generate embedding for FAQ: ${(err as Error).message}`);
    }

    // Create the FAQ from the post's title (question) and answer
    const faq = await FAQ.create({
      question: post.title,
      answer: post.answer,
      category: 'Community',
      status: 'approved',
      embedding,
      createdBy: post.author,
    });

    // Mark the post as resolved
    post.status = 'answered';
    post.escalationStatus = 'none';
    post.escalatedAt = null;
    post.escalationReason = null;
    post.escalatedBy = null;
    post.answerIsExpert = true;
    await post.save();

    // Invalidate search cache so the new FAQ appears immediately
    await invalidateCache().catch((err) => {
      logger.warn(`[post] Failed to invalidate cache on FAQ conversion: ${(err as Error).message}`);
    });

    res.status(201).json({ message: 'FAQ created from community post.', faq });
  } catch (error) {
    logger.error(`[post] convertCommunityPostToFAQ failed: ${(error as Error).message}`);
    res.status(500).json({ message: 'Server error' });
  }
};

// ─── DNA ────────────────────────────────────────────────────────────────────────
export const setPostDNA = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ message: 'Not authorized' }); return; }
  try {
    const post = await CommunityPost.findById(req.params.id);
    if (!post) { res.status(404).json({ message: 'Post not found.' }); return; }

    // IDOR guard: only post author or admin/moderator can edit DNA
    const isAuthor = post.author.toString() === req.user._id.toString();
    const isPrivileged = ['admin', 'moderator'].includes(req.user.role);
    if (!isAuthor && !isPrivileged) {
      res.status(403).json({ message: 'Forbidden: only the post author or admin can edit DNA.' });
      return;
    }

    const { steps, tools, timeToComplete, difficulty } = req.body as {
      steps?: string[];
      tools?: string[];
      timeToComplete?: string;
      difficulty?: 'Easy' | 'Moderate' | 'Tricky';
    };

    post.dna = {
      steps: steps ?? post.dna?.steps ?? [],
      tools: tools ?? post.dna?.tools ?? [],
      timeToComplete: timeToComplete ?? post.dna?.timeToComplete ?? null,
      difficulty: difficulty ?? post.dna?.difficulty ?? null,
    };
    await post.save();

    res.json({ message: 'DNA updated.', dna: post.dna });
  } catch (error) {
    logger.error(`[post] setPostDNA failed: ${(error as Error).message}`);
    res.status(500).json({ message: 'Server error' });
  }
};

// PATCH /api/community/:id/tags — Update tags on a community post (author or admin)
export const setPostTags = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ message: 'Not authorized' }); return; }
  try {
    const post = await CommunityPost.findById(req.params.id);
    if (!post) { res.status(404).json({ message: 'Post not found.' }); return; }

    // IDOR guard: only post author or admin/moderator can edit tags
    const isAuthor = post.author.toString() === req.user._id.toString();
    const isPrivileged = ['admin', 'moderator'].includes(req.user.role);
    if (!isAuthor && !isPrivileged) {
      res.status(403).json({ message: 'Forbidden: only the post author or admin can edit tags.' });
      return;
    }

    const { tags } = req.body as { tags?: string[] };
    if (!Array.isArray(tags)) { res.status(400).json({ message: 'tags must be an array.' }); return; }

    post.tags = tags.map((t: string) => t.trim().toLowerCase()).filter(Boolean);
    await post.save();

    res.json({ message: 'Tags updated.', tags: post.tags });
  } catch (error) {
    logger.error(`[post] setPostTags failed: ${(error as Error).message}`);
    res.status(500).json({ message: 'Server error' });
  }
};
