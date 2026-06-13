/**
 * supportGoldenController.ts — Golden Ticket admin actions
 * (v1.65, additive).
 *
 * Routes (from routes/support.ts):
 *   POST   /api/admin/support/requests/:id/convert-to-golden   (admin)
 *   POST   /api/admin/support/requests/:id/unconvert-golden   (admin)
 *   POST   /api/admin/support/users/:userId/award-sp          (admin)
 *   GET    /api/support/me/sp                                  (any authed user)
 *
 * Every handler is a thin wrapper around the SP helpers in
 * promotionService.ts and the lifecycle transitions in
 * supportCore.ts. No existing controller was touched — the new
 * routes register under a fresh `supportGolden*` export surface.
 *
 * Backward-compat: the underlying SupportRequest and User schemas
 * already grew the additive Golden fields in v1.65; legacy tickets
 * (and legacy users) read as non-Golden / sp=0 through the
 * `isGoldenTicket()` / `user.sp ?? 0` guards. No data migration is
 * needed.
 */

import { Request, Response } from 'express';
import { Types } from 'mongoose';
import SupportRequest from '../models/SupportRequest.js';
import {
  getAuthedUserId,
  getAuthedUserRole,
  stripAdminOnlyFields,
  logAdminAction,
  notifyUser,
  isGoldenTicket,
  requireFeatureOn,
} from './supportCore.js';
import { awardSpurtiPoints, spendSpurtiPoints, refundSpurtiPoints } from '../services/promotionService.js';
import { logger } from '../utils/http/logger.js';

function asStringParam(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

function requireAdmin(req: Request, res: Response): { userId: Types.ObjectId } | null {
  const userId = getAuthedUserId(req);
  if (!userId) {
    res.status(401).json({ message: 'Authentication required.' });
    return null;
  }
  const role = getAuthedUserRole(req);
  if (role !== 'admin' && role !== 'moderator') {
    res.status(403).json({ message: 'Admin only.' });
    return null;
  }
  return { userId };
}

// ─── Convert existing ticket to Golden (admin) ───────────────────────────

/**
 * POST /api/admin/support/requests/:id/convert-to-golden
 *
 * Body: { spCost?: number, note?: string }
 *
 * Marks the ticket Golden and records provenance. If `spCost` is
 * provided and > 0, the SP is debited from the user's wallet
 * (spendSpurtiPoints). The SP helpers throw on insufficient balance,
 * so a 402-ish failure surfaces here as 400.
 *
 * Idempotent: converting an already-Golden ticket is a no-op (returns
 * the existing ticket). This lets admin UIs wire the "Convert" button
 * without tracking client-side state.
 */
export async function convertToGolden(req: Request, res: Response): Promise<void> {
  const auth = requireAdmin(req, res);
  if (!auth) return;

  const id = asStringParam(req.params.id);
  if (!id || !Types.ObjectId.isValid(id)) {
    res.status(400).json({ message: 'Invalid request id.' });
    return;
  }

  const body = (req.body ?? {}) as { spCost?: number; note?: string };
  const spCost = Number.isFinite(body.spCost) ? Math.max(0, Math.trunc(Number(body.spCost))) : 0;
  const note = String(body.note || '').trim().slice(0, 2000);

  try {
    const request = await SupportRequest.findById(id);
    if (!request) {
      res.status(404).json({ message: 'Support request not found.' });
      return;
    }

    // Idempotent: already Golden — return as-is.
    if (isGoldenTicket(request)) {
      res.json({ request: stripAdminOnlyFields(request.toObject(), true) });
      return;
    }

    const { default: User } = await import('../models/User.js');
    const admin = await User.findById(auth.userId).select('name').lean();
    if (!admin) {
      res.status(401).json({ message: 'Admin not found.' });
      return;
    }

    // Debit SP if a cost was specified. The helper throws on
    // insufficient balance — we catch and surface as 400 so admins
    // get a clear "wallet too low" message instead of a 500.
    if (spCost > 0) {
      try {
        await spendSpurtiPoints(
          request.userId.toString(),
          spCost,
          `Golden Ticket conversion by admin ${admin.name}`,
          request._id,
        );
      } catch (spErr) {
        res.status(400).json({
          message: (spErr as Error).message || 'Insufficient Spurti Points.',
        });
        return;
      }
    }

    const now = new Date();
    request.isGolden = true;
    request.spCost = spCost;
    request.goldenConvertedAt = now;
    request.goldenConvertedBy = auth.userId;
    request.goldenConvertedByName = admin.name;
    // Tag the audit trail so future readers can find this transition
    // in the status history even after the request is closed.
    request.statusHistory.push({
      status: request.status,
      note: note || `Promoted to Golden by ${admin.name}${spCost > 0 ? ` (-${spCost} SP)` : ''}.`,
      updatedBy: auth.userId,
      updatedByName: admin.name,
      timestamp: now,
    });
    request.updatedAt = now;
    await request.save();

    await logAdminAction(
      auth.userId,
      admin.name,
      'golden_converted',
      request._id,
      `Converted to Golden${spCost > 0 ? ` (SP cost: ${spCost})` : ''}${note ? ` | ${note.slice(0, 100)}` : ''}`,
    );

    // Tell the student their ticket is now Golden-priority.
    await notifyUser(request.userId, {
      title: 'Your support request was promoted to Golden',
      message: spCost > 0
        ? `An admin converted your ticket to a Golden Ticket (${spCost} SP applied). It will be reviewed with priority.`
        : 'An admin converted your ticket to a Golden Ticket. It will be reviewed with priority.',
      link: '/support/' + request._id.toString(),
      metadata: {
        supportRequestId: request._id.toString(),
        issueType: request.issueType,
        status: request.status,
        isGolden: true,
        spCost,
      },
    });

    res.json({ request: stripAdminOnlyFields(request.toObject(), true) });
  } catch (err) {
    logger.error(`[supportGolden] convertToGolden failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to convert ticket to Golden.' });
  }
}

// ─── Roll back a Golden conversion (admin) ─────────────────────────────────

/**
 * POST /api/admin/support/requests/:id/unconvert-golden
 *
 * Reverses convertToGolden. Refunds the SP debit (if any), clears
 * the Golden flag, and stamps the audit trail. Only valid on tickets
 * that are still Golden AND not yet Resolved / closed.
 */
export async function unconverGolden(req: Request, res: Response): Promise<void> {
  const auth = requireAdmin(req, res);
  if (!auth) return;

  const id = asStringParam(req.params.id);
  if (!id || !Types.ObjectId.isValid(id)) {
    res.status(400).json({ message: 'Invalid request id.' });
    return;
  }

  const body = (req.body ?? {}) as { note?: string };
  const note = String(body.note || '').trim().slice(0, 2000);

  try {
    const request = await SupportRequest.findById(id);
    if (!request) {
      res.status(404).json({ message: 'Support request not found.' });
      return;
    }
    if (!isGoldenTicket(request)) {
      // Idempotent in the other direction.
      res.json({ request: stripAdminOnlyFields(request.toObject(), true) });
      return;
    }
    if (request.status === 'Resolved' || request.status === 'closed') {
      res.status(409).json({
        message: `Cannot roll back a Golden conversion on a ticket in terminal state '${request.status}'.`,
      });
      return;
    }

    const { default: User } = await import('../models/User.js');
    const admin = await User.findById(auth.userId).select('name').lean();
    if (!admin) {
      res.status(401).json({ message: 'Admin not found.' });
      return;
    }

    if (request.spCost > 0) {
      try {
        await refundSpurtiPoints(
          request.userId.toString(),
          request.spCost,
          `Golden Ticket conversion rolled back by admin ${admin.name}`,
          request._id,
        );
      } catch (spErr) {
        // Refund failed (e.g. user already deleted) — log and continue
        // with the rollback so the ticket state is consistent. The audit
        // trail still records the rollback; an admin can re-credit via
        // /award-sp if needed.
        logger.warn(`[supportGolden] refund failed during rollback: ${(spErr as Error).message}`);
      }
    }

    const now = new Date();
    request.isGolden = false;
    const refundAmount = request.spCost;
    request.spCost = 0;
    request.goldenConvertedAt = null;
    request.goldenConvertedBy = null;
    request.goldenConvertedByName = '';
    request.statusHistory.push({
      status: request.status,
      note: note || `Golden conversion rolled back by ${admin.name}${refundAmount > 0 ? ` (${refundAmount} SP refunded)` : ''}.`,
      updatedBy: auth.userId,
      updatedByName: admin.name,
      timestamp: now,
    });
    request.updatedAt = now;
    await request.save();

    await logAdminAction(
      auth.userId,
      admin.name,
      'golden_unconverted',
      request._id,
      `Rolled back Golden conversion${refundAmount > 0 ? ` (refunded ${refundAmount} SP)` : ''}${note ? ` | ${note.slice(0, 100)}` : ''}`,
    );

    res.json({ request: stripAdminOnlyFields(request.toObject(), true) });
  } catch (err) {
    logger.error(`[supportGolden] unconverGolden failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to roll back Golden conversion.' });
  }
}

// ─── Award Spurti Points to a user (admin) ─────────────────────────────────

/**
 * POST /api/admin/support/users/:userId/award-sp
 *
 * Body: { amount: number, reason: string }
 *
 * Awards `amount` SP to a user (positive = credit, negative = manual
 * admin debit / correction). Logs to ReputationLog via the
 * `sp_awarded` action. The amount must be a non-zero integer.
 */
export async function awardSpurtiPointsAdmin(req: Request, res: Response): Promise<void> {
  const auth = requireAdmin(req, res);
  if (!auth) return;

  const userId = asStringParam(req.params.userId);
  if (!userId || !Types.ObjectId.isValid(userId)) {
    res.status(400).json({ message: 'Invalid user id.' });
    return;
  }

  const body = (req.body ?? {}) as { amount?: number; reason?: string };
  const amount = Number(body.amount);
  const reason = String(body.reason || '').trim().slice(0, 500);
  if (!Number.isFinite(amount) || amount === 0 || !Number.isInteger(amount)) {
    res.status(400).json({ message: 'amount must be a non-zero integer.' });
    return;
  }
  if (!reason) {
    res.status(400).json({ message: 'reason is required.' });
    return;
  }

  try {
    const { default: User } = await import('../models/User.js');
    const admin = await User.findById(auth.userId).select('name').lean();
    if (!admin) {
      res.status(401).json({ message: 'Admin not found.' });
      return;
    }

    let newBalance: number;
    try {
      const result = await awardSpurtiPoints(
        userId,
        amount,
        'sp_awarded',
        `Admin ${admin.name}: ${reason}`,
        auth.userId,
      );
      newBalance = result.newBalance;
    } catch (spErr) {
      res.status(400).json({
        message: (spErr as Error).message || 'SP adjustment failed.',
      });
      return;
    }

    await logAdminAction(
      auth.userId,
      admin.name,
      amount > 0 ? 'sp_awarded' : 'sp_deducted',
      new Types.ObjectId(userId),
      `SP ${amount > 0 ? '+' : ''}${amount} | ${reason}`,
    );

    res.json({ userId, newBalance });
  } catch (err) {
    logger.error(`[supportGolden] awardSpurtiPointsAdmin failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to adjust Spurti Points.' });
  }
}

// ─── Self-service: read my own Spurti Points ───────────────────────────────

/**
 * GET /api/support/me/sp
 * Returns the authenticated user's current SP balance + their
 * Golden Ticket cooldown + ban status (so the frontend can render
 * the countdown / banned banner without making a second request).
 * Cheap — single indexed read, no joins.
 *
 * v1.65.1 — feature flag check is awaited INSIDE the handler (not
 * on the route) so the response actually reaches the client.
 */
export async function getMySpurtiPoints(req: Request, res: Response): Promise<void> {
  if (!(await requireFeatureOn(req, res, 'goldenTicket'))) return;
  const userId = getAuthedUserId(req);
  if (!userId) { res.status(401).json({ message: 'Authentication required.' }); return; }

  try {
    const { default: User } = await import('../models/User.js');
    const { readSetting } = await import('../models/AppSetting.js');
    const [user, cooldownHours] = await Promise.all([
      User.findById(userId).select('sp lastGoldenRejectionAt').lean(),
      readSetting('goldenCooldownHours', 48),
    ]);
    if (!user) {
      res.status(404).json({ message: 'User not found.' });
      return;
    }
    // v1.65.3 — Cooldown semantics: `User.lastGoldenRejectionAt` stores
    // the END date of the active cooldown (i.e. now + goldenCooldownHours
    // at the time the stamp was set). Stamped on successful Golden
    // submission (not on admin action — that path no longer fires the
    // user-level cooldown). The readers below use the field DIRECTLY as
    // the END date; the previous "+ cooldownHours" math was a 2x bug
    // left over from when the field stored the event timestamp.
    const lastRej = user.lastGoldenRejectionAt as Date | string | null;
    const cooldownEndsAt = lastRej && cooldownHours > 0
      ? new Date(lastRej).toISOString()
      : null;
    const canSubmitGolden = !cooldownEndsAt || new Date(cooldownEndsAt).getTime() <= Date.now();
    res.json({
      sp: user.sp ?? 0,
      cooldownHours,
      cooldownEndsAt: canSubmitGolden ? null : cooldownEndsAt,
      canSubmitGolden,
    });
  } catch (err) {
    logger.error(`[supportGolden] getMySpurtiPoints failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to load Spurti Points.' });
  }
}

// ─── Public Escalation Queue (anonymous to non-admins) ─────────────────────
//
// v1.65 — the new Golden Ticket landing page shows a live feed of
// recent Golden tickets so users see what kinds of escalations are
// being made. To protect the requester's identity, regular users see
// the username redacted to 'ANONYMOUS'; admins see the real name
// (since they're already trusted). The list excludes the requester's
// own tickets from their view so the form-submit UX doesn't have the
// user staring at their own card on the right.

/**
 * GET /api/support/golden/queue
 * Query: ?limit=10 (default 10, capped at 50)
 * Public to all authed users. Returns the most recent Golden
 * tickets ordered newest-first. Non-admin callers see the
 * `userName` / `userId` fields redacted to anonymous equivalents.
 *
 * v1.65.1 — feature flag check is awaited INSIDE the handler (not
 * on the route) so the response actually reaches the client.
 */
export async function getGoldenQueue(req: Request, res: Response): Promise<void> {
  if (!(await requireFeatureOn(req, res, 'goldenTicket'))) return;
  const userId = getAuthedUserId(req);
  if (!userId) { res.status(401).json({ message: 'Authentication required.' }); return; }

  const role = getAuthedUserRole(req);
  const isAdmin = role === 'admin' || role === 'moderator';

  const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? '10')) || 10));

  try {
    // 1. Determine if the user has an active Golden Ticket and what their position is
    const myActiveTicket = await SupportRequest.findOne({
      isGolden: true,
      status: { $in: ['Pending', 'In Review', 'open'] },
      userId: userId
    }).select('spCost createdAt').lean();

    let myQueuePosition: number | undefined;
    let ticketsAhead: number | undefined;
    let mySpCost: number | undefined;

    if (myActiveTicket) {
      ticketsAhead = await SupportRequest.countDocuments({
        isGolden: true,
        status: { $in: ['Pending', 'In Review', 'open'] },
        $or: [
          { spCost: { $gt: myActiveTicket.spCost } },
          { spCost: myActiveTicket.spCost, createdAt: { $lt: myActiveTicket.createdAt } }
        ]
      });
      myQueuePosition = ticketsAhead + 1;
      mySpCost = myActiveTicket.spCost;
    }

    // 2. Fetch the top `limit` pending Golden Tickets
    const docs = await SupportRequest.find({ 
      isGolden: true,
      status: { $in: ['Pending', 'In Review', 'open'] }
    })
      .sort({ spCost: -1, createdAt: 1 })
      .limit(limit)
      .select('userId userName title details spCost status createdAt')
      .lean();

    const items = docs
      .filter((d) => isAdmin || d.userId.toString() !== userId.toString())
      .map((d) => {
        const isOwn = d.userId.toString() === userId.toString();
        return {
          _id: d._id,
          isOwn,
          userName: isOwn ? d.userName : (isAdmin ? d.userName : 'ANONYMOUS'),
          title: d.title,
          details: d.details,
          spCost: d.spCost ?? 0,
          status: d.status,
          createdAt: d.createdAt,
        };
      });

    res.json({ items, myQueuePosition, ticketsAhead, mySpCost });
  } catch (err) {
    logger.error(`[supportGolden] getGoldenQueue failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to load Golden queue.' });
  }
}
