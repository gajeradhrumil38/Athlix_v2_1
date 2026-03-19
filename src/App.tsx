/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
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

export default function App() {
  return (
    <AuthProvider>
      <RestTimerProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/auth" element={<Auth />} />
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
        </BrowserRouter>
      </RestTimerProvider>
    </AuthProvider>
  );
}
