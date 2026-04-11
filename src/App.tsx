/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter, HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { HeartRateProvider } from './contexts/HeartRateContext';
import { RestTimerProvider } from './contexts/RestTimerContext';
import { Layout } from './components/Layout';
import { Auth } from './pages/Auth';
import { Home } from './pages/Home';
import { Calendar } from './pages/Calendar';
import { Log } from './pages/Log';
import { Templates } from './pages/Templates';
import { Timeline } from './pages/Timeline';
import { Settings } from './pages/Settings';
import { Progress } from './pages/Progress';

import { DashboardLayoutEditor } from './pages/DashboardLayoutEditor';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen bg-black flex items-center justify-center text-white">Loading...</div>;
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
};

const RedirectToStatic = ({ path }: { path: string }) => {
  React.useEffect(() => {
    window.location.href = path;
  }, [path]);
  return null;
};

export default function App() {
  const isGitHubPagesHost =
    typeof window !== 'undefined' && window.location.hostname.endsWith('github.io');
  const Router = isGitHubPagesHost ? HashRouter : BrowserRouter;
  const staticBase =
    (import.meta.env.BASE_URL && import.meta.env.BASE_URL !== './'
      ? import.meta.env.BASE_URL
      : '/') || '/';

  return (
    <AuthProvider>
      <HeartRateProvider>
        <RestTimerProvider>
          <Router>
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route path="/privacy" element={<RedirectToStatic path={`${staticBase}privacy.html`} />} />
              <Route path="/terms" element={<RedirectToStatic path={`${staticBase}terms.html`} />} />
              <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
                <Route index element={<Home />} />
                <Route path="calendar" element={<Calendar />} />
                <Route path="log" element={<Log />} />
                <Route path="templates" element={<Templates />} />
                <Route path="timeline" element={<Timeline />} />
                <Route path="progress" element={<Progress />} />
                <Route path="settings" element={<Settings />} />
                <Route path="settings/layout" element={<DashboardLayoutEditor />} />
              </Route>
            </Routes>
          </Router>
        </RestTimerProvider>
      </HeartRateProvider>
    </AuthProvider>
  );
}
