import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { TxPanel } from './components/TxPanel';
import { Toasts } from './components/Toasts';
import { SkeletonRows } from './components/ui/Skeleton';

const Landing = lazy(() => import('./pages/landing/Landing'));
const Employer = lazy(() => import('./pages/employer/EmployerDashboard'));
const Agent = lazy(() => import('./pages/agent/AgentPanel'));
const Claim = lazy(() => import('./pages/claim/ClaimPage'));
const MyStreams = lazy(() => import('./pages/claim/MyStreams'));
const Activity = lazy(() => import('./pages/activity/ActivityPage'));
const Docs = lazy(() => import('./pages/docs/DocsPage'));
const NotFound = lazy(() => import('./pages/NotFound'));

const Fallback = () => (
  <div className="mx-auto max-w-7xl px-6 py-12">
    <SkeletonRows rows={4} />
  </div>
);

export default function App() {
  return (
    <AppShell>
      <Suspense fallback={<Fallback />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/app" element={<Employer />} />
          <Route path="/app/agent" element={<Agent />} />
          <Route path="/claim/:streamId" element={<Claim />} />
          <Route path="/me" element={<MyStreams />} />
          <Route path="/activity" element={<Activity />} />
          <Route path="/docs" element={<Docs />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
      <TxPanel />
      <Toasts />
    </AppShell>
  );
}
