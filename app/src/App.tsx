import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { useDeviceStream } from './hooks/useDeviceStream';
import { Dashboard } from './pages/Dashboard';
import { NMMiner } from './pages/NMMiner';
import { AxeOS } from './pages/AxeOS';
import { GroupsPage, GroupDetail } from './pages/Groups';
import { Pool } from './pages/Pool';
import { Templates } from './pages/Templates';
import { Schedules } from './pages/Schedules';
import { Alerts } from './pages/Alerts';
import { Earnings } from './pages/Earnings';
import { Wallets } from './pages/Wallets';
import { Settings } from './pages/Settings';
import { DeviceDetail } from './pages/DeviceDetail';

function AppInner() {
  useDeviceStream();
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/miners/nmminer" element={<NMMiner />} />
        <Route path="/miners/axeos" element={<AxeOS />} />
        <Route path="/devices/:ip" element={<DeviceDetail />} />
        <Route path="/groups" element={<GroupsPage />} />
        <Route path="/groups/:id" element={<GroupDetail />} />
        <Route path="/pool" element={<Pool />} />
        <Route path="/templates" element={<Templates />} />
        <Route path="/schedules" element={<Schedules />} />
        <Route path="/alerts" element={<Alerts />} />
        <Route path="/earnings" element={<Earnings />} />
        <Route path="/wallets" element={<Wallets />} />
        <Route path="/settings" element={<Navigate to="/settings/general" replace />} />
        <Route path="/settings/:section" element={<Settings />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AppShell>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppInner />
    </BrowserRouter>
  );
}
