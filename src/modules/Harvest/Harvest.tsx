import React, { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { Trash2, Search, ShoppingBag } from 'lucide-react';

export const Harvest: React.FC = () => {
  const { harvests, crops, expenses, usageLogs, addHarvest, deleteHarvest } = useAppStore();
  const activeCrop = crops.find(c => c.status === 'active');

  const [searchQuery, setSearchQuery] = useState('');
  // Buyer autocomplete
  const [buyerSuggestions, setBuyerSuggestions] = useState<string[]>([]);
  const uniqueBuyers = Array.from(new Set(harvests.map(h => h.buyer_name).filter(Boolean)));
  const handleBuyerChange = (val: string) => {
    setFormData(prev => ({ ...prev, buyer_name: val }));
    if (val.length >= 1) {
      setBuyerSuggestions(uniqueBuyers.filter(b => b.toLowerCase().includes(val.toLowerCase())));
    } else {
      setBuyerSuggestions([]);
    }
  };

  // Form state
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    grade_a: '',
    grade_b: '',
    wastage: '',
    buyer_name: 'City Wholesale Mandi',
    net_revenue: '',
    sale_rate: '',
    notes: ''
  });

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCrop) {
      alert('You must have an active crop cycle running to record harvests.');
      return;
    }

    const gA = Number(formData.grade_a) || 0;
    const gB = Number(formData.grade_b) || 0;
    const waste = Number(formData.wastage) || 0;

    const totalWeight = gA + gB + waste;

    if (totalWeight <= 0) {
      alert('Harvest weight must be greater than zero.');
      return;
    }

    addHarvest({
      crop_id: activeCrop.id,
      date: formData.date,
      weight_total: totalWeight,
      weight_grade_a: gA,
      weight_grade_b: gB,
      weight_grade_c: 0,
      wastage: waste,
      buyer_name: formData.buyer_name,
      mandi_rate: Number(formData.net_revenue) || 0,
      sale_rate: Number(formData.sale_rate),
      notes: formData.notes
    });

    // Reset Form
    setFormData({
      date: new Date().toISOString().split('T')[0],
      grade_a: '',
      grade_b: '',
      wastage: '',
      buyer_name: 'City Wholesale Mandi',
      net_revenue: '',
      sale_rate: '',
      notes: ''
    });

  };

  // Calculations for Active Crop
  const cropHarvests = activeCrop ? harvests.filter(h => h.crop_id === activeCrop.id) : [];
  const totalProduction = cropHarvests.reduce((sum, h) => sum + Number(h.weight_total), 0);
  const totalRevenue = cropHarvests.reduce((sum, h) => sum + Number(h.revenue), 0);
  const avgSaleRate = totalProduction > 0 ? totalRevenue / totalProduction : 0;
  
  // Grade distribution splits
  const totalGradeA = cropHarvests.reduce((sum, h) => sum + Number(h.weight_grade_a), 0);
  const totalGradeB = cropHarvests.reduce((sum, h) => sum + Number(h.weight_grade_b), 0);
  const totalWastage = cropHarvests.reduce((sum, h) => sum + Number(h.wastage), 0);

  const totalSum = totalGradeA + totalGradeB + totalWastage;
  const pctA = totalSum > 0 ? parseFloat(((totalGradeA / totalSum) * 100).toFixed(1)) : 0;
  const pctB = totalSum > 0 ? parseFloat(((totalGradeB / totalSum) * 100).toFixed(1)) : 0;
  const pctW = totalSum > 0 ? parseFloat(((totalWastage / totalSum) * 100).toFixed(1)) : 0;

  // Active crop unit cost
  const cropExpenses = activeCrop ? expenses.filter(e => e.crop_id === activeCrop.id) : [];
  const cropUsages = activeCrop ? usageLogs.filter(u => u.crop_id === activeCrop.id) : [];
  const totalExp = cropExpenses.reduce((sum, e) => sum + Number(e.amount), 0) + 
                   cropUsages.reduce((sum, u) => sum + Number(u.cost), 0);
  const costPerKg = totalProduction > 0 ? totalExp / totalProduction : 0;

  // Filter list
  const filteredHarvests = harvests.filter(h => {
    const cropMatches = activeCrop ? h.crop_id === activeCrop.id : true;
    const matchesSearch = h.buyer_name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          h.notes.toLowerCase().includes(searchQuery.toLowerCase());
    return cropMatches && matchesSearch;
  });

  // Calculate live dynamic form inputs
  const liveFormGradeA = Number(formData.grade_a) || 0;
  const liveFormGradeB = Number(formData.grade_b) || 0;
  const liveFormWastage = Number(formData.wastage) || 0;
  const liveFormTotal = liveFormGradeA + liveFormGradeB + liveFormWastage;
  const liveFormRevenue = Number(formData.net_revenue) || 0;

  return (
    <div className="space-y-6">
      
      {/* 1. TOP METRICS METERS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Metric 1 */}
        <div className="glass rounded-2xl p-4 border border-slate-200/30 dark:border-slate-800/30 shadow-sm space-y-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Harvested Production</span>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-slate-800 dark:text-slate-100">
              {totalProduction.toLocaleString()}
            </span>
            <span className="text-xs font-bold text-slate-400">kg</span>
          </div>
          <span className="text-[10px] text-emerald-500 font-semibold block">Total crop volume collected</span>
        </div>

        {/* Metric 2 */}
        <div className="glass rounded-2xl p-4 border border-slate-200/30 dark:border-slate-800/30 shadow-sm space-y-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Sales Revenue</span>
          <div className="flex items-baseline gap-1">
            <span className="text-xs font-bold text-slate-400">₹</span>
            <span className="text-2xl font-bold text-slate-800 dark:text-slate-100">
              {totalRevenue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
            </span>
          </div>
          <span className="text-[10px] text-emerald-500 font-semibold block">
            Net: ₹{(totalRevenue - totalExp).toFixed(0)} profits
          </span>
        </div>

        {/* Metric 3 */}
        <div className="glass rounded-2xl p-4 border border-slate-200/30 dark:border-slate-800/30 shadow-sm space-y-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Avg Selling Rate</span>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-slate-800 dark:text-slate-100">
              ₹{avgSaleRate.toFixed(2)}
            </span>
            <span className="text-xs font-semibold text-slate-400">/ kg</span>
          </div>
          <span className="text-[10px] text-slate-400 block font-semibold">Overall negotiated sales average</span>
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
          <span className={`text-[10px] font-bold block ${avgSaleRate - costPerKg >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
            Margin: ₹{(avgSaleRate - costPerKg).toFixed(2)} / kg
          </span>
        </div>
      </div>

      {/* CUMULATIVE YIELD PROGRESS (if target set) */}
      {activeCrop && (activeCrop.target_yield_kg ?? 0) > 0 && (
        <div className="glass rounded-2xl p-5 border border-emerald-500/20 dark:border-emerald-900/40 shadow-sm space-y-3 bg-emerald-500/5">
          <div className="flex justify-between items-center text-xs font-semibold">
            <span className="text-emerald-700 dark:text-emerald-300 font-bold">Yield Target Progress</span>
            <span className="text-emerald-600 dark:text-emerald-400">
              {totalProduction.toLocaleString()} kg harvested &bull; {((activeCrop.target_yield_kg ?? 0) - totalProduction).toLocaleString()} kg remaining
            </span>
          </div>
          <div className="w-full h-4 bg-emerald-100 dark:bg-emerald-950/50 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all rounded-full flex items-center justify-end pr-2"
              style={{ width: `${Math.min(100, (totalProduction / (activeCrop.target_yield_kg ?? 1)) * 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
            <span>{Math.min(100, (totalProduction / (activeCrop.target_yield_kg ?? 1)) * 100).toFixed(1)}% of target</span>
            <span>Target: {(activeCrop.target_yield_kg ?? 0).toLocaleString()} kg</span>
          </div>
        </div>
      )}

      {/* 2. GRADE SPLITS PROGRESS VISUAL */}
      {totalSum > 0 && (
        <div className="glass rounded-2xl p-5 border border-slate-200/30 dark:border-slate-800/30 shadow-sm space-y-3">
          <h4 className="font-heading font-bold text-slate-700 dark:text-slate-300 text-xs">Crop Yield Grade Split & Wastage Analysis</h4>
          
          {/* Progress Bar Segmented */}
          <div className="w-full h-4 bg-slate-200 dark:bg-slate-800 rounded-full flex overflow-hidden">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pctA}%` }} title={`Grade A: ${pctA}%`}></div>
            <div className="h-full bg-emerald-300 transition-all" style={{ width: `${pctB}%` }} title={`Grade B: ${pctB}%`}></div>
            <div className="h-full bg-rose-500 transition-all" style={{ width: `${pctW}%` }} title={`Wastage: ${pctW}%`}></div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-semibold text-slate-600 dark:text-slate-400">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-emerald-500 block shrink-0"></span>
              <span>Grade A (Premium): <b className="text-slate-700 dark:text-slate-200">{totalGradeA} kg ({pctA}%)</b></span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-emerald-300 block shrink-0"></span>
              <span>Grade B (Curved): <b className="text-slate-700 dark:text-slate-200">{totalGradeB} kg ({pctB}%)</b></span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-rose-500 block shrink-0"></span>
              <span>Wastage (Pests/Rot): <b className="text-slate-700 dark:text-slate-200">{totalWastage} kg ({pctW}%)</b></span>
            </div>
          </div>
        </div>
      )}

      {/* 3. LOG HARVEST ACTIONS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left: Harvest Entries List */}
        <div className="lg:col-span-2 glass rounded-2xl p-5 border border-slate-200/30 dark:border-slate-800/30 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200/20 dark:border-slate-800/20 pb-3">
            <div>
              <h4 className="font-heading font-bold text-slate-700 dark:text-slate-300">Yield & Mandi Sales Logs</h4>
              <p className="text-[10px] text-slate-400">List of all cucumber pickings and buyers for the current active crop.</p>
            </div>
            
            <div className="relative max-w-xs w-full">
              <span className="absolute left-3 top-2.5 text-slate-400">
                <Search size={16} />
              </span>
              <input
                type="text"
                placeholder="Search by buyer or notes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-xs bg-slate-100/50 dark:bg-slate-900/50 border border-slate-200/30 dark:border-slate-800/30 rounded-xl pl-9 pr-4 py-2.5 font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {filteredHarvests.length > 0 ? (
            <div className="space-y-3 max-h-[450px] overflow-y-auto pr-1">
              {filteredHarvests.map(har => (
                  <div key={har.id} className="p-4 bg-slate-100/30 dark:bg-slate-900/20 border border-slate-200/30 dark:border-slate-800/20 rounded-2xl flex flex-col sm:flex-row justify-between sm:items-center gap-4 text-xs font-semibold">
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2 py-0.5 rounded-lg border border-slate-200/20 bg-slate-100 dark:bg-slate-900 font-bold text-[9px]">
                          {har.date}
                        </span>
                        <span className="px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/15 font-bold text-[9px] flex items-center gap-1">
                          <ShoppingBag size={10} />
                          {har.buyer_name}
                        </span>
                      </div>

                      <h5 className="text-sm font-black text-slate-700 dark:text-slate-200">
                        {har.weight_total} kg <span className="text-xs font-semibold text-slate-400">Total Yield</span>
                      </h5>

                      <div className="flex items-center gap-3 text-[10px] text-slate-400 font-bold">
                        <span>A: <b className="text-slate-600 dark:text-slate-300">{har.weight_grade_a}kg</b></span>
                        <span>B: <b className="text-slate-600 dark:text-slate-300">{har.weight_grade_b}kg</b></span>
                        <span className="text-rose-400">Waste: <b className="text-rose-500">{har.wastage}kg</b></span>
                      </div>

                      {har.notes && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium italic mt-1 bg-white/20 dark:bg-slate-950/20 p-2 border border-slate-200/10 rounded-xl leading-relaxed">
                          {har.notes}
                        </p>
                      )}
                    </div>

                    {/* Rates & Revenue */}
                    <div className="flex sm:flex-col justify-between items-center sm:items-end gap-3 shrink-0 border-t sm:border-t-0 border-slate-200/20 pt-2 sm:pt-0">
                      <div className="text-left sm:text-right text-[10px]">
                        <span className="text-slate-400 block font-semibold">Gross Rate (ref)</span>
                        <span className="font-semibold text-slate-500 dark:text-slate-400">₹{har.sale_rate}/kg</span>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <span className="text-[9px] text-slate-400 block uppercase font-bold">Net Revenue</span>
                          <span className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400 font-heading">
                            +₹{har.revenue.toFixed(2)}
                          </span>
                        </div>
                        <button
                          onClick={() => {
                            if (window.confirm(`Delete harvest record logged on ${har.date}? This removes ₹${har.revenue.toFixed(2)} net revenue from totals.`)) {
                              deleteHarvest(har.id);
                            }
                          }}
                          className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-900"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>

                  </div>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center text-slate-400 text-xs italic">
              No harvest sessions recorded for the active cucumber cycle.
            </div>
          )}
        </div>

        {/* Right: Add Harvest Entry Form */}
        <div className="glass rounded-2xl p-5 border border-slate-200/30 dark:border-slate-800/30 shadow-sm h-fit space-y-4">
          <div>
            <h4 className="font-heading font-bold text-slate-700 dark:text-slate-200">Log Fresh Cucumber Harvest</h4>
            <p className="text-[10px] text-slate-400">Record daily pickings by category. Total weight & cash totals compute instantly.</p>
          </div>

          {!activeCrop ? (
            <div className="p-4 bg-slate-100/40 dark:bg-slate-900/40 rounded-xl border border-slate-200/20 text-xs text-center text-slate-400 italic">
              Start an active crop cycle under the "Crop Cycle" tab to begin daily harvest logs.
            </div>
          ) : (
            <form onSubmit={handleAddSubmit} className="space-y-4 text-xs font-semibold">
              <div className="space-y-1">
                <label className="text-slate-500 dark:text-slate-400">Harvest Date</label>
                <input
                  type="date"
                  required
                  value={formData.date}
                  onChange={(e) => setFormData({...formData, date: e.target.value})}
                  className="w-full bg-slate-100/50 dark:bg-slate-900/50 border border-slate-200/30 dark:border-slate-800/30 rounded-xl px-3 py-2.5 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-emerald-500">Grade A (kg)</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="0"
                    value={formData.grade_a}
                    onChange={(e) => setFormData({...formData, grade_a: e.target.value})}
                    className="w-full bg-slate-100/50 dark:bg-slate-900/50 border border-emerald-500/30 rounded-xl px-3 py-2.5 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-emerald-400">Grade B (kg)</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="0"
                    value={formData.grade_b}
                    onChange={(e) => setFormData({...formData, grade_b: e.target.value})}
                    className="w-full bg-slate-100/50 dark:bg-slate-900/50 border border-slate-200/30 dark:border-slate-800/30 rounded-xl px-3 py-2.5 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-rose-500 font-bold">Wastage (kg)</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="0"
                    value={formData.wastage}
                    onChange={(e) => setFormData({...formData, wastage: e.target.value})}
                    className="w-full bg-slate-100/50 dark:bg-slate-900/50 border border-rose-500/20 rounded-xl px-3 py-2.5 text-rose-600 dark:text-rose-400 focus:outline-none focus:border-rose-500"
                  />
                </div>
              </div>

              <div className="space-y-1 bg-slate-100/40 dark:bg-slate-900/40 p-3 rounded-xl border border-slate-200/20 flex justify-between items-baseline">
                <span className="text-slate-400 font-bold">Calculated Weight Total:</span>
                <span className="font-black text-slate-700 dark:text-slate-200 text-lg font-heading">{liveFormTotal} kg</span>
              </div>

              <div className="space-y-1 relative">
                <label className="text-slate-500 dark:text-slate-400">Contract Buyer Name</label>
                <input
                  type="text"
                  required
                  value={formData.buyer_name}
                  onChange={(e) => handleBuyerChange(e.target.value)}
                  onBlur={() => setTimeout(() => setBuyerSuggestions([]), 150)}
                  className="w-full bg-slate-100/50 dark:bg-slate-900/50 border border-slate-200/30 dark:border-slate-800/30 rounded-xl px-3 py-2.5 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
                />
                {buyerSuggestions.length > 0 && (
                  <div className="absolute top-full mt-1 left-0 right-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-50 overflow-hidden">
                    {buyerSuggestions.map((b, i) => (
                      <button
                        key={i}
                        type="button"
                        onPointerDown={() => { setFormData(prev => ({ ...prev, buyer_name: b })); setBuyerSuggestions([]); }}
                        className="w-full text-left px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-emerald-500/10 hover:text-emerald-600 dark:hover:text-emerald-400 border-b border-slate-100 dark:border-slate-800 last:border-0 transition-colors"
                      >
                        {b}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-500 dark:text-slate-400">Sold Price (₹/kg)</label>
                  <input
                    type="number"
                    required
                    min="0.01"
                    step="any"
                    placeholder="e.g. 15.00"
                    value={formData.sale_rate}
                    onChange={(e) => setFormData({...formData, sale_rate: e.target.value})}
                    className="w-full bg-slate-100/50 dark:bg-slate-900/50 border border-slate-200/30 dark:border-slate-800/30 rounded-xl px-3 py-2.5 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-500 dark:text-slate-400">Net Revenue (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="After commission, transport..."
                    value={formData.net_revenue}
                    onChange={(e) => setFormData({...formData, net_revenue: e.target.value})}
                    className="w-full bg-slate-100/50 dark:bg-slate-900/50 border border-slate-200/30 dark:border-slate-800/30 rounded-xl px-3 py-2.5 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="space-y-1 bg-emerald-500/10 dark:bg-emerald-950/20 p-3 rounded-xl border border-emerald-500/20 flex justify-between items-baseline text-emerald-600 dark:text-emerald-400">
                <span className="font-bold">Calculated Sales Earnings:</span>
                <span className="font-black text-xl font-heading">₹{liveFormRevenue.toFixed(2)}</span>
              </div>

              <div className="space-y-1">
                <label className="text-slate-500 dark:text-slate-400">Harvest Notes</label>
                <input
                  type="text"
                  placeholder="Greenhouse canopy health observations during picking..."
                  value={formData.notes}
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                  className="w-full bg-slate-100/50 dark:bg-slate-900/50 border border-slate-200/30 dark:border-slate-800/30 rounded-xl px-3 py-2.5 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-bold rounded-xl shadow-md transition-all"
              >
                Log Harvest & Sales Outlay
              </button>
            </form>
          )}
        </div>
      </div>

    </div>
  );
};
