import React, { useState, useEffect } from 'react';
import { useAppStore, LS_KEY, USER_ID_KEY } from './store/useAppStore';
import { supabase } from './lib/supabase';
import { Layout } from './components/Layout';
import { Auth } from './modules/Auth/Auth';
import { Sprout, Lock } from 'lucide-react';

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

const PasswordResetModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [pw, setPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (pw.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (pw !== confirmPw) { setError('Passwords do not match.'); return; }
    setSubmitting(true);
    const { error: err } = await supabase.auth.updateUser({ password: pw });
    setSubmitting(false);
    if (err) { setError(err.message); return; }
    setSuccess(true);
    setTimeout(onClose, 1500);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <Lock size={20} />
          </div>
          <div>
            <h3 className="font-heading font-bold text-slate-800 dark:text-slate-100">Set New Password</h3>
            <p className="text-[10px] text-slate-400 font-semibold mt-0.5">Choose a new password to finish recovery.</p>
          </div>
        </div>

        {success ? (
          <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2.5">
            Password updated successfully.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">New Password</label>
              <input
                type="password"
                required
                minLength={6}
                value={pw}
                onChange={e => setPw(e.target.value)}
                placeholder="Min. 6 characters"
                autoComplete="new-password"
                className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Confirm Password</label>
              <input
                type="password"
                required
                minLength={6}
                value={confirmPw}
                onChange={e => setConfirmPw(e.target.value)}
                placeholder="Re-enter the same password"
                autoComplete="new-password"
                className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
              />
            </div>
            {error && (
              <div className="text-xs font-semibold text-rose-500 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 disabled:opacity-60 text-white font-bold text-xs rounded-xl shadow-md transition-all"
            >
              {submitting ? 'Updating…' : 'Update Password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

function App() {
  const { initializeStore, checkSession, pullFromSupabase, authUser, authLoading, isSyncing } = useAppStore();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [showPasswordReset, setShowPasswordReset] = useState(false);

  useEffect(() => {
    // Initial bootstrap. initializeStore is async (it consults the Supabase
    // session before deciding whether to seed mock data) so we must await it
    // before checkSession to keep the load order deterministic.
    void (async () => {
      await initializeStore();
      await checkSession();
      const { authUser: user } = useAppStore.getState();
      if (user) pullFromSupabase();
    })();

    // Auth state listener — handles multi-tab logout, password reset / email
    // confirmation flows, and the Google OAuth callback. Our own signIn /
    // signOut actions also trigger these events, so we de-dupe by comparing
    // against the current Zustand authUser.
    const { data: authSub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        // User clicked the reset-password link; Supabase has authenticated
        // them via the magic link. Show the modal so they can pick a new one.
        setShowPasswordReset(true);
        return;
      }
      if (event === 'SIGNED_OUT') {
        if (useAppStore.getState().authUser) {
          useAppStore.setState({ authUser: null });
        }
      } else if (event === 'SIGNED_IN' && session?.user) {
        const newUserId = session.user.id;
        const currentAuthUser = useAppStore.getState().authUser;
        // Already processed (our signIn / checkSession got here first).
        if (currentAuthUser?.id === newUserId) return;

        const storedUserId = localStorage.getItem(USER_ID_KEY);
        if (storedUserId && storedUserId !== newUserId) {
          // Different user — wipe prior data to prevent cross-account leak.
          localStorage.removeItem(LS_KEY);
          useAppStore.setState({
            crops: [], inventory: [], usageLogs: [], harvests: [],
            expenses: [], weatherLogs: [], activeCropId: null, syncQueue: [],
          });
        }
        localStorage.setItem(USER_ID_KEY, newUserId);
        useAppStore.setState({ authUser: { id: newUserId, email: session.user.email ?? '' } });
        void useAppStore.getState().pullFromSupabase();
      }
      // TOKEN_REFRESHED, INITIAL_SESSION, USER_UPDATED — no action; Supabase
      // refreshes tokens silently and INITIAL_SESSION is already handled by
      // the bootstrap above.
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
      authSub.subscription.unsubscribe();
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
  if (!authUser) {
    return (
      <>
        <Auth />
        {showPasswordReset && <PasswordResetModal onClose={() => setShowPasswordReset(false)} />}
      </>
    );
  }

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
    <>
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
      {showPasswordReset && <PasswordResetModal onClose={() => setShowPasswordReset(false)} />}
    </>
  );
}

export default App;
