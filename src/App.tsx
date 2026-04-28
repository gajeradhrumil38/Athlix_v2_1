/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { HeartRateProvider } from './contexts/HeartRateContext';
import { RestTimerProvider } from './contexts/RestTimerContext';
import { Layout } from './components/Layout';
import { LoadingScreen } from './components/LoadingScreen';
import { Auth } from './legacy-pages/Auth';
import { Home } from './legacy-pages/Home';
import { Calendar } from './legacy-pages/Calendar';
import { Log } from './legacy-pages/Log';
import { Templates } from './legacy-pages/Templates';
import { Timeline } from './legacy-pages/Timeline';
import { Settings } from './legacy-pages/Settings';
import { Progress } from './legacy-pages/Progress';

import { DashboardLayoutEditor } from './legacy-pages/DashboardLayoutEditor';
import { WhoopCallback } from './legacy-pages/WhoopCallback';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
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
  const staticBase = '/';

  return (
    <AuthProvider>
      <HeartRateProvider>
        <RestTimerProvider>
          <HashRouter>
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route path="/whoop/callback" element={<WhoopCallback />} />
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
          </HashRouter>
        </RestTimerProvider>
      </HeartRateProvider>
    </AuthProvider>
  );
}
