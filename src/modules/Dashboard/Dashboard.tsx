import React from 'react';
import { useAppStore } from '../../store/useAppStore';
import {
  Sprout, AlertTriangle, CloudSun,
  Activity, PlusCircle,
  ChevronUp, ChevronDown, CalendarCheck
} from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip
} from 'recharts';

interface DashboardProps {
  setActiveTab: (tab: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ setActiveTab }) => {
  const { 
    crops, inventory, usageLogs, harvests, expenses, weatherLogs, settings, 
    updateWidgetOrder 
  } = useAppStore();

  const activeCrop = crops.find(c => c.status === 'active');

  // 1. Calculations if crop is active
  let daysSinceTransplant = 0;
  let totalProduction = 0;
  let totalRevenue = 0;
  let totalGeneralExpenses = 0;
  let totalUsageExpenses = 0;
  let totalExpenses = 0;
  let netProfit = 0;
  let roi = 0;
  let costPerKg = 0;
  let costPerPlant = 0;
  if (activeCrop) {
    // Days since transplant — guard against empty / invalid transplant_date,
    // which would otherwise make `new Date(...).getTime()` return NaN and
    // render "NaN days".
    const tDate = new Date(activeCrop.transplant_date);
    if (!isNaN(tDate.getTime())) {
      const today = new Date();
      const diffTime = Math.abs(today.getTime() - tDate.getTime());
      daysSinceTransplant = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    // Active harvests
    const cropHarvests = harvests.filter(h => h.crop_id === activeCrop.id);
    totalProduction = cropHarvests.reduce((sum, h) => sum + Number(h.weight_total), 0);
    totalRevenue = cropHarvests.reduce((sum, h) => sum + Number(h.revenue), 0);

    // Active general expenses (Labour, Transport, Packaging, Misc)
    const cropExpenses = expenses.filter(e => e.crop_id === activeCrop.id);
    totalGeneralExpenses = cropExpenses.reduce((sum, e) => sum + Number(e.amount), 0);

    // Active usage expenses (Fertigation, Sprays)
    const cropUsages = usageLogs.filter(u => u.crop_id === activeCrop.id);
    totalUsageExpenses = cropUsages.reduce((sum, u) => sum + Number(u.cost), 0);

    // Combine (include upfront seed/nursery cost from crop record)
    totalExpenses = totalGeneralExpenses + totalUsageExpenses + (activeCrop.seed_nursery_cost ?? 0);
    netProfit = totalRevenue - totalExpenses;
    
    if (totalExpenses > 0) {
      roi = parseFloat(((netProfit / totalExpenses) * 100).toFixed(1));
    }
    if (totalProduction > 0) {
      costPerKg = parseFloat((totalExpenses / totalProduction).toFixed(2));
    }
    if (activeCrop.num_plants > 0) {
      costPerPlant = parseFloat((totalExpenses / activeCrop.num_plants).toFixed(2));
    }
  }

  // 2. Low stock alerts
  const lowStockItems = inventory.filter(item => item.remaining_qty <= item.low_stock_threshold);

  // 3. Upcoming Spray/Fertigation reminders
  // Find all usage logs that have a repeat schedule enabled
  const recurringItems = usageLogs
    .filter(u => u.repeat_schedule && u.repeat_interval_days)
    .reduce((acc, log) => {
      // Keep only the latest log per product
      const key = `${log.product_name}-${log.type}`;
      if (!acc[key] || new Date(log.date) > new Date(acc[key].date)) {
        acc[key] = log;
      }
      return acc;
    }, {} as Record<string, typeof usageLogs[0]>);

  const upcomingReminders = Object.values(recurringItems).map(log => {
    const lastDate = new Date(log.date);
    const interval = log.repeat_interval_days || 7;
    const nextDate = new Date(lastDate);
    nextDate.setDate(lastDate.getDate() + interval);
    
    const today = new Date();
    today.setHours(0,0,0,0);
    nextDate.setHours(0,0,0,0);
    
    const diffTime = nextDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return {
      id: log.id,
      product: log.product_name,
      type: log.type,
      interval,
      nextDate: nextDate.toISOString().split('T')[0],
      daysRemaining: diffDays
    };
  }).sort((a, b) => a.daysRemaining - b.daysRemaining);

  // 4. Latest Weather Log
  const latestWeather = weatherLogs.length > 0 ? weatherLogs[0] : null;

  // 5. Sparkline Helpers
  const getSparklinePath = (data: number[], width: number, height: number): string => {
    if (data.length < 2) return '';
    const max = Math.max(...data, 10);
    const min = Math.min(...data, 0);
    const range = max - min === 0 ? 1 : max - min;
    
    return data.map((val, index) => {
      const x = (index / (data.length - 1)) * width;
      const y = height - ((val - min) / range) * height;
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(' ');
  };

  // Sparkline data for active crop
  const lastCropsHarvests = activeCrop 
    ? harvests.filter(h => h.crop_id === activeCrop.id).slice(-6).reverse().map(h => Number(h.weight_total))
    : [];
  
  const lastCropsExpenses = activeCrop
    ? expenses.filter(e => e.crop_id === activeCrop.id).slice(-6).reverse().map(e => Number(e.amount))
    : [];

  const harvestSparkline = getSparklinePath(lastCropsHarvests, 140, 32);
  const expenseSparkline = getSparklinePath(lastCropsExpenses, 140, 32);

  // Cumulative revenue vs. expense trend for active crop
  const buildCumulativeTrend = () => {
    if (!activeCrop) return [];
    const events: Array<{ date: string; revDelta: number; expDelta: number }> = [
      ...harvests.filter(h => h.crop_id === activeCrop.id).map(h => ({ date: h.date, revDelta: Number(h.revenue), expDelta: 0 })),
      ...expenses.filter(e => e.crop_id === activeCrop.id).map(e => ({ date: e.date, revDelta: 0, expDelta: Number(e.amount) })),
      ...usageLogs.filter(u => u.crop_id === activeCrop.id).map(u => ({ date: u.date, revDelta: 0, expDelta: Number(u.cost) })),
    ];
    if ((activeCrop.seed_nursery_cost ?? 0) > 0)
      events.push({ date: activeCrop.start_date, revDelta: 0, expDelta: activeCrop.seed_nursery_cost ?? 0 });
    events.sort((a, b) => a.date.localeCompare(b.date));
    const grouped: Record<string, { rev: number; exp: number }> = {};
    events.forEach(ev => {
      if (!grouped[ev.date]) grouped[ev.date] = { rev: 0, exp: 0 };
      grouped[ev.date].rev += ev.revDelta;
      grouped[ev.date].exp += ev.expDelta;
    });
    let cumRev = 0, cumExp = 0;
    return Object.keys(grouped).sort().map(date => {
      cumRev += grouped[date].rev;
      cumExp += grouped[date].exp;
      return { date, revenue: parseFloat(cumRev.toFixed(2)), expenses: parseFloat(cumExp.toFixed(2)) };
    });
  };
  const cumulativeTrend = buildCumulativeTrend();

  // Last archived crop for no-crop empty state
  const lastArchivedCrop = crops
    .filter(c => c.status === 'archived')
    .sort((a, b) => (b.end_date ?? '').localeCompare(a.end_date ?? ''))[0] ?? null;
  const lastArchivedStats = lastArchivedCrop ? (() => {
    const ch = harvests.filter(h => h.crop_id === lastArchivedCrop.id);
    const ce = expenses.filter(e => e.crop_id === lastArchivedCrop.id);
    const cu = usageLogs.filter(u => u.crop_id === lastArchivedCrop.id);
    const yld = ch.reduce((s, h) => s + Number(h.weight_total), 0);
    const rev = ch.reduce((s, h) => s + Number(h.revenue), 0);
    const exp = ce.reduce((s, e) => s + Number(e.amount), 0) + cu.reduce((s, u) => s + Number(u.cost), 0) + (lastArchivedCrop.seed_nursery_cost ?? 0);
    const start = new Date(lastArchivedCrop.start_date);
    const end = lastArchivedCrop.end_date ? new Date(lastArchivedCrop.end_date) : new Date();
    const dur = Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    return { yield: yld, revenue: rev, expenses: exp, profit: rev - exp, costKg: yld > 0 ? exp / yld : 0, duration: dur };
  })() : null;

  // Widget Reordering logic
  const moveWidget = (index: number, direction: 'up' | 'down') => {
    const order = [...settings.widgetsOrder];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= order.length) return;
    
    // Swap
    const temp = order[index];
    order[index] = order[targetIndex];
    order[targetIndex] = temp;
    
    updateWidgetOrder(order);
  };

  // Render Widget Helper
  const renderWidget = (widgetId: string, index: number) => {
    // If feature disabled, hide it
    if (widgetId === 'stockAlerts' && !settings.features.inventoryAlerts) return null;
    if (widgetId === 'spraysReminders' && !settings.features.recurringReminders) return null;
    if (widgetId === 'miniCharts' && !settings.features.charts) return null;
    if (widgetId === 'weatherBrief' && !settings.modules.weather) return null;

    const widgetControls = (
      <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5 shadow-sm no-print">
        <button 
          onClick={() => moveWidget(index, 'up')} 
          disabled={index === 0}
          className="p-1 text-slate-500 hover:text-emerald-500 disabled:opacity-30 rounded hover:bg-slate-200 dark:hover:bg-slate-700"
        >
          <ChevronUp size={14} />
        </button>
        <button 
          onClick={() => moveWidget(index, 'down')} 
          disabled={index === settings.widgetsOrder.length - 1}
          className="p-1 text-slate-500 hover:text-emerald-500 disabled:opacity-30 rounded hover:bg-slate-200 dark:hover:bg-slate-700"
        >
          <ChevronDown size={14} />
        </button>
      </div>
    );

    switch (widgetId) {
      // 1. ACTIVE CROP CARD
      case 'cropSummary':
        return (
          <div key={widgetId} className="group relative glass-premium rounded-2xl p-6 border border-slate-200/50 dark:border-slate-800/40 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6 transition-all duration-300">
            {widgetControls}
            
            {activeCrop ? (
              <>
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200/50">
                      ACTIVE CROP
                    </span>
                    <span className="text-xs font-bold text-slate-400">Transplanted {activeCrop.transplant_date}</span>
                  </div>
                  <h3 className="text-2xl font-bold font-heading text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    <Sprout className="text-emerald-500 stroke-[2]" size={24} />
                    {activeCrop.name}
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                    <div className="bg-slate-100/40 dark:bg-slate-900/30 p-2 rounded-xl border border-slate-200/20">
                      <span className="text-slate-400 block font-semibold">Variety / Hybrid</span>
                      <span className="font-bold text-slate-700 dark:text-slate-300">{activeCrop.variety}</span>
                    </div>
                    <div className="bg-slate-100/40 dark:bg-slate-900/30 p-2 rounded-xl border border-slate-200/20">
                      <span className="text-slate-400 block font-semibold">Seed Company</span>
                      <span className="font-bold text-slate-700 dark:text-slate-300">{activeCrop.seed_company}</span>
                    </div>
                    <div className="bg-slate-100/40 dark:bg-slate-900/30 p-2 rounded-xl border border-slate-200/20">
                      <span className="text-slate-400 block font-semibold">Area Covered</span>
                      <span className="font-bold text-slate-700 dark:text-slate-300">{activeCrop.area_covered} m²</span>
                    </div>
                    <div className="bg-slate-100/40 dark:bg-slate-900/30 p-2 rounded-xl border border-slate-200/20">
                      <span className="text-slate-400 block font-semibold">Total Plants</span>
                      <span className="font-bold text-slate-700 dark:text-slate-300">{activeCrop.num_plants} stems</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 bg-emerald-500/10 dark:bg-emerald-950/20 border border-emerald-500/20 px-6 py-4 rounded-2xl shrink-0">
                  <div className="text-center">
                    <span className="text-5xl font-black font-heading text-emerald-600 dark:text-emerald-400 block">{daysSinceTransplant}</span>
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-300 uppercase tracking-widest">Days in House</span>
                  </div>
                </div>
              </>
            ) : (
              <div className="w-full space-y-4 py-4">
                {lastArchivedCrop && lastArchivedStats ? (
                  <div className="space-y-3">
                    <div className="text-center">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Last Completed Cycle</span>
                      <h4 className="text-base font-bold text-slate-700 dark:text-slate-300 mt-0.5">{lastArchivedCrop.name}</h4>
                      <span className="text-xs text-slate-400">{lastArchivedCrop.variety} &bull; {lastArchivedStats.duration} days</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs text-center">
                      <div className="bg-slate-100/50 dark:bg-slate-900/40 p-2.5 rounded-xl border border-slate-200/20">
                        <span className="text-slate-400 block font-bold text-[10px] uppercase">Total Yield</span>
                        <span className="font-extrabold text-slate-700 dark:text-slate-200 text-base">{lastArchivedStats.yield.toLocaleString()} kg</span>
                      </div>
                      <div className="bg-slate-100/50 dark:bg-slate-900/40 p-2.5 rounded-xl border border-slate-200/20">
                        <span className="text-slate-400 block font-bold text-[10px] uppercase">Net Profit</span>
                        <span className={`font-extrabold text-base ${lastArchivedStats.profit >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>₹{lastArchivedStats.profit.toFixed(0)}</span>
                      </div>
                      <div className="bg-slate-100/50 dark:bg-slate-900/40 p-2.5 rounded-xl border border-slate-200/20">
                        <span className="text-slate-400 block font-bold text-[10px] uppercase">Revenue</span>
                        <span className="font-extrabold text-slate-700 dark:text-slate-200 text-base">₹{lastArchivedStats.revenue.toFixed(0)}</span>
                      </div>
                      <div className="bg-slate-100/50 dark:bg-slate-900/40 p-2.5 rounded-xl border border-slate-200/20">
                        <span className="text-slate-400 block font-bold text-[10px] uppercase">Cost / kg</span>
                        <span className="font-extrabold text-slate-700 dark:text-slate-200 text-base">₹{lastArchivedStats.costKg.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center">
                    <Sprout size={48} className="mx-auto text-slate-300 dark:text-slate-700 stroke-[1.5]" />
                    <h4 className="text-lg font-bold text-slate-700 dark:text-slate-300 mt-2">No Active Crop Cycle Found</h4>
                    <p className="text-sm text-slate-400 max-w-md mx-auto">Start a fresh crop record keeping ledger to unlock cucumber live financials, yield grids, alerts and VPD advisory tracking.</p>
                  </div>
                )}
                <div className="text-center">
                  <button
                    onClick={() => setActiveTab('cropLifecycle')}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-semibold text-sm shadow-md inline-flex items-center gap-2"
                  >
                    <PlusCircle size={16} />
                    Start Active Crop Cycle
                  </button>
                </div>
              </div>
            )}
          </div>
        );

      // 2. FINANCIAL PERFORMANCE CARDS
      case 'financials':
        if (!activeCrop) return null;
        return (
          <div key={widgetId} className="group relative grid grid-cols-2 lg:grid-cols-4 gap-4">
            {widgetControls}
            
            {/* Metric 1 */}
            <div className="glass rounded-2xl p-4 border border-slate-200/30 dark:border-slate-800/30 shadow-sm space-y-1">
              <span className="text-xs font-bold text-slate-400 block">Total Yield</span>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold text-slate-800 dark:text-slate-100">
                  {totalProduction.toLocaleString()}
                </span>
                <span className="text-xs font-bold text-slate-400">kg</span>
              </div>
              <span className="text-[10px] text-emerald-500 font-bold block">Avg direct sales</span>
            </div>

            {/* Metric 2 */}
            <div className="glass rounded-2xl p-4 border border-slate-200/30 dark:border-slate-800/30 shadow-sm space-y-1">
              <span className="text-xs font-bold text-slate-400 block">Total Expenses</span>
              <div className="flex items-baseline gap-1">
                <span className="text-xs font-bold text-slate-400">₹</span>
                <span className="text-2xl font-bold text-slate-800 dark:text-slate-100">
                  {totalExpenses.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                </span>
              </div>
              <span className="text-[10px] text-slate-400 block">
                Mat: ₹{totalUsageExpenses.toFixed(0)} &bull; Lab: ₹{totalGeneralExpenses.toFixed(0)}
              </span>
            </div>

            {/* Metric 3 */}
            <div className="glass rounded-2xl p-4 border border-slate-200/30 dark:border-slate-800/30 shadow-sm space-y-1">
              <span className="text-xs font-bold text-slate-400 block">Net Profitability</span>
              <div className="flex items-baseline gap-1">
                <span className="text-xs font-bold text-emerald-500">₹</span>
                <span className={`text-2xl font-bold ${netProfit >= 0 ? 'text-emerald-500 dark:text-emerald-400' : 'text-rose-500'}`}>
                  {netProfit.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                </span>
              </div>
              <span className="text-[10px] font-bold text-emerald-500">
                ROI: {roi}%
              </span>
            </div>

            {/* Metric 4 */}
            <div className="glass rounded-2xl p-4 border border-slate-200/30 dark:border-slate-800/30 shadow-sm space-y-1">
              <span className="text-xs font-bold text-slate-400 block">Production Cost</span>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold text-slate-800 dark:text-slate-100">
                  ₹{costPerKg.toFixed(2)}
                </span>
                <span className="text-xs font-semibold text-slate-400">/ kg</span>
              </div>
              <span className="text-[10px] text-slate-400 block">
                Plant load: ₹{costPerPlant.toFixed(2)} / stem
              </span>
            </div>
          </div>
        );

      // 3. MINI CHARTS SPARKLINE
      case 'miniCharts':
        if (!activeCrop) return null;
        return (
          <div key={widgetId} className="group relative space-y-4">
            {widgetControls}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="glass rounded-2xl p-4 border border-slate-200/30 dark:border-slate-800/30 shadow-sm flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <span className="text-xs font-bold text-slate-400 block">Yield Sparkline</span>
                  <span className="text-lg font-bold text-slate-800 dark:text-slate-100">Last 6 harvests</span>
                  <span className="text-[10px] text-emerald-500 block font-semibold">&bull; Peak volume active</span>
                </div>
                <div className="w-36 h-10 shrink-0">
                  {lastCropsHarvests.length > 1 ? (
                    <svg className="w-full h-full text-emerald-500 overflow-visible" strokeWidth="2.5" fill="none">
                      <path d={harvestSparkline} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    <span className="text-xs text-slate-400 italic">No trend data yet</span>
                  )}
                </div>
              </div>

              <div className="glass rounded-2xl p-4 border border-slate-200/30 dark:border-slate-800/30 shadow-sm flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <span className="text-xs font-bold text-slate-400 block">Expense Outlay</span>
                  <span className="text-lg font-bold text-slate-800 dark:text-slate-100">Operation Ledger</span>
                  <span className="text-[10px] text-amber-500 block font-semibold">&bull; Drip inputs major</span>
                </div>
                <div className="w-36 h-10 shrink-0">
                  {lastCropsExpenses.length > 1 ? (
                    <svg className="w-full h-full text-amber-500 overflow-visible" strokeWidth="2.5" fill="none">
                      <path d={expenseSparkline} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    <span className="text-xs text-slate-400 italic">No trend data yet</span>
                  )}
                </div>
              </div>
            </div>

            {cumulativeTrend.length > 1 && (
              <div className="glass rounded-2xl p-4 border border-slate-200/30 dark:border-slate-800/30 shadow-sm space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Revenue vs. Expenses (Cumulative)</span>
                  <div className="flex items-center gap-3 text-[10px] font-bold">
                    <span className="flex items-center gap-1 text-emerald-500"><span className="w-3 h-0.5 bg-emerald-500 inline-block rounded" />Revenue</span>
                    <span className="flex items-center gap-1 text-rose-500"><span className="w-3 h-0.5 bg-rose-500 inline-block rounded" />Expenses</span>
                  </div>
                </div>
                <div className="w-full h-36">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={cumulativeTrend} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 9 }} />
                      <YAxis stroke="#94a3b8" tick={{ fontSize: 9 }} />
                      <Tooltip formatter={(v) => `₹${Number(v).toLocaleString()}`} labelStyle={{ fontSize: 10 }} contentStyle={{ fontSize: 11 }} />
                      <Line type="monotone" name="Revenue" dataKey="revenue" stroke="#10b981" strokeWidth={2} dot={false} />
                      <Line type="monotone" name="Expenses" dataKey="expenses" stroke="#f43f5e" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        );

      // 4. LOW STOCK ALERTS
      case 'stockAlerts':
        return (
          <div key={widgetId} className="group relative glass rounded-2xl p-5 border border-slate-200/30 dark:border-slate-800/30 shadow-sm space-y-3">
            {widgetControls}
            <div className="flex items-center justify-between border-b border-slate-200/30 dark:border-slate-800/30 pb-2">
              <h4 className="font-heading font-bold text-sm text-slate-700 dark:text-slate-300 flex items-center gap-2">
                <AlertTriangle className="text-amber-500 animate-pulse" size={16} />
                Input Inventory Alerts
              </h4>
              <span className="text-[10px] font-bold text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded-full">
                {lowStockItems.length} LOW
              </span>
            </div>
            
            {lowStockItems.length > 0 ? (
              <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1">
                {lowStockItems.map(item => (
                  <div key={item.id} className="flex justify-between items-center bg-slate-100/40 dark:bg-slate-900/40 px-3 py-2 rounded-xl border border-slate-200/20 text-xs">
                    <div>
                      <span className="font-bold text-slate-700 dark:text-slate-300 block">{item.name}</span>
                      <span className="text-[10px] text-slate-400 capitalize">{item.brand} &bull; {item.category.replace('_',' ')}</span>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-amber-500 block">
                        {item.remaining_qty} {item.unit}
                      </span>
                      <span className="text-[9px] text-slate-400">Min: {item.low_stock_threshold} {item.unit}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic text-center py-2">All fertilizers and spray stocks reside in healthy thresholds.</p>
            )}
          </div>
        );

      // 5. SPRAYS & SCHEDULING REMINDERS
      case 'spraysReminders':
        return (
          <div key={widgetId} className="group relative glass rounded-2xl p-5 border border-slate-200/30 dark:border-slate-800/30 shadow-sm space-y-3">
            {widgetControls}
            <div className="flex items-center justify-between border-b border-slate-200/30 dark:border-slate-800/30 pb-2">
              <h4 className="font-heading font-bold text-sm text-slate-700 dark:text-slate-300 flex items-center gap-2">
                <CalendarCheck className="text-emerald-500" size={16} />
                Upcoming Spray Reminders
              </h4>
            </div>

            {upcomingReminders.length > 0 ? (
              <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1">
                {upcomingReminders.slice(0, 4).map(rem => {
                  let alertColor = 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20';
                  let daysText = `Due in ${rem.daysRemaining} days`;
                  
                  if (rem.daysRemaining === 0) {
                    alertColor = 'text-amber-500 bg-amber-500/10 border-amber-500/20 animate-pulse';
                    daysText = 'DUE TODAY';
                  } else if (rem.daysRemaining < 0) {
                    alertColor = 'text-rose-500 bg-rose-500/10 border-rose-500/20';
                    daysText = `Overdue by ${Math.abs(rem.daysRemaining)} days`;
                  }

                  return (
                    <div key={rem.id} className="flex justify-between items-center bg-slate-100/40 dark:bg-slate-900/40 px-3 py-2.5 rounded-xl border border-slate-200/20 text-xs">
                      <div>
                        <span className="font-bold text-slate-700 dark:text-slate-300 block">{rem.product}</span>
                        <span className="text-[9px] text-slate-400 capitalize font-medium">Every {rem.interval} days &bull; {rem.type}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded-lg border text-[10px] font-bold ${alertColor}`}>
                        {daysText}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic text-center py-2">No recurring schedule rules programmed in usage logs.</p>
            )}
          </div>
        );

      // 6. WEATHER BRIEF SUMMARY
      case 'weatherBrief':
        return (
          <div key={widgetId} className="group relative glass rounded-2xl p-5 border border-slate-200/30 dark:border-slate-800/30 shadow-sm space-y-3">
            {widgetControls}
            <div className="flex items-center justify-between border-b border-slate-200/30 dark:border-slate-800/30 pb-2">
              <h4 className="font-heading font-bold text-sm text-slate-700 dark:text-slate-300 flex items-center gap-2">
                <CloudSun className="text-indigo-400" size={16} />
                House Climate Summary
              </h4>
              <span className="text-[10px] text-slate-400 font-bold">{latestWeather?.date || 'Today'}</span>
            </div>

            {latestWeather ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                <div className="bg-slate-100/40 dark:bg-slate-900/40 p-2.5 rounded-xl border border-slate-200/20">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight block">Temp</span>
                  <span className="text-lg font-extrabold text-slate-700 dark:text-slate-200">{latestWeather.temp}°C</span>
                </div>
                <div className="bg-slate-100/40 dark:bg-slate-900/40 p-2.5 rounded-xl border border-slate-200/20">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight block">Humidity</span>
                  <span className="text-lg font-extrabold text-slate-700 dark:text-slate-200">{latestWeather.humidity}%</span>
                </div>
                <div className="bg-slate-100/40 dark:bg-slate-900/40 p-2.5 rounded-xl border border-slate-200/20">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight block">VPD Index</span>
                  <span className="text-lg font-extrabold text-slate-700 dark:text-slate-200">{latestWeather.vpd != null ? `${latestWeather.vpd} kPa` : '—'}</span>
                </div>
                <div className="bg-slate-100/40 dark:bg-slate-900/40 p-2.5 rounded-xl border border-slate-200/20">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight block">AQI / UV</span>
                  <span className="text-lg font-extrabold text-slate-700 dark:text-slate-200">{latestWeather.aqi} / {latestWeather.uv_index}</span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic text-center py-2">No climatic registers synced. Load weather logs screen.</p>
            )}
            
            {latestWeather && latestWeather.vpd && (
              <div className={`p-2.5 rounded-xl border text-[11px] font-medium text-center ${
                latestWeather.vpd >= 1.0 && latestWeather.vpd <= 1.6
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                  : 'bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400'
              }`}>
                {latestWeather.vpd >= 1.0 && latestWeather.vpd <= 1.6
                  ? 'Optimal cucumber transpiration climate. VPD range is balanced.'
                  : latestWeather.vpd < 1.0 
                    ? 'Caution: Low VPD. High fungal outbreak risk. Ventilate polyhouse.'
                    : 'Caution: High VPD. Fast stomatal closure. Activate fogging/misting.'}
              </div>
            )}
          </div>
        );

      // 7. RECENT OPERATIONS TIMELINE
      case 'activityFeed': {
        const recentLogs = [
          ...harvests.map(h => ({ type: 'harvest' as const, date: h.date, desc: `Harvested ${h.weight_total}kg Grade A/B cucumber. Revenue ₹${h.revenue.toFixed(0)}` })),
          ...usageLogs.map(u => ({ type: 'usage' as const, date: u.date, desc: `Applied ${u.quantity_used}${u.unit} of ${u.product_name} (${u.type})` }))
        ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 4);

        return (
          <div key={widgetId} className="group relative glass rounded-2xl p-5 border border-slate-200/30 dark:border-slate-800/30 shadow-sm space-y-3">
            {widgetControls}
            <div className="flex items-center justify-between border-b border-slate-200/30 dark:border-slate-800/30 pb-2">
              <h4 className="font-heading font-bold text-sm text-slate-700 dark:text-slate-300 flex items-center gap-2">
                <Activity className="text-teal-400" size={16} />
                House Operations Timeline
              </h4>
            </div>

            {recentLogs.length > 0 ? (
              <div className="space-y-3.5 pl-3 border-l border-slate-200 dark:border-slate-800 relative text-xs">
                {recentLogs.map((log, index) => (
                  <div key={index} className="space-y-0.5 relative">
                    {/* Circle Node */}
                    <div className={`absolute -left-[17px] top-1 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-slate-900 ${
                      log.type === 'harvest' ? 'bg-emerald-500' : 'bg-teal-400'
                    }`}></div>
                    
                    <span className="text-[9px] font-bold text-slate-400 block">{log.date}</span>
                    <p className="text-slate-700 dark:text-slate-300 font-semibold">{log.desc}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic text-center py-2">No operations logged recently.</p>
            )}
          </div>
        );
      }

      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Dynamic Render according to order */}
      {settings.widgetsOrder.map((widgetId, index) => renderWidget(widgetId, index))}
    </div>
  );
};
