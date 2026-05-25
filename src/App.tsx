import { useState, useEffect } from 'react';
import { useAppStore } from './store/useAppStore';
import { Layout } from './components/Layout';
import { Auth } from './modules/Auth/Auth';
import { Sprout } from 'lucide-react';

// Modules
import { Dashboard } from './modules/Dashboard/Dashboard';
import { CropLifecycle } from './modules/CropLifecycle/CropLifecycle';
import { Inventory } from './modules/Inventory/Inventory';
import { UsageLogs } from './modules/UsageLogs/UsageLogs';
import { Harvest } from './modules/Harvest/Harvest';
import { Expenses } from './modules/Expenses/Expenses';
import { Weather } from './modules/Weather/Weather';
import { Analytics } from './modules/Analytics/Analytics';
import { Reports } from './modules/Reports/Reports';
import { Reference } from './modules/Reference/Reference';
import { Settings } from './modules/Settings/Settings';

function App() {
  const { initializeStore, checkSession, pullFromSupabase, authUser, authLoading, isSyncing } = useAppStore();
  const [activeTab, setActiveTab] = useState('dashboard');

  useEffect(() => {
    initializeStore();
    checkSession().then(() => {
      const { authUser: user } = useAppStore.getState();
      if (user) pullFromSupabase();
    });

    // Auto-retry 1: when the device comes back online, flush queued writes.
    const handleOnline = () => {
      const { authUser: user, syncQueue } = useAppStore.getState();
      if (user && syncQueue.length > 0) {
        void useAppStore.getState().pullFromSupabase();
      }
    };
    window.addEventListener('online', handleOnline);

    // Auto-retry 2: while syncQueue has items, retry every 30s. Clear the
    // interval as soon as the queue drains. A store subscription re-arms the
    // interval whenever new pending work appears.
    let retryInterval: ReturnType<typeof setInterval> | null = null;
    const tick = () => {
      const { syncQueue: queue, authUser: user } = useAppStore.getState();
      if (queue.length === 0) {
        if (retryInterval) {
          clearInterval(retryInterval);
          retryInterval = null;
        }
        return;
      }
      if (user && navigator.onLine) {
        void useAppStore.getState().pullFromSupabase();
      }
    };
    const ensureInterval = () => {
      if (retryInterval) return;
      if (useAppStore.getState().syncQueue.length === 0) return;
      retryInterval = setInterval(tick, 30 * 1000);
    };
    const unsubscribe = useAppStore.subscribe(() => { ensureInterval(); });
    ensureInterval();

    return () => {
      window.removeEventListener('online', handleOnline);
      if (retryInterval) clearInterval(retryInterval);
      unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Full-screen spinner while checking session
  if (authLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-slate-950 to-emerald-950 gap-4">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center shadow-xl">
          <Sprout size={28} className="text-white" />
        </div>
        <div className="w-6 h-6 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  // Show auth screen when not signed in
  if (!authUser) return <Auth />;

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':     return <Dashboard setActiveTab={setActiveTab} />;
      case 'cropLifecycle': return <CropLifecycle />;
      case 'inventory':     return <Inventory />;
      case 'usageLogs':     return <UsageLogs />;
      case 'harvest':       return <Harvest />;
      case 'expenses':      return <Expenses />;
      case 'weather':       return <Weather />;
      case 'analytics':     return <Analytics />;
      case 'reports':       return <Reports />;
      case 'reference':     return <Reference />;
      case 'settings':      return <Settings />;
      default:              return <Dashboard setActiveTab={setActiveTab} />;
    }
  };

  return (
    <Layout activeTab={activeTab} setActiveTab={setActiveTab}>
      {/* Sync indicator */}
      {isSyncing && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold px-3 py-1.5 rounded-full backdrop-blur-sm">
          <div className="w-3 h-3 border border-emerald-400/40 border-t-emerald-400 rounded-full animate-spin" />
          Syncing…
        </div>
      )}
      {renderContent()}
    </Layout>
  );
}

export default App;
