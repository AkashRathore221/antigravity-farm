import React, { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import type { UsageType, UnitType } from '../../db/types';
import { ClipboardList, PlusCircle, Trash2, Search, RefreshCw } from 'lucide-react';

export const UsageLogs: React.FC = () => {
  const { usageLogs, inventory, crops, addUsageLog, deleteUsageLog } = useAppStore();
  const activeCrop = crops.find(c => c.status === 'active');

  const [searchQuery, setSearchQuery] = useState('');
  const [activeType, setActiveType] = useState<string>('all');
  const [showAddForm, setShowAddForm] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    type: 'fertigation' as UsageType,
    inventory_id: '', // Linked inventory item (empty for manual text)
    custom_product_name: '', // Manual override name
    quantity_used: '',
    area_treated: '1000',
    notes: '',
    repeat_schedule: false,
    repeat_interval_days: '7'
  });

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCrop) {
      alert('You must have an active crop cycle running to record material usage.');
      return;
    }

    let finalProductName = formData.custom_product_name;
    let selectedUnit: UnitType = 'kg';
    const isLinked = formData.inventory_id !== '';

    if (isLinked) {
      const selectedItem = inventory.find(i => i.id === formData.inventory_id);
      if (selectedItem) {
        finalProductName = selectedItem.name;
        selectedUnit = selectedItem.unit;

        // Check if remaining stock is sufficient
        if (Number(formData.quantity_used) > selectedItem.remaining_qty) {
          if (!window.confirm(`Warning: The quantity used (${formData.quantity_used} ${selectedUnit}) exceeds the remaining stock in inventory (${selectedItem.remaining_qty} ${selectedUnit}). This will result in negative stock. Continue?`)) {
            return;
          }
        }
      }
    }

    addUsageLog({
      crop_id: activeCrop.id,
      date: formData.date,
      inventory_id: isLinked ? formData.inventory_id : null,
      product_name: finalProductName,
      quantity_used: Number(formData.quantity_used),
      unit: selectedUnit,
      area_treated: Number(formData.area_treated),
      type: formData.type,
      notes: formData.notes,
      repeat_schedule: formData.repeat_schedule,
      repeat_interval_days: formData.repeat_schedule ? Number(formData.repeat_interval_days) : undefined
    });

    // Reset Form
    setFormData({
      date: new Date().toISOString().split('T')[0],
      type: 'fertigation',
      inventory_id: '',
      custom_product_name: '',
      quantity_used: '',
      area_treated: '1000',
      notes: '',
      repeat_schedule: false,
      repeat_interval_days: '7'
    });

    setShowAddForm(false);
  };

  // Calculations
  const activeCropLogs = activeCrop ? usageLogs.filter(l => l.crop_id === activeCrop.id) : [];
  const totalConsumptionCost = activeCropLogs.reduce((sum, log) => sum + Number(log.cost), 0);

  // Filters
  const filteredLogs = usageLogs.filter(log => {
    const cropMatches = activeCrop ? log.crop_id === activeCrop.id : true; // Show all if no active crop
    
    const matchesSearch = log.product_name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          log.notes.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesType = activeType === 'all' || log.type === activeType;

    return cropMatches && matchesSearch && matchesType;
  });

  // Category labels helper
  const typesList = [
    { id: 'all', label: 'All Operations' },
    { id: 'fertigation', label: 'Drip Fertigation' },
    { id: 'spray', label: 'Foliar Sprays' },
    { id: 'chemical', label: 'Chemical Treatments' },
    { id: 'bio_stimulant', label: 'Biological Stimulants' }
  ];

  return (
    <div className="space-y-6">
      
      {/* 1. OPERATIONS HEADER & METRICS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Metric 1 */}
        <div className="glass rounded-2xl p-5 border border-slate-200/30 dark:border-slate-800/30 shadow-sm flex items-center gap-4">
          <div className="p-3.5 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-white shadow-md">
            <ClipboardList size={24} />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Active Material Expense</span>
            <div className="flex items-baseline gap-0.5">
              <span className="text-xs font-bold text-slate-400">₹</span>
              <h3 className="text-2xl font-black font-heading text-slate-800 dark:text-slate-100">
                {totalConsumptionCost.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
              </h3>
            </div>
            <span className="text-[10px] text-slate-400 font-semibold block">Total consumed fertilizer & spray costs</span>
          </div>
        </div>

        {/* Metric 2 */}
        <div className="glass rounded-2xl p-5 border border-slate-200/30 dark:border-slate-800/30 shadow-sm flex items-center gap-4">
          <div className="p-3.5 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-white shadow-md">
            <RefreshCw size={24} />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Scheduled Operations</span>
            <h3 className="text-2xl font-black font-heading text-slate-800 dark:text-slate-100">
              {usageLogs.filter(u => u.repeat_schedule).length} Active Rules
            </h3>
            <span className="text-[10px] text-slate-400 font-semibold block">Recurring cycle reminders loaded</span>
          </div>
        </div>

        {/* Action Toggle */}
        <div className="glass rounded-2xl p-5 border border-slate-200/30 dark:border-slate-800/30 shadow-sm flex items-center justify-center">
          <button
            onClick={() => {
              if (!activeCrop) {
                alert('Launch an active crop cycle first under the "Crop Cycle" tab.');
                return;
              }
              setShowAddForm(!showAddForm);
            }}
            className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-bold text-sm shadow-md flex items-center justify-center gap-2 transition-all"
          >
            <PlusCircle size={18} />
            {showAddForm ? 'Hide Log Entry' : 'Log New House Application'}
          </button>
        </div>
      </div>

      {/* 2. APPLICATION LOG ENTRY FORM */}
      {showAddForm && activeCrop && (
        <div className="glass-premium rounded-2xl p-6 border border-slate-200/50 dark:border-slate-800/40 shadow-md animate-slide-up space-y-4">
          <div>
            <h3 className="text-lg font-bold font-heading text-slate-800 dark:text-slate-100">Record Polyhouse Application</h3>
            <p className="text-xs text-slate-400">Log chemical, bio, or foliar applications. Selecting from stock deducts quantities and computes financials.</p>
          </div>

          <form onSubmit={handleAddSubmit} className="space-y-4 text-xs font-semibold">
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="text-slate-500 dark:text-slate-400">Date Applied</label>
                <input
                  type="date"
                  required
                  value={formData.date}
                  onChange={(e) => setFormData({...formData, date: e.target.value})}
                  className="w-full bg-slate-100/50 dark:bg-slate-900/50 border border-slate-200/30 dark:border-slate-800/30 rounded-xl px-3 py-2.5 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>
              
              <div className="space-y-1">
                <label className="text-slate-500 dark:text-slate-400">Application Type</label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({...formData, type: e.target.value as UsageType})}
                  className="w-full bg-slate-100/50 dark:bg-slate-900/50 border border-slate-200/30 dark:border-slate-800/30 rounded-xl px-3 py-2.5 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
                >
                  <option value="fertigation">Drip Fertigation (Fertilizer)</option>
                  <option value="spray">Foliar Spray Plan</option>
                  <option value="chemical">Soil Chemical Treatment</option>
                  <option value="bio_stimulant">Bio Stimulant Application</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-slate-500 dark:text-slate-400"> Greenhouses Treated Area (m²)</label>
                <input
                  type="number"
                  required
                  min="1"
                  value={formData.area_treated}
                  onChange={(e) => setFormData({...formData, area_treated: e.target.value})}
                  className="w-full bg-slate-100/50 dark:bg-slate-900/50 border border-slate-200/30 dark:border-slate-800/30 rounded-xl px-3 py-2.5 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              
              <div className="space-y-1">
                <label className="text-slate-500 dark:text-slate-400">Link Stock Product (Deducts stock)</label>
                <select
                  value={formData.inventory_id}
                  onChange={(e) => setFormData({...formData, inventory_id: e.target.value, custom_product_name: ''})}
                  className="w-full bg-slate-100/50 dark:bg-slate-900/50 border border-slate-200/30 dark:border-slate-800/30 rounded-xl px-3 py-2.5 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
                >
                  <option value="">-- Manual Text Product Entry --</option>
                  {inventory.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.name} ({item.brand}) - Stock: {item.remaining_qty} {item.unit}
                    </option>
                  ))}
                </select>
              </div>

              {formData.inventory_id === '' && (
                <div className="space-y-1">
                  <label className="text-slate-500 dark:text-slate-400">Manual Product Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Organic Compost"
                    value={formData.custom_product_name}
                    onChange={(e) => setFormData({...formData, custom_product_name: e.target.value})}
                    className="w-full bg-slate-100/50 dark:bg-slate-900/50 border border-slate-200/30 dark:border-slate-800/30 rounded-xl px-3 py-2.5 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              )}

              <div className="space-y-1">
                <label className="text-slate-500 dark:text-slate-400">
                  Quantity Applied {formData.inventory_id !== '' && `(${inventory.find(i => i.id === formData.inventory_id)?.unit})`}
                </label>
                <input
                  type="number"
                  required
                  min="0.001"
                  step="any"
                  placeholder="e.g. 5"
                  value={formData.quantity_used}
                  onChange={(e) => setFormData({...formData, quantity_used: e.target.value})}
                  className="w-full bg-slate-100/50 dark:bg-slate-900/50 border border-slate-200/30 dark:border-slate-800/30 rounded-xl px-3 py-2.5 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-slate-500 dark:text-slate-400 font-bold block mb-1">Set Repeat Calendar Schedule?</label>
                <div className="flex items-center gap-3 bg-slate-100/40 dark:bg-slate-900/40 p-2 border border-slate-200/20 rounded-xl">
                  <input
                    type="checkbox"
                    id="repeat_check"
                    checked={formData.repeat_schedule}
                    onChange={(e) => setFormData({...formData, repeat_schedule: e.target.checked})}
                    className="w-4 h-4 text-emerald-500 border-slate-300 rounded focus:ring-emerald-500"
                  />
                  <label htmlFor="repeat_check" className="text-slate-600 dark:text-slate-400 font-bold select-none cursor-pointer">
                    Enable upcoming reminder alarms
                  </label>
                </div>
              </div>

              {formData.repeat_schedule && (
                <div className="space-y-1">
                  <label className="text-slate-500 dark:text-slate-400">Repeat Application Recurrence Interval</label>
                  <select
                    value={formData.repeat_interval_days}
                    onChange={(e) => setFormData({...formData, repeat_interval_days: e.target.value})}
                    className="w-full bg-slate-100/50 dark:bg-slate-900/50 border border-slate-200/30 dark:border-slate-800/30 rounded-xl px-3 py-2.5 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="5">Every 5 Days</option>
                    <option value="7">Every 7 Days (Weekly)</option>
                    <option value="15">Every 15 Days (Bi-weekly)</option>
                    <option value="30">Every 30 Days (Monthly)</option>
                  </select>
                </div>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-slate-500 dark:text-slate-400">Application/Mixing Notes</label>
              <textarea
                rows={2}
                placeholder="Details about mixing ratios, dilution (e.g. 200L water tank) or pH values..."
                value={formData.notes}
                onChange={(e) => setFormData({...formData, notes: e.target.value})}
                className="w-full bg-slate-100/50 dark:bg-slate-900/50 border border-slate-200/30 dark:border-slate-800/30 rounded-xl px-3 py-2.5 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-bold rounded-xl shadow-md transition-all"
            >
              Confirm and Log Application
            </button>
          </form>
        </div>
      )}

      {/* 3. LOGS SUMMARY GRID */}
      <div className="glass rounded-2xl p-5 border border-slate-200/30 dark:border-slate-800/30 shadow-sm space-y-4">
        
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h4 className="font-heading font-bold text-slate-700 dark:text-slate-300">
              {activeCrop ? `Operations Log: ${activeCrop.name}` : 'Historical Crop Application Logs'}
            </h4>
            <p className="text-[10px] text-slate-400">List of all sprays and fertilizations. Stocks are automatically refunded if logs are deleted.</p>
          </div>
          
          <div className="relative max-w-xs w-full">
            <span className="absolute left-3 top-2.5 text-slate-400">
              <Search size={16} />
            </span>
            <input
              type="text"
              placeholder="Search applied products..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs bg-slate-100/50 dark:bg-slate-900/50 border border-slate-200/30 dark:border-slate-800/30 rounded-xl pl-9 pr-4 py-2.5 font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        {/* Tab Filters */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar border-b border-slate-200/20 dark:border-slate-800/20">
          {typesList.map(type => (
            <button
              key={type.id}
              onClick={() => setActiveType(type.id)}
              className={`px-4 py-2 rounded-xl text-xs font-bold shrink-0 transition-all ${
                activeType === type.id
                  ? 'bg-emerald-500 text-white shadow-sm'
                  : 'bg-slate-100/60 dark:bg-slate-900/40 text-slate-500 dark:text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-900'
              }`}
            >
              {type.label}
            </button>
          ))}
        </div>

        {/* 4. CHRONOLOGICAL LIST */}
        {filteredLogs.length > 0 ? (
          <div className="space-y-4">
            {filteredLogs.map(log => {
              let categoryTheme = 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/10';
              if (log.type === 'spray') categoryTheme = 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/10';
              if (log.type === 'chemical') categoryTheme = 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/10';
              if (log.type === 'bio_stimulant') categoryTheme = 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/10';

              return (
                <div key={log.id} className="p-4 bg-slate-100/30 dark:bg-slate-900/20 border border-slate-200/30 dark:border-slate-800/20 rounded-2xl flex flex-col sm:flex-row justify-between sm:items-center gap-4 text-xs font-semibold">
                  
                  {/* Left: Info details */}
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2 py-0.5 rounded-lg border text-[9px] uppercase tracking-wider font-bold">
                        {log.date}
                      </span>
                      <span className={`px-2 py-0.5 rounded-lg border text-[9px] uppercase tracking-wider font-bold ${categoryTheme}`}>
                        {log.type.replace('_',' ')}
                      </span>
                      {log.repeat_schedule && (
                        <span className="px-2 py-0.5 rounded-lg border border-indigo-500/20 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[9px] font-bold flex items-center gap-1">
                          <RefreshCw size={10} className="animate-spin" />
                          Recurring every {log.repeat_interval_days}d
                        </span>
                      )}
                    </div>
                    <div>
                      <h5 className="text-sm font-bold text-slate-700 dark:text-slate-200">{log.product_name}</h5>
                      <p className="text-slate-400 font-semibold text-[10px] block mt-0.5">
                        Applied {log.quantity_used} {log.unit} over {log.area_treated} m² &bull; Linked: {log.inventory_id ? 'Yes (Stock Deducted)' : 'No (Manual)'}
                      </p>
                    </div>
                    {log.notes && (
                      <p className="text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed max-w-2xl bg-white/20 dark:bg-slate-950/20 p-2 rounded-xl border border-slate-200/10">
                        {log.notes}
                      </p>
                    )}
                  </div>

                  {/* Right: Cash Cost & Delete */}
                  <div className="flex sm:flex-col justify-between items-center sm:items-end gap-3 shrink-0">
                    <div className="text-left sm:text-right">
                      <span className="text-[9px] text-slate-400 block uppercase font-bold">Application Cost</span>
                      <span className="text-sm font-bold text-slate-700 dark:text-slate-200 font-heading">
                        ₹{log.cost.toFixed(2)}
                      </span>
                    </div>

                    <button
                      onClick={() => {
                        if (window.confirm(`Delete usage log for "${log.product_name}"? This will automatically refund the stock level by ${log.quantity_used} ${log.unit}.`)) {
                          deleteUsageLog(log.id);
                        }
                      }}
                      className="p-2 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-900"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-12 text-center text-slate-400 text-xs italic">
            No application operations recorded under these filter criteria.
          </div>
        )}
      </div>

    </div>
  );
};
