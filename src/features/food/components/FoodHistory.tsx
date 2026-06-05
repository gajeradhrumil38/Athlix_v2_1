import React, { useCallback, useEffect, useRef, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Search, SlidersHorizontal, Trash2, X, ChevronRight, UtensilsCrossed } from 'lucide-react';
import type { FoodScan } from '../types';
import { deleteFoodScan, getFoodScans } from '../../../lib/foodData';
import { deleteFoodImage } from '../services/foodRecognition.service';
import { useAuth } from '../../../contexts/AuthContext';

interface Props {
  onViewDetail: (scan: FoodScan) => void;
}

// ── Skeleton loader ──────────────────────────────────────────────────────────

const SkeletonRow: React.FC = () => (
  <div className="flex items-center gap-4 px-4 py-3.5 animate-pulse">
    <div className="w-16 h-16 rounded-xl shrink-0" style={{ background: 'rgba(255,255,255,0.06)' }} />
    <div className="flex-1 space-y-2">
      <div className="h-3 rounded" style={{ background: 'rgba(255,255,255,0.06)', width: '50%' }} />
      <div className="h-2.5 rounded" style={{ background: 'rgba(255,255,255,0.04)', width: '70%' }} />
    </div>
    <div className="h-7 w-14 rounded-xl" style={{ background: 'rgba(255,255,255,0.06)' }} />
  </div>
);

// ── Single history row ───────────────────────────────────────────────────────

const HistoryRow: React.FC<{
  scan: FoodScan;
  onView: () => void;
  onDelete: () => void;
  deleting: boolean;
}> = ({ scan, onView, onDelete, deleting }) => {
  const topFoods = scan.foods_detected.slice(0, 2).map((f) => f.name).join(', ');
  const extra = scan.foods_detected.length > 2 ? ` +${scan.foods_detected.length - 2} more` : '';

  return (
    <button onClick={onView}
      className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-white/5 transition-colors"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>

      {/* Thumbnail */}
      <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0"
        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
        {scan.thumbnail_url || scan.image_url ? (
          <img src={scan.thumbnail_url ?? scan.image_url!} alt=""
            className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <UtensilsCrossed className="w-6 h-6" style={{ color: 'rgba(255,255,255,0.2)' }} />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-semibold" style={{ color: 'rgba(255,255,255,0.4)' }}>
          {format(parseISO(scan.scan_date), 'EEE d MMM · h:mm a')}
        </p>
        <p className="text-[13px] font-bold mt-0.5 truncate" style={{ color: '#fff' }}>
          {topFoods || 'No foods logged'}
          {extra && <span style={{ color: 'rgba(255,255,255,0.35)' }}>{extra}</span>}
        </p>
        <div className="flex items-center gap-2 mt-1">
          {[
            { label: 'P', val: scan.total_protein,  color: '#60a5fa' },
            { label: 'C', val: scan.total_carbs,    color: '#fbbf24' },
            { label: 'F', val: scan.total_fat,      color: '#f87171' },
          ].map(({ label, val, color }) => (
            <span key={label} className="text-[10px] font-semibold" style={{ color }}>
              {label} {(val ?? 0).toFixed(0)}g
            </span>
          ))}
        </div>
      </div>

      {/* Calories + chevron */}
      <div className="flex items-center gap-1 shrink-0">
        <div className="text-right">
          <p className="text-[22px] font-black tabular-nums leading-none" style={{ color: '#C8FF00' }}>
            {scan.total_calories}
          </p>
          <p className="text-[9px] uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>kcal</p>
        </div>
        <ChevronRight className="w-4 h-4 ml-1" style={{ color: 'rgba(255,255,255,0.2)' }} />
      </div>

      {/* Delete (shown as overlay on long-press / swipe — here via separate button on detail) */}
    </button>
  );
};

// ── Filters bar ──────────────────────────────────────────────────────────────

interface Filters { calMin: number; calMax: number; dateFrom: string; dateTo: string; }
const DEFAULT_FILTERS: Filters = { calMin: 0, calMax: 9999, dateFrom: '', dateTo: '' };

const FiltersSheet: React.FC<{
  filters: Filters;
  onChange: (f: Filters) => void;
  onClose: () => void;
}> = ({ filters, onChange, onClose }) => {
  const [local, setLocal] = useState(filters);
  const apply = () => { onChange(local); onClose(); };
  const reset = () => { setLocal(DEFAULT_FILTERS); onChange(DEFAULT_FILTERS); onClose(); };
  const field = (label: string, node: React.ReactNode) => (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: 'rgba(255,255,255,0.3)' }}>{label}</p>
      {node}
    </div>
  );
  const inp = (val: string | number, key: keyof Filters, type = 'number') => (
    <input type={type} value={val}
      onChange={(e) => setLocal((p) => ({ ...p, [key]: type === 'number' ? Number(e.target.value) : e.target.value }))}
      className="w-full px-3 py-2.5 rounded-xl text-[13px] focus:outline-none"
      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', caretColor: '#C8FF00' }}
    />
  );
  return (
    <div className="fixed inset-0 z-[300] flex items-end justify-center"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}>
      <div className="w-full max-w-[480px] rounded-t-[24px] pb-[max(20px,env(safe-area-inset-bottom))]"
        style={{ background: '#111419', border: '1px solid rgba(255,255,255,0.1)' }}>
        <div className="w-9 h-1 rounded-full mx-auto mt-4 mb-5 opacity-30" style={{ background: '#fff' }} />
        <div className="flex items-center justify-between px-5 mb-5">
          <p className="text-[16px] font-bold" style={{ color: '#fff' }}>Filter Scans</p>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.08)' }}>
            <X className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.5)' }} />
          </button>
        </div>
        <div className="px-5 space-y-4 pb-5">
          <div className="grid grid-cols-2 gap-3">
            {field('Min calories', inp(local.calMin, 'calMin'))}
            {field('Max calories', inp(local.calMax === 9999 ? '' : local.calMax, 'calMax'))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {field('From date', inp(local.dateFrom, 'dateFrom', 'date'))}
            {field('To date',   inp(local.dateTo,   'dateTo',   'date'))}
          </div>
          <button onClick={apply}
            className="w-full py-3.5 rounded-xl text-[14px] font-bold text-black active:scale-[0.98] transition-all"
            style={{ background: '#C8FF00' }}>
            Apply Filters
          </button>
          <button onClick={reset}
            className="w-full py-3 text-[13px] font-semibold active:scale-[0.98] transition-all"
            style={{ color: 'rgba(255,255,255,0.4)' }}>
            Clear All Filters
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Delete confirmation ──────────────────────────────────────────────────────

const DeleteConfirm: React.FC<{
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}> = ({ onConfirm, onCancel, loading }) => (
  <div className="fixed inset-0 z-[400] flex items-center justify-center px-6"
    style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)' }}>
    <div className="w-full max-w-[320px] rounded-2xl p-6 text-center"
      style={{ background: '#16191F', border: '1px solid rgba(255,255,255,0.1)' }}>
      <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4"
        style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)' }}>
        <Trash2 className="w-5 h-5" style={{ color: '#f87171' }} />
      </div>
      <p className="text-[16px] font-bold mb-1" style={{ color: '#fff' }}>Delete this scan?</p>
      <p className="text-[12px] mb-5" style={{ color: 'rgba(255,255,255,0.4)' }}>This can't be undone.</p>
      <div className="flex gap-3">
        <button onClick={onCancel}
          className="flex-1 py-3 rounded-xl text-[13px] font-semibold"
          style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)' }}>
          Cancel
        </button>
        <button onClick={onConfirm} disabled={loading}
          className="flex-1 py-3 rounded-xl text-[13px] font-bold disabled:opacity-50"
          style={{ background: '#f87171', color: '#000' }}>
          {loading ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </div>
  </div>
);

// ── Main FoodHistory ─────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

export const FoodHistory: React.FC<Props> = ({ onViewDetail }) => {
  const { user } = useAuth();

  const [scans, setScans]             = useState<FoodScan[]>([]);
  const [loading, setLoading]         = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [total, setTotal]             = useState(0);
  const [page, setPage]               = useState(0);

  const [query, setQuery]             = useState('');
  const [filters, setFilters]         = useState<Filters>(DEFAULT_FILTERS);
  const [showFilters, setShowFilters] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<FoodScan | null>(null);
  const [deleting, setDeleting]         = useState(false);

  const loaderRef = useRef<HTMLDivElement>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────

  const load = useCallback(async (pg: number, replace: boolean) => {
    if (!user) return;
    pg === 0 ? setLoading(true) : setLoadingMore(true);
    try {
      const { scans: newScans, total: t } = await getFoodScans(user.id, pg, PAGE_SIZE);
      setScans((prev) => replace ? newScans : [...prev, ...newScans]);
      setTotal(t);
    } catch { /* silent */ }
    finally { pg === 0 ? setLoading(false) : setLoadingMore(false); }
  }, [user]);

  useEffect(() => { load(0, true); }, [load]);

  // ── Infinite scroll ────────────────────────────────────────────────────

  useEffect(() => {
    const el = loaderRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !loadingMore && scans.length < total) {
        const next = page + 1;
        setPage(next);
        load(next, false);
      }
    }, { threshold: 0.5 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [load, loadingMore, page, scans.length, total]);

  // ── Delete ─────────────────────────────────────────────────────────────

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteFoodScan(deleteTarget.id);
      // Also clean up images from storage (best-effort)
      if (deleteTarget.image_url)     deleteFoodImage(deleteTarget.image_url);
      if (deleteTarget.thumbnail_url) deleteFoodImage(deleteTarget.thumbnail_url);
      setScans((prev) => prev.filter((s) => s.id !== deleteTarget.id));
      setTotal((t) => t - 1);
    } catch { /* silent */ }
    finally { setDeleting(false); setDeleteTarget(null); }
  };

  // ── Client-side filtering + search ─────────────────────────────────────

  const visible = scans.filter((s) => {
    if (query) {
      const q = query.toLowerCase();
      const match =
        s.foods_detected.some((f) => f.name.toLowerCase().includes(q)) ||
        format(parseISO(s.scan_date), 'EEE d MMM yyyy').toLowerCase().includes(q);
      if (!match) return false;
    }
    if (s.total_calories < filters.calMin || s.total_calories > filters.calMax) return false;
    // Compare date-only portions (YYYY-MM-DD) to avoid timezone/format mismatches
    const scanDay = s.scan_date.slice(0, 10);
    if (filters.dateFrom && scanDay < filters.dateFrom) return false;
    if (filters.dateTo   && scanDay > filters.dateTo)   return false;
    return true;
  });

  const hasFilters = filters.calMin > 0 || filters.calMax < 9999 || !!filters.dateFrom || !!filters.dateTo;

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Search + filter bar */}
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'rgba(255,255,255,0.3)' }} />
          <input value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search foods or dates…"
            className="w-full pl-9 pr-3 py-2.5 rounded-xl text-[13px] focus:outline-none"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', caretColor: '#C8FF00' }}
          />
        </div>
        <button onClick={() => setShowFilters(true)}
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all active:scale-90"
          style={{
            background: hasFilters ? 'rgba(200,255,0,0.12)' : 'rgba(255,255,255,0.06)',
            border: `1px solid ${hasFilters ? 'rgba(200,255,0,0.3)' : 'rgba(255,255,255,0.1)'}`,
          }}>
          <SlidersHorizontal className="w-4 h-4" style={{ color: hasFilters ? '#C8FF00' : 'rgba(255,255,255,0.5)' }} />
        </button>
      </div>

      {/* Results count */}
      {!loading && (
        <p className="text-[11px] font-semibold mb-3" style={{ color: 'rgba(255,255,255,0.3)' }}>
          {visible.length} of {total} scan{total !== 1 ? 's' : ''}
          {hasFilters && ' (filtered)'}
        </p>
      )}

      {/* List */}
      <div className="rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(160deg,#16191F,#111419)', border: '1px solid rgba(255,255,255,0.08)' }}>
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <UtensilsCrossed className="w-10 h-10 mb-4" style={{ color: 'rgba(255,255,255,0.15)' }} />
            <p className="text-[15px] font-bold" style={{ color: 'rgba(255,255,255,0.5)' }}>No scans yet</p>
            <p className="text-[12px] mt-1" style={{ color: 'rgba(255,255,255,0.3)' }}>
              {hasFilters || query ? 'Try different filters or search terms.' : 'Scan your first meal to start tracking.'}
            </p>
          </div>
        ) : (
          visible.map((scan) => (
            <HistoryRow
              key={scan.id}
              scan={scan}
              onView={() => onViewDetail(scan)}
              onDelete={() => setDeleteTarget(scan)}
              deleting={deleteTarget?.id === scan.id && deleting}
            />
          ))
        )}

        {/* Infinite scroll trigger */}
        <div ref={loaderRef} style={{ height: 1 }} />
        {loadingMore && (
          <div className="py-4 flex justify-center">
            <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
              style={{ borderColor: 'rgba(200,255,0,0.5)', borderTopColor: 'transparent' }} />
          </div>
        )}
      </div>

      {showFilters && (
        <FiltersSheet filters={filters} onChange={setFilters} onClose={() => setShowFilters(false)} />
      )}
      {deleteTarget && (
        <DeleteConfirm
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
          loading={deleting}
        />
      )}
    </div>
  );
};
