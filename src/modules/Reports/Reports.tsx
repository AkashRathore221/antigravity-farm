import React, { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import {
  FileSpreadsheet, FileText, Download, Upload, Printer, Sprout
} from 'lucide-react';

export const Reports: React.FC = () => {
  const { 
    crops, inventory, usageLogs, harvests, expenses, weatherLogs, 
    settings, importBackup 
  } = useAppStore();

  const [selectedCropId, setSelectedCropId] = useState<string>(() => {
    const active = crops.find(c => c.status === 'active');
    return active ? active.id : (crops[0]?.id || '');
  });

  const [importText, setImportText] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [importStatus, setImportStatus] = useState<{ type: 'success' | 'error' | null; message: string }>({ type: null, message: '' });

  const selectedCrop = crops.find(c => c.id === selectedCropId);

  // Filtered data for the selected crop
  const cropHarvests = harvests.filter(h => h.crop_id === selectedCropId);
  const cropExpenses = expenses.filter(e => e.crop_id === selectedCropId);
  const cropUsages = usageLogs.filter(u => u.crop_id === selectedCropId);

  // Computations for report
  const totalProduction = cropHarvests.reduce((sum, h) => sum + h.weight_total, 0);
  const gradeAWeight = cropHarvests.reduce((sum, h) => sum + h.weight_grade_a, 0);
  const gradeBWeight = cropHarvests.reduce((sum, h) => sum + h.weight_grade_b, 0);
  const gradeCWeight = cropHarvests.reduce((sum, h) => sum + h.weight_grade_c, 0);
  const totalWastage = cropHarvests.reduce((sum, h) => sum + h.wastage, 0);

  const totalHarvestRevenue = cropHarvests.reduce((sum, h) => sum + h.revenue, 0);
  
  // Usage Log expenses (operational input costs)
  const usageCost = cropUsages.reduce((sum, u) => sum + u.cost, 0);
  // Manual direct ledger expenses (Labour, Transport, Packaging, Misc)
  const directExpenses = cropExpenses.reduce((sum, e) => sum + e.amount, 0);
  
  // Combined actual cost of crop: direct manual expenses + consumed material cost
  const totalExpenses = directExpenses + usageCost;
  const netProfit = totalHarvestRevenue - totalExpenses;
  const roi = totalExpenses > 0 ? (netProfit / totalExpenses) * 100 : 0;
  
  const costPerKg = totalProduction > 0 ? totalExpenses / totalProduction : 0;
  const costPerPlant = selectedCrop && selectedCrop.num_plants > 0 ? totalExpenses / selectedCrop.num_plants : 0;
  const avgSellingRate = totalProduction > 0 ? totalHarvestRevenue / totalProduction : 0;

  // Weather VPD Calculations for active period
  const cropWeatherLogs = weatherLogs.filter(log => {
    if (!selectedCrop) return false;
    const logDate = new Date(log.date);
    const start = new Date(selectedCrop.start_date);
    const end = selectedCrop.end_date ? new Date(selectedCrop.end_date) : new Date();
    return logDate >= start && logDate <= end;
  });

  const avgTemp = cropWeatherLogs.length > 0 
    ? cropWeatherLogs.reduce((sum, l) => sum + l.temp, 0) / cropWeatherLogs.length 
    : 0;
  const avgHumidity = cropWeatherLogs.length > 0 
    ? cropWeatherLogs.reduce((sum, l) => sum + l.humidity, 0) / cropWeatherLogs.length 
    : 0;
  const avgVPD = cropWeatherLogs.length > 0 
    ? cropWeatherLogs.reduce((sum, l) => sum + (l.vpd || 0), 0) / cropWeatherLogs.length 
    : 0;

  // Standard CSV Exporter
  const downloadCSV = (headers: string[], rows: any[][], fileName: string) => {
    const csvContent = [
      headers.join(','),
      ...rows.map(e => e.map(val => {
        if (typeof val === 'string') {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return val === null || val === undefined ? '' : String(val);
      }).join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Trigger Excel CSV exports
  const exportCrops = () => {
    const headers = ['ID', 'Name', 'Variety', 'Seed Company', 'Start Date', 'Transplant Date', 'Expected End Date', 'End Date', 'Area Covered (sqm)', 'Num Plants', 'Status', 'Notes'];
    const rows = crops.map(c => [
      c.id, c.name, c.variety, c.seed_company, c.start_date, c.transplant_date, c.expected_end_date, c.end_date || '', c.area_covered, c.num_plants, c.status, c.notes
    ]);
    downloadCSV(headers, rows, 'crops_ledger.csv');
  };

  const exportInventory = () => {
    const headers = ['ID', 'Name', 'Brand', 'Category', 'Unit', 'Purchased Qty', 'Remaining Qty', 'Price Per Unit', 'Purchase Date', 'Supplier', 'Low Stock Threshold', 'Notes'];
    const rows = inventory.map(i => [
      i.id, i.name, i.brand, i.category, i.unit, i.purchased_qty, i.remaining_qty, i.price, i.purchase_date, i.supplier, i.low_stock_threshold, i.notes
    ]);
    downloadCSV(headers, rows, 'inventory_ledger.csv');
  };

  const exportUsageLogs = () => {
    const headers = ['ID', 'Crop ID', 'Crop Name', 'Date', 'Inventory ID', 'Product Name', 'Quantity Used', 'Unit', 'Area Treated (sqm)', 'Cost', 'Type', 'Repeat Schedule', 'Repeat Interval Days', 'Notes'];
    const rows = usageLogs.map(u => {
      const cropName = crops.find(c => c.id === u.crop_id)?.name || 'Unknown Crop';
      return [
        u.id, u.crop_id, cropName, u.date, u.inventory_id || '', u.product_name, u.quantity_used, u.unit, u.area_treated, u.cost, u.type, u.repeat_schedule, u.repeat_interval_days || '', u.notes
      ];
    });
    downloadCSV(headers, rows, 'material_usage_logs.csv');
  };

  const exportHarvests = () => {
    const headers = ['ID', 'Crop ID', 'Crop Name', 'Date', 'Total Weight (kg)', 'Grade A (kg)', 'Grade B (kg)', 'Grade C (kg)', 'Wastage (kg)', 'Buyer Name', 'Mandi Rate', 'Sale Rate', 'Revenue', 'Notes'];
    const rows = harvests.map(h => {
      const cropName = crops.find(c => c.id === h.crop_id)?.name || 'Unknown Crop';
      return [
        h.id, h.crop_id, cropName, h.date, h.weight_total, h.weight_grade_a, h.weight_grade_b, h.weight_grade_c, h.wastage, h.buyer_name, h.mandi_rate, h.sale_rate, h.revenue, h.notes
      ];
    });
    downloadCSV(headers, rows, 'harvest_sales_ledger.csv');
  };

  const exportExpenses = () => {
    const headers = ['ID', 'Crop ID', 'Crop Name', 'Date', 'Category', 'Amount', 'Notes'];
    const rows = expenses.map(e => {
      const cropName = crops.find(c => c.id === e.crop_id)?.name || 'Unknown Crop';
      return [
        e.id, e.crop_id, cropName, e.date, e.category, e.amount, e.notes
      ];
    });
    downloadCSV(headers, rows, 'operating_expenses_ledger.csv');
  };

  const exportBackupJSON = () => {
    const state = { crops, inventory, usageLogs, harvests, expenses, weatherLogs, settings };
    const jsonStr = JSON.stringify(state, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `polyhouse_backup_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImport = () => {
    if (!importText.trim()) return;
    const success = importBackup(importText);
    if (success) {
      setImportStatus({ type: 'success', message: 'Database backup imported successfully! Page will re-render.' });
      setImportText('');
      setTimeout(() => setShowImport(false), 2000);
    } else {
      setImportStatus({ type: 'error', message: 'Failed to import backup. Please ensure JSON format is correct.' });
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      
      {/* EXPORT CONTROL BOARD */}
      <div className="no-print grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* CSV Excel Exports card */}
        <div className="glass-premium p-6 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <FileSpreadsheet size={20} />
            </div>
            <h3 className="font-heading font-bold text-slate-800 dark:text-slate-100">Excel / CSV Ledger Downloads</h3>
          </div>
          <p className="text-xs text-slate-400 font-semibold leading-relaxed">
            Export raw transactional ledgers to open directly in Microsoft Excel, Google Sheets, or other agribusiness databases.
          </p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <button onClick={exportCrops} className="flex items-center justify-between px-3 py-2 bg-slate-100/50 hover:bg-slate-200/50 dark:bg-slate-900/50 dark:hover:bg-slate-800/50 rounded-xl font-semibold transition-all">
              <span>Crops Grid</span>
              <Download size={12} className="opacity-65" />
            </button>
            <button onClick={exportInventory} className="flex items-center justify-between px-3 py-2 bg-slate-100/50 hover:bg-slate-200/50 dark:bg-slate-900/50 dark:hover:bg-slate-800/50 rounded-xl font-semibold transition-all">
              <span>Inventory</span>
              <Download size={12} className="opacity-65" />
            </button>
            <button onClick={exportUsageLogs} className="flex items-center justify-between px-3 py-2 bg-slate-100/50 hover:bg-slate-200/50 dark:bg-slate-900/50 dark:hover:bg-slate-800/50 rounded-xl font-semibold transition-all">
              <span>Usage Logs</span>
              <Download size={12} className="opacity-65" />
            </button>
            <button onClick={exportHarvests} className="flex items-center justify-between px-3 py-2 bg-slate-100/50 hover:bg-slate-200/50 dark:bg-slate-900/50 dark:hover:bg-slate-800/50 rounded-xl font-semibold transition-all">
              <span>Harvests</span>
              <Download size={12} className="opacity-65" />
            </button>
            <button onClick={exportExpenses} className="col-span-2 flex items-center justify-between px-3 py-2 bg-slate-100/50 hover:bg-slate-200/50 dark:bg-slate-900/50 dark:hover:bg-slate-800/50 rounded-xl font-semibold transition-all text-emerald-600 dark:text-emerald-400">
              <span>Operating Expenses Ledger</span>
              <Download size={12} />
            </button>
          </div>
        </div>

        {/* Cloud backup & JSON operations */}
        <div className="glass-premium p-6 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400">
              <Download size={20} />
            </div>
            <h3 className="font-heading font-bold text-slate-800 dark:text-slate-100">Local Database Backups</h3>
          </div>
          <p className="text-xs text-slate-400 font-semibold leading-relaxed">
            Download a full cryptographic snapshot of your entire farm state. Store this securely as an offline disaster recovery log.
          </p>
          <div className="space-y-2">
            <button onClick={exportBackupJSON} className="w-full flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700 text-white font-bold rounded-xl text-xs shadow-md shadow-emerald-500/10 transition-all">
              <Download size={14} />
              <span>Download State Backup (.JSON)</span>
            </button>
            <button onClick={() => { setShowImport(!showImport); setImportStatus({ type: null, message: '' }); }} className="w-full py-2 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-600 dark:text-slate-300 font-semibold rounded-xl text-xs transition-all">
              <span>{showImport ? 'Hide Restore Console' : 'Restore Database from JSON'}</span>
            </button>
          </div>
        </div>

        {/* Quick select cycle report */}
        <div className="glass-premium p-6 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <FileText size={20} />
            </div>
            <h3 className="font-heading font-bold text-slate-800 dark:text-slate-100">Audit Crop Reports</h3>
          </div>
          <p className="text-xs text-slate-400 font-semibold leading-relaxed">
            Select an active or historically archived cucumber crop cycle below to compile a printable corporate audit log.
          </p>
          <div className="space-y-3">
            <div>
              <label className="block text-[10px] font-bold tracking-wider text-slate-400 uppercase mb-1">Select Crop Cycle</label>
              <select
                value={selectedCropId}
                onChange={(e) => setSelectedCropId(e.target.value)}
                className="w-full bg-slate-100 dark:bg-slate-900 px-3 py-2 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-emerald-500 border border-transparent dark:border-slate-800"
              >
                {crops.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.status === 'active' ? 'Active' : 'Archived'})
                  </option>
                ))}
              </select>
            </div>
            <button 
              onClick={handlePrint}
              disabled={!selectedCropId}
              className="w-full flex items-center justify-center gap-2 py-2 bg-emerald-500/10 dark:bg-emerald-500/20 hover:bg-emerald-500/20 dark:hover:bg-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-bold rounded-xl text-xs transition-all disabled:opacity-50"
            >
              <Printer size={14} />
              <span>Print PDF Audit Report</span>
            </button>
          </div>
        </div>

      </div>

      {/* IMPORT COMPONENT PANEL */}
      {showImport && (
        <div className="no-print glass p-6 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 animate-slide-up space-y-4">
          <h4 className="font-heading font-bold text-sm text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Upload size={16} className="text-emerald-500" />
            <span>Restore Backup Snapshot</span>
          </h4>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder="Paste your JSON backup file contents here..."
            className="w-full h-32 bg-slate-100 dark:bg-slate-900 p-3 rounded-xl text-xs font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500 border border-slate-200 dark:border-slate-800"
          ></textarea>
          {importStatus.type && (
            <div className={`p-3 rounded-xl text-xs font-semibold ${
              importStatus.type === 'success' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-500'
            }`}>
              {importStatus.message}
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowImport(false)} className="px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-900 rounded-xl text-xs font-semibold">
              Cancel
            </button>
            <button onClick={handleImport} className="px-4 py-2 bg-emerald-500 text-white hover:bg-emerald-600 rounded-xl text-xs font-bold shadow-md shadow-emerald-500/10">
              Inject Data State
            </button>
          </div>
        </div>
      )}

      {/* DETAILED CROP AUDIT REPORT PREVIEW */}
      {selectedCrop ? (
        <div id="printable-report-area" className="bg-white dark:bg-slate-900 p-6 lg:p-12 rounded-3xl border border-slate-200/40 dark:border-slate-800/40 shadow-sm space-y-8 print:p-0 print:border-none print:shadow-none">
          
          {/* REPORT HEADER */}
          <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-8 gap-4">
            <div className="flex items-center gap-4">
              <div className="p-4 rounded-2xl bg-emerald-500/10 text-emerald-600 print:bg-emerald-500 print:text-white print:-ml-1">
                <Sprout size={36} />
              </div>
              <div>
                <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">Greenhouse Crop Audit Summary</span>
                <h2 className="text-2xl font-bold font-heading text-slate-900 dark:text-slate-50">
                  {selectedCrop.name}
                </h2>
                <p className="text-xs text-slate-400 font-semibold mt-0.5">
                  Variety: <span className="text-slate-600 dark:text-slate-300 font-bold">{selectedCrop.variety}</span> ({selectedCrop.seed_company})
                </p>
              </div>
            </div>

            <div className="text-left md:text-right space-y-1 text-xs">
              <div className="font-semibold text-slate-400">Status</div>
              <div>
                {selectedCrop.status === 'active' ? (
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-400 font-bold uppercase tracking-wider text-[10px]">
                    Active Cycle
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 font-bold uppercase tracking-wider text-[10px]">
                    Archived
                  </span>
                )}
              </div>
              <div className="text-[10px] text-slate-400 font-semibold mt-1">
                Audited: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
              </div>
            </div>
          </div>

          {/* QUICK FINANCIALS & OPERATIONAL KPIS */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            
            <div className="p-5 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-100 dark:border-slate-800/40">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Net Income / P&L</span>
              <div className={`text-2xl font-bold font-heading mt-1 flex items-baseline gap-0.5 ${netProfit >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                <span className="text-sm font-semibold">₹</span>
                <span>{netProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <span className="text-[10px] text-slate-400 font-semibold mt-1 block">Total Profit of Cycle</span>
            </div>

            <div className="p-5 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-100 dark:border-slate-800/40">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Return on Investment</span>
              <div className={`text-2xl font-bold font-heading mt-1 flex items-baseline gap-0.5 ${roi >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                <span>{roi.toFixed(1)}</span>
                <span className="text-sm font-semibold">%</span>
              </div>
              <span className="text-[10px] text-slate-400 font-semibold mt-1 block">Net Profit / Cost ratio</span>
            </div>

            <div className="p-5 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-100 dark:border-slate-800/40">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Cucumber Harvest</span>
              <div className="text-2xl font-bold font-heading text-slate-900 dark:text-slate-50 mt-1 flex items-baseline gap-0.5">
                <span>{totalProduction.toLocaleString()}</span>
                <span className="text-sm font-semibold">kg</span>
              </div>
              <span className="text-[10px] text-slate-400 font-semibold mt-1 block">Avg: ₹{avgSellingRate.toFixed(2)}/kg sales</span>
            </div>

            <div className="p-5 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-100 dark:border-slate-800/40">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Unit Production Cost</span>
              <div className="text-2xl font-bold font-heading text-slate-900 dark:text-slate-50 mt-1 flex items-baseline gap-0.5">
                <span className="text-sm font-semibold">₹</span>
                <span>{costPerKg.toFixed(2)}</span>
                <span className="text-xs text-slate-400 font-normal">/kg</span>
              </div>
              <span className="text-[10px] text-slate-400 font-semibold mt-1 block">Or ₹{costPerPlant.toFixed(2)} / plant</span>
            </div>

          </div>

          {/* BASIC CROP TIMELINE & STATS */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <h3 className="font-heading font-bold text-sm text-slate-800 dark:text-slate-100 border-b border-slate-100 dark:border-slate-800 pb-2">
                1. Cycle Timelines & Infrastructure
              </h3>
              <table className="w-full text-xs text-left">
                <tbody>
                  <tr className="border-b border-slate-100 dark:border-slate-800/20 py-2">
                    <td className="py-2.5 font-semibold text-slate-400">Sowing Date</td>
                    <td className="py-2.5 text-right font-bold text-slate-700 dark:text-slate-350">{new Date(selectedCrop.start_date).toLocaleDateString()}</td>
                  </tr>
                  <tr className="border-b border-slate-100 dark:border-slate-800/20 py-2">
                    <td className="py-2.5 font-semibold text-slate-400">Transplant Date</td>
                    <td className="py-2.5 text-right font-bold text-slate-700 dark:text-slate-350">{new Date(selectedCrop.transplant_date).toLocaleDateString()}</td>
                  </tr>
                  <tr className="border-b border-slate-100 dark:border-slate-800/20 py-2">
                    <td className="py-2.5 font-semibold text-slate-400">End Date / Expected</td>
                    <td className="py-2.5 text-right font-bold text-slate-700 dark:text-slate-350">
                      {selectedCrop.end_date ? new Date(selectedCrop.end_date).toLocaleDateString() : `${new Date(selectedCrop.expected_end_date).toLocaleDateString()} (Expected)`}
                    </td>
                  </tr>
                  <tr className="border-b border-slate-100 dark:border-slate-800/20 py-2">
                    <td className="py-2.5 font-semibold text-slate-400">Greenhouse Footprint</td>
                    <td className="py-2.5 text-right font-bold text-slate-700 dark:text-slate-350">{selectedCrop.area_covered} sqm</td>
                  </tr>
                  <tr className="border-b border-slate-100 dark:border-slate-800/20 py-2">
                    <td className="py-2.5 font-semibold text-slate-400">Crop Plant Stand</td>
                    <td className="py-2.5 text-right font-bold text-slate-700 dark:text-slate-350">{selectedCrop.num_plants.toLocaleString()} stems</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="space-y-4">
              <h3 className="font-heading font-bold text-sm text-slate-800 dark:text-slate-100 border-b border-slate-100 dark:border-slate-800 pb-2">
                2. Environmental Parameters Audit
              </h3>
              <table className="w-full text-xs text-left">
                <tbody>
                  <tr className="border-b border-slate-100 dark:border-slate-800/20 py-2">
                    <td className="py-2.5 font-semibold text-slate-400">Average Temp (°C)</td>
                    <td className="py-2.5 text-right font-bold text-slate-700 dark:text-slate-350">
                      {avgTemp > 0 ? `${avgTemp.toFixed(1)} °C` : 'No Log Entries'}
                    </td>
                  </tr>
                  <tr className="border-b border-slate-100 dark:border-slate-800/20 py-2">
                    <td className="py-2.5 font-semibold text-slate-400">Average Humidity (%)</td>
                    <td className="py-2.5 text-right font-bold text-slate-700 dark:text-slate-350">
                      {avgHumidity > 0 ? `${avgHumidity.toFixed(0)} %` : 'No Log Entries'}
                    </td>
                  </tr>
                  <tr className="border-b border-slate-100 dark:border-slate-800/20 py-2">
                    <td className="py-2.5 font-semibold text-slate-400">Avg Vapor Pressure Deficit (VPD)</td>
                    <td className="py-2.5 text-right font-bold text-slate-700 dark:text-slate-350">
                      {avgVPD > 0 ? `${avgVPD.toFixed(2)} kPa` : 'No Log Entries'}
                    </td>
                  </tr>
                  <tr className="border-b border-slate-100 dark:border-slate-800/20 py-2">
                    <td className="py-2.5 font-semibold text-slate-400">Transpiration Efficiency</td>
                    <td className="py-2.5 text-right font-bold">
                      {avgVPD === 0 ? (
                        <span className="text-slate-400">N/A</span>
                      ) : avgVPD >= 1.0 && avgVPD <= 1.6 ? (
                        <span className="text-emerald-500 font-bold">Optimal Range (1.0 - 1.6)</span>
                      ) : avgVPD < 1.0 ? (
                        <span className="text-blue-500 font-bold">Mold/Mildew Risk (&lt;1.0)</span>
                      ) : (
                        <span className="text-amber-500 font-bold">Stomatal Stress (&gt;1.6)</span>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="print-break h-px"></div>

          {/* GRADED HARVESTS BREAKDOWN */}
          <div className="space-y-4">
            <h3 className="font-heading font-bold text-sm text-slate-800 dark:text-slate-100 border-b border-slate-100 dark:border-slate-800 pb-2">
              3. Production Yield & Grading Splits
            </h3>
            
            {/* Split bars */}
            <div className="space-y-3">
              <div className="flex h-6 rounded-xl overflow-hidden text-[10px] font-bold text-white shadow-inner bg-slate-100 dark:bg-slate-800">
                {totalProduction > 0 ? (
                  <>
                    <div 
                      style={{ width: `${(gradeAWeight / totalProduction) * 100}%` }}
                      className="bg-emerald-500 flex items-center justify-center min-w-[30px]"
                      title="Grade A Quality"
                    >
                      A ({(gradeAWeight / totalProduction * 100).toFixed(0)}%)
                    </div>
                    <div 
                      style={{ width: `${(gradeBWeight / totalProduction) * 100}%` }}
                      className="bg-teal-400 flex items-center justify-center min-w-[30px]"
                      title="Grade B Quality"
                    >
                      B ({(gradeBWeight / totalProduction * 100).toFixed(0)}%)
                    </div>
                    <div 
                      style={{ width: `${(gradeCWeight / totalProduction) * 100}%` }}
                      className="bg-amber-400 flex items-center justify-center min-w-[30px]"
                      title="Grade C Quality"
                    >
                      C ({(gradeCWeight / totalProduction * 100).toFixed(0)}%)
                    </div>
                    <div 
                      style={{ width: `${(totalWastage / totalProduction) * 100}%` }}
                      className="bg-red-400 flex items-center justify-center min-w-[30px]"
                      title="Wastage / Rot"
                    >
                      W ({(totalWastage / totalProduction * 100).toFixed(0)}%)
                    </div>
                  </>
                ) : (
                  <div className="w-full text-slate-400 font-semibold flex items-center justify-center">No harvest yield data recorded yet</div>
                )}
              </div>

              <div className="grid grid-cols-4 gap-2 text-xs font-semibold text-center text-slate-500">
                <div>
                  <span className="inline-block w-2.5 h-2.5 bg-emerald-500 rounded-full mr-1.5 align-middle"></span>
                  <span>Grade A: {gradeAWeight.toLocaleString()} kg</span>
                </div>
                <div>
                  <span className="inline-block w-2.5 h-2.5 bg-teal-400 rounded-full mr-1.5 align-middle"></span>
                  <span>Grade B: {gradeBWeight.toLocaleString()} kg</span>
                </div>
                <div>
                  <span className="inline-block w-2.5 h-2.5 bg-amber-400 rounded-full mr-1.5 align-middle"></span>
                  <span>Grade C: {gradeCWeight.toLocaleString()} kg</span>
                </div>
                <div>
                  <span className="inline-block w-2.5 h-2.5 bg-red-400 rounded-full mr-1.5 align-middle"></span>
                  <span>Wastage: {totalWastage.toLocaleString()} kg</span>
                </div>
              </div>
            </div>

            {/* List of recent harvests */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[9px]">
                    <th className="py-2.5">Date</th>
                    <th className="py-2.5">Buyer</th>
                    <th className="py-2.5 text-right">Sold Rate ($/kg)</th>
                    <th className="py-2.5 text-right">Mandi Bench ($/kg)</th>
                    <th className="py-2.5 text-right">Total Yield (kg)</th>
                    <th className="py-2.5 text-right">Revenue ($)</th>
                  </tr>
                </thead>
                <tbody>
                  {cropHarvests.length > 0 ? (
                    cropHarvests.map((h) => (
                      <tr key={h.id} className="border-b border-slate-100 dark:border-slate-800/10 hover:bg-slate-50/50">
                        <td className="py-2 font-semibold">{new Date(h.date).toLocaleDateString()}</td>
                        <td className="py-2">{h.buyer_name}</td>
                        <td className="py-2 text-right font-bold">₹{h.sale_rate.toFixed(2)}</td>
                        <td className="py-2 text-right text-slate-400">₹{h.mandi_rate.toFixed(2)}</td>
                        <td className="py-2 text-right">{h.weight_total.toLocaleString()} kg</td>
                        <td className="py-2 text-right font-bold text-emerald-600 dark:text-emerald-400">₹{h.revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="py-4 text-center text-slate-400 italic">No harvests logged yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="print-break h-px"></div>

          {/* FINANCIAL STATEMENTS & LEDGER SUMMARY */}
          <div className="space-y-4">
            <h3 className="font-heading font-bold text-sm text-slate-800 dark:text-slate-100 border-b border-slate-100 dark:border-slate-800 pb-2">
              4. Financial Auditing Ledger (Expenses Breakdown)
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-xs">
              {/* Category split */}
              <div className="space-y-2">
                <span className="font-semibold text-slate-400 uppercase tracking-wider text-[9px] block">Expense Classification</span>
                
                {/* Labour */}
                <div>
                  <div className="flex justify-between font-bold mb-1">
                    <span>Labour wages</span>
                    <span>₹{cropExpenses.filter(e => e.category === 'labour').reduce((sum, e) => sum + e.amount, 0).toLocaleString()}</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-emerald-500"
                      style={{ width: `${totalExpenses > 0 ? (cropExpenses.filter(e => e.category === 'labour').reduce((sum, e) => sum + e.amount, 0) / totalExpenses) * 100 : 0}%` }}
                    ></div>
                  </div>
                </div>

                {/* Fertilizers & Spray Inventory */}
                <div>
                  <div className="flex justify-between font-bold mb-1">
                    <span>Chemicals & Fertigation Consumed</span>
                    <span>₹{usageCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-teal-500"
                      style={{ width: `${totalExpenses > 0 ? (usageCost / totalExpenses) * 100 : 0}%` }}
                    ></div>
                  </div>
                </div>

                {/* Transport & Packaging */}
                <div>
                  <div className="flex justify-between font-bold mb-1">
                    <span>Logistics & Packaging</span>
                    <span>₹{cropExpenses.filter(e => ['transport', 'packaging'].includes(e.category)).reduce((sum, e) => sum + e.amount, 0).toLocaleString()}</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-amber-500"
                      style={{ width: `${totalExpenses > 0 ? (cropExpenses.filter(e => ['transport', 'packaging'].includes(e.category)).reduce((sum, e) => sum + e.amount, 0) / totalExpenses) * 100 : 0}%` }}
                    ></div>
                  </div>
                </div>

                {/* Miscellaneous */}
                <div>
                  <div className="flex justify-between font-bold mb-1">
                    <span>General Overheads</span>
                    <span>₹{(cropExpenses.filter(e => ['miscellaneous', 'inventory'].includes(e.category)).reduce((sum, e) => sum + e.amount, 0)).toLocaleString()}</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div 
                      className="h-full bg-slate-400" 
                      style={{ width: `${totalExpenses > 0 ? (cropExpenses.filter(e => ['miscellaneous', 'inventory'].includes(e.category)).reduce((sum, e) => sum + e.amount, 0) / totalExpenses) * 100 : 0}%` }}
                    ></div>
                  </div>
                </div>

              </div>

              {/* Summary calculations */}
              <div className="bg-slate-50 dark:bg-slate-900/60 p-5 rounded-2xl border border-slate-100 dark:border-slate-800/40 text-xs space-y-2 font-semibold">
                <span className="font-semibold text-slate-400 uppercase tracking-wider text-[9px] block mb-2">Statement of Farm Operations</span>
                <div className="flex justify-between">
                  <span className="text-slate-400">Total Harvest Revenues</span>
                  <span className="text-slate-800 dark:text-slate-100 font-bold">₹{totalHarvestRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between border-b border-slate-200 dark:border-slate-850 pb-2">
                  <span className="text-slate-400">Manual Operating Costs (Ledger)</span>
                  <span className="text-slate-800 dark:text-slate-100 font-bold">-₹{directExpenses.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between border-b border-slate-200 dark:border-slate-850 pb-2">
                  <span className="text-slate-400">Material Consumption Cost (Usage)</span>
                  <span className="text-slate-800 dark:text-slate-100 font-bold">-₹{usageCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-slate-400 pt-1">
                  <span>Combined Direct Expenses</span>
                  <span className="text-slate-850 dark:text-slate-200 font-bold">₹{totalExpenses.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-base font-bold pt-3 border-t border-slate-300 dark:border-slate-700">
                  <span className="text-slate-900 dark:text-slate-50">Net P&L Earnings</span>
                  <span className={netProfit >= 0 ? 'text-emerald-500' : 'text-red-500'}>
                    ₹{netProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>

            {/* List of recent direct expenses */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[9px]">
                    <th className="py-2.5">Date</th>
                    <th className="py-2.5">Category</th>
                    <th className="py-2.5">Description</th>
                    <th className="py-2.5 text-right">Amount ($)</th>
                  </tr>
                </thead>
                <tbody>
                  {cropExpenses.length > 0 || cropUsages.length > 0 ? (
                    <>
                      {/* Direct manual expenses */}
                      {cropExpenses.map((e) => (
                        <tr key={e.id} className="border-b border-slate-100 dark:border-slate-800/10 hover:bg-slate-50/50">
                          <td className="py-2">{new Date(e.date).toLocaleDateString()}</td>
                          <td className="py-2 capitalize font-semibold">{e.category}</td>
                          <td className="py-2 text-slate-500">{e.notes}</td>
                          <td className="py-2 text-right font-bold text-red-500">₹{e.amount.toFixed(2)}</td>
                        </tr>
                      ))}
                      {/* Consumed inventory costs */}
                      {cropUsages.map((u) => (
                        <tr key={u.id} className="border-b border-slate-100 dark:border-slate-800/10 hover:bg-slate-50/50">
                          <td className="py-2">{new Date(u.date).toLocaleDateString()}</td>
                          <td className="py-2 capitalize text-teal-600 dark:text-teal-400 font-semibold">Inputs</td>
                          <td className="py-2 text-slate-500">Applied {u.quantity_used} {u.unit} of {u.product_name} (Usage)</td>
                          <td className="py-2 text-right font-bold text-red-500">₹{u.cost.toFixed(2)}</td>
                        </tr>
                      ))}
                    </>
                  ) : (
                    <tr>
                      <td colSpan={4} className="py-4 text-center text-slate-400 italic">No expenses recorded for this cycle yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* PRINT DECLARATION SIGN OFF */}
          <div className="border-t border-slate-200 dark:border-slate-800 pt-8 flex justify-between text-[10px] text-slate-400 font-bold uppercase tracking-wider">
            <div>Antigravity PWA Farm Management Systems &bull; Confidential</div>
            <div className="text-right">Authorized Signatory: _________________________</div>
          </div>

        </div>
      ) : (
        <div className="glass p-12 text-center text-slate-400 italic font-semibold">
          No crop cycle profiles found. Start an active cucumber crop to generate data sheets.
        </div>
      )}

    </div>
  );
};
