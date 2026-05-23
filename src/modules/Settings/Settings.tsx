import React, { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import {
  Layout, Sliders, Database, Trash2,
  ToggleLeft, ToggleRight, ArrowUp, ArrowDown, ShieldAlert,
  RefreshCw, AlertCircle, User, LogOut, CheckCircle2, WifiOff
} from 'lucide-react';

export const Settings: React.FC = () => {
  const {
    settings, toggleModule, toggleFeature,
    updateWidgetOrder, resetAllData, authUser, signOut, pullFromSupabase, isSyncing, isOnline
  } = useAppStore();

  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const moveWidget = (index: number, direction: 'up' | 'down') => {
    const newOrder = [...settings.widgetsOrder];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    
    if (targetIndex < 0 || targetIndex >= newOrder.length) return;
    
    // Swap elements
    const temp = newOrder[index];
    newOrder[index] = newOrder[targetIndex];
    newOrder[targetIndex] = temp;
    
    updateWidgetOrder(newOrder);
  };

  const handleReset = () => {
    resetAllData();
    setShowResetConfirm(false);
    alert('System database reset successfully. Pre-seeded database has been cleared.');
    window.location.reload();
  };

  const widgetDisplayNames: Record<string, string> = {
    cropSummary: '🌱 Active Crop Summary Metrics',
    financials: '💰 Crop Financial Health & P&L',
    stockAlerts: '⚠️ Low-Stock & Inventory Warnings',
    spraysReminders: '📅 Spraying & Fertigation Reminders',
    miniCharts: '📊 Interactive Trend Mini-Sparklines',
    weatherBrief: '🌤️ Greenhouse Climate Brief (VPD)',
    activityFeed: '⚡ Real-time Operations Audit Logs'
  };

  const moduleDisplayNames: Record<keyof typeof settings.modules, { name: string, desc: string }> = {
    dashboard: { name: 'Dashboard View', desc: 'Main control center with widgets and key KPIs' },
    cropLifecycle: { name: 'Crop Lifecycle Manager', desc: 'Sow new batches, transplant timers and archives' },
    inventory: { name: 'Inventory & Inputs', desc: 'Stock registers, thresholds and warning banners' },
    usageLogs: { name: 'Usage Logs', desc: 'Record NPK fertigation blocks and foliar sprays' },
    harvest: { name: 'Harvests & Sales', desc: 'Sizing grids A/B/C and direct contract revenues' },
    expenses: { name: 'Expenses Ledger', desc: 'Labour hiring ledgers, packaging, transport bills' },
    weather: { name: 'Weather Center', desc: 'VPD calculation algorithms and humidity tracking' },
    analytics: { name: 'Analytics & Trends', desc: 'Deep dive Recharts comparative visuals' },
    reports: { name: 'Reports & Export', desc: 'Download Excel sheets and print PDF crop audits' },
    reference: { name: 'Agri Reference Guide', desc: 'Deficiency diagnosis boards and spray schedules' }
  };

  const featureDisplayNames: Record<keyof typeof settings.features, { name: string, desc: string }> = {
    expenseAnalytics: { name: 'P&L Analytics Engine', desc: 'Automatically compute ROI, cost/kg, cost/plant' },
    charts: { name: 'Vibrant Graphic Charts', desc: 'Compile visual trends on dashboard and analytics' },
    inventoryAlerts: { name: 'Active Depletion Prompts', desc: 'Flag materials when inventory dips below trigger threshold' },
    recurringReminders: { name: 'Foliar Interval Trackers', desc: 'Compute spray recurrences on dashboard reminders' },
    weatherForecast: { name: '3-Day Climate Models', desc: 'Pull forecasts dynamically based on polyhouse coordinates' },
    photoUploads: { name: 'Input & Harvest Photos', desc: 'Cache leaf deficiency or graded batch photos locally' }
  };

  return (
    <div className="space-y-6">
      
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* MODULES & SYSTEM FEATURES CONTROLLER */}
        <div className="xl:col-span-2 space-y-6">
          
          {/* Module Toggles */}
          <div className="glass-premium p-6 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <Layout size={20} />
              </div>
              <div>
                <h3 className="font-heading font-bold text-slate-800 dark:text-slate-100">Application Modules Switchboard</h3>
                <p className="text-xs text-slate-400 font-semibold mt-0.5">Toggle primary screens on/off. Disabled tabs disappear from navigation bars dynamically.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
              {Object.keys(settings.modules).map((moduleKey) => {
                const key = moduleKey as keyof typeof settings.modules;
                const active = settings.modules[key];
                const info = moduleDisplayNames[key];
                if (!info) return null;
                return (
                  <button
                    key={key}
                    onClick={() => toggleModule(key)}
                    className={`flex items-start justify-between p-3.5 rounded-xl border text-left transition-all ${
                      active 
                        ? 'border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-500/5' 
                        : 'border-slate-200/50 dark:border-slate-800/50 hover:bg-slate-100/30 dark:hover:bg-slate-900/30'
                    }`}
                  >
                    <div className="space-y-1 pr-4">
                      <div className="text-xs font-bold text-slate-700 dark:text-slate-250 flex items-center gap-1.5">
                        <span className={active ? 'text-emerald-500' : 'text-slate-400'}>&bull;</span>
                        <span>{info.name}</span>
                      </div>
                      <div className="text-[10px] text-slate-400 font-semibold leading-relaxed">{info.desc}</div>
                    </div>
                    {active ? (
                      <ToggleRight size={24} className="text-emerald-500 shrink-0" />
                    ) : (
                      <ToggleLeft size={24} className="text-slate-400 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Feature toggles */}
          <div className="glass-premium p-6 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400">
                <Sliders size={20} />
              </div>
              <div>
                <h3 className="font-heading font-bold text-slate-800 dark:text-slate-100">Intelligent Feature Configurations</h3>
                <p className="text-xs text-slate-400 font-semibold mt-0.5">Toggle advanced algorithms, visual engines, and local triggers.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
              {Object.keys(settings.features).map((featureKey) => {
                const key = featureKey as keyof typeof settings.features;
                const active = settings.features[key];
                const info = featureDisplayNames[key];
                if (!info) return null;
                return (
                  <button
                    key={key}
                    onClick={() => toggleFeature(key)}
                    className={`flex items-start justify-between p-3.5 rounded-xl border text-left transition-all ${
                      active 
                        ? 'border-teal-500/30 bg-teal-500/5 dark:bg-teal-500/5' 
                        : 'border-slate-200/50 dark:border-slate-800/50 hover:bg-slate-100/30 dark:hover:bg-slate-900/30'
                    }`}
                  >
                    <div className="space-y-1 pr-4">
                      <div className="text-xs font-bold text-slate-700 dark:text-slate-250 flex items-center gap-1.5">
                        <span className={active ? 'text-teal-500' : 'text-slate-400'}>&bull;</span>
                        <span>{info.name}</span>
                      </div>
                      <div className="text-[10px] text-slate-400 font-semibold leading-relaxed">{info.desc}</div>
                    </div>
                    {active ? (
                      <ToggleRight size={24} className="text-teal-500 shrink-0" />
                    ) : (
                      <ToggleLeft size={24} className="text-slate-400 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

        </div>

        {/* DASHBOARD WIDGET SORT PANEL & CLOUD SYNC */}
        <div className="space-y-6">
          
          {/* Dashboard widget sorter */}
          <div className="glass-premium p-6 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                <Sliders size={20} />
              </div>
              <div>
                <h3 className="font-heading font-bold text-slate-800 dark:text-slate-100">Dashboard Widget Order</h3>
                <p className="text-xs text-slate-400 font-semibold mt-0.5">Use sorting toggles to rearrange layouts on the dashboard viewport.</p>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              {settings.widgetsOrder.map((widgetId, index) => {
                const displayName = widgetDisplayNames[widgetId] || widgetId;
                return (
                  <div 
                    key={widgetId} 
                    className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-800/50 text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    <span>{displayName}</span>
                    <div className="flex gap-1">
                      <button 
                        onClick={() => moveWidget(index, 'up')}
                        disabled={index === 0}
                        className="p-1 rounded bg-slate-200/50 hover:bg-slate-200 dark:bg-slate-850 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 disabled:opacity-30 transition-all"
                      >
                        <ArrowUp size={12} />
                      </button>
                      <button 
                        onClick={() => moveWidget(index, 'down')}
                        disabled={index === settings.widgetsOrder.length - 1}
                        className="p-1 rounded bg-slate-200/50 hover:bg-slate-200 dark:bg-slate-850 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 disabled:opacity-30 transition-all"
                      >
                        <ArrowDown size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Account & Cloud Sync */}
          <div className="glass-premium p-6 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <Database size={20} />
              </div>
              <div>
                <h3 className="font-heading font-bold text-slate-800 dark:text-slate-100">Account & Cloud Sync</h3>
                <p className="text-xs text-slate-400 font-semibold mt-0.5">Your farm data syncs automatically to Supabase on every action.</p>
              </div>
            </div>

            <div className="space-y-3 pt-1">
              {/* Logged-in user card */}
              {authUser ? (
                <div className="flex items-center gap-3 p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center shrink-0 shadow-md">
                    <User size={14} className="text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">Signed In As</span>
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate block">{authUser.email}</span>
                  </div>
                  <div className="flex items-center gap-1 text-[9px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                    <CheckCircle2 size={10} />
                    <span>Active</span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl text-xs font-semibold text-amber-600 dark:text-amber-400">
                  <WifiOff size={14} />
                  <span>Not signed in — data is local only.</span>
                </div>
              )}

              {/* Sync status */}
              <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900/40 rounded-xl text-xs font-semibold">
                <span className="text-slate-500">Cloud connection</span>
                <span className={`font-bold ${isOnline ? 'text-emerald-500' : 'text-amber-500'}`}>
                  {isOnline ? 'Connected' : 'Offline'}
                </span>
              </div>

              {/* Manual sync pull */}
              {syncMsg && (
                <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-500/10 p-2 rounded-lg">
                  <CheckCircle2 size={13} />
                  <span>{syncMsg}</span>
                </div>
              )}
              <button
                onClick={async () => {
                  await pullFromSupabase();
                  setSyncMsg('All data refreshed from cloud.');
                  setTimeout(() => setSyncMsg(null), 3000);
                }}
                disabled={isSyncing || !authUser || !isOnline}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-bold rounded-xl text-xs shadow-md transition-all"
              >
                <RefreshCw size={12} className={isSyncing ? 'animate-spin' : ''} />
                <span>{isSyncing ? 'Syncing…' : 'Pull Latest From Cloud'}</span>
              </button>

              {/* Sign out */}
              {authUser && (
                <button
                  onClick={() => signOut()}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-slate-100 hover:bg-rose-500/10 dark:bg-slate-900 hover:border-rose-500/30 border border-slate-200/50 dark:border-slate-800 text-slate-500 hover:text-rose-500 font-bold rounded-xl text-xs transition-all"
                >
                  <LogOut size={12} />
                  <span>Sign Out of Farm Account</span>
                </button>
              )}
            </div>
          </div>

          {/* Danger zone */}
          <div className="glass-premium p-6 rounded-2xl border border-red-500/15 dark:border-red-500/10 bg-red-500/5 shadow-sm space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-red-500/10 text-red-500">
                <ShieldAlert size={20} />
              </div>
              <div>
                <h3 className="font-heading font-bold text-slate-800 dark:text-slate-100 text-sm">Danger Control Zone</h3>
                <p className="text-[10px] text-slate-400 font-semibold mt-0.5">Irreversible actions that modify or flush your local client store.</p>
              </div>
            </div>

            <div className="space-y-2 pt-1 text-xs">
              {!showResetConfirm ? (
                <button 
                  onClick={() => setShowResetConfirm(true)}
                  className="w-full flex items-center justify-center gap-2 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 font-bold rounded-xl text-xs transition-all border border-red-500/20"
                >
                  <Trash2 size={12} />
                  <span>Wipe All Local Databases</span>
                </button>
              ) : (
                <div className="p-3 bg-red-500/10 border border-red-500/35 rounded-xl space-y-3">
                  <p className="text-[10px] text-red-500 font-bold leading-normal flex items-start gap-1">
                    <AlertCircle size={14} className="shrink-0" />
                    <span>WARNING: This will permanently erase all custom crops, sales receipts, inventories, and weather logs. Pre-seeded demo structures will reload on refresh.</span>
                  </p>
                  <div className="flex gap-2 justify-end">
                    <button 
                      onClick={() => setShowResetConfirm(false)} 
                      className="px-2.5 py-1 bg-slate-200/80 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded text-[10px] font-semibold text-slate-700 dark:text-slate-350"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={handleReset} 
                      className="px-2.5 py-1 bg-red-500 hover:bg-red-600 text-white rounded text-[10px] font-bold shadow shadow-red-500/20"
                    >
                      Flush DB Now
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>

      </div>

    </div>
  );
};
