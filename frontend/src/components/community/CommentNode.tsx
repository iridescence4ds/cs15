import React, { useState } from 'react';
import api, { friendlyError } from '../../utils/api';
import Avatar from '../ui/Avatar';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import { useAuthGate } from '../../context/AuthModalContext';
import { DEPTH_COLORS, DEPTH_BARS, formatDate, countReplies } from '../ui/threadUtils';

interface CommentNodeProps {
  comment: Comment;
  postId: string;
  currentUserId: string;
  userRole: string;
  onReplyAdded: (newComment: Comment, parentId: string | null) => void;
  onCommentDeleted?: (commentId: string, parentId: string | null) => void;
  depth?: number;
  threadColor?: string;
  barColor?: string;
}

interface Comment {
  _id: string;
  author?: { name?: string; _id?: string };
  body: string;
  createdAt?: string;
  upvotes?: (string | { _id?: string })[];
  downvotes?: (string | { _id?: string })[];
  verified?: boolean;
  isExpertAnswer?: boolean;
  isFirstResponder?: boolean;
  firstResponderAwardedAt?: string | null;
  depth: number;
  parentId?: string | null;
  replies?: Comment[];
}

export default function CommentNode({
  comment,
  postId,
  currentUserId,
  userRole,
  onReplyAdded,
  onCommentDeleted,
  depth = 0,
  threadColor,
  barColor,
}: CommentNodeProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [showReplyBox, setShowReplyBox] = useState(false);
  const [replyLoading, setReplyLoading] = useState(false);
  const [localReplies, setLocalReplies] = useState<Comment[]>(comment.replies ?? []);
  const [localUpvotes, setLocalUpvotes] = useState(comment.upvotes ?? []);
  const [localDownvotes, setLocalDownvotes] = useState(comment.downvotes ?? []);
  const gate = useAuthGate();
  const [actionError, setActionError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(comment.body);
  const [editLoading, setEditLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Derived values that canEdit/canDelete depend on
  const isExpert = comment.isExpertAnswer;
  const isVerified = comment.verified;
  const isFirstResponder = comment.isFirstResponder;
  const isAuthor = comment.author?._id?.toString() === currentUserId || comment.author?._id === currentUserId;
  const canEdit = isAuthor && !isExpert && !isVerified;
  const canDelete = isAuthor || userRole === 'admin' || userRole === 'moderator';

  const color = threadColor ?? DEPTH_COLORS[depth % DEPTH_COLORS.length];
  const bar   = barColor   ?? DEPTH_BARS[depth % DEPTH_BARS.length];
  const maxDepth = depth >= 4;

  const cUpvotes    = localUpvotes.length;
  const cDownvotes  = localDownvotes.length;
  const netScore    = cUpvotes - cDownvotes;
  const hasUpvoted  = localUpvotes.some(u =>
    (typeof u === 'object' ? (u as { _id?: string })._id || u : u)?.toString() === currentUserId
  );
  const hasDownvoted = localDownvotes.some(u =>
    (typeof u === 'object' ? (u as { _id?: string })._id || u : u)?.toString() === currentUserId
  );
  const commentOpacity = netScore >= 0 ? 1 : Math.max(0.15, 1 - Math.abs(netScore) * 0.2);
  const totalReplies = countReplies(comment) + localReplies.length;

  // ── Upvote ───────────────────────────────────────────────────────────────────

  const doUpvoteImpl = () => {
    const previousUpvotes = localUpvotes;
    const previousDownvotes = localDownvotes;
    const isUpvoted = previousUpvotes.some(u =>
      (typeof u === 'object' ? (u as { _id?: string })._id || u : u)?.toString() === currentUserId
    );

    setLocalUpvotes(prev =>
      isUpvoted
        ? prev.filter(u => (typeof u === 'object' ? (u as { _id?: string })._id || u : u)?.toString() !== currentUserId)
        : [...prev, currentUserId]
    );
    setLocalDownvotes(prev =>
      prev.filter(u => (typeof u === 'object' ? (u as { _id?: string })._id || u : u)?.toString() !== currentUserId)
    );

    api.post<{ upvotedByMe: boolean }>(`/community/${postId}/comments/${comment._id}/upvote`)
      .then(res => {
        setLocalUpvotes(res.data.upvotedByMe
          ? [...(localUpvotes.filter(u => (typeof u === 'object' ? (u as { _id?: string })._id : u)?.toString() !== currentUserId)), currentUserId]
          : localUpvotes.filter(u => (typeof u === 'object' ? (u as { _id?: string })._id : u)?.toString() !== currentUserId)
        );
        setLocalDownvotes(prev =>
          prev.filter(u => (typeof u === 'object' ? (u as { _id?: string })._id : u)?.toString() !== currentUserId)
        );
      })
      .catch(() => {
        setLocalUpvotes(previousUpvotes);
        setLocalDownvotes(previousDownvotes);
      });
  };

  const doUpvote = gate(doUpvoteImpl, 'Sign in to upvote this comment.');

  // ── Downvote ─────────────────────────────────────────────────────────────────

  const doDownvoteImpl = () => {
    const previousUpvotes = localUpvotes;
    const previousDownvotes = localDownvotes;
    const isDownvoted = previousDownvotes.some(u =>
      (typeof u === 'object' ? (u as { _id?: string })._id || u : u)?.toString() === currentUserId
    );

    setLocalDownvotes(prev =>
      isDownvoted
        ? prev.filter(u => (typeof u === 'object' ? (u as { _id?: string })._id || u : u)?.toString() !== currentUserId)
        : [...prev, currentUserId]
    );
    setLocalUpvotes(prev =>
      prev.filter(u => (typeof u === 'object' ? (u as { _id?: string })._id || u : u)?.toString() !== currentUserId)
    );

    api.post<{ deleted?: boolean; downvotedByMe: boolean }>(
      `/community/${postId}/comments/${comment._id}/downvote`
    ).then(res => {
      if (res.data.deleted) {
        try { new Audio('/fahhhhh.mp3').play(); } catch (_) {}
        const el = document.getElementById(`comment-${comment._id}`);
        if (el) { el.style.setProperty('--current-opacity', String(commentOpacity)); el.classList.add('comment-dying'); }
        return;
      }
      setLocalDownvotes(res.data.downvotedByMe
        ? [...(localDownvotes.filter(u => (typeof u === 'object' ? (u as { _id?: string })._id : u)?.toString() !== currentUserId)), currentUserId]
        : localDownvotes.filter(u => (typeof u === 'object' ? (u as { _id?: string })._id : u)?.toString() !== currentUserId)
      );
      setLocalUpvotes(prev =>
        prev.filter(u => (typeof u === 'object' ? (u as { _id?: string })._id : u)?.toString() !== currentUserId)
      );
    }).catch(() => {
      setLocalDownvotes(previousDownvotes);
      setLocalUpvotes(previousUpvotes);
    });
  };

  const doDownvote = gate(doDownvoteImpl, 'Sign in to downvote this comment.');

  // ── Reply ────────────────────────────────────────────────────────────────────

  const doReplyImpl = async () => {
    if (!replyText.trim() || replyLoading) return;
    setReplyLoading(true);
    try {
      const res = await api.post<{ comment: Comment }>(
        `/community/${postId}/comments?parentId=${comment._id}`,
        { body: replyText }
      );
      setLocalReplies(prev => [...prev, res.data.comment]);
      setReplyText('');
      setShowReplyBox(false);
      onReplyAdded(res.data.comment, comment._id);
    } catch (e) {
      setActionError(friendlyError(e, 'Reply failed. Please try again.'));
      setTimeout(() => setActionError(null), 3000);
    } finally { setReplyLoading(false); }
  };

  const handleReply = gate(doReplyImpl, 'Sign in to reply to this comment.');

  const handleReplySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleReply();
  };

  // ── Edit ─────────────────────────────────────────────────────────────────────

  const doEditImpl = async () => {
    if (!editText.trim() || editLoading) return;
    setEditLoading(true);
    try {
      const res = await api.patch<{ comment: Comment }>(
        `/community/${postId}/comments/${comment._id}`,
        { body: editText }
      );
      comment.body = res.data.comment.body ?? editText;
      setEditing(false);
    } catch (e) {
      setActionError(friendlyError(e, 'Edit failed. Please try again.'));
      setTimeout(() => setActionError(null), 3000);
    } finally {
      setEditLoading(false);
    }
  };

  const doEdit = gate(doEditImpl, 'Sign in to edit this comment.');

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    doEdit();
  };

  // ── Delete ───────────────────────────────────────────────────────────────────

  const doDeleteImpl = async () => {
    if (deleteLoading) return;
    if (!window.confirm('Delete this comment? This cannot be undone.')) return;
    setDeleteLoading(true);
    try {
      await api.delete(`/community/${postId}/comments/${comment._id}`);
      onCommentDeleted?.(comment._id, comment.parentId ?? null);
    } catch (e) {
      setActionError(friendlyError(e, 'Delete failed. Please try again.'));
      setTimeout(() => setActionError(null), 3000);
    } finally {
      setDeleteLoading(false);
    }
  };

  const doDelete = gate(doDeleteImpl, 'Sign in to delete this comment.');

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div
      id={`comment-${comment._id}`}
      className="flex items-stretch gap-0 transition-opacity duration-300 group/comment"
      style={{ opacity: commentOpacity }}
    >
      {/* Vote column */}
      <div className="flex flex-col items-center gap-0 mr-2 flex-shrink-0">
        <button onClick={doUpvote}
          className={`w-6 h-6 rounded flex items-center justify-center transition-all ${hasUpvoted ? 'text-orange-500' : 'text-ink-faint hover:text-orange-400'}`}
          title="Upvote">
          <svg width="10" height="10" viewBox="0 0 10 10" fill={hasUpvoted ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5">
            <path d="M5 1L9 7H1L5 1Z" strokeLinejoin="round"/>
          </svg>
        </button>
        <span className={`text-[10px] font-bold leading-none py-0.5 ${netScore > 0 ? 'text-orange-500' : netScore < 0 ? 'text-blue-400' : 'text-ink-faint'}`}>
          {netScore > 0 ? '+' : ''}{netScore || '0'}
        </span>
        <button onClick={doDownvote}
          className={`w-6 h-6 rounded flex items-center justify-center transition-all ${hasDownvoted ? 'text-blue-500' : 'text-ink-faint hover:text-blue-400'}`}
          title="Downvote">
          <svg width="10" height="10" viewBox="0 0 10 10" fill={hasDownvoted ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5">
            <path d="M5 9L1 3H9L5 9Z" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      {/* Thread line + content column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Collapse toggle */}
        <button onClick={() => setCollapsed(v => !v)}
          className="flex items-center gap-1.5 mb-0.5 text-left hover:opacity-80 transition-opacity"
          title={collapsed ? 'Expand thread' : 'Collapse thread'}>
          <div className={`w-0.5 h-4 flex-shrink-0 rounded-full ${bar} ${collapsed ? 'opacity-30' : 'opacity-100'} transition-all`} />
          <span className="text-[10px] text-ink-faint font-medium">
            {collapsed ? `[+${totalReplies + 1}]` : '[-]'}
          </span>
        </button>

        {!collapsed && (
          <>
            {/* Comment card */}
            <div className={`rounded-xl px-3 py-2.5 relative overflow-hidden ${isExpert ? 'bg-accent/5 border border-accent/20' : 'bg-mist'}`}>
              {netScore > 2 && <div className="comment-fire-glow" />}
              <div className="relative z-10">
                <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                  <Avatar name={comment.author?.name} size="xs" />
                  <span className="text-xs font-semibold text-ink">{comment.author?.name || 'User'}</span>
                  {isExpert && <Badge variant="accent">👑</Badge>}
                  {isVerified && <span className="text-[10px] text-emerald-500">✓</span>}
                  {isFirstResponder && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-yellow-100 border border-yellow-300 text-yellow-700 text-[10px] font-bold">
                      🏅 First Responder
                    </span>
                  )}
                  <span className="text-[10px] text-ink-faint">·</span>
                  <span className="text-[10px] text-ink-faint">{formatDate(comment.createdAt)}</span>
                  {depth > 0 && (
                    <span className={`text-[10px] font-medium ml-1 px-1.5 py-0.5 rounded-full border ${color.replace('border-', 'border-')} ${color.replace('border-', 'text-')} ${color.replace('border-', 'bg-')}/10`}>
                      ↳ depth {depth}
                    </span>
                  )}
                  <span className={`ml-auto text-[10px] font-bold ${netScore > 0 ? 'text-orange-500' : netScore < 0 ? 'text-blue-400' : 'text-ink-faint'}`}>
                    {netScore > 0 ? '+' : ''}{netScore} pts
                  </span>
                </div>
                <p className="text-sm text-ink/75 leading-relaxed whitespace-pre-wrap break-words">{comment.body}</p>

                {/* Actions */}
                <div className="flex items-center gap-1 mt-2">
                  <button onClick={() => !hasUpvoted && doUpvote()}
                    className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition-all ${hasUpvoted ? 'text-orange-500 bg-orange-500/10' : 'text-ink-faint hover:text-orange-500 hover:bg-orange-500/10'}`}>
                    {hasUpvoted ? '↑ Upvoted' : '↑ Upvote'}
                  </button>
                  <button onClick={() => !hasDownvoted && doDownvote()}
                    className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition-all ${hasDownvoted ? 'text-blue-500 bg-blue-500/10' : 'text-ink-faint hover:text-blue-500 hover:bg-blue-500/10'}`}>
                    {hasDownvoted ? '↓ Downvoted' : '↓ Downvote'}
                  </button>
                  {!maxDepth && (
                    <button onClick={() => setShowReplyBox(v => !v)}
                      className="text-[10px] text-ink-faint hover:text-accent transition-colors px-1.5 py-0.5 rounded hover:bg-accent/10">
                      {showReplyBox ? '✕ Cancel' : '↩ Reply'}
                    </button>
                  )}
                  {canEdit && !editing && (
                    <button onClick={() => { setEditing(true); setEditText(comment.body); }}
                      className="text-[10px] text-ink-faint hover:text-accent transition-colors px-1.5 py-0.5 rounded hover:bg-accent/10">
                      ✎ Edit
                    </button>
                  )}
                  {canDelete && !editing && (
                    <button onClick={doDelete}
                      className="text-[10px] text-ink-faint hover:text-danger transition-colors px-1.5 py-0.5 rounded hover:bg-danger/10">
                      {deleteLoading ? '…' : '🗑'}
                    </button>
                  )}
                  {(userRole === 'admin' || userRole === 'moderator') && (
                    <button
                      onClick={() =>
                        api.patch<{ verified: boolean }>(`/community/${postId}/comments/${comment._id}/verify`)
                          .then(res => { comment.verified = res.data.verified; })
                          .catch(e => { console.error(e); })
                      }
                      className="ml-auto text-[10px] text-ink-faint hover:text-emerald-500 transition-colors">
                      {isVerified ? 'Unverify' : '✅ Verify'}
                    </button>
                  )}
                </div>

                {/* Edit form */}
                {editing && (
                  <form onSubmit={handleEditSubmit} className="mt-2 flex gap-1.5 items-start">
                    <textarea
                      value={editText}
                      onChange={e => setEditText(e.target.value)}
                      rows={3}
                      className="flex-1 rounded-lg border border-accent/30 bg-card px-2.5 py-1.5 text-xs text-ink placeholder-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/25 resize-none"
                      autoFocus />
                    <div className="flex flex-col gap-1">
                      <Button type="submit" size="sm" disabled={!editText.trim()} loading={editLoading} className="flex-shrink-0">
                        Save
                      </Button>
                      <button type="button" onClick={() => setEditing(false)}
                        className="text-[10px] text-ink-faint hover:text-ink px-2 py-0.5 rounded transition-colors">
                        Cancel
                      </button>
                    </div>
                  </form>
                )}

                {/* Reply form */}
                {showReplyBox && (
                  <form onSubmit={handleReplySubmit} className="mt-2 flex gap-1.5 items-start">
                    <textarea
                      value={replyText}
                      onChange={e => setReplyText(e.target.value)}
                      rows={2}
                      placeholder={`Reply to ${comment.author?.name || 'user'}…`}
                      className="flex-1 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-ink placeholder-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/25 resize-none"
                      autoFocus />
                    <Button type="submit" size="sm" disabled={!replyText.trim()} loading={replyLoading} className="flex-shrink-0 mt-0.5">
                      Post
                    </Button>
                  </form>
                )}
              </div>
            </div>

            {/* Children */}
            {localReplies.length > 0 && (
              <div className={`mt-1 border-l-2 ${color.replace('border-', 'border-')}/40 rounded-bl ml-1 pl-2 space-y-1`}>
                {localReplies.map(reply => (
                  <CommentNode
                    key={reply._id}
                    comment={reply}
                    postId={postId}
                    currentUserId={currentUserId}
                    userRole={userRole}
                    onReplyAdded={onReplyAdded}
                    onCommentDeleted={onCommentDeleted}
                    depth={depth + 1}
                    threadColor={DEPTH_COLORS[(depth + 1) % DEPTH_COLORS.length]}
                    barColor={DEPTH_BARS[(depth + 1) % DEPTH_BARS.length]}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}