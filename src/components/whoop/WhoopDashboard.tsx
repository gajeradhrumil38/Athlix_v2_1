import React, { useState, useEffect, useCallback } from 'react';
import { format, subDays } from 'date-fns';
import { Activity, X } from 'lucide-react';
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

function recoveryColor(score: number) {
  if (score >= 67) return '#4ade80';
  if (score >= 34) return '#f59e0b';
  return '#f87171';
}

const STAT_INFO: Record<string, { title: string; desc: string }> = {
  HRV: {
    title: 'Heart Rate Variability',
    desc: 'The variation in time between heartbeats. Higher HRV generally indicates better recovery and readiness. WHOOP measures this during sleep.',
  },
  RHR: {
    title: 'Resting Heart Rate',
    desc: 'Your heart rate at complete rest, measured during sleep. A lower RHR typically indicates better cardiovascular fitness and recovery.',
  },
  'IN BED': {
    title: 'Time in Bed',
    desc: 'Total time spent in bed during your last sleep, including time awake in bed. More time in bed doesn\'t always mean better sleep quality.',
  },
  STRAIN: {
    title: 'Strain Score',
    desc: 'A measure of cardiovascular load on a 0–21 scale. Higher strain means more stress on your body. Balance strain with recovery for optimal performance.',
  },
};

// ── Circular ring gauge ────────────────────────────────────────
type RingProps = {
  value: number | null;
  max: number;
  color: string;
  label: string;
  unit?: string;
  decimals?: number;
};

const Ring: React.FC<RingProps> = ({ value, max, color, label, unit, decimals = 0 }) => {
  const size = 116;
  const cx = size / 2;
  const cy = size / 2;
  const r = 48;
  const circumference = 2 * Math.PI * r;
  const progress = value != null ? Math.min(Math.max(value / max, 0), 1) : 0;
  const offset = circumference * (1 - progress);
  const display = value != null ? (decimals > 0 ? value.toFixed(decimals) : Math.round(value).toString()) : '—';
  const numFontSize = display === '—' ? 26 : display.length > 4 ? 18 : display.length > 3 ? 22 : 28;

  return (
    <div className="flex flex-col items-center" style={{ gap: 10 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Track */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="7" />
        {/* Progress */}
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke={value != null ? color : 'transparent'}
          strokeWidth="7"
          strokeDasharray={`${circumference}`}
          strokeDashoffset={`${offset}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: 'stroke-dashoffset 0.9s ease' }}
        />
        {/* Number — shifted up slightly when unit is present */}
        <text
          x={cx}
          y={unit && value != null ? cy - 6 : cy}
          textAnchor="middle"
          dominantBaseline="central"
          fill="white"
          fontSize={numFontSize}
          fontWeight="800"
          fontFamily="system-ui, -apple-system, sans-serif"
        >
          {display}
        </text>
        {/* Unit below number */}
        {unit && value != null && (
          <text
            x={cx} y={cy + numFontSize * 0.72}
            textAnchor="middle"
            dominantBaseline="central"
            fill="rgba(255,255,255,0.55)"
            fontSize="11"
            fontWeight="600"
            fontFamily="system-ui, -apple-system, sans-serif"
          >
            {unit}
          </text>
        )}
      </svg>
      {/* Label */}
      <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
        {label} <span style={{ opacity: 0.5 }}>›</span>
      </div>
    </div>
  );
};

// ── Sub-stat pill with info icon ───────────────────────────────
const Stat: React.FC<{ label: string; value: string; color?: string; onInfo: () => void }> = ({ label, value, color, onInfo }) => (
  <div
    className="flex-1 flex flex-col items-center gap-1 rounded-xl py-2.5 px-1 relative"
    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
  >
    <button
      type="button"
      onClick={onInfo}
      className="absolute top-1.5 right-1.5 flex items-center justify-center"
      style={{ color: 'rgba(255,255,255,0.2)', lineHeight: 1 }}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
        <circle cx="5" cy="5" r="4.5" stroke="currentColor" strokeWidth="0.8" />
        <text x="5" y="7" textAnchor="middle" fill="currentColor" fontSize="6" fontWeight="700" fontFamily="system-ui">i</text>
      </svg>
    </button>
    <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
      {label}
    </div>
    <div style={{ color: color ?? 'white', fontSize: 14, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
      {value}
    </div>
  </div>
);

// ── Info popup ─────────────────────────────────────────────────
const InfoPopup: React.FC<{ stat: string; onClose: () => void }> = ({ stat, onClose }) => {
  const info = STAT_INFO[stat];
  if (!info) return null;
  return (
    <div
      className="absolute inset-x-4 bottom-4 rounded-2xl p-4 z-10"
      style={{ background: 'rgba(20,24,33,0.98)', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(12px)' }}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <span style={{ color: 'white', fontSize: 13, fontWeight: 700 }}>{info.title}</span>
        <button type="button" onClick={onClose} style={{ color: 'rgba(255,255,255,0.4)', flexShrink: 0 }}>
          <X size={14} />
        </button>
      </div>
      <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, lineHeight: 1.6 }}>{info.desc}</p>
    </div>
  );
};

// ── Skeleton shimmer ───────────────────────────────────────────
const RingSkeleton: React.FC = () => (
  <div className="flex flex-col items-center" style={{ gap: 10 }}>
    <div className="skeleton rounded-full" style={{ width: 116, height: 116 }} />
    <div className="skeleton h-2.5 w-16 rounded" />
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
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeInfo, setActiveInfo] = useState<string | null>(null);

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
      const { start, end } = tab === 'day' ? { start: undefined, end: undefined } : buildDateRange(TAB_DAYS[tab]);
      const result = await whoopService.fetchAll(tab, start, end);
      setRecovery(result.recovery);
      setSleep(result.sleep);
      setSteps(result.cycles);
      setStale(result.fromCache);
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

  const todayRec = recovery[0];
  const todaySleep = sleep[0];
  const todayStep = steps[0];

  const hrv = todayRec?.hrv_rmssd_milli ?? null;
  const rhr = todayRec?.resting_heart_rate ?? null;
  const inBedHours = todaySleep ? (todaySleep.total_in_bed_time_milli / 3_600_000).toFixed(1) : null;
  const strain = todayStep?.strain_score ?? null;

  const avgRecovery = tab !== 'day' ? numAvg(recovery.map((r) => r.recovery_score)) : null;
  const avgHrv = tab !== 'day' ? numAvg(recovery.map((r) => r.hrv_rmssd_milli)) : null;
  const avgRhr = tab !== 'day' ? numAvg(recovery.map((r) => r.resting_heart_rate)) : null;
  const avgSleep = tab !== 'day' ? numAvg(sleep.map((s) => s.sleep_performance_percentage)) : null;
  const avgStrain = tab !== 'day' ? numAvg(steps.filter((s) => s.strain_score != null).map((s) => s.strain_score!)) : null;
  const lastDate = recovery[0]?.date ? format(new Date(recovery[0].date), 'MMM d') : null;

  const hasSubStats = tab === 'day'
    ? (hrv != null || rhr != null || inBedHours != null || strain != null)
    : (avgRecovery != null || avgHrv != null || avgRhr != null || avgSleep != null || avgStrain != null);

  return (
    <div
      className="rounded-2xl animate-card-enter overflow-hidden relative"
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
        <div className="flex items-center gap-2">
          {lastDate && tab === 'day' && (
            <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10 }}>{lastDate}</span>
          )}
          {stale && !loading && (
            <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 9, letterSpacing: '0.05em' }}>cached</span>
          )}
        </div>
      </div>

      {/* Tabs */}
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

      {/* Error */}
      {error && (
        <div className="mx-4 mt-3 rounded-xl px-3 py-2 text-[11px]" style={{ background: 'rgba(248,113,113,0.1)', color: '#f87171' }}>
          {error} —{' '}
          <button type="button" onClick={() => void fetchAll()} className="underline">Retry</button>
        </div>
      )}

      {/* Rings */}
      <div className="flex justify-around px-3 py-4">
        {loading ? (
          <>
            <RingSkeleton />
            <RingSkeleton />
            <RingSkeleton />
          </>
        ) : (
          <>
            <Ring
              value={sleepVal}
              max={100}
              color="#60a5fa"
              label="Sleep"
              unit="%"
              decimals={1}
            />
            <Ring
              value={recoveryVal}
              max={100}
              color={recoveryVal != null ? recoveryColor(recoveryVal) : '#666'}
              label="Recovery"
              unit="%"
            />
            <Ring
              value={strainVal}
              max={21}
              color="#C8FF00"
              label="Strain"
              unit="/ 21"
              decimals={1}
            />
          </>
        )}
      </div>

      {/* Sub-stats */}
      {!loading && !error && hasSubStats && (
        <div className="px-4 pb-4">
          {tab === 'day' ? (
            <div className="flex gap-2">
              {hrv != null && <Stat label="HRV" value={`${Math.round(hrv)}ms`} color="#a78bfa" onInfo={() => setActiveInfo('HRV')} />}
              {rhr != null && <Stat label="RHR" value={`${rhr}bpm`} color="#f87171" onInfo={() => setActiveInfo('RHR')} />}
              {inBedHours && <Stat label="In Bed" value={`${inBedHours}h`} color="#60a5fa" onInfo={() => setActiveInfo('IN BED')} />}
              {strain != null && <Stat label="Strain" value={strain.toFixed(1)} color="#C8FF00" onInfo={() => setActiveInfo('STRAIN')} />}
            </div>
          ) : (
            <div className="flex gap-2">
              {avgHrv != null && <Stat label="Avg HRV" value={`${Math.round(avgHrv)}ms`} color="#a78bfa" onInfo={() => setActiveInfo('HRV')} />}
              {avgRhr != null && <Stat label="Avg RHR" value={`${Math.round(avgRhr)}`} color="#f87171" onInfo={() => setActiveInfo('RHR')} />}
              {avgSleep != null && <Stat label="Avg Sleep" value={`${Math.round(avgSleep)}%`} color="#60a5fa" onInfo={() => setActiveInfo('IN BED')} />}
              {avgStrain != null && <Stat label="Avg Strain" value={avgStrain.toFixed(1)} color="#C8FF00" onInfo={() => setActiveInfo('STRAIN')} />}
            </div>
          )}
        </div>
      )}

      {/* Info popup overlay */}
      {activeInfo && (
        <InfoPopup stat={activeInfo} onClose={() => setActiveInfo(null)} />
      )}
    </div>
  );
};
