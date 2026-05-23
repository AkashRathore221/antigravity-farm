import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import {
  LayoutDashboard, Sprout, Boxes, ClipboardList, TrendingUp,
  Receipt, CloudSun, BarChart3, FileSpreadsheet, BookOpen,
  Settings, Sun, Moon, Wifi, WifiOff, RefreshCw, Menu, X, LogOut, User
} from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const Layout: React.FC<LayoutProps> = ({ children, activeTab, setActiveTab }) => {
  const { settings, isOnline, syncQueue, initializeStore, authUser, signOut, pullFromSupabase, isSyncing } = useAppStore();
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('theme');
    return saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    initializeStore();
  }, [initializeStore]);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  // Handle auto-sync indicators on online status changes
  useEffect(() => {
    const handleOnline = () => useAppStore.getState().setOnlineStatus(true);
    const handleOffline = () => useAppStore.getState().setOnlineStatus(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Map modules to their UI tabs & icon details
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, enabled: settings.modules.dashboard },
    { id: 'cropLifecycle', label: 'Crop Cycle', icon: Sprout, enabled: settings.modules.cropLifecycle },
    { id: 'inventory', label: 'Inventory & Inputs', icon: Boxes, enabled: settings.modules.inventory },
    { id: 'usageLogs', label: 'Usage Logs', icon: ClipboardList, enabled: settings.modules.usageLogs },
    { id: 'harvest', label: 'Harvest & Sales', icon: TrendingUp, enabled: settings.modules.harvest },
    { id: 'expenses', label: 'Expenses Ledger', icon: Receipt, enabled: settings.modules.expenses },
    { id: 'weather', label: 'Weather Center', icon: CloudSun, enabled: settings.modules.weather },
    { id: 'analytics', label: 'Analytics', icon: BarChart3, enabled: settings.modules.analytics },
    { id: 'reports', label: 'Reports & Export', icon: FileSpreadsheet, enabled: settings.modules.reports },
    { id: 'reference', label: 'Agri Reference', icon: BookOpen, enabled: settings.modules.reference },
    { id: 'settings', label: 'System Settings', icon: Settings, enabled: true }, // settings always enabled
  ];

  const activeNavItems = navItems.filter(item => item.enabled);

  // If active tab was disabled, fallback to settings or first active tab
  useEffect(() => {
    const currentEnabled = navItems.find(n => n.id === activeTab)?.enabled;
    if (!currentEnabled) {
      const firstActive = activeNavItems[0]?.id || 'settings';
      setActiveTab(firstActive);
    }
  }, [settings.modules, activeTab]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex transition-colors duration-300">
      
      {/* 1. DESKTOP SIDEBAR - Glassmorphism style */}
      <aside className="hidden lg:flex flex-col w-64 glass border-r border-slate-200/50 dark:border-slate-800/50 sticky top-0 h-screen z-20 shrink-0">
        {/* Brand/Logo */}
        <div className="p-6 flex items-center gap-3 border-b border-slate-200/50 dark:border-slate-800/50">
          <div className="p-2 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-white shadow-md shadow-emerald-500/20">
            <Sprout size={24} className="animate-pulse-subtle" />
          </div>
          <div>
            <h1 className="font-heading text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-600 to-teal-500 dark:from-emerald-400 dark:to-teal-300">
              Antigravity Farm
            </h1>
            <span className="text-xs text-slate-400 font-semibold tracking-wider uppercase">Polyhouse cucumber</span>
          </div>
        </div>

        {/* Scrollable Navigation links */}
        <nav className="flex-1 overflow-y-auto p-4 space-y-1.5 no-scrollbar">
          {activeNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 ${
                  isActive 
                    ? 'bg-gradient-to-r from-emerald-500/15 to-emerald-600/5 text-emerald-600 dark:text-emerald-400 border-l-4 border-emerald-500 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100/50 dark:hover:bg-slate-900/40 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Icon size={18} className={isActive ? 'stroke-[2.5]' : 'opacity-70'} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Sidebar footer: user + sync + theme */}
        <div className="p-4 border-t border-slate-200/50 dark:border-slate-800/50 space-y-2">
          {/* Online / sync status */}
          <div className="flex items-center justify-between text-xs px-2 py-1 bg-slate-100/60 dark:bg-slate-900/60 rounded-lg">
            <div className="flex items-center gap-2">
              {isOnline ? <Wifi size={13} className="text-emerald-500" /> : <WifiOff size={13} className="text-amber-500" />}
              <span className="font-semibold text-slate-500 dark:text-slate-400">{isOnline ? 'Online' : 'Offline'}</span>
            </div>
            <button
              onClick={() => pullFromSupabase()}
              disabled={isSyncing || !isOnline}
              title="Pull latest from cloud"
              className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-emerald-500 disabled:opacity-40 transition-all"
            >
              <RefreshCw size={12} className={isSyncing ? 'animate-spin text-emerald-500' : ''} />
            </button>
          </div>

          {/* User info + sign out */}
          {authUser && (
            <div className="flex items-center gap-2 px-2 py-1.5 bg-emerald-500/5 border border-emerald-500/15 rounded-xl">
              <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center shrink-0">
                <User size={12} className="text-white" />
              </div>
              <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 truncate flex-1">{authUser.email}</span>
              <button onClick={() => signOut()} title="Sign out" className="p-1 text-slate-400 hover:text-rose-500 transition-colors">
                <LogOut size={13} />
              </button>
            </div>
          )}

          <button
            onClick={() => setDarkMode(!darkMode)}
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 bg-slate-100/40 dark:bg-slate-900/40 hover:bg-slate-100/80 dark:hover:bg-slate-900/80 border border-slate-200/30 dark:border-slate-800/30 rounded-xl transition-all"
          >
            <span>Appearance</span>
            {darkMode ? <Sun size={14} className="text-amber-400" /> : <Moon size={14} className="text-indigo-400" />}
          </button>
        </div>
      </aside>

      {/* MOBILE NAV SIDEBAR OVERLAY */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 transition-all duration-300" onClick={() => setSidebarOpen(false)}>
          <aside className="w-64 h-full glass border-r border-slate-200 dark:border-slate-800 flex flex-col p-4 animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-2">
                <Sprout className="text-emerald-500" size={24} />
                <span className="font-heading font-bold text-emerald-600 dark:text-emerald-400">Antigravity Farm</span>
              </div>
              <button onClick={() => setSidebarOpen(false)} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-900">
                <X size={20} />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto space-y-1 no-scrollbar">
              {activeNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveTab(item.id);
                      setSidebarOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                      isActive 
                        ? 'bg-gradient-to-r from-emerald-500/10 to-teal-500/5 text-emerald-600 dark:text-emerald-400 border-l-4 border-emerald-500'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <Icon size={18} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2">
              <button
                onClick={() => setDarkMode(!darkMode)}
                className="w-full flex items-center justify-between p-2 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-900"
              >
                <span>{darkMode ? 'Light Theme' : 'Dark Theme'}</span>
                {darkMode ? <Sun size={14} className="text-amber-400" /> : <Moon size={14} className="text-indigo-400" />}
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* 2. MAIN CONTENT WRAPPER */}
      <div className="flex-1 flex flex-col min-w-0 pb-20 lg:pb-0">
        
        {/* MOBILE HEADER */}
        <header className="lg:hidden flex items-center justify-between px-4 py-3 glass sticky top-0 z-30 border-b border-slate-200/50 dark:border-slate-800/50">
          <div className="flex items-center gap-2">
            <button onClick={() => setSidebarOpen(true)} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-900">
              <Menu size={22} className="text-slate-600 dark:text-slate-400" />
            </button>
            <span className="font-heading font-bold text-emerald-600 dark:text-emerald-400 text-md">
              {navItems.find(n => n.id === activeTab)?.label || 'Polyhouse PWA'}
            </span>
          </div>
          
          <div className="flex items-center gap-3">
            {syncQueue.length > 0 && (
              <span className="p-1.5 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 animate-pulse">
                <RefreshCw size={12} className="animate-spin" />
              </span>
            )}
            <div className="flex items-center gap-1.5 bg-slate-100/60 dark:bg-slate-900/60 px-2 py-1 rounded-lg">
              {isOnline ? (
                <Wifi size={12} className="text-emerald-500" />
              ) : (
                <WifiOff size={12} className="text-amber-500" />
              )}
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                {isOnline ? 'Online' : 'Offline'}
              </span>
            </div>
          </div>
        </header>

        {/* HEADER DESKTOP - Optional Premium Dashboard Breadcrumb */}
        <header className="hidden lg:flex items-center justify-between px-8 py-4 bg-transparent sticky top-0 z-10">
          <div>
            <h2 className="text-2xl font-bold font-heading text-slate-800 dark:text-slate-100">
              {navItems.find(n => n.id === activeTab)?.label}
            </h2>
            <p className="text-xs text-slate-400 font-semibold mt-0.5">Polyhouse Operations Dashboard &bull; Cucumber Crops</p>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-white dark:bg-slate-900/80 px-3 py-1.5 rounded-xl border border-slate-200/40 dark:border-slate-800/40 shadow-sm">
              <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-amber-500'} animate-pulse`}></div>
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                {isOnline ? 'Connected' : 'Offline mode'}
              </span>
            </div>
          </div>
        </header>

        {/* PRIMARY MAIN VIEWPORT */}
        <main className="flex-grow p-4 lg:p-8 overflow-y-auto animate-slide-up">
          {children}
        </main>

        {/* 3. MOBILE STICKY BOTTOM NAVIGATION BAR */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 glass border-t border-slate-200/50 dark:border-slate-800/50 px-2 py-2 flex items-center justify-around z-30 shadow-2xl">
          {activeNavItems.slice(0, 5).map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all duration-200 ${
                  isActive 
                    ? 'text-emerald-500 dark:text-emerald-400 font-bold scale-105'
                    : 'text-slate-400 dark:text-slate-500'
                }`}
              >
                <Icon size={20} className={isActive ? 'stroke-[2.5]' : ''} />
                <span className="text-[10px] font-semibold tracking-tight">{item.label.split(' ')[0]}</span>
              </button>
            );
          })}
          {/* More menu triggers sidebar */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="flex flex-col items-center gap-1 py-1 px-3 text-slate-400 dark:text-slate-500"
          >
            <Menu size={20} />
            <span className="text-[10px] font-semibold tracking-tight">More</span>
          </button>
        </nav>

      </div>
    </div>
  );
};
