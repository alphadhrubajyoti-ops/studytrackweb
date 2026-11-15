import { lazy, Suspense, useEffect, useState } from 'react';
import { HashRouter, Route, Routes, Navigate } from 'react-router-dom';
import { DataProvider, useData } from './hooks/useData';
import { ToastProvider, useToast } from './hooks/useToast';
import { useApplyTheme } from './hooks/useTheme';
import { Layout } from './components/Layout';
import { RunningSessionWatcher } from './components/Timer';
import { LockScreen } from './components/LockScreen';
import { Onboarding } from './pages/Onboarding';
import Home from './pages/Home';
import StudyLog from './pages/StudyLog';
import CalendarPage from './pages/Calendar';
import Settings from './pages/Settings';
import { Skeleton } from './components/ui';
import { useReminders } from './pwa/notifications';
import { metTarget } from './lib/stats';

// Charts are the heaviest dependency, so the Reports page loads on demand.
const Reports = lazy(() => import('./pages/Reports'));

function Gate() {
  const { ready, settings, dayMap, goals, todayKey } = useData();
  const toast = useToast();
  const [unlocked, setUnlocked] = useState(
    () => sessionStorage.getItem('studytrack.unlocked') === '1',
  );
  useApplyTheme(settings.theme, settings.accent);
  useReminders(settings, metTarget(dayMap, goals, todayKey));

  useEffect(() => {
    document.getElementById('boot')?.remove();
  }, []);

  useEffect(() => {
    const onUpdate = (e: Event) => {
      const apply = (e as CustomEvent<() => void>).detail;
      toast.show('A new version of StudyTrack is ready.', 'info', { label: 'Reload', run: apply });
    };
    const onOffline = () => toast.show('StudyTrack is ready to work offline.', 'success');
    window.addEventListener('studytrack:update-ready', onUpdate);
    window.addEventListener('studytrack:offline-ready', onOffline);
    return () => {
      window.removeEventListener('studytrack:update-ready', onUpdate);
      window.removeEventListener('studytrack:offline-ready', onOffline);
    };
  }, [toast]);

  if (!ready) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (settings.lock && !unlocked) {
    return (
      <LockScreen
        lock={settings.lock}
        onUnlock={() => {
          sessionStorage.setItem('studytrack.unlocked', '1');
          setUnlocked(true);
        }}
      />
    );
  }

  return (
    <>
      <RunningSessionWatcher />
      {!settings.onboarded && <Onboarding />}
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="log" element={<StudyLog />} />
            <Route path="calendar" element={<CalendarPage />} />
            <Route
              path="reports"
              element={
                <Suspense fallback={<Skeleton className="h-96" />}>
                  <Reports />
                </Suspense>
              }
            />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </HashRouter>
    </>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <DataProvider>
        <Gate />
      </DataProvider>
    </ToastProvider>
  );
}
