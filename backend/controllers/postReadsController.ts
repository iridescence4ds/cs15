/**
 * postReadsController.ts — Public read endpoints for community posts.
 *
 * Routes (from routes/community.ts):
 *   GET /api/community                            — list (cursor-paginated, filterable, sortable, searchable)
 *   GET /api/community/:id                        — single post + nested comment tree
 *   GET /api/community/solved                     — recently resolved posts
 */

import { Request, Response } from 'express';
import mongoose from 'mongoose';
import CommunityPost from '../models/CommunityPost.js';
import { logger } from '../utils/http/logger.js';
import { buildCommentTree, timeTrialHoursRemaining } from './postCore.js';

// GET /api/community — All posts (cursor-paginated, filterable, sortable, searchable)
export const getAllPosts = async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = Math.max(1, Math.min(50, parseInt(req.query.limit as string) || 20));
    const cursor = (req.query.cursor as string) || '';

    const filter = (req.query.filter as string) || 'all';
    const sortParam = (req.query.sort as string) || 'newest';
    const search = (req.query.search as string)?.trim() || '';

    // Build query filter
    const query: Record<string, unknown> = { isHidden: { $ne: true } };
    if (filter === 'unanswered') query.status = 'unanswered';
    else if (filter === 'answered') query.status = 'answered';
    // 'all' → no status filter

    // Text search on title
    if (search.length >= 2) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.title = { $regex: escaped, $options: 'i' };
    }

    // Decode cursor to ObjectId for keyset pagination
    let cursorId: mongoose.Types.ObjectId | null = null;
    if (cursor && sortParam !== 'popular') {
      try {
        const decoded = Buffer.from(cursor, 'base64').toString('utf8');
        cursorId = new mongoose.Types.ObjectId(decoded);
        if (sortParam === 'oldest') {
          query._id = { $gt: cursorId };
        } else {
          query._id = { $lt: cursorId };
        }
      } catch {
        res.status(400).json({ message: 'Invalid cursor.' });
        return;
      }
    }

    // Build sort — always by _id desc (required for cursor pagination to work)
    let sortObj: Record<string, 1 | -1> = { _id: -1 };
    if (sortParam === 'oldest') sortObj = { _id: 1 };
    else if (sortParam === 'popular') sortObj = { 'upvotes.length': -1, _id: -1 };

    const total = await CommunityPost.countDocuments(query);

    const populateFields = [
      { path: 'author', select: 'name' },
      { path: 'comments.author', select: 'name' },
      { path: 'comments.upvotes', select: 'name' },
      { path: 'comments.downvotes', select: 'name' },
      { path: 'comments.replies.upvotes', select: 'name' },
      { path: 'comments.replies.downvotes', select: 'name' },
    ];

    // ── Sort by upvotes — cursor is incompatible with in-memory sort,
    // so when sorting by popularity we load the full upvote count for all posts
    // rather than using keyset pagination. This is acceptable since the community
    // post list is small enough that loading all posts at once is fast.
    if (sortParam === 'popular') {
      const allPosts = await CommunityPost.find(query)
        .select('-embedding')
        .populate(populateFields)
        .sort({ _id: -1 })
        .limit(200) // cap at 200 to keep query fast; not cursor-limited
        .exec();

      const sorted = allPosts.sort((a, b) => (b.upvotes?.length ?? 0) - (a.upvotes?.length ?? 0));
      const hasMore = allPosts.length > limit;
      const paged = hasMore ? sorted.slice(0, limit) : sorted;
      const nextCursor = hasMore && paged.length > 0
        ? Buffer.from(paged[paged.length - 1]._id.toString()).toString('base64')
        : null;

      res.json({
        posts: paged.map((p) => {
          const doc = p.toObject() as unknown as Record<string, unknown>;
          doc.timeTrialHoursRemaining = timeTrialHoursRemaining(doc as never);
          return doc;
        }),
        total,
        limit,
        hasMore,
        nextCursor,
      });
      return;
    }

    const posts = await CommunityPost.find(query)
      .select('-embedding')
      .populate(populateFields)
      .sort(sortObj)
      .limit(limit + 1);

    const hasMore = posts.length > limit;
    const results = hasMore ? posts.slice(0, limit) : posts;
    const nextCursor = hasMore && results.length > 0
      ? Buffer.from(results[results.length - 1]._id.toString()).toString('base64')
      : null;

    res.json({
      posts: results.map((p) => {
        const doc = p.toObject() as unknown as Record<string, unknown>;
        doc.timeTrialHoursRemaining = timeTrialHoursRemaining(doc as never);
        return doc;
      }),
      total,
      limit,
      hasMore,
      nextCursor,
    });
  } catch (error) {
    logger.error(`[post] getAllPosts failed: ${(error as Error).message}`);
    res.status(500).json({ message: 'Server error' });
  }
};

// GET /api/community/:id — Single post with nested comment tree
export const getPostById = async (req: Request, res: Response): Promise<void> => {
  try {
    const post = await CommunityPost.findById(req.params.id)
      .select('-embedding')
      .populate('author', 'name')
      .populate('comments.author', 'name')
      .populate('comments.upvotes', 'name')
      .populate('comments.downvotes', 'name')
      .populate('comments.replies.upvotes', 'name')
      .populate('comments.replies.downvotes', 'name');

    if (!post) {
      res.status(404).json({ message: 'Post not found.' });
      return;
    }

    // Attach nested replies tree to the response
    const postObj = post.toObject() as unknown as Record<string, unknown>;
    const comments = postObj.comments as Array<Record<string, unknown>>;
    postObj.comments = buildCommentTree(comments);

    // Add timeTrialHoursRemaining for pending Time-Trial posts
    postObj.timeTrialHoursRemaining = timeTrialHoursRemaining(postObj as never, 24);

    res.json(postObj);
  } catch (error) {
    logger.error(`[post] getPostById failed: ${(error as Error).message}`);
    res.status(500).json({ message: 'Server error' });
  }
};

// GET /api/community/solved — Get recently resolved posts (for "Top Solved Today" widget)
export const getSolvedPosts = async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 4, 10);
    const hours = parseInt(req.query.hours as string) || 24;

    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const posts = await CommunityPost.find({
      status: 'answered',
      updatedAt: { $gte: since },
    })
      .sort({ updatedAt: -1 })
      .limit(limit)
      .populate('author', 'name')
      .lean();

    res.json({ posts });
  } catch (error) {
    logger.error(`[post] getSolvedPosts failed: ${(error as Error).message}`);
    res.status(500).json({ message: 'Server error' });
  }
};
