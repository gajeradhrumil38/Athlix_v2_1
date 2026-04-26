import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { format, subDays } from 'date-fns';
import { Activity, Info } from 'lucide-react';
import { whoopService } from '../../services/whoopService';
import { useAuth } from '../../contexts/AuthContext';
import type { WhoopRecovery, WhoopSleep, WhoopHeartRate, WhoopCycle } from '../../types/whoop';

type DateRange = 7 | 14 | 30;

function toISO(d: Date) {
  return d.toISOString();
}

function buildDateRange(days: DateRange) {
  const end = new Date();
  const start = subDays(end, days);
  return { start: toISO(start), end: toISO(end) };
}

// Recovery score color: 0–33 red, 34–66 yellow, 67–100 green
function recoveryColor(score: number) {
  if (score >= 67) return '#4ade80';
  if (score >= 34) return '#facc15';
  return '#f87171';
}

// Moved outside component — no deps, no stale-closure risk
function friendlyError(err: unknown): string {
  const e = err as { status?: number; message?: string };
  if (e?.status === 401) return 'Session expired — reconnect WHOOP in Settings';
  return e?.message ?? 'Failed to load data';
}

const CHART_MARGIN = { top: 4, right: 4, bottom: 0, left: 0 };

const ChartTooltipStyle: React.CSSProperties = {
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  fontSize: 11,
  color: 'var(--text-primary)',
  padding: '4px 8px',
};

// Replaces deprecated Cell: recharts passes entry data into shape props
type BarShapeProps = {
  x?: number; y?: number; width?: number; height?: number; isLatest?: boolean;
};
const AccentBar = ({ x = 0, y = 0, width = 0, height = 0, isLatest }: BarShapeProps) => {
  if (!width || height <= 0) return null;
  return (
    <rect
      x={x} y={y} width={width} height={height}
      fill={isLatest ? 'var(--accent)' : 'rgba(200,255,0,0.3)'}
      rx={3} ry={3}
    />
  );
};

/* ── Skeleton ──────────────────────────────────────────────── */
const MetricSkeleton: React.FC = () => (
  <div className="space-y-2">
    <div className="skeleton h-3 w-16 rounded" />
    <div className="skeleton h-7 w-10 rounded" />
    <div className="skeleton h-[60px] w-full rounded-lg" />
  </div>
);

/* ── Stat box ──────────────────────────────────────────────── */
const SubStat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <div className="text-[9px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--text-muted)' }}>
      {label}
    </div>
    <div className="text-[13px] font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>
      {value}
    </div>
  </div>
);

/* ── Inline error ──────────────────────────────────────────── */
const InlineError: React.FC<{ msg: string; onRetry: () => void }> = ({ msg, onRetry }) => (
  <div className="space-y-1">
    <p className="text-[11px]" style={{ color: 'var(--red)' }}>{msg}</p>
    <button type="button" onClick={onRetry} className="text-[10px] underline" style={{ color: 'var(--accent)' }}>
      Retry
    </button>
  </div>
);

/* ── Recovery card ─────────────────────────────────────────── */
const RecoveryCard: React.FC<{ data: WhoopRecovery[]; loading: boolean; error: string | null; onRetry: () => void }> = ({
  data, loading, error, onRetry,
}) => {
  const today = data[0];
  const chartData = [...data].reverse().map((r) => ({
    label: format(new Date(r.date), 'M/d'),
    score: r.recovery_score,
  }));

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-3">
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] mb-2" style={{ color: 'var(--text-muted)' }}>
        Recovery
      </div>

      {loading && <MetricSkeleton />}
      {!loading && error && <InlineError msg={error} onRetry={onRetry} />}

      {!loading && !error && (
        <>
          <div className="flex items-end gap-2 mb-2">
            <span
              className="text-[28px] font-black tabular-nums leading-none"
              style={{ color: today ? recoveryColor(today.recovery_score) : 'var(--text-muted)' }}
            >
              {today ? today.recovery_score : '—'}
            </span>
            {today && <span className="text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>/100</span>}
          </div>

          {today && (
            <div className="flex gap-4 mb-2">
              <SubStat label="HRV" value={`${Math.round(today.hrv_rmssd_milli)} ms`} />
              <SubStat label="RHR" value={`${today.resting_heart_rate} bpm`} />
            </div>
          )}

          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={60}>
              <AreaChart data={chartData} margin={CHART_MARGIN}>
                <defs>
                  <linearGradient id="whoopRecGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 9 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={ChartTooltipStyle} formatter={(v: number) => [`${v}`, 'Score']} />
                <Area type="monotone" dataKey="score" stroke="var(--accent)" strokeWidth={2} fill="url(#whoopRecGrad)" dot={false} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>No data for this period</p>
          )}
        </>
      )}
    </div>
  );
};

/* ── Sleep card ────────────────────────────────────────────── */
const SleepCard: React.FC<{ data: WhoopSleep[]; loading: boolean; error: string | null; onRetry: () => void }> = ({
  data, loading, error, onRetry,
}) => {
  const today = data[0];
  const chartData = [...data].reverse().map((r, i, arr) => ({
    label: format(new Date(r.date), 'M/d'),
    eff: r.sleep_efficiency_percentage,
    isLatest: i === arr.length - 1,
  }));

  const hoursInBed = today ? (today.total_in_bed_time_milli / 3_600_000).toFixed(1) : null;

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-3">
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] mb-2" style={{ color: 'var(--text-muted)' }}>
        Sleep Efficiency
      </div>

      {loading && <MetricSkeleton />}
      {!loading && error && <InlineError msg={error} onRetry={onRetry} />}

      {!loading && !error && (
        <>
          <div className="flex items-end gap-1 mb-2">
            <span className="text-[28px] font-black tabular-nums leading-none" style={{ color: 'var(--accent)' }}>
              {today ? `${Math.round(today.sleep_efficiency_percentage)}` : '—'}
            </span>
            {today && <span className="text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>%</span>}
          </div>

          {hoursInBed && (
            <div className="mb-2">
              <SubStat label="In Bed" value={`${hoursInBed}h`} />
            </div>
          )}

          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={60}>
              <BarChart data={chartData} margin={CHART_MARGIN}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 9 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={ChartTooltipStyle} formatter={(v: number) => [`${v}%`, 'Efficiency']} />
                <Bar dataKey="eff" isAnimationActive={false} shape={<AccentBar />} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>No data for this period</p>
          )}
        </>
      )}
    </div>
  );
};

/* ── Heart Rate card ───────────────────────────────────────── */
const HeartRateCard: React.FC<{ data: WhoopHeartRate[]; loading: boolean; error: string | null; onRetry: () => void }> = ({
  data, loading, error, onRetry,
}) => {
  // Sample every 30th point (step=60s → one point per 30 min)
  const chartData = data
    .filter((_, i) => i % 30 === 0)
    .map((r) => ({
      label: format(new Date(r.timestamp), 'HH:mm'),
      bpm: r.heart_rate_bpm,
    }));

  const bpms = data.map((r) => r.heart_rate_bpm).filter((v) => v > 0);
  const minBpm = bpms.length ? Math.min(...bpms) : null;
  const maxBpm = bpms.length ? Math.max(...bpms) : null;
  const avgBpm = bpms.length ? Math.round(bpms.reduce((a, b) => a + b, 0) / bpms.length) : null;
  const latest = data[data.length - 1]?.heart_rate_bpm ?? null;

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-3">
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] mb-2" style={{ color: 'var(--text-muted)' }}>
        Heart Rate
      </div>

      {loading && <MetricSkeleton />}
      {!loading && error && <InlineError msg={error} onRetry={onRetry} />}

      {!loading && !error && (
        <>
          <div className="flex items-end gap-1 mb-2">
            <span className="text-[28px] font-black tabular-nums leading-none" style={{ color: '#f87171' }}>
              {latest ?? '—'}
            </span>
            {latest !== null && <span className="text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>bpm</span>}
          </div>

          {/* minBpm/maxBpm/avgBpm are all non-null together — guard once on avgBpm */}
          {avgBpm !== null && minBpm !== null && maxBpm !== null && (
            <div className="flex gap-4 mb-2">
              <SubStat label="Min" value={`${minBpm}`} />
              <SubStat label="Avg" value={`${avgBpm}`} />
              <SubStat label="Max" value={`${maxBpm}`} />
            </div>
          )}

          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={60}>
              <LineChart data={chartData} margin={CHART_MARGIN}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 9 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <Tooltip contentStyle={ChartTooltipStyle} formatter={(v: number) => [`${v} bpm`, 'HR']} />
                <Line type="monotone" dataKey="bpm" stroke="#f87171" strokeWidth={1.5} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>No data for this period</p>
          )}
        </>
      )}
    </div>
  );
};

/* ── Steps card ────────────────────────────────────────────── */
const StepsCard: React.FC<{ data: WhoopCycle[]; loading: boolean; error: string | null; onRetry: () => void }> = ({
  data, loading, error, onRetry,
}) => {
  const [showInfo, setShowInfo] = useState(false);
  const today = data[0];
  const chartData = [...data].reverse().map((r, i, arr) => ({
    label: format(new Date(r.date), 'M/d'),
    steps: r.estimated_steps,
    isLatest: i === arr.length - 1,
  }));

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--text-muted)' }}>
          Est. Steps
        </span>
        <div className="relative">
          <button
            type="button"
            aria-label="Steps estimation info"
            onMouseEnter={() => setShowInfo(true)}
            onMouseLeave={() => setShowInfo(false)}
            onFocus={() => setShowInfo(true)}
            onBlur={() => setShowInfo(false)}
          >
            <Info className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
          </button>
          {showInfo && (
            <div
              className="absolute bottom-full left-0 mb-1.5 w-[180px] rounded-lg px-2.5 py-2 text-[10px] leading-[1.5] z-10"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
            >
              WHOOP doesn't expose step count natively — estimated from strain: steps ≈ kilojoules × 23.9
            </div>
          )}
        </div>
      </div>

      {loading && <MetricSkeleton />}
      {!loading && error && <InlineError msg={error} onRetry={onRetry} />}

      {!loading && !error && (
        <>
          <div className="text-[28px] font-black tabular-nums leading-none mb-2" style={{ color: 'var(--accent)' }}>
            {today ? today.estimated_steps.toLocaleString() : '—'}
          </div>

          {today?.strain_score !== undefined && (
            <div className="mb-2">
              <SubStat label="Strain" value={today.strain_score.toFixed(1)} />
            </div>
          )}

          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={60}>
              <BarChart data={chartData} margin={CHART_MARGIN}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 9 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={ChartTooltipStyle} formatter={(v: number) => [v.toLocaleString(), 'Est. Steps']} />
                <Bar dataKey="steps" isAnimationActive={false} shape={<AccentBar />} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>No data for this period</p>
          )}
        </>
      )}
    </div>
  );
};

/* ── Main dashboard ────────────────────────────────────────── */
export const WhoopDashboard: React.FC = () => {
  const { user } = useAuth();
  const [token, setToken] = useState<string | null>(null);
  const [tokenLoading, setTokenLoading] = useState(true);
  const [range, setRange] = useState<DateRange>(7);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [recovery, setRecovery] = useState<WhoopRecovery[]>([]);
  const [sleep, setSleep] = useState<WhoopSleep[]>([]);
  const [heartRate, setHeartRate] = useState<WhoopHeartRate[]>([]);
  const [steps, setSteps] = useState<WhoopCycle[]>([]);

  // Load token from Supabase (handles auto-refresh via edge function)
  useEffect(() => {
    if (!user?.id) { setTokenLoading(false); return; }
    whoopService.getStoredToken(user.id)
      .then(setToken)
      .catch(() => setToken(null))
      .finally(() => setTokenLoading(false));
  }, [user?.id]);

  // Start false — fetchAll sets them true immediately; avoids stuck skeleton when no token
  const [loadingFlags, setLoadingFlags] = useState({ recovery: false, sleep: false, hr: false, steps: false });
  const [errors, setErrors] = useState<Record<string, string | null>>({ recovery: null, sleep: null, hr: null, steps: null });

  const fetchAll = useCallback(() => {
    if (!token) return;
    const { start, end } = buildDateRange(range);

    // Set all loading at once to avoid four separate re-renders
    setLoadingFlags({ recovery: true, sleep: true, hr: true, steps: true });
    setErrors({ recovery: null, sleep: null, hr: null, steps: null });

    whoopService.fetchRecovery(token, start, end)
      .then(setRecovery)
      .catch((err) => setErrors((prev) => ({ ...prev, recovery: friendlyError(err) })))
      .finally(() => setLoadingFlags((prev) => ({ ...prev, recovery: false })));

    whoopService.fetchSleep(token, start, end)
      .then(setSleep)
      .catch((err) => setErrors((prev) => ({ ...prev, sleep: friendlyError(err) })))
      .finally(() => setLoadingFlags((prev) => ({ ...prev, sleep: false })));

    whoopService.fetchHeartRate(token, start, end)
      .then(setHeartRate)
      .catch((err) => setErrors((prev) => ({ ...prev, hr: friendlyError(err) })))
      .finally(() => setLoadingFlags((prev) => ({ ...prev, hr: false })));

    whoopService.fetchStepCount(token, start, end)
      .then(setSteps)
      .catch((err) => setErrors((prev) => ({ ...prev, steps: friendlyError(err) })))
      .finally(() => setLoadingFlags((prev) => ({ ...prev, steps: false })));
  }, [token, range]);

  // Debounce range changes by 300ms
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(fetchAll, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [fetchAll]);

  const sessionExpired = Object.values(errors).some((e) => e?.includes('reconnect'));

  if (tokenLoading) return null;

  if (!token) {
    return (
      <div
        className="rounded-xl border border-dashed p-4 text-center animate-card-enter"
        style={{ borderColor: 'var(--border)', animationDelay: '420ms' }}
      >
        <Activity className="w-6 h-6 mx-auto mb-2 opacity-40" style={{ color: 'var(--accent)' }} />
        <p className="text-[12px] font-medium" style={{ color: 'var(--text-secondary)' }}>WHOOP not connected</p>
        <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
          Connect your account in Settings → Integrations
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2 animate-card-enter" style={{ animationDelay: '420ms' }}>
      {sessionExpired && (
        <div
          className="rounded-xl px-3 py-2.5 text-[11px] font-medium"
          style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', color: '#f87171' }}
        >
          WHOOP session expired — reconnect in Settings → Integrations
        </div>
      )}

      {/* Header + date range selector */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
          <span className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: 'var(--text-secondary)' }}>
            WHOOP
          </span>
        </div>
        <div className="flex gap-1">
          {([7, 14, 30] as DateRange[]).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setRange(d)}
              className="h-6 px-2 rounded-lg text-[10px] font-bold transition-all"
              style={
                range === d
                  ? { background: 'var(--accent)', color: '#000' }
                  : { background: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px solid var(--border)' }
              }
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* 2×2 metric grid */}
      <div className="grid grid-cols-2 gap-2">
        <RecoveryCard data={recovery} loading={loadingFlags.recovery} error={errors.recovery} onRetry={fetchAll} />
        <SleepCard    data={sleep}    loading={loadingFlags.sleep}    error={errors.sleep}    onRetry={fetchAll} />
        <HeartRateCard data={heartRate} loading={loadingFlags.hr}     error={errors.hr}       onRetry={fetchAll} />
        <StepsCard    data={steps}    loading={loadingFlags.steps}    error={errors.steps}    onRetry={fetchAll} />
      </div>
    </div>
  );
};
