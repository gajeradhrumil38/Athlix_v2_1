import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
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
  return (
    <div className="flex h-screen bg-black text-white overflow-hidden">
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
      <main className="flex-1 flex flex-col h-full relative overflow-y-auto pb-[calc(58px+env(safe-area-inset-bottom))] md:pb-0">
        <div className="flex-1 w-full max-w-5xl mx-auto md:p-8">
          <Outlet />
        </div>
      </main>

      {/* Floating Action Button */}
      <NavLink 
        to="/log"
        onClick={() => { if (navigator.vibrate) navigator.vibrate(15); }} 
        className="md:hidden fixed bottom-[calc(70px+env(safe-area-inset-bottom))] right-4 w-14 h-14 rounded-full bg-[var(--accent)] text-black flex items-center justify-center shadow-[0_4px_20px_var(--accent-glow)] active:scale-95 transition-transform z-[90]"
      >
        <AppIcon name="Plus" size="lg" />
      </NavLink>

      {/* Bottom Navigation for mobile */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-[calc(58px+env(safe-area-inset-bottom))] bg-[var(--bg-base)]/90 backdrop-blur-xl border-t border-[var(--border)] z-[100] pb-safe">
        <div className="max-w-[480px] mx-auto h-[58px] flex items-center justify-between px-6 relative">
          <NavLink to="/" className={({ isActive }) => `flex flex-col items-center justify-center h-full w-16 relative ${isActive ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>
            {({ isActive }) => (
              <>
                {isActive && <div className="absolute top-0 left-0 right-0 h-[2px] bg-[var(--accent)]"></div>}
                <AppIcon name="Home" size="md" className="mb-1" />
                <span className="text-[10px] font-medium tracking-wide">Home</span>
              </>
            )}
          </NavLink>
          
          <NavLink to="/progress" className={({ isActive }) => `flex flex-col items-center justify-center h-full w-16 relative ${isActive ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>
            {({ isActive }) => (
              <>
                {isActive && <div className="absolute top-0 left-0 right-0 h-[2px] bg-[var(--accent)]"></div>}
                <AppIcon name="Activity" size="md" className="mb-1" />
                <span className="text-[10px] font-medium tracking-wide">Health</span>
              </>
            )}
          </NavLink>
          
          <NavLink to="/calendar" className={({ isActive }) => `flex flex-col items-center justify-center h-full w-16 relative ${isActive ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>
            {({ isActive }) => (
              <>
                {isActive && <div className="absolute top-0 left-0 right-0 h-[2px] bg-[var(--accent)]"></div>}
                <AppIcon name="Calendar" size="md" className="mb-1" />
                <span className="text-[10px] font-medium tracking-wide">Calendar</span>
              </>
            )}
          </NavLink>
          
          <NavLink to="/settings" className={({ isActive }) => `flex flex-col items-center justify-center h-full w-16 relative ${isActive ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>
            {({ isActive }) => (
              <>
                {isActive && <div className="absolute top-0 left-0 right-0 h-[2px] bg-[var(--accent)]"></div>}
                <AppIcon name="More" size="md" className="mb-1" />
                <span className="text-[10px] font-medium tracking-wide">More</span>
              </>
            )}
          </NavLink>
        </div>
      </nav>

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
