import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';
import {
  Moon, Scale, Activity, LogOut, LayoutDashboard,
  ChevronRight, Trash2, Dumbbell, User, Save, Loader2, CheckCircle, XCircle,
} from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { convertWeight, type WeightUnit } from '../lib/units';
import { whoopService } from '../services/whoopService';

/* ── WHOOP connect sub-section ─────────────────────────────── */
const WhoopConnect: React.FC<{ userId: string }> = ({ userId }) => {
  const [status, setStatus] = useState<'loading' | 'connected' | 'disconnected'>('loading');
  const [connectedAt, setConnectedAt] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  // Load connection status from Supabase
  useEffect(() => {
    if (!userId) return;
    whoopService.getConnectionInfo(userId).then((info) => {
      if (info?.connected) {
        setStatus('connected');
        setConnectedAt(info.connectedAt ?? null);
      } else {
        setStatus('disconnected');
      }
    });
  }, [userId]);

  // Handle OAuth redirect result (?whoop=connected or ?whoop=error)
  useEffect(() => {
    const result = searchParams.get('whoop');
    const msg = searchParams.get('msg');
    if (!result) return;

    if (result === 'connected') {
      toast.success('WHOOP connected successfully');
      setStatus('connected');
      whoopService.getConnectionInfo(userId).then((info) => {
        if (info?.connectedAt) setConnectedAt(info.connectedAt);
      });
    } else if (result === 'error') {
      toast.error(msg ? decodeURIComponent(msg) : 'WHOOP connection failed');
    }

    // Clear params so toast doesn't re-fire on refresh
    setSearchParams({}, { replace: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConnect = () => {
    window.location.href = whoopService.buildAuthUrl(userId);
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await whoopService.disconnect(userId);
      setStatus('disconnected');
      setConnectedAt(null);
      toast.success('WHOOP disconnected');
    } catch {
      toast.error('Failed to disconnect');
    } finally {
      setDisconnecting(false);
    }
  };

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div className="px-5 py-4 space-y-3">
      {/* Connection status row */}
      <div className="flex items-center gap-2">
        {status === 'loading' && <Loader2 className="w-4 h-4 animate-spin shrink-0" style={{ color: 'var(--text-muted)' }} />}
        {status === 'connected' && <CheckCircle className="w-4 h-4 shrink-0" style={{ color: '#4ade80' }} />}
        {status === 'disconnected' && <XCircle className="w-4 h-4 shrink-0" style={{ color: 'var(--text-muted)' }} />}
        <span className="text-[13px] font-medium" style={{ color: status === 'connected' ? '#4ade80' : 'var(--text-secondary)' }}>
          {status === 'loading' ? 'Checking…' : status === 'connected' ? 'Connected' : 'Not connected'}
        </span>
        {status === 'connected' && connectedAt && (
          <span className="text-[11px] ml-auto" style={{ color: 'var(--text-muted)' }}>
            since {fmtDate(connectedAt)}
          </span>
        )}
      </div>

      {status === 'disconnected' && (
        <>
          <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
            Connect your WHOOP account to sync Recovery, Sleep, Heart Rate, Steps &amp; Strain.
          </p>
          <button
            type="button"
            onClick={handleConnect}
            className="w-full h-10 rounded-xl bg-[var(--accent)] text-black text-[13px] font-bold flex items-center justify-center gap-2 transition-opacity"
          >
            <Activity className="w-4 h-4" />
            Connect with WHOOP
          </button>
        </>
      )}

      {status === 'connected' && (
        <button
          type="button"
          onClick={() => void handleDisconnect()}
          disabled={disconnecting}
          className="w-full h-10 rounded-xl border text-[13px] font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-40"
          style={{ borderColor: 'rgba(248,113,113,0.3)', color: 'rgba(248,113,113,0.8)' }}
        >
          {disconnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
          Disconnect WHOOP
        </button>
      )}
    </div>
  );
};

/* ── Reusable sub-components ───────────────────────────── */

const SectionCard: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="glass-card overflow-hidden">
    <div className="px-5 py-3 border-b border-[var(--border)]">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
        {title}
      </h3>
    </div>
    <div className="divide-y divide-[var(--border)]">{children}</div>
  </section>
);

const Row: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`flex items-center justify-between gap-4 px-5 py-4 ${className}`}>
    {children}
  </div>
);

const RowLabel: React.FC<{ icon: React.ReactNode; title: string; subtitle?: string }> = ({ icon, title, subtitle }) => (
  <div className="flex items-center gap-3 min-w-0">
    <span className="shrink-0 flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--bg-elevated)] text-[var(--text-secondary)]">
      {icon}
    </span>
    <div className="min-w-0">
      <p className="text-[14px] font-medium text-[var(--text-primary)] truncate">{title}</p>
      {subtitle && <p className="text-[12px] text-[var(--text-muted)] truncate mt-0.5">{subtitle}</p>}
    </div>
  </div>
);

const Toggle: React.FC<{ on: boolean; onToggle: () => void; disabled?: boolean; label: string }> = ({
  on, onToggle, disabled, label,
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={on}
    aria-label={label}
    onClick={onToggle}
    disabled={disabled}
    className={`toggle-track ${on ? 'on' : ''} disabled:opacity-40`}
  >
    <span className="toggle-thumb" />
  </button>
);

const SegmentControl: React.FC<{
  options: string[];
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}> = ({ options, value, onChange, disabled }) => (
  <div className="segment-control">
    {options.map((opt) => (
      <button
        key={opt}
        type="button"
        disabled={disabled}
        onClick={() => onChange(opt)}
        className={`${value === opt ? 'active' : ''} disabled:opacity-40`}
      >
        {opt}
      </button>
    ))}
  </div>
);

/* ── Main Settings page ────────────────────────────────── */

export const Settings: React.FC = () => {
  const { user, profile, loading, signOut, deleteAccount, updateProfile: saveProfileUpdate } = useAuth();
  const navigate = useNavigate();
  const [draftProfile, setDraftProfile] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [nameChanged, setNameChanged] = useState(false);
  const [metricsChanged, setMetricsChanged] = useState(false);

  useEffect(() => {
    setDraftProfile(profile);
    setNameChanged(false);
    setMetricsChanged(false);
  }, [profile]);

  /* ── BMI ─────────────────────────────────────── */
  const bmi = (() => {
    const bwKg = draftProfile?.body_weight == null ? null
      : draftProfile.body_weight_unit === 'lbs'
        ? Number(draftProfile.body_weight) * 0.45359237
        : Number(draftProfile.body_weight);
    const hM = draftProfile?.height_feet != null && draftProfile?.height_inches != null
      ? ((Number(draftProfile.height_feet) * 12) + Number(draftProfile.height_inches)) * 0.0254
      : null;
    return bwKg && hM && hM > 0 ? bwKg / (hM * hM) : null;
  })();

  /* ── Save helpers ────────────────────────────── */
  const save = async (updates: Record<string, any>, successMsg: string) => {
    setSaving(true);
    try {
      await saveProfileUpdate(updates);
      toast.success(successMsg);
    } catch {
      toast.error('Failed to save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const saveName = () => {
    if (!nameChanged) return;
    save({ full_name: draftProfile?.full_name }, 'Name updated');
    setNameChanged(false);
  };

  const saveMetrics = () => {
    if (!metricsChanged) return;
    save(
      {
        body_weight: draftProfile?.body_weight ?? null,
        body_weight_unit: draftProfile?.body_weight_unit || 'kg',
        height_feet: draftProfile?.height_feet ?? null,
        height_inches: draftProfile?.height_inches ?? null,
      },
      'Body metrics saved',
    );
    setMetricsChanged(false);
  };

  const handleUnitChange = (unit: string) =>
    save({ unit_preference: unit }, `Weight unit → ${unit}`);

  const handleThemeChange = (theme: string) =>
    save({ theme_preference: theme }, `Theme → ${theme}`);

  const handleToggle = (field: string, current: boolean) =>
    save({ [field]: !current }, 'Setting updated');

  const handleBodyWeightUnitChange = (nextUnit: WeightUnit) => {
    setDraftProfile((prev: any) => {
      if (!prev || prev.body_weight_unit === nextUnit) return prev;
      const nextWeight =
        prev.body_weight == null
          ? null
          : convertWeight(Number(prev.body_weight), prev.body_weight_unit, nextUnit, 0.1);
      return { ...prev, body_weight: nextWeight, body_weight_unit: nextUnit };
    });
    setMetricsChanged(true);
  };

  /* ── Delete account ──────────────────────────── */
  const handleDeleteAccount = async () => {
    if (!user) return;
    const confirmed = window.confirm(
      'Delete your account and all data permanently? This cannot be undone.',
    );
    if (!confirmed) return;
    try {
      await deleteAccount();
      toast.success('Account deleted');
      navigate('/auth', { replace: true });
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete account');
    }
  };

  /* ── Loading skeleton ────────────────────────── */
  if (loading || !draftProfile) {
    return (
      <div className="max-w-lg mx-auto space-y-4 pb-10">
        <div className="skeleton h-7 w-32 rounded-xl" />
        <div className="skeleton h-28 rounded-2xl" />
        <div className="skeleton h-48 rounded-2xl" />
        <div className="skeleton h-40 rounded-2xl" />
      </div>
    );
  }

  /* ── Avatar initial ──────────────────────────── */
  const initial = draftProfile?.full_name?.trim().charAt(0).toUpperCase() || 'A';

  return (
    <div className="max-w-lg mx-auto space-y-4 pb-10 animate-fade-in">
      <h1 className="text-[22px] font-bold text-[var(--text-primary)]">Settings</h1>

      {/* ── Profile card ──────────────────────── */}
      <SectionCard title="Profile">
        {/* Avatar + info */}
        <div className="px-5 py-5 flex items-center gap-4">
          <div
            className="h-14 w-14 rounded-2xl flex items-center justify-center text-[22px] font-bold shrink-0 border border-[var(--accent)]/25"
            style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}
          >
            {initial}
          </div>
          <div className="min-w-0">
            <p className="text-[16px] font-semibold text-[var(--text-primary)] truncate">
              {draftProfile?.full_name || 'Athlete'}
            </p>
            <p className="text-[13px] text-[var(--text-muted)] truncate">{user?.email}</p>
          </div>
        </div>

        {/* Display name input */}
        <div className="px-5 pb-5">
          <label className="block text-[12px] font-medium text-[var(--text-muted)] mb-1.5">
            Display name
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={draftProfile?.full_name || ''}
              onChange={(e) => {
                setDraftProfile({ ...draftProfile, full_name: e.target.value });
                setNameChanged(true);
              }}
              onKeyDown={(e) => e.key === 'Enter' && saveName()}
              className="flex-1 h-10 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl px-3.5 text-[14px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]/60 transition-colors"
              placeholder="Your name"
            />
            <button
              onClick={saveName}
              disabled={saving || !nameChanged}
              className="h-10 px-4 rounded-xl bg-[var(--accent)] text-black text-[13px] font-bold flex items-center gap-1.5 disabled:opacity-40 transition-opacity"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save
            </button>
          </div>
        </div>
      </SectionCard>

      {/* ── Preferences ───────────────────────── */}
      <SectionCard title="Preferences">
        {/* Dashboard layout */}
        <Link to="/settings/layout" className="block group">
          <Row className="hover:bg-[var(--bg-elevated)] transition-colors cursor-pointer">
            <RowLabel
              icon={<LayoutDashboard className="w-4 h-4" />}
              title="Dashboard Layout"
              subtitle="Customize home screen widgets"
            />
            <ChevronRight className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--accent)] transition-colors shrink-0" />
          </Row>
        </Link>

        {/* Weight unit */}
        <Row>
          <RowLabel
            icon={<Scale className="w-4 h-4" />}
            title="Weight Unit"
            subtitle="Applies to all logging & history"
          />
          <SegmentControl
            options={['kg', 'lbs']}
            value={draftProfile?.unit_preference || 'kg'}
            onChange={handleUnitChange}
            disabled={saving}
          />
        </Row>

        {/* Theme */}
        <Row>
          <RowLabel
            icon={<Moon className="w-4 h-4" />}
            title="Theme"
            subtitle="App appearance"
          />
          <SegmentControl
            options={['dark', 'darker']}
            value={draftProfile?.theme_preference || 'dark'}
            onChange={handleThemeChange}
            disabled={saving}
          />
        </Row>

        {/* Live add exercise */}
        <Row>
          <RowLabel
            icon={<Dumbbell className="w-4 h-4" />}
            title="Live Add Exercise"
            subtitle="Always available during workouts"
          />
          <span className="inline-flex h-6 items-center rounded-full border border-[var(--accent)]/25 bg-[var(--accent)]/10 px-2.5 text-[11px] font-semibold text-[var(--accent)]">
            Always On
          </span>
        </Row>

        {/* Show start sheet */}
        <Row>
          <RowLabel
            icon={<Dumbbell className="w-4 h-4" />}
            title="Start Sheet"
            subtitle="Template picker before workout"
          />
          <Toggle
            on={!!draftProfile?.show_start_sheet}
            onToggle={() => handleToggle('show_start_sheet', !!draftProfile?.show_start_sheet)}
            disabled={saving}
            label="Toggle start sheet"
          />
        </Row>
      </SectionCard>

      {/* ── Body metrics ──────────────────────── */}
      <SectionCard title="Body Metrics">
        <div className="px-5 py-5 space-y-4">
          <p className="text-[12px] text-[var(--text-muted)]">
            Used to normalize muscle load by body size.
            {bmi ? ` BMI: ${bmi.toFixed(1)}` : ''}
          </p>

          {/* Body weight */}
          <div>
            <label className="block text-[12px] font-medium text-[var(--text-muted)] mb-1.5">
              Body weight
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                min="0"
                step="0.1"
                value={draftProfile?.body_weight ?? ''}
                onChange={(e) => {
                  setDraftProfile({ ...draftProfile, body_weight: e.target.value === '' ? null : Number(e.target.value) });
                  setMetricsChanged(true);
                }}
                className="flex-1 h-10 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl px-3.5 text-[14px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]/60 transition-colors"
                placeholder="e.g. 75"
              />
              <SegmentControl
                options={['kg', 'lbs']}
                value={draftProfile?.body_weight_unit || 'kg'}
                onChange={(v) => handleBodyWeightUnitChange(v as WeightUnit)}
              />
            </div>
          </div>

          {/* Height */}
          <div>
            <label className="block text-[12px] font-medium text-[var(--text-muted)] mb-1.5">
              Height
            </label>
            <div className="grid grid-cols-2 gap-2">
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={draftProfile?.height_feet ?? ''}
                  onChange={(e) => {
                    setDraftProfile({ ...draftProfile, height_feet: e.target.value === '' ? null : Number(e.target.value) });
                    setMetricsChanged(true);
                  }}
                  className="w-full h-10 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl px-3.5 pr-9 text-[14px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]/60 transition-colors"
                  placeholder="5"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-[var(--text-muted)] pointer-events-none">ft</span>
              </div>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  max="11"
                  step="1"
                  value={draftProfile?.height_inches ?? ''}
                  onChange={(e) => {
                    setDraftProfile({ ...draftProfile, height_inches: e.target.value === '' ? null : Number(e.target.value) });
                    setMetricsChanged(true);
                  }}
                  className="w-full h-10 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl px-3.5 pr-9 text-[14px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]/60 transition-colors"
                  placeholder="10"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-[var(--text-muted)] pointer-events-none">in</span>
              </div>
            </div>
          </div>

          <button
            onClick={saveMetrics}
            disabled={saving || !metricsChanged}
            className="w-full h-10 rounded-xl bg-[var(--accent)] text-black text-[13px] font-bold flex items-center justify-center gap-2 disabled:opacity-40 transition-opacity"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Metrics
          </button>
        </div>
      </SectionCard>

      {/* ── Integrations ──────────────────────── */}
      <SectionCard title="Integrations">
        <div className="px-5 pt-4 pb-1">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 shrink-0" style={{ color: 'var(--accent)' }} />
            <span className="text-[14px] font-medium" style={{ color: 'var(--text-primary)' }}>WHOOP</span>
          </div>
          <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Recovery, Sleep Efficiency, Heart Rate &amp; Steps
          </p>
        </div>
        <WhoopConnect userId={user?.id ?? ''} />
      </SectionCard>

      {/* ── Account ───────────────────────────── */}
      <SectionCard title="Account">
        <Row>
          <RowLabel
            icon={<User className="w-4 h-4" />}
            title="Email"
            subtitle={user?.email}
          />
        </Row>
        <div className="px-5 py-4 space-y-2.5">
          <button
            onClick={signOut}
            className="w-full h-11 flex items-center justify-center gap-2 rounded-xl border border-[var(--border)] text-[14px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
          <button
            onClick={handleDeleteAccount}
            className="w-full h-11 flex items-center justify-center gap-2 rounded-xl border border-[var(--red)]/25 text-[14px] font-medium text-[var(--red)]/70 hover:bg-[var(--red)]/8 hover:text-[var(--red)] transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Delete Account & Data
          </button>
        </div>
      </SectionCard>

      <p className="text-center text-[11px] text-[var(--text-muted)] pb-2">
        Athlix v2.1 · Track. Recover. Perform.
      </p>
    </div>
  );
};
