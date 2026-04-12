import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AppIcon, IconName } from '../config/icons';

const navItems: { path: string; icon: IconName; label: string }[] = [
  { path: '/', icon: 'Home', label: 'Home' },
  { path: '/calendar', icon: 'Calendar', label: 'Calendar' },
  { path: '/log', icon: 'Plus', label: 'Log' },
  { path: '/templates', icon: 'Clipboard', label: 'Templates' },
  { path: '/timeline', icon: 'History', label: 'Timeline' },
  { path: '/progress', icon: 'Trending', label: 'Progress' },
  { path: '/settings', icon: 'Settings', label: 'Settings' },
];

export const Layout: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [viewportHeight, setViewportHeight] = useState(
    typeof window === 'undefined' ? 0 : window.innerHeight,
  );
  const isImmersiveRoute = location.pathname === '/log';
  const swipeStartRef = useRef<{ x: number; y: number; ts: number } | null>(null);

  const currentPageLabel = useMemo(() => {
    if (location.pathname.startsWith('/settings/layout')) return 'Layout';
    const route = navItems.find((item) => item.path === location.pathname);
    return route?.label || 'Athlix';
  }, [location.pathname]);

  const canGoBack = location.pathname !== '/';

  useEffect(() => {
    const updateViewportHeight = () => {
      const nextHeight = Math.round(window.visualViewport?.height || window.innerHeight);
      setViewportHeight(nextHeight);
    };

    updateViewportHeight();

    window.addEventListener('resize', updateViewportHeight);
    window.visualViewport?.addEventListener('resize', updateViewportHeight);
    window.visualViewport?.addEventListener('scroll', updateViewportHeight);

    return () => {
      window.removeEventListener('resize', updateViewportHeight);
      window.visualViewport?.removeEventListener('resize', updateViewportHeight);
      window.visualViewport?.removeEventListener('scroll', updateViewportHeight);
    };
  }, []);

  const handleBack = () => {
    if (!canGoBack) return;
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate('/');
  };

  const handleTouchStart = (event: React.TouchEvent<HTMLElement>) => {
    if (!canGoBack || event.touches.length !== 1) {
      swipeStartRef.current = null;
      return;
    }

    const touch = event.touches[0];
    if (touch.clientX > 28) {
      swipeStartRef.current = null;
      return;
    }

    swipeStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      ts: Date.now(),
    };
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLElement>) => {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!start || event.changedTouches.length !== 1) return;

    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - start.x;
    const deltaY = Math.abs(touch.clientY - start.y);
    const elapsed = Date.now() - start.ts;

    if (deltaX > 78 && deltaY < 56 && elapsed < 520) {
      handleBack();
    }
  };

  return (
    <div
      className="flex bg-black text-white overflow-hidden"
      style={viewportHeight > 0 ? { height: `${viewportHeight}px` } : undefined}
    >
      {/* Sidebar for tablet/desktop */}
      <aside className="hidden md:flex flex-col w-64 border-r border-white/10 bg-[#0A0A0A]">
        <div className="p-6">
          <h1 className="text-2xl font-bold tracking-tighter text-[#00D4FF]">ATHLIX</h1>
        </div>
        <nav className="flex-1 px-4 space-y-2">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center space-x-3 px-4 py-3 rounded-xl transition-colors ${
                  isActive
                    ? 'bg-[#00D4FF]/10 text-[#00D4FF]'
                    : 'text-gray-400 hover:bg-white/5 hover:text-white'
                }`
              }
            >
              <AppIcon name={item.icon} size="md" />
              <span className="font-medium">{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Main Content */}
      <main
        className="flex-1 flex flex-col h-full relative overflow-y-auto md:pb-0"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        style={
          isImmersiveRoute
            ? undefined
            : { paddingBottom: 'calc(102px + max(env(safe-area-inset-bottom), 12px))' }
        }
      >
        {!isImmersiveRoute && (
          <div
            className="md:hidden sticky top-0 z-[80] border-b border-white/5 bg-[linear-gradient(180deg,rgba(8,17,30,0.92),rgba(8,17,30,0.55),transparent)] backdrop-blur-xl px-3 pb-2"
            style={{ paddingTop: 'max(env(safe-area-inset-top), 8px)' }}
          >
            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.035] px-2 py-2 shadow-[0_10px_35px_rgba(0,0,0,0.28)]">
              <button
                type="button"
                onClick={handleBack}
                disabled={!canGoBack}
                aria-label="Go back"
                className="inline-flex h-9 min-w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.035] px-2 text-white/90 transition hover:bg-white/[0.08] disabled:cursor-default disabled:opacity-35"
              >
                <AppIcon name="Back" size="md" />
              </button>
              <p className="text-sm font-semibold tracking-wide text-slate-100">{currentPageLabel}</p>
              <button
                type="button"
                onClick={() => navigate('/')}
                aria-label="Go to home"
                className="inline-flex h-9 min-w-9 items-center justify-center rounded-lg border border-cyan-400/20 bg-cyan-400/10 px-2 text-cyan-300 transition hover:bg-cyan-400/20"
              >
                <AppIcon name="Home" size="sm" />
              </button>
            </div>
          </div>
        )}

        <div
          className={`flex-1 w-full ${
            isImmersiveRoute
              ? ''
              : 'px-3 pt-3 pb-5 sm:px-5 md:px-8 md:pt-8 md:pb-8'
          }`}
        >
          <Outlet />
        </div>
      </main>

      {/* Floating Action Button */}
      {!isImmersiveRoute && (
        <NavLink
          to="/log?add=1"
          onClick={() => {
            if (navigator.vibrate) navigator.vibrate(15);
          }}
          className="md:hidden fixed right-4 w-14 h-14 rounded-full bg-[var(--accent)] text-black flex items-center justify-center shadow-[0_8px_24px_var(--accent-glow)] active:scale-95 transition-transform z-[95]"
          style={{ bottom: 'calc(88px + max(env(safe-area-inset-bottom), 12px))' }}
        >
          <AppIcon name="Plus" size="lg" />
        </NavLink>
      )}

      {/* Bottom Navigation for mobile */}
      {!isImmersiveRoute && (
        <nav
          className="md:hidden fixed left-3 right-3 z-[100] rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(18,30,48,0.48),rgba(8,18,30,0.86))] backdrop-blur-2xl shadow-[0_20px_45px_rgba(0,0,0,0.45)]"
          style={{ bottom: 'max(env(safe-area-inset-bottom), 10px)' }}
        >
          <div className="pointer-events-none absolute -top-px left-5 right-5 h-px bg-gradient-to-r from-transparent via-cyan-300/70 to-transparent" />
          <div className="mx-auto h-[64px] max-w-[540px] flex items-center justify-between px-6 relative">
            <NavLink
              to="/"
              className={({ isActive }) =>
                `flex flex-col items-center justify-center h-full w-16 relative transition ${
                  isActive ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <div className="absolute top-1 left-2 right-2 h-[2px] rounded-full bg-[var(--accent)]/90 shadow-[0_0_12px_var(--accent-glow)]" />}
                  <AppIcon name="Home" size="md" className="mb-1" />
                  <span className="text-[10px] font-medium tracking-wide">Home</span>
                </>
              )}
            </NavLink>

            <NavLink
              to="/progress"
              className={({ isActive }) =>
                `flex flex-col items-center justify-center h-full w-16 relative transition ${
                  isActive ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <div className="absolute top-1 left-2 right-2 h-[2px] rounded-full bg-[var(--accent)]/90 shadow-[0_0_12px_var(--accent-glow)]" />}
                  <AppIcon name="Activity" size="md" className="mb-1" />
                  <span className="text-[10px] font-medium tracking-wide">Health</span>
                </>
              )}
            </NavLink>

            <NavLink
              to="/calendar"
              className={({ isActive }) =>
                `flex flex-col items-center justify-center h-full w-16 relative transition ${
                  isActive ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <div className="absolute top-1 left-2 right-2 h-[2px] rounded-full bg-[var(--accent)]/90 shadow-[0_0_12px_var(--accent-glow)]" />}
                  <AppIcon name="Calendar" size="md" className="mb-1" />
                  <span className="text-[10px] font-medium tracking-wide">Calendar</span>
                </>
              )}
            </NavLink>

            <NavLink
              to="/settings"
              className={({ isActive }) =>
                `flex flex-col items-center justify-center h-full w-16 relative transition ${
                  isActive ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <div className="absolute top-1 left-2 right-2 h-[2px] rounded-full bg-[var(--accent)]/90 shadow-[0_0_12px_var(--accent-glow)]" />}
                  <AppIcon name="More" size="md" className="mb-1" />
                  <span className="text-[10px] font-medium tracking-wide">More</span>
                </>
              )}
            </NavLink>
          </div>
        </nav>
      )}

      <Toaster 
        position="top-center"
        toastOptions={{
          style: {
            background: '#1A1A1A',
            color: '#fff',
            border: '1px solid rgba(255,255,255,0.1)',
          },
        }}
      />
    </div>
  );
};
