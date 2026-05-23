import React, { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import type { Crop } from '../../db/types';
import { Sprout, Trash2, Search } from 'lucide-react';

export const CropLifecycle: React.FC = () => {
  const { crops, harvests, expenses, usageLogs, startCrop, endCrop, deleteCrop } = useAppStore();
  const activeCrop = crops.find(c => c.status === 'active');
  const archivedCrops = crops.filter(c => c.status === 'archived');
  
  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');

  // Start Crop form state
  const [formData, setFormData] = useState({
    name: 'Cucumber Summer Batch ' + new Date().getFullYear(),
    variety: 'Multistar F1',
    seed_company: 'Rijk Zwaan',
    start_date: new Date().toISOString().split('T')[0],
    transplant_date: new Date().toISOString().split('T')[0],
    expected_end_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    area_covered: 1000,
    num_plants: 3200,
    notes: ''
  });

  const [isSubmitConfirm, setIsSubmitConfirm] = useState(false);

  // Stats Calculator helper for any crop (active or archived)
  const getCropStats = (crop: Crop) => {
    const cropHarvests = harvests.filter(h => h.crop_id === crop.id);
    const cropExpenses = expenses.filter(e => e.crop_id === crop.id);
    const cropUsages = usageLogs.filter(u => u.crop_id === crop.id);

    const yieldTotal = cropHarvests.reduce((sum, h) => sum + Number(h.weight_total), 0);
    const revenue = cropHarvests.reduce((sum, h) => sum + Number(h.revenue), 0);
    
    const matExpense = cropUsages.reduce((sum, u) => sum + Number(u.cost), 0);
    const labExpense = cropExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
    const totalExp = matExpense + labExpense;
    
    const profit = revenue - totalExp;
    const costKg = yieldTotal > 0 ? totalExp / yieldTotal : 0;
    
    // Duration
    const start = new Date(crop.start_date);
    const end = crop.end_date ? new Date(crop.end_date) : new Date();
    const durationDays = Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

    return {
      yieldTotal,
      revenue,
      totalExp,
      profit,
      costKg,
      durationDays
    };
  };

  const handleStartCropSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (activeCrop) {
      setIsSubmitConfirm(true); // Open inline confirm to archive active first
    } else {
      triggerStartCrop();
    }
  };

  const triggerStartCrop = () => {
    startCrop({
      name: formData.name,
      variety: formData.variety,
      seed_company: formData.seed_company,
      start_date: formData.start_date,
      transplant_date: formData.transplant_date,
      expected_end_date: formData.expected_end_date,
      area_covered: Number(formData.area_covered),
      num_plants: Number(formData.num_plants),
      notes: formData.notes
    });
    setIsSubmitConfirm(false);
  };

  // Filter archived crops
  const filteredArchived = archivedCrops.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.variety.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.seed_company.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      
      {/* 1. TOP STATUS PANEL: ACTIVE CROP OR START FORM */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left 2 Cols: Form or Active Card */}
        <div className="lg:col-span-2 space-y-6">
          {activeCrop ? (
            /* Active Crop Card Details */
            <div className="glass-premium rounded-2xl p-6 border border-slate-200/50 dark:border-slate-800/40 shadow-sm space-y-5">
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    LIVE CROP CYCLE IN PROGRESS
                  </span>
                  <h3 className="text-2xl font-bold font-heading text-slate-800 dark:text-slate-100 flex items-center gap-2 mt-1">
                    <Sprout className="text-emerald-500" size={24} />
                    {activeCrop.name}
                  </h3>
                </div>
                <button
                  onClick={() => {
                    if (window.confirm(`Are you sure you want to end and archive the crop "${activeCrop.name}"? This will save all financials, harvest logs, and lock the record.`)) {
                      endCrop(activeCrop.id);
                    }
                  }}
                  className="px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 hover:border-rose-500/30 text-rose-600 dark:text-rose-400 rounded-xl text-xs font-bold transition-all shadow-sm"
                >
                  End & Archive Crop
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                <div className="bg-slate-100/40 dark:bg-slate-900/40 p-3 rounded-xl border border-slate-200/20">
                  <span className="text-slate-400 block font-semibold">Sown Date</span>
                  <span className="font-bold text-slate-700 dark:text-slate-300">{activeCrop.start_date}</span>
                </div>
                <div className="bg-slate-100/40 dark:bg-slate-900/40 p-3 rounded-xl border border-slate-200/20">
                  <span className="text-slate-400 block font-semibold">Transplant Date</span>
                  <span className="font-bold text-slate-700 dark:text-slate-300">{activeCrop.transplant_date}</span>
                </div>
                <div className="bg-slate-100/40 dark:bg-slate-900/40 p-3 rounded-xl border border-slate-200/20">
                  <span className="text-slate-400 block font-semibold">Target Yield End</span>
                  <span className="font-bold text-slate-700 dark:text-slate-300">{activeCrop.expected_end_date}</span>
                </div>
                <div className="bg-slate-100/40 dark:bg-slate-900/40 p-3 rounded-xl border border-slate-200/20">
                  <span className="text-slate-400 block font-semibold">Planting Setup</span>
                  <span className="font-bold text-slate-700 dark:text-slate-300">{activeCrop.num_plants} @ {activeCrop.area_covered}m²</span>
                </div>
              </div>

              {activeCrop.notes && (
                <div className="p-3 bg-slate-100/40 dark:bg-slate-900/30 border border-slate-200/20 rounded-xl text-xs">
                  <span className="font-bold text-slate-500 block mb-1">Operational Crop Notes:</span>
                  <p className="text-slate-600 dark:text-slate-400 leading-relaxed">{activeCrop.notes}</p>
                </div>
              )}
            </div>
          ) : (
            /* Start Crop Form */
            <div className="glass rounded-2xl p-6 border border-slate-200/30 dark:border-slate-800/30 shadow-sm space-y-4">
              <div>
                <h3 className="text-lg font-bold font-heading text-slate-800 dark:text-slate-200">Start Active Cucumber Crop Cycle</h3>
                <p className="text-xs text-slate-400">Initialize tracking database for a new greenhouse cucumber crop cycle.</p>
              </div>

              {isSubmitConfirm && (
                <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-700 dark:text-amber-300 space-y-3">
                  <span className="font-bold block">⚠️ ARCHIVING ACTIVE CROP DETECTED</span>
                  <p>Starting a new crop cycle will automatically mark your current active crop cycle as **archived** and set its end date to today. This ensures you maintain **one active crop** in play.</p>
                  <div className="flex gap-2">
                    <button type="button" onClick={triggerStartCrop} className="px-3 py-1.5 bg-amber-500 text-white font-bold rounded-lg hover:bg-amber-600">Yes, archive & start new</button>
                    <button type="button" onClick={() => setIsSubmitConfirm(false)} className="px-3 py-1.5 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold rounded-lg">Cancel</button>
                  </div>
                </div>
              )}

              <form onSubmit={handleStartCropSubmit} className="space-y-4 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="font-bold text-slate-500 dark:text-slate-400">Crop Cycle Identifier</label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full bg-slate-100/60 dark:bg-slate-900/60 border border-slate-200/40 dark:border-slate-800/40 rounded-xl px-3 py-2.5 font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-bold text-slate-500 dark:text-slate-400">Cucumber Hybrid / Variety</label>
                    <input
                      type="text"
                      required
                      value={formData.variety}
                      onChange={(e) => setFormData({ ...formData, variety: e.target.value })}
                      className="w-full bg-slate-100/60 dark:bg-slate-900/60 border border-slate-200/40 dark:border-slate-800/40 rounded-xl px-3 py-2.5 font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="font-bold text-slate-500 dark:text-slate-400">Sowing Start Date</label>
                    <input
                      type="date"
                      required
                      value={formData.start_date}
                      onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                      className="w-full bg-slate-100/60 dark:bg-slate-900/60 border border-slate-200/40 dark:border-slate-800/40 rounded-xl px-3 py-2.5 font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-bold text-slate-500 dark:text-slate-400">Transplanting Date</label>
                    <input
                      type="date"
                      required
                      value={formData.transplant_date}
                      onChange={(e) => setFormData({ ...formData, transplant_date: e.target.value })}
                      className="w-full bg-slate-100/60 dark:bg-slate-900/60 border border-slate-200/40 dark:border-slate-800/40 rounded-xl px-3 py-2.5 font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-bold text-slate-500 dark:text-slate-400">Expected Cycle End</label>
                    <input
                      type="date"
                      required
                      value={formData.expected_end_date}
                      onChange={(e) => setFormData({ ...formData, expected_end_date: e.target.value })}
                      className="w-full bg-slate-100/60 dark:bg-slate-900/60 border border-slate-200/40 dark:border-slate-800/40 rounded-xl px-3 py-2.5 font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="font-bold text-slate-500 dark:text-slate-400">Seed Company Breeder</label>
                    <input
                      type="text"
                      required
                      value={formData.seed_company}
                      onChange={(e) => setFormData({ ...formData, seed_company: e.target.value })}
                      className="w-full bg-slate-100/60 dark:bg-slate-900/60 border border-slate-200/40 dark:border-slate-800/40 rounded-xl px-3 py-2.5 font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-bold text-slate-500 dark:text-slate-400">Greenhouse Area (m²)</label>
                    <input
                      type="number"
                      required
                      min="1"
                      value={formData.area_covered}
                      onChange={(e) => setFormData({ ...formData, area_covered: Number(e.target.value) })}
                      className="w-full bg-slate-100/60 dark:bg-slate-900/60 border border-slate-200/40 dark:border-slate-800/40 rounded-xl px-3 py-2.5 font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-bold text-slate-500 dark:text-slate-400">Number of Plants (stems)</label>
                    <input
                      type="number"
                      required
                      min="1"
                      value={formData.num_plants}
                      onChange={(e) => setFormData({ ...formData, num_plants: Number(e.target.value) })}
                      className="w-full bg-slate-100/60 dark:bg-slate-900/60 border border-slate-200/40 dark:border-slate-800/40 rounded-xl px-3 py-2.5 font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-500 dark:text-slate-400">Bed Soil / Irrigation Setup Notes</label>
                  <textarea
                    rows={3}
                    value={formData.notes}
                    placeholder="Enter details on base organic fertilizers, soil solarization, or drip emitters configuration..."
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="w-full bg-slate-100/60 dark:bg-slate-900/60 border border-slate-200/40 dark:border-slate-800/40 rounded-xl px-3 py-2.5 font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-bold rounded-xl transition-all shadow-md"
                >
                  Create and Launch Active Crop Cycle
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Right 1 Col: Live Crop Financial Summary */}
        {activeCrop && (
          <div className="glass rounded-2xl p-6 border border-slate-200/30 dark:border-slate-800/30 shadow-sm space-y-4 h-fit">
            <h4 className="font-heading font-bold text-slate-700 dark:text-slate-300 border-b border-slate-200/30 dark:border-slate-800/30 pb-2">
              Active Yield Financials
            </h4>
            
            {(() => {
              const stats = getCropStats(activeCrop);
              return (
                <div className="space-y-4 text-xs font-semibold">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Crop Sowing Span</span>
                    <span className="text-slate-700 dark:text-slate-300 font-bold">{stats.durationDays} days</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Gross Harvest Volume</span>
                    <span className="text-slate-700 dark:text-slate-300 font-bold">{stats.yieldTotal.toLocaleString()} kg</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Sales Earnings</span>
                    <span className="text-emerald-500 font-bold font-heading text-sm">₹{stats.revenue.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Accumulated Outlay</span>
                    <span className="text-slate-700 dark:text-slate-300 font-bold">₹{stats.totalExp.toFixed(2)}</span>
                  </div>

                  <div className="border-t border-dashed border-slate-200 dark:border-slate-800 pt-3 flex justify-between items-center">
                    <span className="text-slate-400">Net Return Margin</span>
                    <span className={`font-heading text-lg font-bold ${stats.profit >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                      ₹{stats.profit.toFixed(2)}
                    </span>
                  </div>

                  <div className="p-3 bg-emerald-500/10 dark:bg-emerald-950/20 border border-emerald-500/20 rounded-xl text-center">
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 block uppercase font-bold tracking-wider">Unit Production Cost</span>
                    <span className="text-lg font-black text-emerald-600 dark:text-emerald-400 font-heading">₹{stats.costKg.toFixed(2)} / kg</span>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* 2. CROP HISTORY LEDGER */}
      <div className="glass rounded-2xl p-6 border border-slate-200/30 dark:border-slate-800/30 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200/30 dark:border-slate-800/30 pb-3">
          <div>
            <h3 className="text-lg font-bold font-heading text-slate-800 dark:text-slate-200">Historical Crop Log</h3>
            <p className="text-xs text-slate-400">Search and review archived crop batch results and financial cost-efficiency metrics.</p>
          </div>
          
          <div className="relative max-w-xs w-full">
            <span className="absolute left-3 top-2.5 text-slate-400">
              <Search size={16} />
            </span>
            <input
              type="text"
              placeholder="Search by variety or hybrid..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs bg-slate-100/50 dark:bg-slate-900/50 border border-slate-200/30 dark:border-slate-800/30 rounded-xl pl-9 pr-4 py-2.5 font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        {filteredArchived.length > 0 ? (
          <div className="space-y-4">
            {filteredArchived.map((crop) => {
              const stats = getCropStats(crop);
              return (
                <div key={crop.id} className="p-5 bg-slate-100/30 dark:bg-slate-900/20 border border-slate-200/30 dark:border-slate-800/20 rounded-2xl space-y-3.5 hover:shadow-sm transition-shadow">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/20 dark:border-slate-800/20 pb-2">
                    <div className="space-y-0.5">
                      <span className="text-[10px] font-bold text-slate-400 block">ARCHIVED BATCH ({crop.start_date} to {crop.end_date})</span>
                      <h4 className="font-heading font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                        {crop.name}
                      </h4>
                    </div>
                    <button
                      onClick={() => {
                        if (window.confirm(`Caution: Deleting this archived crop "${crop.name}" will completely clear all its historical calculations. Continue?`)) {
                          deleteCrop(crop.id);
                        }
                      }}
                      className="p-2 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-900/60 self-end sm:self-auto"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-6 gap-4 text-xs font-semibold text-center">
                    <div className="bg-white/40 dark:bg-slate-950/40 p-2 rounded-xl border border-slate-200/10">
                      <span className="text-[10px] text-slate-400 block">Variety</span>
                      <span className="text-slate-700 dark:text-slate-300 font-bold">{crop.variety}</span>
                    </div>
                    <div className="bg-white/40 dark:bg-slate-950/40 p-2 rounded-xl border border-slate-200/10">
                      <span className="text-[10px] text-slate-400 block">Duration</span>
                      <span className="text-slate-700 dark:text-slate-300 font-bold">{stats.durationDays} Days</span>
                    </div>
                    <div className="bg-white/40 dark:bg-slate-950/40 p-2 rounded-xl border border-slate-200/10">
                      <span className="text-[10px] text-slate-400 block">Total Yield</span>
                      <span className="text-slate-700 dark:text-slate-300 font-bold">{stats.yieldTotal.toLocaleString()} kg</span>
                    </div>
                    <div className="bg-white/40 dark:bg-slate-950/40 p-2 rounded-xl border border-slate-200/10">
                      <span className="text-[10px] text-slate-400 block">Expenses</span>
                      <span className="text-slate-700 dark:text-slate-300 font-bold">₹{stats.totalExp.toFixed(0)}</span>
                    </div>
                    <div className="bg-white/40 dark:bg-slate-950/40 p-2 rounded-xl border border-slate-200/10">
                      <span className="text-[10px] text-slate-400 block">Cost / kg</span>
                      <span className="text-emerald-500 font-bold">₹{stats.costKg.toFixed(2)}</span>
                    </div>
                    <div className="bg-emerald-500/5 dark:bg-emerald-950/10 p-2 rounded-xl border border-emerald-500/10">
                      <span className="text-[10px] text-slate-400 block">Net Profit</span>
                      <span className={`font-bold font-heading ${stats.profit >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                        ₹{stats.profit.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-8 text-center text-slate-400 text-xs italic">
            No historical crop registers fit search parameters.
          </div>
        )}
      </div>

    </div>
  );
};
