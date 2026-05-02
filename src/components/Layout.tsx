import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AppIcon, IconName } from '../config/icons';
import { AiChat } from './AiChat';

const navItems: { path: string; icon: IconName; label: string }[] = [
  { path: '/',          icon: 'Home',      label: 'Home'      },
  { path: '/calendar',  icon: 'Calendar',  label: 'Calendar'  },
  { path: '/log',       icon: 'Plus',      label: 'Log'       },
  { path: '/templates', icon: 'Clipboard', label: 'Templates' },
  { path: '/timeline',  icon: 'History',   label: 'Timeline'  },
  { path: '/progress',  icon: 'Trending',  label: 'Progress'  },
  { path: '/run',       icon: 'Run',       label: 'Run'       },
  { path: '/settings',  icon: 'Settings',  label: 'Settings'  },
];

const mobileNavItems: { path: string; icon: IconName; label: string }[] = [
  { path: '/',         icon: 'Home',     label: 'Home'     },
  { path: '/progress', icon: 'Activity', label: 'Progress' },
  { path: '/calendar', icon: 'Calendar', label: 'Calendar' },
  { path: '/run',      icon: 'Run',      label: 'Run'      },
  { path: '/settings', icon: 'More',     label: 'More'     },
];

export const Layout: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [viewportHeight, setViewportHeight] = useState(
    typeof window === 'undefined' ? 0 : window.innerHeight,
  );
  const [tappedTab, setTappedTab] = useState<string | null>(null);
  const isImmersiveRoute = location.pathname === '/log' || location.pathname === '/run';
  const isHomeRoute = location.pathname === '/';
  const swipeStartRef = useRef<{ x: number; y: number; ts: number } | null>(null);
  const tapTimerRef = useRef<number | null>(null);

  const currentPageLabel = useMemo(() => {
    if (location.pathname.startsWith('/settings/layout')) return 'Layout';
    if (location.pathname === '/') return 'Home';
    const route = navItems.find(
      (item) => item.path !== '/' && location.pathname.startsWith(item.path),
    );
    return route?.label || 'Athlix';
  }, [location.pathname]);

  const canGoBack = location.pathname !== '/';

  /* ── Viewport height (handles mobile browser chrome) ── */
  useEffect(() => {
    const update = () => {
      setViewportHeight(Math.round(window.visualViewport?.height || window.innerHeight));
    };
    update();
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    return () => {
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
    };
  }, []);

  useEffect(() => {
    return () => { if (tapTimerRef.current) window.clearTimeout(tapTimerRef.current); };
  }, []);

  /* ── Back navigation ─────────────────────────────────── */
  const handleBack = () => {
    if (!canGoBack) return;
    window.history.length > 1 ? navigate(-1) : navigate('/');
  };

  /* ── Left-edge swipe → back ──────────────────────────── */
  const handleTouchStart = (e: React.TouchEvent<HTMLElement>) => {
    if (!canGoBack || e.touches.length !== 1) { swipeStartRef.current = null; return; }
    const touch = e.touches[0];
    if (touch.clientX > 28) { swipeStartRef.current = null; return; }
    swipeStartRef.current = { x: touch.clientX, y: touch.clientY, ts: Date.now() };
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLElement>) => {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!start || e.changedTouches.length !== 1) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = Math.abs(touch.clientY - start.y);
    const dt = Date.now() - start.ts;
    if (dx > 78 && dy < 56 && dt < 520) handleBack();
  };

  /* ── Tab tap feedback ───────────────────────────────── */
  const handleTabTap = (path: string) => {
    if (navigator.vibrate) navigator.vibrate(10);
    setTappedTab(path);
    if (tapTimerRef.current) window.clearTimeout(tapTimerRef.current);
    tapTimerRef.current = window.setTimeout(() => setTappedTab(null), 150);
  };

  return (
    <div
      className="flex bg-[var(--bg-base)] text-[var(--text-primary)] overflow-hidden"
      style={viewportHeight > 0 ? { height: `${viewportHeight}px` } : undefined}
    >
      {/* ── Desktop sidebar ───────────────────────────── */}
      <aside className="hidden md:flex flex-col w-60 shrink-0 border-r border-[var(--border)] bg-[var(--bg-surface)]">
        {/* Logo */}
        <div className="px-6 py-5 border-b border-[var(--border)]">
          <span
            className="text-[22px] font-black tracking-[0.10em] text-[var(--accent)]"
            style={{ fontFamily: '"Arial Black", sans-serif' }}
          >
            ATHLIX
          </span>
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-[var(--accent-dim)] text-[var(--accent)] border border-[var(--accent)]/20'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]'
                }`
              }
            >
              <AppIcon name={item.icon} size="md" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Sidebar footer */}
        <div className="px-3 py-4 border-t border-[var(--border)] space-y-2">
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('athlix:open-ai'))}
            className="flex w-full items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] transition-all duration-150"
          >
            <span
              className="flex h-5 w-5 items-center justify-center rounded-md shrink-0"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #2563eb)' }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
              </svg>
            </span>
            <span>AI Coach</span>
          </button>
          <p className="text-[11px] text-[var(--text-muted)] px-3">Track. Recover. Perform.</p>
        </div>
      </aside>

      {/* ── Mobile top header ─────────────────────────── */}
      {!isImmersiveRoute && !isHomeRoute && (
        <header
          className="md:hidden fixed top-0 left-0 right-0 z-[90]"
          style={{
            paddingTop: 'env(safe-area-inset-top)',
            background: 'color-mix(in srgb, var(--bg-base) 82%, transparent)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div className="flex h-[54px] items-center justify-between px-4">
            {/* Back button */}
            <button
              type="button"
              onClick={handleBack}
              disabled={!canGoBack}
              aria-label="Go back"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--bg-elevated)] text-[var(--text-secondary)] transition-all active:scale-95 disabled:opacity-30"
            >
              <AppIcon name="Back" size="md" />
            </button>

            {/* Page title */}
            <span className="text-[15px] font-semibold text-[var(--text-primary)] tracking-wide">
              {currentPageLabel}
            </span>

            {/* Home shortcut */}
            <button
              type="button"
              onClick={() => navigate('/')}
              aria-label="Go to home"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent-dim)] text-[var(--accent)] border border-[var(--accent)]/20 transition-all active:scale-95"
            >
              <AppIcon name="Home" size="sm" />
            </button>
          </div>
        </header>
      )}

      {/* ── Main content ──────────────────────────────── */}
      <main
        className={`flex-1 flex flex-col h-full relative overflow-y-auto ${
          isImmersiveRoute
            ? ''
            : isHomeRoute
              ? 'pb-[calc(72px+env(safe-area-inset-bottom))] md:pb-0'
              : 'pt-[calc(54px+env(safe-area-inset-top))] pb-[calc(72px+env(safe-area-inset-bottom))] md:pt-0 md:pb-0'
        }`}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className={`flex-1 w-full ${
            isImmersiveRoute || isHomeRoute
              ? ''
              : 'px-3 pt-4 pb-6 sm:px-5 md:px-8 md:pt-8 md:pb-8'
          }`}
        >
          <Outlet />
        </div>
      </main>

      {/* ── AI Chat ──────────────────────────────────── */}
      {!isImmersiveRoute && <AiChat />}

      {/* ── Floating Action Button ────────────────────── */}
      {!isImmersiveRoute && (
        <NavLink
          to="/log?add=1"
          onClick={() => { if (navigator.vibrate) navigator.vibrate(15); }}
          aria-label="Start workout"
          className="md:hidden fixed right-4 w-14 h-14 rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-transform z-[95]"
          style={{
            bottom: 'calc(80px + max(env(safe-area-inset-bottom), 12px))',
            background: 'var(--accent)',
            color: '#000',
            boxShadow: '0 4px 20px var(--accent-glow)',
          }}
        >
          <AppIcon name="Plus" size="lg" />
        </NavLink>
      )}

      {/* ── Mobile bottom nav ─────────────────────────── */}
      {!isImmersiveRoute && (
        <>
          {/* Fade gradient above nav */}
          <div
            className="md:hidden fixed left-0 right-0 z-[97] pointer-events-none"
            style={{
              bottom: 'calc(64px + env(safe-area-inset-bottom))',
              height: 28,
              background: 'linear-gradient(to bottom, transparent, color-mix(in srgb, var(--bg-base) 88%, transparent))',
            }}
          />

          <nav
            className="md:hidden fixed left-0 right-0 bottom-0 z-[98]"
            style={{
              background: 'color-mix(in srgb, var(--bg-base) 92%, transparent)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              borderTop: '1px solid var(--border)',
              paddingBottom: 'env(safe-area-inset-bottom)',
            }}
          >
            <div className="mx-auto flex h-16 max-w-[480px] items-center justify-around px-4">
              {mobileNavItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === '/'}
                  onClick={() => handleTabTap(item.path)}
                  className={({ isActive }) =>
                    `relative flex flex-col items-center justify-center gap-1 w-16 h-full transition-all duration-150 ${
                      isActive ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'
                    } ${tappedTab === item.path ? 'scale-110' : 'scale-100'}`
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <span className="pointer-events-none absolute left-1/2 bottom-2 h-2.5 w-11 -translate-x-1/2 rounded-full bg-[var(--accent)]/28 blur-[10px]" />
                      )}
                      <span className="relative z-10">
                        <AppIcon name={item.icon} size="md" />
                      </span>
                      <span className={`text-[10px] font-medium leading-none relative z-10 ${isActive ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}`}>
                        {item.label}
                      </span>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </nav>
        </>
      )}

      {/* ── Toast notifications ───────────────────────── */}
      <Toaster
        position="top-center"
        gutter={8}
        toastOptions={{
          duration: 3000,
          style: {
            background: 'var(--bg-elevated)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            fontSize: '14px',
            fontWeight: 500,
            padding: '10px 14px',
          },
          success: {
            iconTheme: { primary: 'var(--accent)', secondary: '#000' },
          },
          error: {
            iconTheme: { primary: 'var(--red)', secondary: '#fff' },
          },
        }}
      />
    </div>
  );
};
