import React, { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell
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

  // 3. Dynamic Grouping by Date for Trends
  const groupData = () => {
    // Map dates to metrics
    const dataMap: Record<string, { date: string; yield: number; revenue: number; expense: number }> = {};
    
    // Group Harvests
    cropHarvests.forEach(h => {
      let key = h.date;
      if (timeFilter === 'weekly') {
        // Group by ISO Week or simplified week start
        const d = new Date(h.date);
        const firstDay = d.getDate() - d.getDay();
        const weekDate = new Date(d.setDate(firstDay));
        key = weekDate.toISOString().split('T')[0];
      } else if (timeFilter === 'monthly') {
        key = h.date.substring(0, 7); // YYYY-MM
      }

      if (!dataMap[key]) {
        dataMap[key] = { date: key, yield: 0, revenue: 0, expense: 0 };
      }
      dataMap[key].yield += Number(h.weight_total);
      dataMap[key].revenue += Number(h.revenue);
    });

    // Group General Expenses
    cropExpenses.forEach(e => {
      let key = e.date;
      if (timeFilter === 'weekly') {
        const d = new Date(e.date);
        const firstDay = d.getDate() - d.getDay();
        const weekDate = new Date(d.setDate(firstDay));
        key = weekDate.toISOString().split('T')[0];
      } else if (timeFilter === 'monthly') {
        key = e.date.substring(0, 7);
      }

      if (!dataMap[key]) {
        dataMap[key] = { date: key, yield: 0, revenue: 0, expense: 0 };
      }
      dataMap[key].expense += Number(e.amount);
    });

    // Group Inventory Usages (Chemical/Fertilizer costs)
    cropUsages.forEach(u => {
      let key = u.date;
      if (timeFilter === 'weekly') {
        const d = new Date(u.date);
        const firstDay = d.getDate() - d.getDay();
        const weekDate = new Date(d.setDate(firstDay));
        key = weekDate.toISOString().split('T')[0];
      } else if (timeFilter === 'monthly') {
        key = u.date.substring(0, 7);
      }

      if (!dataMap[key]) {
        dataMap[key] = { date: key, yield: 0, revenue: 0, expense: 0 };
      }
      dataMap[key].expense += Number(u.cost);
    });

    // Add seed/nursery upfront cost on crop start date
    if (activeCrop && (activeCrop.seed_nursery_cost ?? 0) > 0) {
      let seedKey = activeCrop.start_date;
      if (timeFilter === 'weekly') {
        const d = new Date(activeCrop.start_date);
        const firstDay = d.getDate() - d.getDay();
        const weekDate = new Date(d.setDate(firstDay));
        seedKey = weekDate.toISOString().split('T')[0];
      } else if (timeFilter === 'monthly') {
        seedKey = activeCrop.start_date.substring(0, 7);
      }
      if (!dataMap[seedKey]) dataMap[seedKey] = { date: seedKey, yield: 0, revenue: 0, expense: 0 };
      dataMap[seedKey].expense += activeCrop.seed_nursery_cost ?? 0;
    }

    // Sort chronologically
    return Object.values(dataMap).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
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

  // Custom tooltips for Recharts (Glassmorphism look)
  const CustomChartTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="glass border border-slate-200/50 dark:border-slate-800/80 p-3 rounded-xl shadow-lg text-xs font-semibold space-y-1 backdrop-blur-md">
          <p className="text-slate-400 font-bold">{label}</p>
          {payload.map((item: any, index: number) => (
            <p key={index} style={{ color: item.color || item.fill }}>
              {item.name}: {item.value.toLocaleString(undefined, { maximumFractionDigits: 2 })} 
              {item.name.includes('Yield') ? ' kg' : ' $'}
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

      {/* 4. INVENTORY CONSUMPTION CHART */}
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
