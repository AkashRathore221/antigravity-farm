import React, { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell, ReferenceLine
} from 'recharts';
import { BarChart3 } from 'lucide-react';

export const Analytics: React.FC = () => {
  const { harvests, expenses, usageLogs, crops, settings } = useAppStore();
  const activeCrop = crops.find(c => c.status === 'active');

  const [timeFilter, setTimeFilter] = useState<'daily' | 'weekly' | 'monthly'>('daily');

  if (!settings.features.charts) {
    return (
      <div className="glass rounded-2xl p-8 border border-slate-200/30 dark:border-slate-800/30 text-center text-slate-400 italic">
        Interactive Charts are disabled from the settings panel. Enable them to view analytics.
      </div>
    );
  }

  // 1. Filter data for the active crop (or all if no active)
  const cropHarvests = activeCrop ? harvests.filter(h => h.crop_id === activeCrop.id) : harvests;
  const cropExpenses = activeCrop ? expenses.filter(e => e.crop_id === activeCrop.id) : expenses;
  const cropUsages = activeCrop ? usageLogs.filter(u => u.crop_id === activeCrop.id) : usageLogs;

  // 2. Prep Graded Yield Pie Data
  const totalGradeA = cropHarvests.reduce((sum, h) => sum + Number(h.weight_grade_a), 0);
  const totalGradeB = cropHarvests.reduce((sum, h) => sum + Number(h.weight_grade_b), 0);
  const totalGradeC = cropHarvests.reduce((sum, h) => sum + Number(h.weight_grade_c), 0);
  const totalWastage = cropHarvests.reduce((sum, h) => sum + Number(h.wastage), 0);

  const pieData = [
    { name: 'Grade A (Premium)', value: totalGradeA, color: '#10b981' },
    { name: 'Grade B (Curves)', value: totalGradeB, color: '#6ee7b7' },
    { name: 'Grade C (Feed)', value: totalGradeC, color: '#fbbf24' },
    { name: 'Wastage (Pest/Rot)', value: totalWastage, color: '#f43f5e' }
  ].filter(d => d.value > 0);

  // Pure helper — no Date mutation, handles month-boundary correctly.
  const getWeekStart = (dateStr: string): string => {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const dayOfWeek = date.getDay(); // 0=Sun
    return new Date(y, m - 1, d - dayOfWeek).toISOString().split('T')[0];
  };

  const getGroupKey = (dateStr: string): string => {
    if (timeFilter === 'weekly') return getWeekStart(dateStr);
    if (timeFilter === 'monthly') return dateStr.substring(0, 7);
    return dateStr;
  };

  // 3. Dynamic Grouping by Date for Trends
  const groupData = () => {
    const dataMap: Record<string, { date: string; yield: number; revenue: number; expense: number }> = {};

    const addToMap = (dateStr: string, yieldVal: number, rev: number, exp: number) => {
      const key = getGroupKey(dateStr);
      if (!dataMap[key]) dataMap[key] = { date: key, yield: 0, revenue: 0, expense: 0 };
      dataMap[key].yield += yieldVal;
      dataMap[key].revenue += rev;
      dataMap[key].expense += exp;
    };

    cropHarvests.forEach(h => addToMap(h.date, Number(h.weight_total), Number(h.revenue), 0));
    cropExpenses.forEach(e => addToMap(e.date, 0, 0, Number(e.amount)));
    cropUsages.forEach(u => addToMap(u.date, 0, 0, Number(u.cost)));
    if (activeCrop && (activeCrop.seed_nursery_cost ?? 0) > 0) {
      addToMap(activeCrop.start_date, 0, 0, activeCrop.seed_nursery_cost ?? 0);
    }

    return Object.values(dataMap).sort((a, b) => a.date.localeCompare(b.date));
  };

  const trendData = groupData();

  // 4. Prep Inventory Consumption Data
  const consumptionMap: Record<string, { name: string; quantity: number; unit: string; cost: number }> = {};
  cropUsages.forEach(u => {
    if (!consumptionMap[u.product_name]) {
      consumptionMap[u.product_name] = { name: u.product_name, quantity: 0, unit: u.unit, cost: 0 };
    }
    consumptionMap[u.product_name].quantity += Number(u.quantity_used);
    consumptionMap[u.product_name].cost += Number(u.cost);
  });

  const consumptionData = Object.values(consumptionMap)
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 5);

  // 5. Expense category donut data
  const seedCost = activeCrop?.seed_nursery_cost ?? 0;
  const getCatTotal = (cat: string) => {
    let sum = cropExpenses.filter(e => e.category === cat).reduce((s, e) => s + Number(e.amount), 0);
    if (cat === 'inventory') sum += cropUsages.reduce((s, u) => s + Number(u.cost), 0);
    return sum;
  };
  const expCatData = [
    { name: 'Labour', value: getCatTotal('labour'), color: '#10b981' },
    { name: 'Inventory & Materials', value: getCatTotal('inventory'), color: '#2dd4bf' },
    { name: 'Transport', value: getCatTotal('transport'), color: '#fbbf24' },
    { name: 'Packaging', value: getCatTotal('packaging'), color: '#6366f1' },
    { name: 'Fuel', value: getCatTotal('personal_vehicle_fuel'), color: '#fb923c' },
    { name: 'Miscellaneous', value: getCatTotal('miscellaneous'), color: '#94a3b8' },
    ...(seedCost > 0 ? [{ name: 'Seed / Nursery', value: seedCost, color: '#059669' }] : []),
  ].filter(d => d.value > 0);

  // 6. Cumulative Revenue vs Cost trend with net profit
  const cumulativeTrend = (() => {
    const events: Array<{ date: string; rev: number; exp: number }> = [
      ...cropHarvests.map(h => ({ date: h.date, rev: Number(h.revenue), exp: 0 })),
      ...cropExpenses.map(e => ({ date: e.date, rev: 0, exp: Number(e.amount) })),
      ...cropUsages.map(u => ({ date: u.date, rev: 0, exp: Number(u.cost) })),
      ...(seedCost > 0 && activeCrop ? [{ date: activeCrop.start_date, rev: 0, exp: seedCost }] : []),
    ];
    const grouped: Record<string, { rev: number; exp: number }> = {};
    events.forEach(ev => {
      if (!grouped[ev.date]) grouped[ev.date] = { rev: 0, exp: 0 };
      grouped[ev.date].rev += ev.rev;
      grouped[ev.date].exp += ev.exp;
    });
    let cumRev = 0, cumExp = 0;
    return Object.keys(grouped).sort().map(date => {
      cumRev += grouped[date].rev;
      cumExp += grouped[date].exp;
      return { date, revenue: parseFloat(cumRev.toFixed(2)), expenses: parseFloat(cumExp.toFixed(2)), net: parseFloat((cumRev - cumExp).toFixed(2)) };
    });
  })();

  // Custom tooltips for Recharts (Glassmorphism look)
  const CustomChartTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="glass border border-slate-200/50 dark:border-slate-800/80 p-3 rounded-xl shadow-lg text-xs font-semibold space-y-1 backdrop-blur-md">
          <p className="text-slate-400 font-bold">{label}</p>
          {payload.map((item: any, index: number) => (
            <p key={index} style={{ color: item.color || item.fill }}>
              {item.name}: {(item.value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
              {item.name.includes('Yield') ? ' kg' : ' ₹'}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      
      {/* 1. TIMELINE PERIOD CONTROL FILTERS */}
      <div className="glass rounded-2xl p-4 border border-slate-200/30 dark:border-slate-800/30 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h4 className="font-heading font-bold text-slate-850 dark:text-slate-200 flex items-center gap-2 text-sm">
            <BarChart3 className="text-emerald-500" size={18} />
            Horticultural Analytics Center
          </h4>
          <span className="text-[10px] text-slate-400 block font-semibold mt-0.5">
            {activeCrop ? `Active Crop Cycle: ${activeCrop.name}` : 'Showing unified history'}
          </span>
        </div>

        <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-900 rounded-xl p-1 shrink-0">
          <button
            onClick={() => setTimeFilter('daily')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              timeFilter === 'daily'
                ? 'bg-emerald-500 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            Daily
          </button>
          <button
            onClick={() => setTimeFilter('weekly')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              timeFilter === 'weekly'
                ? 'bg-emerald-500 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            Weekly
          </button>
          <button
            onClick={() => setTimeFilter('monthly')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              timeFilter === 'monthly'
                ? 'bg-emerald-500 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            Monthly
          </button>
        </div>
      </div>

      {/* 2. DUAL METRIC AREA CHART: PRODUCTION VS REVENUE */}
      <div className="glass rounded-2xl p-5 border border-slate-200/30 dark:border-slate-800/30 shadow-sm space-y-4">
        <div>
          <h4 className="font-heading font-bold text-slate-700 dark:text-slate-200 text-sm">Harvest Yield & Revenue Trend</h4>
          <p className="text-[10px] text-slate-400">Yield volume (kg) charted alongside earned contract sales revenue (₹) over time.</p>
        </div>

        {trendData.length > 0 ? (
          <div className="w-full h-80 text-xs font-bold">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorYield" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" className="dark:hidden" />
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" className="hidden dark:block" />
                <XAxis dataKey="date" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip content={<CustomChartTooltip />} />
                <Legend iconType="circle" />
                <Area 
                  name="Yield Volume (kg)" 
                  type="monotone" 
                  dataKey="yield" 
                  stroke="#10b981" 
                  strokeWidth={2.5} 
                  fillOpacity={1} 
                  fill="url(#colorYield)" 
                />
                <Area 
                  name="Revenue (₹)"
                  type="monotone" 
                  dataKey="revenue" 
                  stroke="#0ea5e9" 
                  strokeWidth={2.5} 
                  fillOpacity={1} 
                  fill="url(#colorRevenue)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="py-24 text-center text-slate-400 italic text-xs">Insufficient harvest history logged to plot area charts.</div>
        )}
      </div>

      {/* 3. DUAL GRID: PIE GRADE CHART & COST LEDGER BREAKDOWNS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Graded Yield Split */}
        <div className="glass rounded-2xl p-5 border border-slate-200/30 dark:border-slate-800/30 shadow-sm space-y-4">
          <div>
            <h4 className="font-heading font-bold text-slate-700 dark:text-slate-200 text-sm">Graded Yield Split</h4>
            <p className="text-[10px] text-slate-400">Breakdown of crop grading splits (Grade A, B, C) and wastage.</p>
          </div>

          {pieData.length > 0 ? (
            <div className="w-full h-64 flex flex-col sm:flex-row items-center justify-around gap-6 text-xs">
              <div className="w-48 h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={75}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="space-y-2.5 shrink-0 font-bold text-slate-500 dark:text-slate-400">
                {pieData.map(item => (
                  <div key={item.name} className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full block shrink-0" style={{ backgroundColor: item.color }}></span>
                    <span>{item.name}: <b className="text-slate-700 dark:text-slate-200">{item.value.toLocaleString()} kg</b></span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="py-24 text-center text-slate-400 italic text-xs">No yield harvests cataloged.</div>
          )}
        </div>

        {/* Expenses vs Revenue over time */}
        <div className="glass rounded-2xl p-5 border border-slate-200/30 dark:border-slate-800/30 shadow-sm space-y-4">
          <div>
            <h4 className="font-heading font-bold text-slate-700 dark:text-slate-200 text-sm">Operating Cash Flow Overview</h4>
            <p className="text-[10px] text-slate-400">Comparison of earnings (₹) against cost expenditures (₹).</p>
          </div>

          {trendData.length > 0 ? (
            <div className="w-full h-64 text-xs font-bold">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" className="dark:hidden" />
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" className="hidden dark:block" />
                  <XAxis dataKey="date" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip content={<CustomChartTooltip />} />
                  <Legend iconType="circle" />
                  <Bar name="Sales Revenue (₹)" dataKey="revenue" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar name="Operating Outlays (₹)" dataKey="expense" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="py-24 text-center text-slate-400 italic text-xs">No cash flow registered yet.</div>
          )}
        </div>

      </div>

      {/* 4. EXPENSE CATEGORY DONUT + CUMULATIVE REV vs COST */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Expense Category Donut */}
        <div className="glass rounded-2xl p-5 border border-slate-200/30 dark:border-slate-800/30 shadow-sm space-y-4">
          <div>
            <h4 className="font-heading font-bold text-slate-700 dark:text-slate-200 text-sm">Expense Category Breakdown</h4>
            <p className="text-[10px] text-slate-400">Distribution of operating costs across all expenditure categories.</p>
          </div>
          {expCatData.length > 0 ? (
            <div className="w-full h-64 flex flex-col sm:flex-row items-center justify-around gap-4 text-xs">
              <div className="w-44 h-44 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={expCatData} cx="50%" cy="50%" innerRadius={38} outerRadius={68} paddingAngle={3} dataKey="value">
                      {expCatData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2 font-bold text-slate-500 dark:text-slate-400 shrink-0">
                {expCatData.map(item => (
                  <div key={item.name} className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                    <span className="text-[10px]">{item.name}: <b className="text-slate-700 dark:text-slate-200">₹{item.value.toLocaleString()}</b></span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="py-24 text-center text-slate-400 italic text-xs">No expense data recorded yet.</div>
          )}
        </div>

        {/* Cumulative Revenue vs Cost with Break-Even */}
        <div className="glass rounded-2xl p-5 border border-slate-200/30 dark:border-slate-800/30 shadow-sm space-y-4">
          <div>
            <h4 className="font-heading font-bold text-slate-700 dark:text-slate-200 text-sm">Cumulative P&L Trajectory</h4>
            <p className="text-[10px] text-slate-400">Running revenue vs. cost — net profit line crosses break-even at ₹0.</p>
          </div>
          {cumulativeTrend.length > 0 ? (
            <div className="w-full h-64 text-xs font-bold">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={cumulativeTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="cumRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="cumExp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" className="dark:hidden" />
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" className="hidden dark:block" />
                  <XAxis dataKey="date" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip content={<CustomChartTooltip />} />
                  <Legend iconType="circle" />
                  <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="4 4" label={{ value: 'Break-Even', fill: '#94a3b8', fontSize: 9 }} />
                  <Area name="Cumulative Revenue (₹)" type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} fill="url(#cumRev)" />
                  <Area name="Cumulative Expenses (₹)" type="monotone" dataKey="expenses" stroke="#f43f5e" strokeWidth={2} fill="url(#cumExp)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="py-24 text-center text-slate-400 italic text-xs">No financial data to build P&L trajectory.</div>
          )}
        </div>

      </div>

      {/* 5. INVENTORY CONSUMPTION CHART */}
      <div className="glass rounded-2xl p-5 border border-slate-200/30 dark:border-slate-800/30 shadow-sm space-y-4">
        <div>
          <h4 className="font-heading font-bold text-slate-700 dark:text-slate-200 text-sm">Top 5 consumed Fertilizers / Sprays</h4>
          <p className="text-[10px] text-slate-400">Visual mapping of operational consumption outlays based on material usage logs.</p>
        </div>

        {consumptionData.length > 0 ? (
          <div className="w-full h-64 text-xs font-bold">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={consumptionData}
                layout="vertical"
                margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" className="dark:hidden" />
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" className="hidden dark:block" />
                <XAxis type="number" stroke="#94a3b8" />
                <YAxis dataKey="name" type="category" stroke="#94a3b8" width={100} />
                <Tooltip content={<CustomChartTooltip />} />
                <Bar name="Total Consumption Cost (₹)" dataKey="cost" fill="#06b6d4" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="py-24 text-center text-slate-400 italic text-xs">No chemical or fertilizer usage recorded.</div>
        )}
      </div>

    </div>
  );
};
