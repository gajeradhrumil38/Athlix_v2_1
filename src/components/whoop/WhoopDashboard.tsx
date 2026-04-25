import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { format, subDays } from 'date-fns';
import { Activity, Info } from 'lucide-react';
import { whoopService } from '../../services/whoopService';
import type { WhoopRecovery, WhoopSleep, WhoopHeartRate, WhoopCycle } from '../../types/whoop';

const TOKEN_KEY = 'whoop_token';
const CONNECTED_AT_KEY = 'whoop_connected_at';

type DateRange = 7 | 14 | 30;

function toISO(d: Date) {
  return d.toISOString();
}

function dateRange(days: DateRange) {
  const end = new Date();
  const start = subDays(end, days);
  return { start: toISO(start), end: toISO(end) };
}

// Recovery score color: 0–33 red, 34–66 yellow, 67–100 green
function recoveryColor(score: number) {
  if (score >= 67) return '#4ade80'; // green
  if (score >= 34) return '#facc15'; // yellow
  return '#f87171';                  // red
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

      {!loading && error && (
        <div className="text-[11px] text-[var(--red)] space-y-1">
          <p>{error}</p>
          <button onClick={onRetry} className="text-[10px] underline" style={{ color: 'var(--accent)' }}>Retry</button>
        </div>
      )}

      {!loading && !error && (
        <>
          <div className="flex items-end gap-2 mb-2">
            <span
              className="text-[28px] font-black tabular-nums leading-none"
              style={{ color: today ? recoveryColor(today.recovery_score) : 'var(--text-muted)' }}
            >
              {today ? today.recovery_score : '—'}
            </span>
            {today && (
              <span className="text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>/100</span>
            )}
          </div>

          {today && (
            <div className="flex gap-4 mb-2">
              <SubStat label="HRV" value={`${Math.round(today.hrv_rmssd_milli)} ms`} />
              <SubStat label="RHR" value={`${today.resting_heart_rate} bpm`} />
            </div>
          )}

          {chartData.length > 0 && (
            <ResponsiveContainer width="100%" height={60}>
              <AreaChart data={chartData} margin={CHART_MARGIN}>
                <defs>
                  <linearGradient id="recGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 9 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={ChartTooltipStyle} formatter={(v: number) => [`${v}`, 'Score']} />
                <Area type="monotone" dataKey="score" stroke="var(--accent)" strokeWidth={2} fill="url(#recGrad)" dot={false} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}

          {data.length === 0 && (
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
  const chartData = [...data].reverse().map((r) => ({
    label: format(new Date(r.date), 'M/d'),
    eff: r.sleep_efficiency_percentage,
  }));

  const hoursInBed = today
    ? (today.total_in_bed_time_milli / 3_600_000).toFixed(1)
    : null;

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-3">
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] mb-2" style={{ color: 'var(--text-muted)' }}>
        Sleep Efficiency
      </div>

      {loading && <MetricSkeleton />}

      {!loading && error && (
        <div className="text-[11px] text-[var(--red)] space-y-1">
          <p>{error}</p>
          <button onClick={onRetry} className="text-[10px] underline" style={{ color: 'var(--accent)' }}>Retry</button>
        </div>
      )}

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

          {chartData.length > 0 && (
            <ResponsiveContainer width="100%" height={60}>
              <BarChart data={chartData} margin={CHART_MARGIN}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 9 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={ChartTooltipStyle} formatter={(v: number) => [`${v}%`, 'Efficiency']} />
                <Bar dataKey="eff" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={i === chartData.length - 1 ? 'var(--accent)' : 'rgba(200,255,0,0.3)'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}

          {data.length === 0 && (
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
  // Sample every 30th point for chart readability (step=60s → every 30min)
  const chartData = data
    .filter((_, i) => i % 30 === 0)
    .map((r) => ({
      label: format(new Date(r.timestamp), 'HH:mm'),
      bpm: r.heart_rate_bpm,
    }));

  const bpms = data.map((r) => r.heart_rate_bpm).filter(Boolean);
  const min = bpms.length ? Math.min(...bpms) : null;
  const max = bpms.length ? Math.max(...bpms) : null;
  const avg = bpms.length ? Math.round(bpms.reduce((a, b) => a + b, 0) / bpms.length) : null;
  const latest = data[data.length - 1]?.heart_rate_bpm ?? null;

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-3">
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] mb-2" style={{ color: 'var(--text-muted)' }}>
        Heart Rate
      </div>

      {loading && <MetricSkeleton />}

      {!loading && error && (
        <div className="text-[11px] text-[var(--red)] space-y-1">
          <p>{error}</p>
          <button onClick={onRetry} className="text-[10px] underline" style={{ color: 'var(--accent)' }}>Retry</button>
        </div>
      )}

      {!loading && !error && (
        <>
          <div className="flex items-end gap-1 mb-2">
            <span className="text-[28px] font-black tabular-nums leading-none" style={{ color: '#f87171' }}>
              {latest ?? '—'}
            </span>
            {latest !== null && <span className="text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>bpm</span>}
          </div>

          {avg !== null && (
            <div className="flex gap-4 mb-2">
              <SubStat label="Min" value={`${min}`} />
              <SubStat label="Avg" value={`${avg}`} />
              <SubStat label="Max" value={`${max}`} />
            </div>
          )}

          {chartData.length > 0 && (
            <ResponsiveContainer width="100%" height={60}>
              <LineChart data={chartData} margin={CHART_MARGIN}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 9 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <Tooltip contentStyle={ChartTooltipStyle} formatter={(v: number) => [`${v} bpm`, 'HR']} />
                <Line type="monotone" dataKey="bpm" stroke="#f87171" strokeWidth={1.5} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          )}

          {data.length === 0 && (
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
  const [showTooltip, setShowTooltip] = useState(false);
  const today = data[0];
  const chartData = [...data].reverse().map((r) => ({
    label: format(new Date(r.date), 'M/d'),
    steps: r.estimated_steps,
  }));

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--text-muted)' }}>
          Est. Steps
        </span>
        <div className="relative">
          <button
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
            onFocus={() => setShowTooltip(true)}
            onBlur={() => setShowTooltip(false)}
            aria-label="Steps estimation info"
          >
            <Info className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
          </button>
          {showTooltip && (
            <div
              className="absolute bottom-full left-0 mb-1.5 w-[180px] rounded-lg px-2.5 py-2 text-[10px] leading-[1.5] z-10"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
            >
              Estimated from WHOOP strain data. WHOOP doesn't expose step count natively — steps ≈ kilojoules × 23.9
            </div>
          )}
        </div>
      </div>

      {loading && <MetricSkeleton />}

      {!loading && error && (
        <div className="text-[11px] text-[var(--red)] space-y-1">
          <p>{error}</p>
          <button onClick={onRetry} className="text-[10px] underline" style={{ color: 'var(--accent)' }}>Retry</button>
        </div>
      )}

      {!loading && !error && (
        <>
          <div className="text-[28px] font-black tabular-nums leading-none mb-2" style={{ color: 'var(--accent)' }}>
            {today ? today.estimated_steps.toLocaleString() : '—'}
          </div>

          {chartData.length > 0 && (
            <ResponsiveContainer width="100%" height={60}>
              <BarChart data={chartData} margin={CHART_MARGIN}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 9 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={ChartTooltipStyle} formatter={(v: number) => [v.toLocaleString(), 'Est. Steps']} />
                <Bar dataKey="steps" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={i === chartData.length - 1 ? 'var(--accent)' : 'rgba(200,255,0,0.3)'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}

          {data.length === 0 && (
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>No data for this period</p>
          )}
        </>
      )}
    </div>
  );
};

/* ── Main dashboard ────────────────────────────────────────── */
export const WhoopDashboard: React.FC = () => {
  const [token] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [range, setRange] = useState<DateRange>(7);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [recovery, setRecovery] = useState<WhoopRecovery[]>([]);
  const [sleep, setSleep] = useState<WhoopSleep[]>([]);
  const [heartRate, setHeartRate] = useState<WhoopHeartRate[]>([]);
  const [steps, setSteps] = useState<WhoopCycle[]>([]);

  const [loadingFlags, setLoadingFlags] = useState({ recovery: true, sleep: true, hr: true, steps: true });
  const [errors, setErrors] = useState<Record<string, string | null>>({ recovery: null, sleep: null, hr: null, steps: null });

  const setLoading = (key: string, val: boolean) =>
    setLoadingFlags((prev) => ({ ...prev, [key]: val }));

  const setError = (key: string, msg: string | null) =>
    setErrors((prev) => ({ ...prev, [key]: msg }));

  const friendlyError = (err: unknown): string => {
    const e = err as { status?: number; message?: string };
    if (e?.status === 401) return 'Session expired — reconnect WHOOP in Settings';
    if (e?.message) return e.message;
    return 'Failed to load data';
  };

  const fetchAll = useCallback(() => {
    if (!token) return;
    const { start, end } = dateRange(range);

    setLoading('recovery', true);
    setError('recovery', null);
    whoopService.fetchRecovery(token, start, end)
      .then(setRecovery)
      .catch((err) => setError('recovery', friendlyError(err)))
      .finally(() => setLoading('recovery', false));

    setLoading('sleep', true);
    setError('sleep', null);
    whoopService.fetchSleep(token, start, end)
      .then(setSleep)
      .catch((err) => setError('sleep', friendlyError(err)))
      .finally(() => setLoading('sleep', false));

    setLoading('hr', true);
    setError('hr', null);
    whoopService.fetchHeartRate(token, start, end)
      .then(setHeartRate)
      .catch((err) => setError('hr', friendlyError(err)))
      .finally(() => setLoading('hr', false));

    setLoading('steps', true);
    setError('steps', null);
    whoopService.fetchStepCount(token, start, end)
      .then(setSteps)
      .catch((err) => setError('steps', friendlyError(err)))
      .finally(() => setLoading('steps', false));
  }, [token, range]);

  // Debounce range changes by 300ms
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(fetchAll, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [fetchAll]);

  // 401 banner — shown if any metric errored with session expired
  const sessionExpired = Object.values(errors).some((e) => e?.includes('reconnect'));

  if (!token) {
    return (
      <div
        className="rounded-xl border border-dashed p-4 text-center animate-card-enter"
        style={{ borderColor: 'var(--border)', animationDelay: '420ms' }}
      >
        <Activity className="w-6 h-6 mx-auto mb-2 opacity-40" style={{ color: 'var(--accent)' }} />
        <p className="text-[12px] font-medium" style={{ color: 'var(--text-secondary)' }}>WHOOP not connected</p>
        <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
          Add your access token in Settings → Integrations
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2 animate-card-enter" style={{ animationDelay: '420ms' }}>
      {/* Session-expired banner */}
      {sessionExpired && (
        <div className="rounded-xl px-3 py-2.5 text-[11px] font-medium" style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', color: '#f87171' }}>
          WHOOP session expired — reconnect in Settings → Integrations
        </div>
      )}

      {/* Header + date range */}
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
        <RecoveryCard
          data={recovery}
          loading={loadingFlags.recovery}
          error={errors.recovery}
          onRetry={fetchAll}
        />
        <SleepCard
          data={sleep}
          loading={loadingFlags.sleep}
          error={errors.sleep}
          onRetry={fetchAll}
        />
        <HeartRateCard
          data={heartRate}
          loading={loadingFlags.hr}
          error={errors.hr}
          onRetry={fetchAll}
        />
        <StepsCard
          data={steps}
          loading={loadingFlags.steps}
          error={errors.steps}
          onRetry={fetchAll}
        />
      </div>
    </div>
  );
};
