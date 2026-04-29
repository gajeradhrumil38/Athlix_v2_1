import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X, Send, Loader2, Settings as SettingsIcon, RotateCcw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { format, subDays } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';
import {
  getWorkouts,
  getPersonalRecords,
  type LocalWorkout,
  type LocalPersonalRecord,
} from '../lib/supabaseData';

const GEMINI_KEY_STORAGE = 'athlix:gemini_api_key';
const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

interface Message {
  role: 'user' | 'model';
  text: string;
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

/* ── System prompt builder ──────────────────────────────────────────── */
function buildSystemPrompt(
  profile: any,
  workouts: LocalWorkout[],
  prs: LocalPersonalRecord[],
): string {
  const today = format(new Date(), 'EEEE, MMMM d, yyyy');
  const name = profile?.full_name || 'Athlete';
  const weight = profile?.body_weight
    ? `${profile.body_weight} ${profile.body_weight_unit}`
    : 'not set';
  const height =
    profile?.height_feet != null
      ? `${profile.height_feet}'${profile.height_inches ?? 0}"`
      : 'not set';
  const unit = profile?.unit_preference || 'kg';

  const workoutLines = workouts
    .slice(0, 20)
    .map(
      (w) =>
        `  • ${w.date} — ${w.title} (${w.duration_minutes ?? '?'} min)${
          w.muscle_groups?.length ? ` [${w.muscle_groups.join(', ')}]` : ''
        }`,
    )
    .join('\n');

  const prLines = prs
    .slice(0, 25)
    .map((p) => `  • ${p.exercise_name}: ${p.best_weight}${unit} × ${p.best_reps} reps`)
    .join('\n');

  return `You are an AI fitness coach embedded inside the Athlix workout tracking app. Be concise, specific, and motivating. Always use the user's real data when relevant.

Today: ${today}
Athlete: ${name}
Body weight: ${weight} | Height: ${height} | Preferred unit: ${unit}

RECENT WORKOUTS:
${workoutLines || '  (no workouts logged yet)'}

PERSONAL RECORDS:
${prLines || '  (no records yet)'}

Instructions:
- Reference the user's actual workouts and PRs when answering
- Recommend today's training based on what muscle groups they recently hit
- For general fitness/nutrition science questions, use your Google Search tool to give up-to-date info
- Keep replies under 300 words unless asked for more detail
- Use ${unit} for weight references`;
}

/* ── Suggested prompts shown on empty chat ──────────────────────────── */
const SUGGESTIONS = [
  'What should I train today?',
  "How's my progress looking?",
  'Best exercises for my weak points?',
  'Give me a deload week plan.',
];

/* ── Main AiChat component ─────────────────────────────────────────── */
export const AiChat: React.FC = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [dataReady, setDataReady] = useState(false);
  const [workouts, setWorkouts] = useState<LocalWorkout[]>([]);
  const [prs, setPrs] = useState<LocalPersonalRecord[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const apiKey = localStorage.getItem(GEMINI_KEY_STORAGE)?.trim() || '';

  /* ── Load workout data once chat opens ────────────────────────────── */
  useEffect(() => {
    if (!open || dataReady || !user?.id) return;
    const load = async () => {
      try {
        const startDate = format(subDays(new Date(), 60), 'yyyy-MM-dd');
        const [ws, ps] = await Promise.all([
          getWorkouts(user.id, { startDate, limit: 20 }),
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

  // Allow sidebar / other components to open the chat via a custom event
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener('athlix:open-ai', handler);
    return () => window.removeEventListener('athlix:open-ai', handler);
  }, []);

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
        const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: history.map((m) => ({
              role: m.role,
              parts: [{ text: m.text }],
            })),
            tools: [{ google_search: {} }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 900 },
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.error?.message || `Request failed (${res.status})`);
        }

        const data = await res.json();
        const aiText =
          data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') ||
          '(no response)';
        setMessages((prev) => [...prev, { role: 'model', text: aiText }]);
      } catch (err: any) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'model',
            text: `⚠️ ${err?.message || 'Something went wrong. Check your API key in Settings.'}`,
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [input, loading, apiKey, profile, workouts, prs, messages],
  );

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  /* ── FAB button (mobile only, sits left of the + FAB) ───────────── */
  const fabButton = (
    <button
      onClick={() => setOpen(true)}
      aria-label="Open AI assistant"
      className="fixed flex items-center justify-center rounded-full shadow-lg active:scale-95 transition-transform z-[94]"
      style={{
        width: 48,
        height: 48,
        right: 'calc(16px + 56px + 12px)', // right of screen + FAB(56px) + gap(12px)
        bottom: 'calc(80px + max(env(safe-area-inset-bottom), 12px))',
        background: 'linear-gradient(135deg, #7c3aed, #2563eb)',
        boxShadow: '0 4px 18px rgba(124,58,237,0.45)',
      }}
    >
      <Sparkles className="w-5 h-5 text-white" />
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
              borderRadius: '22px 22px 0 0',
              background: 'var(--bg-surface)',
              borderTop: '1px solid var(--border)',
            }}
          >
            <ChatContent
              apiKey={apiKey}
              messages={messages}
              input={input}
              loading={loading}
              inputRef={inputRef}
              bottomRef={bottomRef}
              onInput={setInput}
              onKey={handleKey}
              onSend={() => send()}
              onSuggest={(q) => send(q)}
              onClose={close}
              onGoSettings={() => { close(); navigate('/settings'); }}
              onClear={() => setMessages([])}
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
              input={input}
              loading={loading}
              inputRef={inputRef}
              bottomRef={bottomRef}
              onInput={setInput}
              onKey={handleKey}
              onSend={() => send()}
              onSuggest={(q) => send(q)}
              onClose={close}
              onGoSettings={() => { close(); navigate('/settings'); }}
              onClear={() => setMessages([])}
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
  input: string;
  loading: boolean;
  inputRef: React.RefObject<HTMLInputElement>;
  bottomRef: React.RefObject<HTMLDivElement>;
  onInput: (v: string) => void;
  onKey: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onSend: () => void;
  onSuggest: (q: string) => void;
  onClose: () => void;
  onGoSettings: () => void;
  onClear: () => void;
}

const ChatContent: React.FC<ChatContentProps> = ({
  apiKey, messages, input, loading,
  inputRef, bottomRef,
  onInput, onKey, onSend, onSuggest,
  onClose, onGoSettings, onClear,
}) => (
  <>
    {/* Header */}
    <div
      className="flex items-center justify-between px-4 py-3.5 shrink-0"
      style={{ borderBottom: '1px solid var(--border)' }}
    >
      <div className="flex items-center gap-2.5">
        <div
          className="w-8 h-8 rounded-[10px] flex items-center justify-center shrink-0"
          style={{ background: 'linear-gradient(135deg, #7c3aed, #2563eb)' }}
        >
          <Sparkles className="w-4 h-4 text-white" />
        </div>
        <div>
          <p className="text-[14px] font-bold text-[var(--text-primary)] leading-tight">Athlix AI</p>
          <p className="text-[10px] text-[var(--text-muted)] leading-tight">Powered by Gemini</p>
        </div>
      </div>
      <div className="flex items-center gap-1">
        {messages.length > 0 && (
          <button
            onClick={onClear}
            title="Clear chat"
            className="w-8 h-8 flex items-center justify-center rounded-full text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-full text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>

    {/* No API key state */}
    {!apiKey ? (
      <div className="flex-1 flex flex-col items-center justify-center gap-5 px-6 text-center">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, #7c3aed, #2563eb)' }}
        >
          <Sparkles className="w-8 h-8 text-white" />
        </div>
        <div>
          <p className="text-[17px] font-bold text-[var(--text-primary)]">Set up AI Coach</p>
          <p className="mt-1.5 text-[13px] text-[var(--text-muted)] leading-relaxed max-w-[260px]">
            Add your Gemini API key in Settings to enable personalized fitness coaching.
          </p>
        </div>
        <button
          onClick={onGoSettings}
          className="h-11 px-5 rounded-xl text-[13px] font-bold flex items-center gap-2 text-white"
          style={{ background: 'linear-gradient(135deg, #7c3aed, #2563eb)' }}
        >
          <SettingsIcon className="w-4 h-4" />
          Go to Settings
        </button>
        <p className="text-[11px] text-[var(--text-muted)]">
          Get a free key at{' '}
          <span className="text-purple-400">aistudio.google.com</span>
        </p>
      </div>
    ) : (
      <>
        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {/* Empty state with suggestions */}
          {messages.length === 0 && (
            <div className="py-4 space-y-2.5">
              <p className="text-[12px] text-[var(--text-muted)] text-center mb-3">
                Ask me anything about your training
              </p>
              {SUGGESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => onSuggest(q)}
                  className="w-full text-left px-3.5 py-2.5 rounded-xl text-[13px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-elevated)]"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
                >
                  {q}
                </button>
              ))}
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
                  className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-1"
                  style={{ background: 'linear-gradient(135deg, #7c3aed, #2563eb)' }}
                >
                  <Sparkles className="w-3 h-3 text-white" />
                </div>
              )}
              <div
                className="max-w-[82%] px-3.5 py-2.5 text-[13px] leading-relaxed"
                style={{
                  background: m.role === 'user' ? 'var(--accent)' : 'var(--bg-elevated)',
                  color: m.role === 'user' ? '#000' : 'var(--text-primary)',
                  borderRadius:
                    m.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                  border: m.role === 'model' ? '1px solid var(--border)' : 'none',
                }}
              >
                {renderText(m.text)}
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {loading && (
            <div className="flex gap-2 justify-start">
              <div
                className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-1"
                style={{ background: 'linear-gradient(135deg, #7c3aed, #2563eb)' }}
              >
                <Sparkles className="w-3 h-3 text-white" />
              </div>
              <div
                className="flex items-center gap-1.5 px-3.5 py-3 rounded-[18px_18px_18px_4px]"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
              >
                {[0, 1, 2].map((d) => (
                  <span
                    key={d}
                    className="block w-1.5 h-1.5 rounded-full bg-[var(--text-muted)] animate-bounce"
                    style={{ animationDelay: `${d * 0.15}s` }}
                  />
                ))}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input bar */}
        <div
          className="shrink-0 px-3 pt-2 pb-3 flex gap-2 items-center"
          style={{
            borderTop: '1px solid var(--border)',
            paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
          }}
        >
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => onInput(e.target.value)}
            onKeyDown={onKey}
            disabled={loading}
            placeholder="Ask about your training…"
            className="flex-1 h-10 rounded-xl px-3.5 text-[13px] outline-none transition-colors placeholder:text-[var(--text-muted)] text-[var(--text-primary)]"
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
            }}
          />
          <button
            onClick={onSend}
            disabled={loading || !input.trim()}
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 disabled:opacity-40 transition-opacity"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #2563eb)' }}
          >
            {loading ? (
              <Loader2 className="w-4 h-4 text-white animate-spin" />
            ) : (
              <Send className="w-4 h-4 text-white" />
            )}
          </button>
        </div>
      </>
    )}
  </>
);
