// AdminBatches — list, create, edit, archive, and delete programs.
// Drives the Batch model on the backend. Form lives inline; we don't
// need a separate modal for the create flow at this size.

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import adminApi from '../utils/adminApi';
import { useBatch } from '../../context/BatchContext';

interface AdminBatch {
  _id: string;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  faqCount: number;
  approvedCount?: number;
  createdAt: string;
  updatedAt: string;
}

interface ToastState { msg: string; type: 'success' | 'error' | 'info'; }
function Toast({ toast }: { toast: ToastState }) {
  const colour =
    toast.type === 'error'   ? 'admin-toast-error'   :
    toast.type === 'info'    ? 'admin-toast-info'    :
                               'admin-toast-success' ;
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
      className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-lg text-xs font-medium border ${colour}`}
    >
      {toast.msg}
    </motion.div>
  );
}

interface FormState {
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

const EMPTY_FORM: FormState = {
  name: '',
  description: '',
  startDate: '',
  endDate: '',
  isActive: true,
};

function toDateInputValue(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
  } catch {
    return '';
  }
}

export default function AdminBatches(): JSX.Element {
  const [batches, setBatches] = useState<AdminBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [saving, setSaving] = useState(false);
  const { refresh: refreshContext } = useBatch();

  const showToast = (msg: string, type: ToastState['type'] = 'success'): void => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  // ── Load list ───────────────────────────────────────────────────────────
  const load = async (): Promise<void> => {
    setLoading(true);
    try {
      const res = await adminApi.get<{ batches: AdminBatch[] }>('/batches/admin/all');
      setBatches(res.data.batches ?? []);
    } catch (err) {
      showToast(friendly(err, 'Failed to load programs.'), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  // ── Form handlers ──────────────────────────────────────────────────────
  const startCreate = (): void => {
    setEditingId('new');
    setForm(EMPTY_FORM);
  };
  const startEdit = (b: AdminBatch): void => {
    setEditingId(b._id);
    setForm({
      name: b.name,
      description: b.description,
      startDate: toDateInputValue(b.startDate),
      endDate: toDateInputValue(b.endDate),
      isActive: b.isActive,
    });
  };
  const cancelForm = (): void => {
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!form.name.trim() || !form.startDate || !form.endDate) {
      showToast('Name, start date, and end date are required.', 'error');
      return;
    }
    if (new Date(form.endDate) <= new Date(form.startDate)) {
      showToast('End date must be after start date.', 'error');
      return;
    }
    setSaving(true);
    try {
      if (editingId === 'new') {
        await adminApi.post('/batches', {
          name: form.name.trim(),
          description: form.description,
          startDate: new Date(form.startDate).toISOString(),
          endDate: new Date(form.endDate).toISOString(),
          isActive: form.isActive,
        });
        showToast('Program created.');
      } else if (editingId) {
        await adminApi.patch(`/batches/${editingId}`, {
          name: form.name.trim(),
          description: form.description,
          startDate: new Date(form.startDate).toISOString(),
          endDate: new Date(form.endDate).toISOString(),
          isActive: form.isActive,
        });
        showToast('Program updated.');
      }
      cancelForm();
      await load();
      void refreshContext();
    } catch (err) {
      showToast(friendly(err, 'Save failed.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Row actions ────────────────────────────────────────────────────────
  const archive = async (b: AdminBatch): Promise<void> => {
    if (!window.confirm(`Archive "${b.name}"? It will be hidden from the public but its data is kept.`)) return;
    try {
      await adminApi.post(`/batches/${b._id}/archive`);
      showToast('Program archived.');
      await load();
      void refreshContext();
    } catch (err) { showToast(friendly(err, 'Archive failed.'), 'error'); }
  };
  const activate = async (b: AdminBatch): Promise<void> => {
    try {
      await adminApi.patch(`/batches/${b._id}`, { isActive: true });
      showToast('Program reactivated.');
      await load();
      void refreshContext();
    } catch (err) { showToast(friendly(err, 'Activate failed.'), 'error'); }
  };
  const destroy = async (b: AdminBatch): Promise<void> => {
    if (b.faqCount > 0) {
      if (!window.confirm(
        `Delete "${b.name}"? This will also delete ${b.faqCount} FAQ${b.faqCount === 1 ? '' : 's'}. This cannot be undone.`
      )) return;
    } else if (!window.confirm(`Delete "${b.name}"? This cannot be undone.`)) return;
    try {
      const res = await adminApi.delete<{ deleted: boolean; cascadedFaqs: number }>(`/batches/${b._id}`);
      showToast(`Program deleted. ${res.data.cascadedFaqs} FAQ${res.data.cascadedFaqs === 1 ? '' : 's'} removed.`);
      await load();
      void refreshContext();
    } catch (err) { showToast(friendly(err, 'Delete failed.'), 'error'); }
  };

  // ── Sorted view: active first, then by start date desc ────────────────
  const sortedBatches = useMemo(() => {
    return [...batches].sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      return new Date(b.startDate).getTime() - new Date(a.startDate).getTime();
    });
  }, [batches]);

  const formIsOpen = editingId !== null;

  return (
    <div className="space-y-5">
      <AnimatePresence>{toast && <Toast key="toast" toast={toast} />}</AnimatePresence>

      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-ink-faint -mt-2">Programs (batches) — each owns its own FAQs, categories, and analytics.</p>
        </div>
        {!formIsOpen && (
          <button
            type="button"
            onClick={startCreate}
            className="admin-btn-primary flex items-center gap-1.5"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New Program
          </button>
        )}
      </div>

      {/* ── Create / edit form ───────────────────────────────────────── */}
      <AnimatePresence>
        {formIsOpen && (
          <motion.div
            key="form"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="admin-card-surface overflow-hidden"
          >
            <div className="admin-card-header">
              <p className="text-sm font-semibold text-ink">
                {editingId === 'new' ? 'Create program' : 'Edit program'}
              </p>
            </div>
            <form onSubmit={submit} className="px-5 py-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="admin-label">Name</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Summer Internship 2026"
                    className="admin-input"
                    maxLength={120}
                    required
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="admin-label">Description</label>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="What is this program about? (optional)"
                    className="admin-input min-h-[72px] resize-y"
                    maxLength={1000}
                  />
                </div>
                <div>
                  <label className="admin-label">Start date</label>
                  <input
                    type="date"
                    value={form.startDate}
                    onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                    className="admin-input"
                    required
                  />
                </div>
                <div>
                  <label className="admin-label">End date</label>
                  <input
                    type="date"
                    value={form.endDate}
                    onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                    className="admin-input"
                    required
                  />
                </div>
                <div className="sm:col-span-2 flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="isActive"
                    checked={form.isActive}
                    onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                    className="w-4 h-4 rounded border-border text-accent focus:ring-accent"
                  />
                  <label htmlFor="isActive" className="text-xs text-ink cursor-pointer select-none">
                    Active — visible in the public program picker
                  </label>
                </div>
              </div>
              <div className="flex items-center gap-2 pt-2 border-t border-border/60">
                <button type="submit" disabled={saving} className="admin-btn-primary">
                  {saving ? 'Saving…' : editingId === 'new' ? 'Create' : 'Save changes'}
                </button>
                <button type="button" onClick={cancelForm} className="admin-btn-secondary">Cancel</button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── List ──────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="admin-card-surface p-8 text-center text-xs text-ink-faint">Loading programs…</div>
      ) : sortedBatches.length === 0 ? (
        <div className="admin-card-surface p-8 text-center">
          <p className="text-sm text-ink">No programs yet.</p>
          <p className="text-xs text-ink-soft mt-1">Create your first program to start adding FAQs.</p>
        </div>
      ) : (
        <div className="admin-card-surface overflow-hidden">
          <div className="admin-card-header">
            <p className="text-sm font-semibold text-ink">{sortedBatches.length} {sortedBatches.length === 1 ? 'program' : 'programs'}</p>
          </div>
          <ul className="divide-y divide-border">
            {sortedBatches.map((b) => (
              <li key={b._id} className="px-5 py-4 flex items-start gap-4">
                <span className={`shrink-0 mt-0.5 inline-flex items-center justify-center w-9 h-9 rounded-lg ${b.isActive ? 'bg-admin-green/15 text-admin-green' : 'bg-admin-purple/10 text-admin-purple'}`}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polygon points="12 2 2 7 12 12 22 7 12 2" />
                    <polyline points="2 17 12 22 22 17" />
                    <polyline points="2 12 12 17 22 12" />
                  </svg>
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-ink truncate">{b.name}</p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold uppercase tracking-wider ${
                      b.isActive
                        ? 'border-admin-green/30 text-admin-green bg-admin-green/10'
                        : 'border-border text-ink-faint'
                    }`}>
                      {b.isActive ? 'Active' : 'Archived'}
                    </span>
                  </div>
                  {b.description && (
                    <p className="text-xs text-ink-soft mt-1 line-clamp-2">{b.description}</p>
                  )}
                  <p className="text-[11px] text-ink-faint mt-1.5 flex items-center gap-3 flex-wrap">
                    <span>{formatDateRange(b.startDate, b.endDate)}</span>
                    <span aria-hidden="true">·</span>
                    <span><span className="text-ink font-semibold tabular-nums">{b.approvedCount ?? b.faqCount}</span> {b.approvedCount === 1 ? 'FAQ' : 'FAQs'}</span>
                    {typeof b.approvedCount === 'number' && b.faqCount !== b.approvedCount && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{b.faqCount - b.approvedCount} draft</span>
                      </>
                    )}
                  </p>
                </div>
                <div className="shrink-0 flex items-center gap-1">
                  {formIsOpen && editingId === b._id ? (
                    <span className="text-[10px] text-accent font-semibold uppercase tracking-wider">Editing</span>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => startEdit(b)}
                        className="px-2.5 py-1 rounded-md text-[11px] text-ink-soft hover:text-ink hover:bg-cream transition-colors"
                        title="Edit"
                      >
                        Edit
                      </button>
                      {b.isActive ? (
                        <button
                          type="button"
                          onClick={() => archive(b)}
                          className="px-2.5 py-1 rounded-md text-[11px] text-ink-soft hover:text-ink hover:bg-cream transition-colors"
                          title="Archive (hide from public)"
                        >
                          Archive
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => activate(b)}
                          className="px-2.5 py-1 rounded-md text-[11px] text-admin-green hover:bg-admin-green/10 transition-colors"
                          title="Reactivate"
                        >
                          Reactivate
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => destroy(b)}
                        className="px-2.5 py-1 rounded-md text-[11px] text-admin-red/80 hover:text-admin-red hover:bg-admin-red/10 transition-colors"
                        title="Delete permanently"
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function friendly(err: unknown, fallback: string): string {
  const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
  return typeof msg === 'string' && msg.length > 0 && msg.length < 200 ? msg : fallback;
}

function formatDateRange(start: string, end: string): string {
  try {
    const s = new Date(start);
    const e = new Date(end);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) return '';
    const fmt = (d: Date): string =>
      d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    return `${fmt(s)} – ${fmt(e)}`;
  } catch {
    return '';
  }
}
