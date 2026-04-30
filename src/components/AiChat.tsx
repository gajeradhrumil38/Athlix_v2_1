import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X, Send, Loader2, Settings as SettingsIcon, RotateCcw, Copy, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { format, subDays, differenceInCalendarDays } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';
import {
  getWorkouts,
  getPersonalRecords,
  type LocalWorkout,
  type LocalExercise,
  type LocalPersonalRecord,
} from '../lib/supabaseData';

type WorkoutWithExercises = LocalWorkout & { exercises?: LocalExercise[] };

const GEMINI_KEY_STORAGE = 'athlix:gemini_api_key';
const GEMINI_MODEL_STORAGE = 'athlix:gemini_model';
const USAGE_STORAGE = 'athlix:api_usage';
const DEFAULT_MODEL = 'gemini-2.5-flash'; // free tier: 5 RPM, 250K tokens/min
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
// Max conversation turns sent to API (keeps token usage low while preserving short-term memory)
const MAX_HISTORY = 12;

// Aurora gradient border CSS — injected once into <head>
const AURORA_CSS = `
  @property --ai-angle { syntax: '<angle>'; initial-value: 0deg; inherits: false; }
  @keyframes ai-spin { to { --ai-angle: 360deg; } }
  @keyframes ai-pulse-glow {
    0%,100% { opacity:1; box-shadow:0 0 5px rgba(200,255,0,0.5); }
    50%      { opacity:0.7; box-shadow:0 0 10px rgba(124,58,237,0.6); }
  }
  .ai-aurora-spin {
    background-image: linear-gradient(var(--bg-elevated,#1a2030),var(--bg-elevated,#1a2030)),
      conic-gradient(from var(--ai-angle),#7c3aed,#2563eb,#C8FF00,#7c3aed);
    background-origin: border-box; background-clip: padding-box,border-box;
    animation: ai-spin 3s linear infinite;
  }
  .ai-aurora-static {
    background-image: linear-gradient(var(--bg-elevated,#1a2030),var(--bg-elevated,#1a2030)),
      linear-gradient(135deg,#7c3aed,#2563eb,#C8FF00);
    background-origin: border-box; background-clip: padding-box,border-box;
  }
  .ai-online-dot {
    width:7px; height:7px; border-radius:50%; background:var(--accent,#C8FF00); flex-shrink:0;
    animation: ai-pulse-glow 2s ease-in-out infinite;
  }
  .ai-input-wrap { transition: border-color 0.15s; }
  .ai-input-wrap:focus-within { border-color: rgba(200,255,0,0.35) !important; }
`;

const LOADING_PHASES = [
  'Reviewing your workout history…',
  'Checking muscle recovery status…',
  'Analyzing your progression…',
  'Formulating advice…',
];

interface Message {
  role: 'user' | 'model';
  text: string;
  thought?: string; // coach's reasoning chain (from Gemini thinking tokens)
}

interface ApiUsage {
  total_tokens: number;
  total_requests: number;
  month_tokens: number;
  month_requests: number;
  month_key: string; // "YYYY-MM"
}

function trackTokenUsage(tokens: number): void {
  const monthKey = new Date().toISOString().slice(0, 7);
  const raw = localStorage.getItem(USAGE_STORAGE);
  const prev: ApiUsage = raw
    ? JSON.parse(raw)
    : { total_tokens: 0, total_requests: 0, month_tokens: 0, month_requests: 0, month_key: monthKey };
  const data: ApiUsage = {
    total_tokens: prev.total_tokens + tokens,
    total_requests: prev.total_requests + 1,
    month_tokens: prev.month_key === monthKey ? prev.month_tokens + tokens : tokens,
    month_requests: prev.month_key === monthKey ? prev.month_requests + 1 : 1,
    month_key: monthKey,
  };
  localStorage.setItem(USAGE_STORAGE, JSON.stringify(data));
}

/* ── Simple markdown → React (bold, bullets, newlines) ─────────────── */
function renderText(raw: string) {
  return raw.split('\n').map((line, li) => {
    const parts: React.ReactNode[] = [];
    let rest = line;
    let key = 0;
    while (rest.length) {
      const m = rest.match(/\*\*(.+?)\*\*/);
      if (!m || m.index === undefined) {
        parts.push(rest);
        break;
      }
      if (m.index > 0) parts.push(rest.slice(0, m.index));
      parts.push(<strong key={key++}>{m[1]}</strong>);
      rest = rest.slice(m.index + m[0].length);
    }
    return (
      <span key={li}>
        {parts}
        {li < raw.split('\n').length - 1 && <br />}
      </span>
    );
  });
}

/* ── Parse "YYYY-MM-DD" as local calendar date (not UTC midnight) ────── */
function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d); // local midnight — never shifts timezone
}

function calDaysSince(dateStr: string): number {
  return differenceInCalendarDays(new Date(), parseLocalDate(dateStr));
}

/* ── Weekly volume per muscle group (Israetel MEV reference) ────────── */
const MEV: Record<string, string> = {
  chest: '10-20', back: '10-25', shoulders: '12-20',
  legs: '12-20', quads: '12-20', hamstrings: '10-16',
  glutes: '12-18', biceps: '10-15', triceps: '10-15', abs: '10-16',
};

function weeklyVolume(workouts: WorkoutWithExercises[]): string {
  const sets: Record<string, number> = {};
  for (const w of workouts) {
    if (calDaysSince(w.date) > 6) continue;
    for (const ex of (w.exercises || [])) {
      const mg = (ex.muscle_group || 'other').toLowerCase();
      sets[mg] = (sets[mg] || 0) + ex.sets;
    }
  }
  if (!Object.keys(sets).length) return '  No sets logged this week';
  return Object.entries(sets)
    .sort((a, b) => b[1] - a[1])
    .map(([mg, n]) => {
      const rec = MEV[mg];
      const cap = mg.charAt(0).toUpperCase() + mg.slice(1);
      return rec ? `  ${cap}: ${n} sets (rec ${rec}/wk)` : `  ${cap}: ${n} sets`;
    })
    .join('\n');
}

/* ── Progressive overload: compare last 14d vs 15–56d ──────────────── */
function progressionReport(workouts: WorkoutWithExercises[], unit: string): string {
  const hist: Record<string, { recent: number[]; older: number[] }> = {};
  for (const w of workouts) {
    const age = calDaysSince(w.date);
    for (const ex of (w.exercises || [])) {
      if (ex.weight <= 0) continue;
      if (!hist[ex.name]) hist[ex.name] = { recent: [], older: [] };
      if (age <= 14) hist[ex.name].recent.push(ex.weight);
      else if (age <= 56) hist[ex.name].older.push(ex.weight);
    }
  }
  const lines: string[] = [];
  for (const [name, { recent, older }] of Object.entries(hist)) {
    if (!recent.length || !older.length) continue;
    const r = Math.max(...recent);
    const o = Math.max(...older);
    const diff = +(r - o).toFixed(1);
    if (diff > 0) lines.push(`  ↑ ${name}: ${o}→${r}${unit} (+${diff})`);
    else if (diff < 0) lines.push(`  ↓ ${name}: ${o}→${r}${unit} (${diff})`);
    else lines.push(`  ~ ${name}: plateau at ${r}${unit} (8+ weeks)`);
  }
  return lines.length ? lines.join('\n') : '  Insufficient data for trend analysis';
}

/* ── Training frequency & streak ────────────────────────────────────── */
function trainingStats(workouts: WorkoutWithExercises[]): string {
  const dateSeen = new Set(workouts.map((w) => w.date));
  const last28 = workouts.filter((w) => calDaysSince(w.date) <= 28);
  const sessionsPerWeek = (new Set(last28.map((w) => w.date)).size / 4).toFixed(1);
  let streak = 0;
  for (let i = 0; i < 60; i++) {
    const d = format(new Date(new Date().setDate(new Date().getDate() - i)), 'yyyy-MM-dd');
    if (dateSeen.has(d)) streak++;
    else if (i > 0) break;
  }
  return `${sessionsPerWeek} sessions/week avg (last 28d) · Streak: ${streak} day${streak !== 1 ? 's' : ''}`;
}

/* ── System prompt builder ──────────────────────────────────────────── */
function buildSystemPrompt(
  profile: any,
  workouts: WorkoutWithExercises[],
  prs: LocalPersonalRecord[],
): string {
  const today = format(new Date(), 'EEEE, MMMM d, yyyy');
  const name = profile?.full_name || 'Athlete';
  const bodyWeight = profile?.body_weight
    ? `${profile.body_weight} ${profile.body_weight_unit}`
    : 'not set';
  const height =
    profile?.height_feet != null
      ? `${profile.height_feet}'${profile.height_inches ?? 0}"`
      : 'not set';
  const unit = profile?.unit_preference || 'kg';

  // Last 7 workouts: full exercise detail
  const detailedSection = workouts.slice(0, 7).map((w) => {
    const age = calDaysSince(w.date);
    const label = age === 0 ? 'Today' : age === 1 ? 'Yesterday' : `${age}d ago`;
    const header = `${w.date} (${label}) — ${w.title} · ${w.duration_minutes ?? '?'} min`;
    const exLines = (w.exercises || []).map(
      (ex) => `    · ${ex.name}: ${ex.sets}×${ex.reps}${ex.weight > 0 ? ` @ ${ex.weight}${ex.unit}` : ''}`,
    );
    return exLines.length ? `  ${header}\n${exLines.join('\n')}` : `  ${header}`;
  }).join('\n');

  // Workouts 8-20: title + muscle groups only
  const olderSection = workouts.slice(7, 20)
    .map((w) => `  ${w.date} — ${w.title}${w.muscle_groups?.length ? ` [${w.muscle_groups.join(', ')}]` : ''}`)
    .join('\n');

  // Muscle group recovery (calendar-day accurate)
  const muscleAge: Record<string, number> = {};
  for (const w of workouts) {
    const age = calDaysSince(w.date);
    for (const mg of (w.muscle_groups || [])) {
      const k = mg.toLowerCase();
      if (muscleAge[k] === undefined || age < muscleAge[k]) muscleAge[k] = age;
    }
  }
  const recoverySection = Object.entries(muscleAge)
    .sort((a, b) => a[1] - b[1])
    .map(([mg, d]) => {
      const status = d === 0 ? '⛔ trained today' : d === 1 ? '⛔ 1d — rest' : d === 2 ? '⚠️ 2d — borderline' : '✅ recovered';
      return `  ${mg.charAt(0).toUpperCase() + mg.slice(1)}: ${d}d since last session — ${status}`;
    })
    .join('\n');

  // Personal records with date
  const prSection = prs.slice(0, 30)
    .map((p) => `  ${p.exercise_name}: ${p.best_weight}${unit} × ${p.best_reps} reps (set ${p.achieved_date})`)
    .join('\n');

  return `You are an expert strength & conditioning coach embedded in the Athlix fitness app. Your role: give ${name} evidence-based, data-driven advice using ONLY their logged data below. Never fabricate numbers.

TODAY: ${today}
ATHLETE: ${name} | BW: ${bodyWeight} | Height: ${height} | Unit: ${unit}
TRAINING PATTERN: ${workouts.length ? trainingStats(workouts) : 'no data'}

━━ RECENT SESSIONS (full detail) ━━
${detailedSection || '  No workouts logged yet'}
${olderSection ? `\n━━ OLDER SESSIONS ━━\n${olderSection}` : ''}

━━ MUSCLE RECOVERY STATUS ━━
${recoverySection || '  No muscle data — cannot assess recovery'}

━━ WEEKLY VOLUME (this week) ━━
${weeklyVolume(workouts)}

━━ STRENGTH TRENDS (last 2 vs prior 6 weeks) ━━
${progressionReport(workouts, unit)}

━━ PERSONAL RECORDS ━━
${prSection || '  No records yet'}

RESPONSE FORMAT (non-negotiable):
• Open with the direct answer in ≤2 sentences — no preamble, no "Based on your data", no "You should"
• Use **bold** for exercise names and key numbers only
• Workout plans: one line per exercise → "· Exercise: Xs × Y–Z reps @ W${unit}"
• No closing summaries, no motivational sign-offs
• Total response: aim for ≤180 words. If a list is needed, use bullet lines.

COACHING RULES:
1. ⛔ muscle groups must NOT appear in today's plan — check RECOVERY STATUS
2. Plateau on an exercise → suggest rep scheme change or drop set, not just "keep going"
3. Weekly sets below MEV range → flag it, suggest extra sets
4. PR opportunity → call it out explicitly with the weight to hit
5. For nutrition/science questions use Google Search for current evidence`;
}

/* ── Context-aware suggestions ──────────────────────────────────────── */
function getSuggestions(workouts: WorkoutWithExercises[]): string[] {
  const trainedToday = workouts.some((w) => calDaysSince(w.date) === 0);
  const hasData = workouts.length > 3;
  if (trainedToday) {
    return [
      'How did this session compare to last time?',
      'Any recovery tips for what I just trained?',
      'Am I hitting enough volume per muscle group?',
      'What should I focus on next session?',
    ];
  }
  if (hasData) {
    return [
      'What should I train today?',
      'Which exercises am I plateauing on?',
      "How's my weekly volume looking?",
      'Give me a progressive overload plan for next week.',
    ];
  }
  return [
    'What should I train today?',
    "How's my progress looking?",
    'Best exercises for my weak points?',
    'Give me a deload week plan.',
  ];
}

/* ── Main AiChat component ─────────────────────────────────────────── */
export const AiChat: React.FC = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState(0);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [dataReady, setDataReady] = useState(false);
  const [workouts, setWorkouts] = useState<WorkoutWithExercises[]>([]);
  const [prs, setPrs] = useState<LocalPersonalRecord[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const apiKey = localStorage.getItem(GEMINI_KEY_STORAGE)?.trim() || '';
  const model = localStorage.getItem(GEMINI_MODEL_STORAGE) || DEFAULT_MODEL;

  /* ── Load workout data once chat opens ────────────────────────────── */
  useEffect(() => {
    if (!open || dataReady || !user?.id) return;
    const load = async () => {
      try {
        const startDate = format(subDays(new Date(), 90), 'yyyy-MM-dd');
        const [ws, ps] = await Promise.all([
          getWorkouts(user.id, { startDate, limit: 20, includeExercises: true }),
          getPersonalRecords(user.id),
        ]);
        setWorkouts(ws || []);
        setPrs(ps || []);
      } catch {
        // non-fatal — AI still works without context
      } finally {
        setDataReady(true);
      }
    };
    load();
  }, [open, user?.id, dataReady]);

  /* ── Auto-scroll to latest message ───────────────────────────────── */
  useEffect(() => {
    if (open) setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
  }, [messages, open, loading]);

  /* ── Focus input when modal opens ───────────────────────────────── */
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 320);
  }, [open]);

  // Inject aurora CSS once
  useEffect(() => {
    if (document.getElementById('athlix-ai-aurora-css')) return;
    const el = document.createElement('style');
    el.id = 'athlix-ai-aurora-css';
    el.textContent = AURORA_CSS;
    document.head.appendChild(el);
  }, []);

  // Allow sidebar / other components to open the chat via a custom event
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener('athlix:open-ai', handler);
    return () => window.removeEventListener('athlix:open-ai', handler);
  }, []);

  // Cycle through loading phase labels while waiting for Gemini
  useEffect(() => {
    if (!loading) { setLoadingPhase(0); return; }
    const id = setInterval(() => setLoadingPhase((p) => (p + 1) % LOADING_PHASES.length), 2200);
    return () => clearInterval(id);
  }, [loading]);

  const close = () => setOpen(false);

  /* ── Send message to Gemini ───────────────────────────────────────── */
  const send = useCallback(
    async (overrideText?: string) => {
      const text = (overrideText ?? input).trim();
      if (!text || loading || !apiKey) return;

      const userMsg: Message = { role: 'user', text };
      const history = [...messages, userMsg];
      setMessages(history);
      setInput('');
      setLoading(true);

      try {
        const systemPrompt = buildSystemPrompt(profile, workouts, prs);

        // Search grounding tool format differs by model family:
        //   Gemini 2.x / 2.5.x  → { google_search: {} }
        //   Gemini 1.5.x         → { google_search_retrieval: { dynamic_retrieval_config: { mode: "MODE_DYNAMIC" } } }
        const isV2 = /^gemini-2/.test(model);
        const searchTool = isV2
          ? { google_search: {} }
          : { google_search_retrieval: { dynamic_retrieval_config: { mode: 'MODE_DYNAMIC' } } };

        // Only send the last MAX_HISTORY messages to keep prompt tokens low
        const trimmedHistory = history.slice(-MAX_HISTORY);

        // Gemini 2.5 Flash supports native thinking tokens — gives coach-level reasoning
        const supportsThinking = /^gemini-2\.5/.test(model);

        const res = await fetch(`${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: trimmedHistory.map((m) => ({
              role: m.role,
              parts: [{ text: m.text }],
            })),
            tools: [searchTool],
            generationConfig: {
              temperature: 1, // required when thinkingConfig is set
              maxOutputTokens: 2048,
              ...(supportsThinking && { thinkingConfig: { thinkingBudget: 1024 } }),
            },
          }),
        });

        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          const errMsg: string = errBody?.error?.message || `Request failed (${res.status})`;
          if (
            res.status === 429 ||
            errMsg.includes('quota') ||
            errMsg.includes('limit: 0') ||
            errMsg.includes('free_tier')
          ) {
            throw new Error(
              'QUOTA: Your API key\'s project has billing enabled, which sets the free tier limit to 0.\n\n' +
              'Fix: Go to aistudio.google.com/app/apikey → "Create API key in new project" (no billing) → paste the new key in Settings.',
            );
          }
          if (res.status === 400 && errMsg.includes('API_KEY')) {
            throw new Error('INVALID_KEY: Your API key is invalid. Check it in Settings.');
          }
          throw new Error(errMsg);
        }

        const data = await res.json();
        const parts: Array<{ text?: string; thought?: boolean }> =
          data?.candidates?.[0]?.content?.parts || [];
        const thought = parts.filter((p) => p.thought).map((p) => p.text).join('').trim();
        const aiText = parts.filter((p) => !p.thought).map((p) => p.text).join('').trim() || '(no response)';
        trackTokenUsage(data?.usageMetadata?.totalTokenCount ?? 0);
        setMessages((prev) => [...prev, { role: 'model', text: aiText, thought: thought || undefined }]);
      } catch (err: any) {
        const raw: string = err?.message || 'Something went wrong.';
        const display = raw.startsWith('QUOTA:')
          ? raw.replace('QUOTA:', '⚠️ Quota issue —')
          : raw.startsWith('INVALID_KEY:')
            ? raw.replace('INVALID_KEY:', '🔑 Invalid key —')
            : `⚠️ ${raw}`;
        setMessages((prev) => [
          ...prev,
          {
            role: 'model',
            text: display,
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [input, loading, apiKey, model, profile, workouts, prs, messages],
  );

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const handleCopy = (text: string, idx: number) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIdx(idx);
      toast.success('Copied!');
      setTimeout(() => setCopiedIdx(null), 2000);
    });
  };

  /* ── FAB button (mobile only, sits left of the + FAB) ───────────── */
  const fabButton = (
    <button
      onClick={() => setOpen(true)}
      aria-label="Open AI assistant"
      className="ai-aurora-spin fixed flex items-center justify-center active:scale-95 transition-transform z-[94]"
      style={{
        width: 50,
        height: 50,
        borderRadius: 8,
        border: '1.5px solid transparent',
        right: 'calc(16px + 56px + 12px)',
        bottom: 'calc(80px + max(env(safe-area-inset-bottom), 12px))',
        background: 'var(--bg-elevated)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
      }}
    >
      <Sparkles className="w-5 h-5" style={{ color: 'var(--accent)' }} />
    </button>
  );

  /* ── Chat panel (shared mobile + desktop) ──────────────────────────── */
  const chatPanel = (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-[198] backdrop-blur-sm"
            onClick={close}
          />

          {/* Mobile: slide up sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            className="md:hidden fixed bottom-0 left-0 right-0 z-[200] flex flex-col"
            style={{
              height: '82vh',
              borderRadius: '16px 16px 0 0',
              background: 'var(--bg-surface)',
              borderTop: '1px solid var(--border)',
              borderLeft: '1px solid var(--border)',
              borderRight: '1px solid var(--border)',
            }}
          >
            {/* Drag pill */}
            <div style={{ width: 36, height: 3, borderRadius: 99, background: 'rgba(255,255,255,0.15)', margin: '10px auto 0', flexShrink: 0 }} />
            <ChatContent
              apiKey={apiKey}
              messages={messages}
              suggestions={getSuggestions(workouts)}
              input={input}
              loading={loading}
              loadingPhase={loadingPhase}
              copiedIdx={copiedIdx}
              inputRef={inputRef}
              bottomRef={bottomRef}
              onInput={setInput}
              onKey={handleKey}
              onSend={() => send()}
              onSuggest={(q) => send(q)}
              onClose={close}
              onGoSettings={() => { close(); navigate('/settings'); }}
              onClear={() => setMessages([])}
              onCopy={handleCopy}
            />
          </motion.div>

          {/* Desktop: centered modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ duration: 0.2 }}
            className="hidden md:flex fixed z-[200] flex-col"
            style={{
              width: 420,
              height: 600,
              bottom: 32,
              right: 32,
              borderRadius: 20,
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
            }}
          >
            <ChatContent
              apiKey={apiKey}
              messages={messages}
              suggestions={getSuggestions(workouts)}
              input={input}
              loading={loading}
              loadingPhase={loadingPhase}
              copiedIdx={copiedIdx}
              inputRef={inputRef}
              bottomRef={bottomRef}
              onInput={setInput}
              onKey={handleKey}
              onSend={() => send()}
              onSuggest={(q) => send(q)}
              onClose={close}
              onGoSettings={() => { close(); navigate('/settings'); }}
              onClear={() => setMessages([])}
              onCopy={handleCopy}
            />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  return (
    <>
      {fabButton}
      {chatPanel}
    </>
  );
};

/* ── Inner chat content (shared between mobile sheet + desktop modal) ─ */
interface ChatContentProps {
  apiKey: string;
  messages: Message[];
  suggestions: string[];
  input: string;
  loading: boolean;
  loadingPhase: number;
  copiedIdx: number | null;
  inputRef: React.RefObject<HTMLInputElement>;
  bottomRef: React.RefObject<HTMLDivElement>;
  onInput: (v: string) => void;
  onKey: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onSend: () => void;
  onSuggest: (q: string) => void;
  onClose: () => void;
  onGoSettings: () => void;
  onClear: () => void;
  onCopy: (text: string, idx: number) => void;
}

const ChatContent: React.FC<ChatContentProps> = ({
  apiKey, messages, suggestions, input, loading, loadingPhase, copiedIdx,
  inputRef, bottomRef,
  onInput, onKey, onSend, onSuggest,
  onClose, onGoSettings, onClear, onCopy,
}) => {
  const [expandedThought, setExpandedThought] = useState<number | null>(null);

  return (
  <>
    {/* Header */}
    <div
      className="flex items-center justify-between px-4 shrink-0"
      style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}
    >
      <div className="flex items-center gap-2.5">
        {/* Avatar with aurora gradient border */}
        <div
          className="ai-aurora-static flex items-center justify-center shrink-0"
          style={{ width: 36, height: 36, borderRadius: 8, border: '1.5px solid transparent' }}
        >
          <Sparkles className="w-[18px] h-[18px]" style={{ color: 'var(--accent)' }} />
        </div>
        <div>
          <p className="text-[15px] font-bold text-[var(--text-primary)] leading-tight">Athlix AI</p>
          <div className="flex items-center gap-[5px] mt-[1px]">
            <div className="ai-online-dot" />
            <p className="text-[11px] leading-tight" style={{ color: 'var(--text-muted)' }}>Ready to coach</p>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1">
        {messages.length > 0 && (
          <button
            onClick={onClear}
            title="Clear chat"
            className="w-8 h-8 flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors"
            style={{ borderRadius: 8 }}
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors"
          style={{ borderRadius: 8 }}
        >
          <X className="w-[15px] h-[15px]" />
        </button>
      </div>
    </div>

    {/* No API key state */}
    {!apiKey ? (
      <div className="flex-1 flex flex-col items-center justify-center gap-5 px-6 text-center">
        <div
          className="ai-aurora-static flex items-center justify-center"
          style={{ width: 64, height: 64, borderRadius: 8, border: '1.5px solid transparent' }}
        >
          <Sparkles className="w-8 h-8" style={{ color: 'var(--accent)' }} />
        </div>
        <div>
          <p className="text-[17px] font-bold text-[var(--text-primary)]">Set up AI Coach</p>
          <p className="mt-1.5 text-[13px] leading-relaxed max-w-[260px]" style={{ color: 'var(--text-muted)' }}>
            Add your Gemini API key in Settings to enable personalized fitness coaching.
          </p>
        </div>
        <button
          onClick={onGoSettings}
          className="h-11 px-5 text-[13px] font-bold flex items-center gap-2"
          style={{ background: 'var(--accent)', color: '#000', borderRadius: 8, border: 'none' }}
        >
          <SettingsIcon className="w-4 h-4" />
          Go to Settings
        </button>
        <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
          Get a free key at{' '}
          <span style={{ color: '#818cf8' }}>aistudio.google.com</span>
        </p>
      </div>
    ) : (
      <>
        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {/* Empty state */}
          {messages.length === 0 && (
            <div className="flex-1 flex flex-col items-center justify-center gap-0 px-5" style={{ minHeight: '60%' }}>
              {/* Aurora icon */}
              <div
                className="ai-aurora-static flex items-center justify-center"
                style={{ width: 52, height: 52, borderRadius: 8, border: '1.5px solid transparent', marginBottom: 14 }}
              >
                <Sparkles className="w-[22px] h-[22px]" style={{ color: 'var(--accent)' }} />
              </div>
              <p className="text-[17px] font-bold text-center mb-[6px]" style={{ color: 'var(--text-primary)' }}>
                Your AI fitness coach
              </p>
              <p className="text-[13px] text-center leading-relaxed mb-6 max-w-[260px]" style={{ color: 'var(--text-secondary)' }}>
                Ask me about recovery, programming, progress, or anything training-related.
              </p>
              {/* 2-col chip grid */}
              <div className="w-full grid grid-cols-2 gap-2">
                {suggestions.map((q) => (
                  <button
                    key={q}
                    onClick={() => onSuggest(q)}
                    className="text-left transition-all"
                    style={{
                      padding: '10px 12px',
                      borderRadius: 8,
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-secondary)',
                      fontSize: 12,
                      fontWeight: 500,
                      lineHeight: 1.4,
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Chat bubbles */}
          {messages.map((m, i) => (
            <div
              key={i}
              className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {m.role === 'model' && (
                <div
                  className="ai-aurora-static flex items-center justify-center shrink-0"
                  style={{ width: 26, height: 26, borderRadius: 8, border: '1.5px solid transparent', marginTop: 2 }}
                >
                  <Sparkles className="w-[11px] h-[11px]" style={{ color: 'var(--accent)' }} />
                </div>
              )}
              <div style={{ maxWidth: '78%', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {/* Coach thinking — collapsible, shown before the reply */}
                {m.role === 'model' && m.thought && (
                  <div className="mb-0.5">
                    <button
                      onClick={() => setExpandedThought(expandedThought === i ? null : i)}
                      className="flex items-center gap-1.5 text-[10px] font-medium px-2.5 py-1 transition-colors"
                      style={{
                        borderRadius: 6,
                        background: 'rgba(124,58,237,0.08)',
                        color: 'rgba(124,58,237,0.8)',
                        border: '1px solid rgba(124,58,237,0.2)',
                      }}
                    >
                      <Sparkles className="w-2.5 h-2.5" />
                      Coach's reasoning
                      <span className="ml-0.5 opacity-60">{expandedThought === i ? '▲' : '▼'}</span>
                    </button>
                    {expandedThought === i && (
                      <div
                        className="mt-1.5 px-3 py-2.5 text-[11px] leading-relaxed whitespace-pre-wrap"
                        style={{
                          borderRadius: 8,
                          background: 'rgba(124,58,237,0.05)',
                          border: '1px solid rgba(124,58,237,0.15)',
                          color: 'var(--text-secondary)',
                          maxHeight: 220,
                          overflowY: 'auto',
                        }}
                      >
                        {m.thought}
                      </div>
                    )}
                  </div>
                )}
                {/* Main reply bubble */}
                <div
                  className="text-[13px] leading-[1.55] word-break"
                  style={{
                    padding: '10px 13px',
                    background: m.role === 'user' ? 'var(--accent)' : 'var(--bg-elevated)',
                    color: m.role === 'user' ? '#000' : 'var(--text-primary)',
                    fontWeight: m.role === 'user' ? 500 : 400,
                    borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                    border: m.role === 'model' ? '1px solid var(--border)' : 'none',
                    wordBreak: 'break-word',
                  }}
                >
                  {renderText(m.text)}
                </div>
                {m.role === 'model' && (
                  <button
                    onClick={() => onCopy(m.text, i)}
                    title="Copy response"
                    className="self-start flex items-center gap-1 transition-colors"
                    style={{
                      padding: '2px 4px',
                      borderRadius: 4,
                      fontSize: 10,
                      color: copiedIdx === i ? 'var(--accent)' : 'var(--text-muted)',
                      background: 'none',
                      border: 'none',
                    }}
                  >
                    {copiedIdx === i
                      ? <><Check className="w-[11px] h-[11px]" /> Copied</>
                      : <><Copy className="w-[11px] h-[11px]" /> Copy</>}
                  </button>
                )}
              </div>
            </div>
          ))}

          {/* Loading indicator */}
          {loading && (
            <div className="flex gap-2 justify-start">
              <div
                className="ai-aurora-static flex items-center justify-center shrink-0"
                style={{ width: 26, height: 26, borderRadius: 8, border: '1.5px solid transparent', marginTop: 2 }}
              >
                <Sparkles className="w-[11px] h-[11px]" style={{ color: 'var(--accent)' }} />
              </div>
              <div
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: '14px 14px 14px 4px',
                  padding: 0,
                }}
              >
                <div className="flex flex-col gap-1.5 px-3.5 py-2.5">
                  <p className="text-[11px] animate-pulse" style={{ color: 'var(--text-muted)' }}>
                    {LOADING_PHASES[loadingPhase]}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {[0, 1, 2].map((d) => (
                      <span
                        key={d}
                        className="block rounded-full animate-bounce"
                        style={{ width: 6, height: 6, background: 'var(--text-muted)', animationDelay: `${d * 0.15}s` }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input bar */}
        <div
          className="shrink-0 flex gap-2 items-center"
          style={{
            borderTop: '1px solid var(--border)',
            padding: '10px 12px',
            paddingBottom: 'max(20px, env(safe-area-inset-bottom))',
          }}
        >
          <div
            className="ai-input-wrap flex-1 flex items-center"
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '0 12px',
              height: 44,
            }}
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => onInput(e.target.value)}
              onKeyDown={onKey}
              disabled={loading}
              placeholder="Ask about your training…"
              className="flex-1 text-[14px] outline-none"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-primary)',
                fontFamily: 'inherit',
              }}
            />
          </div>
          <button
            onClick={onSend}
            disabled={loading || !input.trim()}
            className="flex items-center justify-center shrink-0 disabled:opacity-35 active:scale-95 transition-all"
            style={{
              width: 44,
              height: 44,
              borderRadius: 8,
              border: 'none',
              background: 'var(--accent)',
              cursor: 'pointer',
            }}
          >
            {loading
              ? <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#000' }} />
              : <Send className="w-4 h-4" style={{ color: '#000' }} />}
          </button>
        </div>
      </>
    )}
  </>
  );
};
