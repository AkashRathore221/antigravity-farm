import React, { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import type { ExpenseCategory } from '../../db/types';
import { Search, Trash2, Pencil, ChevronDown, ChevronUp } from 'lucide-react';

export const Expenses: React.FC = () => {
  const { expenses, crops, harvests, usageLogs, addExpense, updateExpense, deleteExpense } = useAppStore();
  const activeCrop = crops.find(c => c.status === 'active');

  const [searchQuery, setSearchQuery] = useState('');
  // Monthly summary toggle
  const [showMonthlySummary, setShowMonthlySummary] = useState(false);
  // Edit expense
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [editExpenseData, setEditExpenseData] = useState({
    date: '',
    category: 'labour' as ExpenseCategory,
    amount: '',
    notes: ''
  });

  const startEditExpense = (exp: typeof expenses[0]) => {
    setEditingExpenseId(exp.id);
    setEditExpenseData({ date: exp.date, category: exp.category, amount: String(exp.amount), notes: exp.notes });
  };

  const saveEditExpense = () => {
    if (!editingExpenseId) return;
    updateExpense(editingExpenseId, {
      date: editExpenseData.date,
      category: editExpenseData.category,
      amount: Number(editExpenseData.amount),
      notes: editExpenseData.notes,
    });
    setEditingExpenseId(null);
  };

  // Form State
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    category: 'labour' as ExpenseCategory,
    amount: '',
    notes: ''
  });

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCrop) {
      alert('You must have an active crop cycle running to record ledger expenses.');
      return;
    }

    addExpense({
      crop_id: activeCrop.id,
      date: formData.date,
      category: formData.category,
      amount: Number(formData.amount),
      notes: formData.notes
    });

    // Reset Form
    setFormData({
      date: new Date().toISOString().split('T')[0],
      category: 'labour',
      amount: '',
      notes: ''
    });

  };

  // Calculations for Active Crop
  const activeExpenses = activeCrop ? expenses.filter(e => e.crop_id === activeCrop.id) : [];
  const activeUsages = activeCrop ? usageLogs.filter(u => u.crop_id === activeCrop.id) : [];

  // Material usage costs
  const totalUsageExpenses = activeUsages.reduce((sum, u) => sum + Number(u.cost), 0);
  // General expenses
  const totalGeneralExpenses = activeExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
  
  // Overall Combine (include upfront seed/nursery cost from crop record)
  const seedCost = activeCrop?.seed_nursery_cost ?? 0;
  const totalExpenses = totalGeneralExpenses + totalUsageExpenses + seedCost;

  // Days since transplant
  let daysSinceTransplant = 0;
  if (activeCrop) {
    const tDate = new Date(activeCrop.transplant_date);
    const today = new Date();
    const diffTime = Math.abs(today.getTime() - tDate.getTime());
    daysSinceTransplant = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;
  }
  const dailyBurnRate = daysSinceTransplant > 0 ? totalExpenses / daysSinceTransplant : 0;

  // Yield calculations
  const cropHarvests = activeCrop ? harvests.filter(h => h.crop_id === activeCrop.id) : [];
  const totalProduction = cropHarvests.reduce((sum, h) => sum + Number(h.weight_total), 0);
  const costPerKg = totalProduction > 0 ? totalExpenses / totalProduction : 0;
  
  const costPerPlant = activeCrop && activeCrop.num_plants > 0 ? totalExpenses / activeCrop.num_plants : 0;

  // Category breakdown calculations (Labour, Inventory, Transport, Packaging, Misc)
  // Include auto-deducted inventory usage costs inside "inventory" category to show realistic breakdown!
  const getCatTotal = (cat: string) => {
    let sum = activeExpenses.filter(e => e.category === cat).reduce((s, e) => s + Number(e.amount), 0);
    if (cat === 'inventory') {
      sum += totalUsageExpenses;
    }
    return sum;
  };

  const catLabour = getCatTotal('labour');
  const catInventory = getCatTotal('inventory');
  const catTransport = getCatTotal('transport');
  const catPackaging = getCatTotal('packaging');
  const catFuel = getCatTotal('personal_vehicle_fuel');
  const catMisc = getCatTotal('miscellaneous');

  const catTotalSum = catLabour + catInventory + catTransport + catPackaging + catFuel + catMisc + seedCost;

  const pctLabour = catTotalSum > 0 ? (catLabour / catTotalSum) * 100 : 0;
  const pctInventory = catTotalSum > 0 ? (catInventory / catTotalSum) * 100 : 0;
  const pctTransport = catTotalSum > 0 ? (catTransport / catTotalSum) * 100 : 0;
  const pctPackaging = catTotalSum > 0 ? (catPackaging / catTotalSum) * 100 : 0;
  const pctFuel = catTotalSum > 0 ? (catFuel / catTotalSum) * 100 : 0;
  const pctMisc = catTotalSum > 0 ? (catMisc / catTotalSum) * 100 : 0;

  // Monthly grouping
  const monthlyData = (() => {
    const map: Record<string, { general: number; usage: number }> = {};
    activeExpenses.forEach(e => {
      const m = e.date.substring(0, 7);
      if (!map[m]) map[m] = { general: 0, usage: 0 };
      map[m].general += Number(e.amount);
    });
    activeUsages.forEach(u => {
      const m = u.date.substring(0, 7);
      if (!map[m]) map[m] = { general: 0, usage: 0 };
      map[m].usage += Number(u.cost);
    });
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, d]) => ({ month, general: d.general, usage: d.usage, total: d.general + d.usage }));
  })();

  // Filter lists
  const filteredExpenses = expenses.filter(e => {
    const cropMatches = activeCrop ? e.crop_id === activeCrop.id : true;
    const matchesSearch = e.notes.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          e.category.toLowerCase().includes(searchQuery.toLowerCase());
    return cropMatches && matchesSearch;
  });

  return (
    <div className="space-y-6">
      
      {/* 1. TOP METRICS HEADER */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Metric 1 */}
        <div className="glass rounded-2xl p-4 border border-slate-200/30 dark:border-slate-800/30 shadow-sm space-y-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Cumulative Expenses</span>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-slate-800 dark:text-slate-100">
              ₹{totalExpenses.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
            </span>
          </div>
          <span className="text-[10px] text-slate-400 font-semibold block">
            Usage: ₹{totalUsageExpenses.toFixed(0)} &bull; Cash: ₹{totalGeneralExpenses.toFixed(0)}
          </span>
        </div>

        {/* Metric 2 */}
        <div className="glass rounded-2xl p-4 border border-slate-200/30 dark:border-slate-800/30 shadow-sm space-y-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Daily Operating Burn</span>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-slate-800 dark:text-slate-100">
              ₹{dailyBurnRate.toFixed(2)}
            </span>
            <span className="text-xs font-semibold text-slate-400">/ day</span>
          </div>
          <span className="text-[10px] text-slate-400 font-semibold block">Active transplant span: {daysSinceTransplant}d</span>
        </div>

        {/* Metric 3 */}
        <div className="glass rounded-2xl p-4 border border-slate-200/30 dark:border-slate-800/30 shadow-sm space-y-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Investment per Stem</span>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-slate-800 dark:text-slate-100">
              ₹{costPerPlant.toFixed(2)}
            </span>
            <span className="text-xs font-semibold text-slate-400">/ plant</span>
          </div>
          <span className="text-[10px] text-slate-400 font-semibold block">Active population: {activeCrop?.num_plants || 0} plants</span>
        </div>

        {/* Metric 4 */}
        <div className="glass rounded-2xl p-4 border border-slate-200/30 dark:border-slate-800/30 shadow-sm space-y-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Production Cost</span>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-slate-800 dark:text-slate-100">
              ₹{costPerKg.toFixed(2)}
            </span>
            <span className="text-xs font-semibold text-slate-400">/ kg</span>
          </div>
          <span className="text-[10px] text-slate-400 block font-semibold">Total production yield: {totalProduction.toLocaleString()}kg</span>
        </div>
      </div>

      {/* 2. CATEGORY ALLOCATION BREAKDOWN */}
      {catTotalSum > 0 && (
        <div className="glass rounded-2xl p-5 border border-slate-200/30 dark:border-slate-800/30 shadow-sm space-y-4">
          <h4 className="font-heading font-bold text-slate-700 dark:text-slate-300 text-xs">Greenhouse Expense Allocation Splits</h4>
          
          <div className="space-y-3 font-semibold text-xs text-slate-600 dark:text-slate-400">
            {/* Seed / Nursery */}
            {seedCost > 0 && (
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span>Seed / Nursery Upfront Cost</span>
                  <span className="text-slate-800 dark:text-slate-200">₹{seedCost.toFixed(2)} ({catTotalSum > 0 ? ((seedCost / catTotalSum) * 100).toFixed(1) : 0}%)</span>
                </div>
                <div className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-600" style={{ width: `${catTotalSum > 0 ? (seedCost / catTotalSum) * 100 : 0}%` }}></div>
                </div>
              </div>
            )}

            {/* Labour */}
            <div className="space-y-1">
              <div className="flex justify-between">
                <span>Labour Payments (Manual Invoices)</span>
                <span className="text-slate-800 dark:text-slate-200">₹{catLabour.toFixed(2)} ({pctLabour.toFixed(1)}%)</span>
              </div>
              <div className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500" style={{ width: `${pctLabour}%` }}></div>
              </div>
            </div>

            {/* Inventory */}
            <div className="space-y-1">
              <div className="flex justify-between">
                <span>Inventory & Material Input Deductions</span>
                <span className="text-slate-800 dark:text-slate-200">₹{catInventory.toFixed(2)} ({pctInventory.toFixed(1)}%)</span>
              </div>
              <div className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-teal-400" style={{ width: `${pctInventory}%` }}></div>
              </div>
            </div>

            {/* Transport */}
            <div className="space-y-1">
              <div className="flex justify-between">
                <span>Transport & Vehicle Hire Fees</span>
                <span className="text-slate-800 dark:text-slate-200">₹{catTransport.toFixed(2)} ({pctTransport.toFixed(1)}%)</span>
              </div>
              <div className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-amber-400" style={{ width: `${pctTransport}%` }}></div>
              </div>
            </div>

            {/* Packaging */}
            <div className="space-y-1">
              <div className="flex justify-between">
                <span>Packaging Supplies Outlay</span>
                <span className="text-slate-800 dark:text-slate-200">₹{catPackaging.toFixed(2)} ({pctPackaging.toFixed(1)}%)</span>
              </div>
              <div className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500" style={{ width: `${pctPackaging}%` }}></div>
              </div>
            </div>

            {/* Personal Vehicle Fuel */}
            <div className="space-y-1">
              <div className="flex justify-between">
                <span>Personal Vehicle Fuel</span>
                <span className="text-slate-800 dark:text-slate-200">₹{catFuel.toFixed(2)} ({pctFuel.toFixed(1)}%)</span>
              </div>
              <div className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-orange-400" style={{ width: `${pctFuel}%` }}></div>
              </div>
            </div>

            {/* Misc */}
            <div className="space-y-1">
              <div className="flex justify-between">
                <span>Miscellaneous Operations Invoices</span>
                <span className="text-slate-800 dark:text-slate-200">₹{catMisc.toFixed(2)} ({pctMisc.toFixed(1)}%)</span>
              </div>
              <div className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-slate-400" style={{ width: `${pctMisc}%` }}></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MONTHLY EXPENSE SUMMARY */}
      {monthlyData.length > 0 && (
        <div className="glass rounded-2xl p-5 border border-slate-200/30 dark:border-slate-800/30 shadow-sm space-y-3">
          <button
            onClick={() => setShowMonthlySummary(v => !v)}
            className="w-full flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300"
          >
            <span>Monthly Expense Breakdown</span>
            {showMonthlySummary ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {showMonthlySummary && (
            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-xs font-semibold text-left border-collapse min-w-[420px]">
                <thead>
                  <tr className="border-b border-slate-200/30 dark:border-slate-800/30 text-slate-400 uppercase text-[10px] font-bold">
                    <th className="py-2">Month</th>
                    <th>General (₹)</th>
                    <th>Materials (₹)</th>
                    <th>Combined (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/10">
                  {monthlyData.map(row => {
                    const [y, m] = row.month.split('-');
                    const label = new Date(Number(y), Number(m) - 1).toLocaleDateString([], { month: 'long', year: 'numeric' });
                    return (
                      <tr key={row.month} className="text-slate-700 dark:text-slate-300">
                        <td className="py-2 font-bold">{label}</td>
                        <td>₹{row.general.toFixed(0)}</td>
                        <td>₹{row.usage.toFixed(0)}</td>
                        <td className="font-extrabold text-slate-800 dark:text-slate-100">₹{row.total.toFixed(0)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 3. GENERAL EXPENSE LEDGERS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left: General Ledger Table */}
        <div className="lg:col-span-2 glass rounded-2xl p-5 border border-slate-200/30 dark:border-slate-800/30 shadow-sm space-y-4">
          
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200/20 dark:border-slate-800/20 pb-3">
            <div>
              <h4 className="font-heading font-bold text-slate-700 dark:text-slate-300">General Expense Ledger</h4>
              <p className="text-[10px] text-slate-400">List of manual labour invoices, transports, and misc overheads.</p>
            </div>
            
            <div className="relative max-w-xs w-full">
              <span className="absolute left-3 top-2.5 text-slate-400">
                <Search size={16} />
              </span>
              <input
                type="text"
                placeholder="Search description or category..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-xs bg-slate-100/50 dark:bg-slate-900/50 border border-slate-200/30 dark:border-slate-800/30 rounded-xl pl-9 pr-4 py-2.5 font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {filteredExpenses.length > 0 ? (
            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
              {filteredExpenses.map(exp => {
                let badgeStyle = 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/10';
                if (exp.category === 'transport') badgeStyle = 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/10';
                if (exp.category === 'packaging') badgeStyle = 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/10';
                if (exp.category === 'inventory') badgeStyle = 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/10';
                if (exp.category === 'personal_vehicle_fuel') badgeStyle = 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/10';
                if (exp.category === 'miscellaneous') badgeStyle = 'bg-slate-500/15 text-slate-500 dark:text-slate-450 border-slate-500/10';

                return (
                  <div key={exp.id} className="p-4 bg-slate-100/30 dark:bg-slate-900/20 border border-slate-200/30 dark:border-slate-800/20 rounded-2xl text-xs font-semibold">
                    {editingExpenseId === exp.id ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <label className="text-slate-400 text-[10px] uppercase tracking-wider">Date</label>
                            <input
                              type="date"
                              value={editExpenseData.date}
                              onChange={e => setEditExpenseData(d => ({ ...d, date: e.target.value }))}
                              className="w-full bg-slate-100/50 dark:bg-slate-900/50 border border-slate-200/30 dark:border-slate-800/30 rounded-lg px-2 py-1.5 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-slate-400 text-[10px] uppercase tracking-wider">Category</label>
                            <select
                              value={editExpenseData.category}
                              onChange={e => setEditExpenseData(d => ({ ...d, category: e.target.value as ExpenseCategory }))}
                              className="w-full bg-slate-100/50 dark:bg-slate-900/50 border border-slate-200/30 dark:border-slate-800/30 rounded-lg px-2 py-1.5 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
                            >
                              <option value="labour">Labour</option>
                              <option value="transport">Transport</option>
                              <option value="packaging">Packaging</option>
                              <option value="personal_vehicle_fuel">Fuel</option>
                              <option value="miscellaneous">Miscellaneous</option>
                            </select>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-slate-400 text-[10px] uppercase tracking-wider">Amount (₹)</label>
                          <input
                            type="number"
                            min="0.01"
                            step="any"
                            value={editExpenseData.amount}
                            onChange={e => setEditExpenseData(d => ({ ...d, amount: e.target.value }))}
                            className="w-full bg-slate-100/50 dark:bg-slate-900/50 border border-slate-200/30 dark:border-slate-800/30 rounded-lg px-2 py-1.5 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-slate-400 text-[10px] uppercase tracking-wider">Description</label>
                          <input
                            type="text"
                            value={editExpenseData.notes}
                            onChange={e => setEditExpenseData(d => ({ ...d, notes: e.target.value }))}
                            className="w-full bg-slate-100/50 dark:bg-slate-900/50 border border-slate-200/30 dark:border-slate-800/30 rounded-lg px-2 py-1.5 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => setEditingExpenseId(null)}
                            className="px-3 py-1.5 text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-900 font-bold"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={saveEditExpense}
                            className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-lg"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex justify-between items-center gap-4">
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded-lg border border-slate-200/20 bg-slate-100 dark:bg-slate-900 font-bold text-[9px]">
                              {exp.date}
                            </span>
                            <span className={`px-2 py-0.5 rounded-lg border text-[9px] uppercase tracking-wider font-bold ${badgeStyle}`}>
                              {exp.category.replace('_',' ')}
                            </span>
                          </div>
                          <p className="text-slate-700 dark:text-slate-200 text-sm font-bold">{exp.notes}</p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-sm font-black text-rose-500 font-heading">
                            -₹{exp.amount.toFixed(2)}
                          </span>
                          <button
                            onClick={() => startEditExpense(exp)}
                            className="p-1.5 text-slate-400 hover:text-emerald-500 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-900"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            onClick={() => {
                              if (window.confirm(`Delete expense logged for ₹${exp.amount}?`)) {
                                deleteExpense(exp.id);
                              }
                            }}
                            className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-900"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-12 text-center text-slate-400 text-xs italic">
              No manual ledger cash expenses logged for the active crop cycle.
            </div>
          )}
        </div>

        {/* Right: Record General Expense Form */}
        <div className="glass rounded-2xl p-5 border border-slate-200/30 dark:border-slate-800/30 shadow-sm h-fit space-y-4">
          <div>
            <h4 className="font-heading font-bold text-slate-700 dark:text-slate-200">Log Operating Expense</h4>
            <p className="text-[10px] text-slate-400">Record manual invoices like labor payouts, logistics truck rentals, packaging cardboard, etc.</p>
          </div>

          {!activeCrop ? (
            <div className="p-4 bg-slate-100/40 dark:bg-slate-900/40 rounded-xl border border-slate-200/20 text-xs text-center text-slate-400 italic">
              Start an active crop cycle under the "Crop Cycle" tab to begin general expenses ledger logs.
            </div>
          ) : (
            <form onSubmit={handleAddSubmit} className="space-y-4 text-xs font-semibold">
              <div className="space-y-1">
                <label className="text-slate-500 dark:text-slate-400">Transaction Date</label>
                <input
                  type="date"
                  required
                  value={formData.date}
                  onChange={(e) => setFormData({...formData, date: e.target.value})}
                  className="w-full bg-slate-100/50 dark:bg-slate-900/50 border border-slate-200/30 dark:border-slate-800/30 rounded-xl px-3 py-2.5 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-500 dark:text-slate-400">Expense Category</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({...formData, category: e.target.value as ExpenseCategory})}
                  className="w-full bg-slate-100/50 dark:bg-slate-900/50 border border-slate-200/30 dark:border-slate-800/30 rounded-xl px-3 py-2.5 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
                >
                  <option value="labour">Labour Manual Payroll Invoice</option>
                  <option value="transport">Transport & Vehicle Hire Fees</option>
                  <option value="packaging">Packaging Materials Outlays</option>
                  <option value="personal_vehicle_fuel">Personal Vehicle Fuel</option>
                  <option value="miscellaneous">Miscellaneous Overheads</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-slate-500 dark:text-slate-400">Amount Charged (₹)</label>
                <input
                  type="number"
                  required
                  min="0.01"
                  step="any"
                  placeholder="e.g. 150"
                  value={formData.amount}
                  onChange={(e) => setFormData({...formData, amount: e.target.value})}
                  className="w-full bg-slate-100/50 dark:bg-slate-900/50 border border-slate-200/30 dark:border-slate-800/30 rounded-xl px-3 py-2.5 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-500 dark:text-slate-400">Ledger Description / Memo</label>
                <textarea
                  rows={3}
                  required
                  placeholder="e.g. Paid 6 day-labourers for lower leaf pruning block C..."
                  value={formData.notes}
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                  className="w-full bg-slate-100/50 dark:bg-slate-900/50 border border-slate-200/30 dark:border-slate-800/30 rounded-xl px-3 py-2.5 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-bold rounded-xl shadow-md transition-all"
              >
                Record Invoice Outlay
              </button>
            </form>
          )}
        </div>
      </div>

    </div>
  );
};
