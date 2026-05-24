import React, { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import type { InventoryCategory, UnitType } from '../../db/types';
import { Boxes, PlusCircle, Search, AlertTriangle, Trash2, Pencil } from 'lucide-react';

export const Inventory: React.FC = () => {
  const { inventory, addInventory, updateInventory, deleteInventory, activeCropId } = useAppStore();

  // Search and Category states
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  
  // Modal/Form toggle
  const [showAddForm, setShowAddForm] = useState(false);
  // Editing: null = adding new, string = editing existing item id
  const [editingId, setEditingId] = useState<string | null>(null);
  // Supplier autocomplete
  const [supplierSuggestions, setSupplierSuggestions] = useState<string[]>([]);

  const uniqueSuppliers = Array.from(new Set(inventory.map(i => i.supplier).filter(Boolean)));

  const handleSupplierChange = (val: string) => {
    setFormData({ ...formData, supplier: val });
    if (val.length >= 1) {
      setSupplierSuggestions(uniqueSuppliers.filter(s => s.toLowerCase().includes(val.toLowerCase())));
    } else {
      setSupplierSuggestions([]);
    }
  };

  // New item form state
  const [formData, setFormData] = useState({
    name: '',
    brand: '',
    category: 'fertilizers' as InventoryCategory,
    unit: 'kg' as UnitType,
    purchased_qty: '',
    price: '',
    supplier: '',
    low_stock_threshold: '',
    notes: ''
  });

  const resetForm = () => {
    setFormData({ name: '', brand: '', category: 'fertilizers', unit: 'kg', purchased_qty: '', price: '', supplier: '', low_stock_threshold: '', notes: '' });
    setEditingId(null);
  };

  const startEdit = (item: typeof inventory[0]) => {
    setFormData({
      name: item.name,
      brand: item.brand,
      category: item.category,
      unit: item.unit,
      purchased_qty: String(item.purchased_qty),
      price: String(item.price),
      supplier: item.supplier,
      low_stock_threshold: String(item.low_stock_threshold),
      notes: item.notes,
    });
    setEditingId(item.id);
    setShowAddForm(true);
  };

  const categoriesList: { id: string; label: string }[] = [
    { id: 'all', label: 'All Inputs' },
    { id: 'fertilizers', label: 'Fertilizers' },
    { id: 'pesticides', label: 'Pesticides' },
    { id: 'fungicides', label: 'Fungicides' },
    { id: 'insecticides', label: 'Insecticides' },
    { id: 'bio_stimulants', label: 'Bio Stimulants' },
    { id: 'sticky_traps', label: 'Sticky Traps' },
    { id: 'packaging_material', label: 'Packaging' }
  ];

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (editingId) {
      updateInventory(editingId, {
        name: formData.name,
        brand: formData.brand,
        category: formData.category,
        unit: formData.unit,
        purchased_qty: Number(formData.purchased_qty),
        price: Number(formData.price),
        supplier: formData.supplier || 'Direct Local Market',
        low_stock_threshold: Number(formData.low_stock_threshold),
        notes: formData.notes,
      });
    } else {
      addInventory({
        name: formData.name,
        brand: formData.brand,
        category: formData.category,
        unit: formData.unit,
        purchased_qty: Number(formData.purchased_qty),
        remaining_qty: Number(formData.purchased_qty),
        price: Number(formData.price),
        purchase_date: new Date().toISOString().split('T')[0],
        supplier: formData.supplier || 'Direct Local Market',
        low_stock_threshold: Number(formData.low_stock_threshold),
        notes: formData.notes,
      });
    }

    resetForm();
    setShowAddForm(false);
  };

  // Quick helper to adjust inventory levels
  const adjustStock = (id: string, delta: number) => {
    const item = inventory.find(i => i.id === id);
    if (!item) return;
    const newQty = Math.max(0, parseFloat((item.remaining_qty + delta).toFixed(2)));
    updateInventory(id, { remaining_qty: newQty });
  };

  // Calculations
  const totalValue = inventory.reduce((sum, item) => {
    const perUnit = item.purchased_qty > 0 ? item.price / item.purchased_qty : 0;
    return sum + item.remaining_qty * perUnit;
  }, 0);
  const lowStockCount = inventory.filter(item => item.remaining_qty <= item.low_stock_threshold).length;

  // Filter products list
  const filteredItems = inventory.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          item.brand.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          item.supplier.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCategory = activeCategory === 'all' || item.category === activeCategory;
    
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-6">
      
      {/* 1. TOP METRICS DASH */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Metric Card 1 */}
        <div className="glass rounded-2xl p-5 border border-slate-200/30 dark:border-slate-800/30 shadow-sm flex items-center gap-4">
          <div className="p-3.5 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-white shadow-md shadow-emerald-500/10">
            <Boxes size={24} />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Operational Stock Valuation</span>
            <div className="flex items-baseline gap-0.5">
              <span className="text-xs font-bold text-slate-400">₹</span>
              <h3 className="text-2xl font-black font-heading text-slate-800 dark:text-slate-100">
                {totalValue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
              </h3>
            </div>
            <span className="text-[10px] text-slate-400 font-semibold block">Locked capital in greenhouse inputs</span>
          </div>
        </div>

        {/* Metric Card 2 */}
        <div className="glass rounded-2xl p-5 border border-slate-200/30 dark:border-slate-800/30 shadow-sm flex items-center gap-4">
          <div className={`p-3.5 rounded-xl text-white shadow-md ${
            lowStockCount > 0 
              ? 'bg-gradient-to-tr from-amber-500 to-yellow-400 shadow-amber-500/10' 
              : 'bg-gradient-to-tr from-emerald-500 to-emerald-400 shadow-emerald-500/10'
          }`}>
            <AlertTriangle size={24} className={lowStockCount > 0 ? 'animate-bounce' : ''} />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Critical Stock Warnings</span>
            <h3 className={`text-2xl font-black font-heading ${lowStockCount > 0 ? 'text-amber-500' : 'text-slate-800 dark:text-slate-100'}`}>
              {lowStockCount} Items Low
            </h3>
            <span className="text-[10px] text-slate-400 font-semibold block">
              {lowStockCount > 0 ? 'Action required: buy replacements' : 'All levels above warning triggers'}
            </span>
          </div>
        </div>

        {/* Action Button */}
        <div className="glass rounded-2xl p-5 border border-slate-200/30 dark:border-slate-800/30 shadow-sm flex items-center justify-center">
          <button
            onClick={() => { if (showAddForm) { resetForm(); setShowAddForm(false); } else { resetForm(); setShowAddForm(true); } }}
            className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-bold text-sm shadow-md shadow-emerald-500/10 flex items-center justify-center gap-2 transition-all"
          >
            <PlusCircle size={18} />
            {showAddForm ? 'Close Form' : 'Register New Input Stock'}
          </button>
        </div>
      </div>

      {/* 2. REGISTRATION FORM */}
      {showAddForm && (
        <div className="glass-premium rounded-2xl p-6 border border-slate-200/50 dark:border-slate-800/40 shadow-md animate-slide-up space-y-4">
          <div>
            <h3 className="text-lg font-bold font-heading text-slate-800 dark:text-slate-100">
              {editingId ? 'Edit Stock Record' : 'Register Chemical / Organic Fertilizers'}
            </h3>
            <p className="text-xs text-slate-400">
              Purchases are cataloged in stock. 
              {activeCropId && <span className="font-bold text-emerald-500"> Note: This will automatically record an outlay expense for your active crop batch.</span>}
            </p>
          </div>
          
          <form onSubmit={handleAddSubmit} className="space-y-4 text-xs font-semibold">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="text-slate-500 dark:text-slate-400">Product Commercial Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Calcium Nitrate Soluble"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full bg-slate-100/50 dark:bg-slate-900/50 border border-slate-200/30 dark:border-slate-800/30 rounded-xl px-3 py-2.5 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-slate-500 dark:text-slate-400">
                  Brand / Manufacturer <span className="text-slate-400/60 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. YaraLiva"
                  value={formData.brand}
                  onChange={(e) => setFormData({...formData, brand: e.target.value})}
                  className="w-full bg-slate-100/50 dark:bg-slate-900/50 border border-slate-200/30 dark:border-slate-800/30 rounded-xl px-3 py-2.5 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div className="space-y-1 relative">
                <label className="text-slate-500 dark:text-slate-400">Supplier Name</label>
                <input
                  type="text"
                  placeholder="e.g. Agro Supplies Corp"
                  value={formData.supplier}
                  onChange={(e) => handleSupplierChange(e.target.value)}
                  onBlur={() => setTimeout(() => setSupplierSuggestions([]), 150)}
                  className="w-full bg-slate-100/50 dark:bg-slate-900/50 border border-slate-200/30 dark:border-slate-800/30 rounded-xl px-3 py-2.5 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
                />
                {supplierSuggestions.length > 0 && (
                  <div className="absolute top-full mt-1 left-0 right-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-50 overflow-hidden">
                    {supplierSuggestions.map((s, i) => (
                      <button
                        key={i}
                        type="button"
                        onMouseDown={() => { setFormData({ ...formData, supplier: s }); setSupplierSuggestions([]); }}
                        className="w-full text-left px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-emerald-500/10 hover:text-emerald-600 dark:hover:text-emerald-400 border-b border-slate-100 dark:border-slate-800 last:border-0 transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="space-y-1">
                <label className="text-slate-500 dark:text-slate-400">Product Category</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({...formData, category: e.target.value as InventoryCategory})}
                  className="w-full bg-slate-100/50 dark:bg-slate-900/50 border border-slate-200/30 dark:border-slate-800/30 rounded-xl px-3 py-2.5 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
                >
                  <option value="fertilizers">Fertilizer</option>
                  <option value="pesticides">Pesticide</option>
                  <option value="fungicides">Fungicide</option>
                  <option value="insecticides">Insecticide</option>
                  <option value="bio_stimulants">Bio Stimulant</option>
                  <option value="sticky_traps">Sticky Traps</option>
                  <option value="packaging_material">Packaging Material</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-slate-500 dark:text-slate-400">Unit Type</label>
                <select
                  value={formData.unit}
                  onChange={(e) => setFormData({...formData, unit: e.target.value as UnitType})}
                  className="w-full bg-slate-100/50 dark:bg-slate-900/50 border border-slate-200/30 dark:border-slate-800/30 rounded-xl px-3 py-2.5 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
                >
                  <option value="kg">kg (Kilogram)</option>
                  <option value="liter">liter (Litre)</option>
                  <option value="piece">piece (Units)</option>
                  <option value="gram">gram (g)</option>
                  <option value="ml">ml (Milliliter)</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-slate-500 dark:text-slate-400">Quantity Purchased</label>
                <input
                  type="number"
                  required
                  min="0.01"
                  step="any"
                  placeholder="e.g. 50"
                  value={formData.purchased_qty}
                  onChange={(e) => setFormData({...formData, purchased_qty: e.target.value})}
                  className="w-full bg-slate-100/50 dark:bg-slate-900/50 border border-slate-200/30 dark:border-slate-800/30 rounded-xl px-3 py-2.5 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-slate-500 dark:text-slate-400">Total Purchase Price (₹)</label>
                <input
                  type="number"
                  required
                  min="0.01"
                  step="any"
                  placeholder="e.g. 5000 for 100 kg purchased"
                  value={formData.price}
                  onChange={(e) => setFormData({...formData, price: e.target.value})}
                  className="w-full bg-slate-100/50 dark:bg-slate-900/50 border border-slate-200/30 dark:border-slate-800/30 rounded-xl px-3 py-2.5 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-slate-500 dark:text-slate-400">Low Stock Alert Trigger Threshold</label>
                <input
                  type="number"
                  required
                  min="0"
                  step="any"
                  placeholder="Alert when stock drops below this value..."
                  value={formData.low_stock_threshold}
                  onChange={(e) => setFormData({...formData, low_stock_threshold: e.target.value})}
                  className="w-full bg-slate-100/50 dark:bg-slate-900/50 border border-slate-200/30 dark:border-slate-800/30 rounded-xl px-3 py-2.5 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-slate-500 dark:text-slate-400">General Notes</label>
                <input
                  type="text"
                  placeholder="NPK balance formulas or crop safety directions..."
                  value={formData.notes}
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                  className="w-full bg-slate-100/50 dark:bg-slate-900/50 border border-slate-200/30 dark:border-slate-800/30 rounded-xl px-3 py-2.5 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-bold rounded-xl shadow-md transition-all"
            >
              {editingId ? 'Save Changes' : 'Confirm and Log Purchased Outlay'}
            </button>
          </form>
        </div>
      )}

      {/* 3. SEARCH AND FILTER CATEGORY TABS */}
      <div className="glass rounded-2xl p-5 border border-slate-200/30 dark:border-slate-800/30 shadow-sm space-y-4">
        
        {/* Search & Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h4 className="font-heading font-bold text-slate-700 dark:text-slate-300">Greenhouse Supplies Ledger</h4>
          
          <div className="relative max-w-xs w-full">
            <span className="absolute left-3 top-2.5 text-slate-400">
              <Search size={16} />
            </span>
            <input
              type="text"
              placeholder="Search supply inventory..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs bg-slate-100/50 dark:bg-slate-900/50 border border-slate-200/30 dark:border-slate-800/30 rounded-xl pl-9 pr-4 py-2.5 font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        {/* Category horizontal scrolling bar */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar border-b border-slate-200/20 dark:border-slate-800/20">
          {categoriesList.map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`px-4 py-2 rounded-xl text-xs font-bold shrink-0 transition-all ${
                activeCategory === cat.id
                  ? 'bg-emerald-500 text-white shadow-sm'
                  : 'bg-slate-100/60 dark:bg-slate-900/40 text-slate-500 dark:text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-900'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* 4. SUPPLIES INVENTORY CARDS GRID */}
        {filteredItems.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredItems.map(item => {
              const isLowStock = item.remaining_qty <= item.low_stock_threshold;
              return (
                <div 
                  key={item.id} 
                  className={`p-5 rounded-2xl border transition-all duration-300 flex flex-col justify-between gap-4 bg-slate-100/10 dark:bg-slate-900/10 ${
                    isLowStock 
                      ? 'border-amber-500/40 shadow-sm shadow-amber-500/5' 
                      : 'border-slate-200/30 dark:border-slate-800/20 hover:border-slate-200 dark:hover:border-slate-800'
                  }`}
                >
                  
                  {/* Top: Name and Brand */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-start gap-2">
                      <span className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-900 text-slate-500 dark:text-slate-400 border border-slate-200/10">
                        {item.category.replace('_', ' ')}
                      </span>
                      {isLowStock && (
                        <span className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-amber-500/15 text-amber-500 border border-amber-500/30 animate-pulse">
                          LOW STOCK
                        </span>
                      )}
                    </div>
                    <h5 className="font-heading font-bold text-slate-700 dark:text-slate-200 text-base">{item.name}</h5>
                    <span className="text-[10px] text-slate-400 block font-semibold">Brand: {item.brand} &bull; Supplier: {item.supplier}</span>
                  </div>

                  {/* Mid: Progress Stock Bar */}
                  <div className="space-y-1.5 text-xs font-semibold">
                    <div className="flex justify-between items-baseline">
                      <span className="text-slate-400">Available Stock</span>
                      <span className={`font-extrabold text-base ${isLowStock ? 'text-amber-500' : 'text-slate-800 dark:text-slate-200'}`}>
                        {item.remaining_qty} <span className="text-xs font-semibold text-slate-400">{item.unit}</span>
                      </span>
                    </div>
                    
                    {/* Visual Progress Bar */}
                    <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-300 ${isLowStock ? 'bg-amber-500' : 'bg-emerald-500'}`}
                        style={{ width: `${Math.min(100, (item.remaining_qty / item.purchased_qty) * 100)}%` }}
                      ></div>
                    </div>
                    
                    <div className="flex justify-between text-[9px] text-slate-400 font-bold">
                      <span>Threshold: {item.low_stock_threshold} {item.unit}</span>
                      <span>Total: {item.purchased_qty} {item.unit}</span>
                    </div>
                  </div>

                  {/* Bottom: Pricing details & Actions */}
                  <div className="border-t border-slate-200/25 dark:border-slate-800/10 pt-3 flex justify-between items-center text-xs">
                    <div>
                      <span className="text-[9px] text-slate-400 block uppercase font-bold">Cost / {item.unit}</span>
                      <span className="font-extrabold text-slate-700 dark:text-slate-200 font-heading">
                        ₹{item.purchased_qty > 0 ? (item.price / item.purchased_qty).toFixed(2) : '—'}
                        <span className="text-[9px] font-normal text-slate-400"> / {item.unit}</span>
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => adjustStock(item.id, -1)}
                        className="w-7 h-7 flex items-center justify-center bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-850 border border-slate-200/10 rounded-lg font-bold text-slate-600 dark:text-slate-400 text-sm"
                      >
                        -
                      </button>
                      <button
                        onClick={() => adjustStock(item.id, 1)}
                        className="w-7 h-7 flex items-center justify-center bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-850 border border-slate-200/10 rounded-lg font-bold text-slate-600 dark:text-slate-400 text-sm"
                      >
                        +
                      </button>
                      <button
                        onClick={() => startEdit(item)}
                        className="p-1.5 text-slate-400 hover:text-emerald-500 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-900"
                        title="Edit this item"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm(`Delete "${item.name}" from your supply inventory? This will wipe the stock balances.`)) {
                            deleteInventory(item.id);
                          }
                        }}
                        className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-900"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-12 text-center text-slate-400 text-xs italic">
            No matching agricultural inputs cataloged under these search filters.
          </div>
        )}
      </div>

    </div>
  );
};
