import { Request, Response } from 'express';
import mongoose from 'mongoose';
import User from '../models/User.js';
import CommunityPost from '../models/CommunityPost.js';
import { logger } from '../utils/http/logger.js';

/** GET /api/community/bookmarks — get current user's bookmarked posts */
export async function getBookmarks(req: Request, res: Response): Promise<void> {
  if (!req.user?._id) { res.status(401).json({ error: 'Unauthorized' }); return; }
  try {
    const user = await User.findById(req.user._id).populate({
      path: 'bookmarks',
      populate: [
        { path: 'author', select: 'name avatar' },
        { path: 'comments.author', select: 'name avatar' },
      ],
    });
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }
    const posts = (user.bookmarks as unknown as mongoose.Document[])
      .filter(p => p && (p as any)._id)
      .map(p => ({ ...(p as any).toObject(), bookmarks: (p as any).bookmarks ?? [] }));
    res.json({ bookmarks: posts, total: posts.length });
  } catch (err) {
    logger.error(`getBookmarks: ${(err as Error).message}`);
    res.status(500).json({ error: 'Failed to load bookmarks' });
  }
}

/** POST /api/community/:id/bookmark — toggle bookmark for a post */
export async function toggleBookmark(req: Request, res: Response): Promise<void> {
  if (!req.user?._id) { res.status(401).json({ error: 'Unauthorized' }); return; }
  try {
    const postId = req.params.id as string;
    const userId = req.user._id;

    const post = await CommunityPost.findById(postId);
    if (!post) { res.status(404).json({ error: 'Post not found' }); return; }

    const user = await User.findById(userId);
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }

    const bookmarks = user.bookmarks as unknown as mongoose.Types.ObjectId[];
    const idx = bookmarks.findIndex(b => b.toString() === postId);
    const bookmarked = idx === -1;

    if (bookmarked) {
      bookmarks.push(new mongoose.Types.ObjectId(postId));
    } else {
      bookmarks.splice(idx, 1);
    }
    user.bookmarks = bookmarks as unknown as typeof user.bookmarks;
    await user.save();

    res.json({ bookmarked, postId });
  } catch (err) {
    logger.error(`toggleBookmark: ${(err as Error).message}`);
    res.status(500).json({ error: 'Failed to update bookmark' });
  }
}