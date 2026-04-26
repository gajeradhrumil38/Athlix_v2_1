import React, { useState, useEffect, useCallback } from 'react';
import { format, subDays } from 'date-fns';
import { Activity } from 'lucide-react';
import { whoopService } from '../../services/whoopService';
import { useAuth } from '../../contexts/AuthContext';
import type { WhoopRecovery, WhoopSleep, WhoopCycle } from '../../types/whoop';

type Tab = 'day' | 'week' | 'month';

const TAB_DAYS: Record<Tab, number> = { day: 7, week: 7, month: 30 };

function buildDateRange(days: number) {
  const end = new Date();
  const start = subDays(end, days);
  return { start: start.toISOString(), end: end.toISOString() };
}

function numAvg(arr: number[]): number | null {
  if (!arr.length) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function friendlyError(err: unknown): string {
  const e = err as { status?: number; message?: string };
  if (e?.status === 401) return 'Session expired — reconnect WHOOP in Settings';
  return e?.message ?? 'Failed to load data';
}

// ── Status labels ──────────────────────────────────────────────
function recoveryColor(score: number) {
  if (score >= 67) return '#4ade80';
  if (score >= 34) return '#f59e0b';
  return '#f87171';
}
function recoveryStatus(score: number) {
  if (score >= 67) return 'OPTIMAL';
  if (score >= 34) return 'ADEQUATE';
  return 'LOW';
}
function strainStatus(score: number) {
  if (score >= 18) return 'ALL OUT';
  if (score >= 13) return 'STRENUOUS';
  if (score >= 8) return 'MODERATE';
  return 'LIGHT';
}
function sleepStatus(eff: number) {
  if (eff >= 85) return 'EXCELLENT';
  if (eff >= 70) return 'GOOD';
  return 'POOR';
}

// ── Circular ring gauge ────────────────────────────────────────
type RingProps = {
  value: number | null;
  max: number;
  color: string;
  label: string;
  status: string;
  unit?: string;
  decimals?: number;
};

const Ring: React.FC<RingProps> = ({ value, max, color, label, status, unit, decimals = 0 }) => {
  const r = 36;
  const circumference = 2 * Math.PI * r;
  const progress = value != null ? Math.min(Math.max(value / max, 0), 1) : 0;
  const offset = circumference * (1 - progress);
  const display = value != null ? (decimals > 0 ? value.toFixed(decimals) : Math.round(value).toString()) : '—';

  return (
    <div className="flex flex-col items-center gap-1.5">
      <svg width="96" height="96" viewBox="0 0 96 96">
        {/* Track */}
        <circle cx="48" cy="48" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="7" />
        {/* Progress */}
        <circle
          cx="48" cy="48" r={r}
          fill="none"
          stroke={value != null ? color : 'transparent'}
          strokeWidth="7"
          strokeDasharray={`${circumference}`}
          strokeDashoffset={`${offset}`}
          strokeLinecap="round"
          transform="rotate(-90 48 48)"
          style={{ transition: 'stroke-dashoffset 0.9s ease' }}
        />
        {/* Value */}
        <text
          x="48" y="44"
          textAnchor="middle"
          dominantBaseline="middle"
          fill="white"
          fontSize={display === '—' ? '20' : display.length > 4 ? '14' : display.length > 3 ? '16' : '18'}
          fontWeight="900"
          fontFamily="system-ui, -apple-system, sans-serif"
        >
          {display}
        </text>
        {unit && value != null && (
          <text x="48" y="60" textAnchor="middle" fill="rgba(255,255,255,0.35)" fontSize="8" fontFamily="system-ui">
            {unit}
          </text>
        )}
      </svg>
      <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ color: value != null ? color : 'rgba(255,255,255,0.2)', fontSize: 9, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        {value != null ? status : 'NO DATA'}
      </div>
    </div>
  );
};

// ── Sub-stat pill ──────────────────────────────────────────────
const Stat: React.FC<{ label: string; value: string; color?: string }> = ({ label, value, color }) => (
  <div
    className="flex-1 flex flex-col items-center gap-0.5 rounded-xl py-2.5 px-1"
    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
  >
    <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
      {label}
    </div>
    <div style={{ color: color ?? 'white', fontSize: 14, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
      {value}
    </div>
  </div>
);

// ── Skeleton shimmer ───────────────────────────────────────────
const RingSkeleton: React.FC = () => (
  <div className="flex flex-col items-center gap-1.5">
    <div className="skeleton rounded-full" style={{ width: 96, height: 96 }} />
    <div className="skeleton h-2.5 w-12 rounded" />
    <div className="skeleton h-2 w-10 rounded" />
  </div>
);

/* ── Main dashboard ────────────────────────────────────────── */
export const WhoopDashboard: React.FC = () => {
  const { user } = useAuth();
  const [connected, setConnected] = useState(false);
  const [connectionLoading, setConnectionLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('day');

  const [recovery, setRecovery] = useState<WhoopRecovery[]>([]);
  const [sleep, setSleep] = useState<WhoopSleep[]>([]);
  const [steps, setSteps] = useState<WhoopCycle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) { setConnectionLoading(false); return; }
    whoopService.getConnectionInfo(user.id)
      .then((info) => setConnected(info?.connected ?? false))
      .catch(() => setConnected(false))
      .finally(() => setConnectionLoading(false));
  }, [user?.id]);

  const fetchAll = useCallback(async () => {
    if (!connected || !user?.id) return;
    setLoading(true);
    setError(null);
    try {
      // Refresh the token once before parallel calls — refresh tokens are single-use,
      // so concurrent refreshes would invalidate each other.
      await whoopService.getStoredToken(user.id);

      // Day tab: no date restriction — always get the most recent records regardless of when
      // they were generated (recovery/sleep are scored after waking, may be days old).
      // Week/month: use a date range for trend data.
      const dateArgs = tab === 'day'
        ? ([undefined, undefined] as [undefined, undefined])
        : (() => { const { start, end } = buildDateRange(TAB_DAYS[tab]); return [start, end] as [string, string]; })();

      const [rec, slp, stps] = await Promise.all([
        whoopService.fetchRecovery(...dateArgs),
        whoopService.fetchSleep(...dateArgs),
        whoopService.fetchStepCount(...dateArgs),
      ]);
      setRecovery(rec);
      setSleep(slp);
      setSteps(stps);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }, [connected, tab, user?.id]);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  if (connectionLoading) return null;

  if (!connected) {
    return (
      <div
        className="rounded-2xl border border-dashed p-5 text-center animate-card-enter"
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

  // ── Compute ring values ────────────────────────────────────
  let recoveryVal: number | null = null;
  let strainVal: number | null = null;
  let sleepVal: number | null = null;

  if (tab === 'day') {
    recoveryVal = recovery[0]?.recovery_score ?? null;
    strainVal = steps[0]?.strain_score ?? null;
    sleepVal = sleep[0]?.sleep_performance_percentage ?? null;
  } else {
    recoveryVal = numAvg(recovery.map((r) => r.recovery_score));
    const strainArr = steps.filter((s) => s.strain_score != null).map((s) => s.strain_score!);
    strainVal = numAvg(strainArr);
    sleepVal = numAvg(sleep.map((s) => s.sleep_performance_percentage));
  }

  // ── Sub-stats (day only) ───────────────────────────────────
  const todayRec = recovery[0];
  const todaySleep = sleep[0];
  const todayStep = steps[0];

  const hrv = todayRec?.hrv_rmssd_milli ?? null;
  const rhr = todayRec?.resting_heart_rate ?? null;
  const inBedHours = todaySleep ? (todaySleep.total_in_bed_duration_milli / 3_600_000).toFixed(1) : null;
  const strain = todayStep?.strain_score ?? null;

  // Week/month: compute averages for sub-stats
  const avgRecovery = tab !== 'day' ? numAvg(recovery.map((r) => r.recovery_score)) : null;
  const avgHrv = tab !== 'day' ? numAvg(recovery.map((r) => r.hrv_rmssd_milli)) : null;
  const avgRhr = tab !== 'day' ? numAvg(recovery.map((r) => r.resting_heart_rate)) : null;
  const avgSleep = tab !== 'day' ? numAvg(sleep.map((s) => s.sleep_performance_percentage)) : null;
  const avgStrain = tab !== 'day' ? numAvg(steps.filter((s) => s.strain_score != null).map((s) => s.strain_score!)) : null;
  const lastDate = recovery[0]?.date ? format(new Date(recovery[0].date), 'MMM d') : null;

  return (
    <div
      className="rounded-2xl animate-card-enter overflow-hidden"
      style={{
        background: 'linear-gradient(160deg, #0d1117 0%, #111827 100%)',
        border: '1px solid rgba(255,255,255,0.08)',
        animationDelay: '420ms',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4" style={{ color: '#C8FF00' }} />
          <span style={{ color: 'white', fontSize: 13, fontWeight: 800, letterSpacing: '0.08em' }}>WHOOP</span>
        </div>
        {lastDate && tab === 'day' && (
          <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10 }}>{lastDate}</span>
        )}
      </div>

      {/* Day / Week / Month tabs */}
      <div className="flex border-b mx-4" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
        {(['day', 'week', 'month'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className="flex-1 py-2 text-center transition-colors"
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: tab === t ? 'white' : 'rgba(255,255,255,0.3)',
              borderBottom: tab === t ? '2px solid #C8FF00' : '2px solid transparent',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-4 mt-3 rounded-xl px-3 py-2 text-[11px]" style={{ background: 'rgba(248,113,113,0.1)', color: '#f87171' }}>
          {error} —{' '}
          <button type="button" onClick={() => void fetchAll()} className="underline">
            Retry
          </button>
        </div>
      )}

      {/* Three rings */}
      <div className="flex justify-around px-4 py-5">
        {loading ? (
          <>
            <RingSkeleton />
            <RingSkeleton />
            <RingSkeleton />
          </>
        ) : (
          <>
            <Ring
              value={recoveryVal}
              max={100}
              color={recoveryVal != null ? recoveryColor(recoveryVal) : '#666'}
              label="Recovery"
              status={recoveryVal != null ? recoveryStatus(recoveryVal) : ''}
            />
            <Ring
              value={strainVal}
              max={21}
              color="#C8FF00"
              label="Strain"
              status={strainVal != null ? strainStatus(strainVal) : ''}
              unit="/21"
              decimals={1}
            />
            <Ring
              value={sleepVal}
              max={100}
              color="#60a5fa"
              label="Performance"
              status={sleepVal != null ? sleepStatus(sleepVal) : ''}
              unit="%"
              decimals={1}
            />
          </>
        )}
      </div>

      {/* Sub-stats */}
      {!loading && !error && (
        <div className="px-4 pb-4">
          {tab === 'day' ? (
            <div className="flex gap-2">
              {hrv != null && <Stat label="HRV" value={`${Math.round(hrv)}ms`} color="#a78bfa" />}
              {rhr != null && <Stat label="RHR" value={`${rhr}bpm`} color="#f87171" />}
              {inBedHours && <Stat label="In Bed" value={`${inBedHours}h`} color="#60a5fa" />}
              {strain != null && <Stat label="Strain" value={strain.toFixed(1)} color="#C8FF00" />}
            </div>
          ) : (
            <div className="flex gap-2">
              {avgRecovery != null && <Stat label="Avg Rec" value={`${Math.round(avgRecovery)}`} color={recoveryColor(avgRecovery)} />}
              {avgHrv != null && <Stat label="Avg HRV" value={`${Math.round(avgHrv)}ms`} color="#a78bfa" />}
              {avgRhr != null && <Stat label="Avg RHR" value={`${Math.round(avgRhr)}`} color="#f87171" />}
              {avgSleep != null && <Stat label="Avg Sleep" value={`${Math.round(avgSleep)}%`} color="#60a5fa" />}
              {avgStrain != null && <Stat label="Avg Strain" value={avgStrain.toFixed(1)} color="#C8FF00" />}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
