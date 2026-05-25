import { create } from 'zustand';
import type {
  Crop, InventoryItem, UsageLog, Harvest, Expense, WeatherLog, AppSettings, SyncQueueItem
} from '../db/types';
import {
  mockCrops, mockInventory, mockUsageLogs, mockHarvests, mockExpenses, mockWeatherLogs, defaultSettings
} from '../db/mockData';
import { supabase } from '../lib/supabase';
import { pullAllData, upsertRow, deleteRow } from '../lib/syncService';

// ─── Auth user shape ───────────────────────────────────────────────────────────
interface AuthUser {
  id: string;
  email: string;
}

// ─── State ─────────────────────────────────────────────────────────────────────
interface AppState {
  crops: Crop[];
  inventory: InventoryItem[];
  usageLogs: UsageLog[];
  harvests: Harvest[];
  expenses: Expense[];
  weatherLogs: WeatherLog[];
  settings: AppSettings;
  syncQueue: SyncQueueItem[];
  isOnline: boolean;
  isSyncing: boolean;
  activeCropId: string | null;

  // Auth
  authUser: AuthUser | null;
  authLoading: boolean;

  // Initialization
  initializeStore: () => void;
  checkSession: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  pullFromSupabase: () => Promise<void>;

  setOnlineStatus: (status: boolean) => void;
  resetAllData: () => void;
  importBackup: (backupStr: string) => boolean;

  // Crop Lifecycle
  startCrop: (cropData: Omit<Crop, 'id' | 'tenant_id' | 'status' | 'created_at'>) => void;
  endCrop: (id: string) => void;
  deleteCrop: (id: string) => void;

  // Inventory
  addInventory: (item: Omit<InventoryItem, 'id' | 'tenant_id' | 'created_at'>) => void;
  updateInventory: (id: string, updates: Partial<InventoryItem>) => void;
  deleteInventory: (id: string) => void;

  // Usage Logs
  addUsageLog: (log: Omit<UsageLog, 'id' | 'tenant_id' | 'cost' | 'created_at'>) => void;
  deleteUsageLog: (id: string) => void;

  // Harvest & Sales
  addHarvest: (harvestData: Omit<Harvest, 'id' | 'tenant_id' | 'revenue' | 'created_at'>) => void;
  deleteHarvest: (id: string) => void;

  // Expenses
  addExpense: (expenseData: Omit<Expense, 'id' | 'tenant_id' | 'created_at'>) => void;
  updateExpense: (id: string, updates: Partial<Expense>) => void;
  deleteExpense: (id: string) => void;

  // Weather
  addWeatherLog: (weatherData: Omit<WeatherLog, 'id' | 'tenant_id' | 'created_at'>) => void;
  deleteWeatherLog: (id: string) => void;

  // Settings
  updateSettings: (updates: Partial<AppSettings>) => void;
  toggleModule: (moduleKey: keyof AppSettings['modules']) => void;
  toggleFeature: (featureKey: keyof AppSettings['features']) => void;
  updateWidgetOrder: (newOrder: string[]) => void;
  updateActiveCropParams: (area: number, numPlants: number) => void;
}

// ─── Constants ─────────────────────────────────────────────────────────────────
const LS_KEY = 'polyhouse_farm_management_state';

// ─── Helpers ───────────────────────────────────────────────────────────────────
function newId(prefix = 'id') {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${prefix}-${Math.random().toString(36).substring(2, 9)}`;
}

function addToQueue(
  queue: SyncQueueItem[],
  action: SyncQueueItem['action'],
  table: SyncQueueItem['table'],
  data: unknown
): SyncQueueItem[] {
  const newEntry: SyncQueueItem = { id: newId(), action, table, data, timestamp: new Date().toISOString() };
  const recordId = data && typeof data === 'object' && 'id' in (data as object)
    ? (data as { id: string }).id
    : null;
  // Deduplicate: remove any earlier pending entry for the same (table, recordId)
  // so only the latest operation per record is kept.
  const deduped = recordId
    ? queue.filter(item => {
        const itemId = item.data && typeof item.data === 'object' && 'id' in (item.data as object)
          ? (item.data as { id: string }).id : null;
        return !(item.table === table && itemId === recordId);
      })
    : queue;
  const result = [...deduped, newEntry];
  // Cap at 500 to prevent localStorage overflow on prolonged offline use.
  return result.length > 500 ? result.slice(-500) : result;
}

function saveLocal(state: Partial<AppState>) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({
      crops: state.crops,
      inventory: state.inventory,
      usageLogs: state.usageLogs,
      harvests: state.harvests,
      expenses: state.expenses,
      weatherLogs: state.weatherLogs,
      settings: state.settings,
      syncQueue: state.syncQueue,
    }));
  } catch { /* storage full or private mode */ }
}

// Fire-and-forget Supabase upsert — never blocks the UI.
// userId guard is a fast-fail using the store's cached auth state;
// upsertRow re-verifies via supabase.auth.getUser() before writing.
function bgUpsert(table: string, obj: unknown, userId: string | undefined) {
  if (!userId) return;
  void upsertRow(table, obj as Record<string, unknown>).catch((e) => {
    console.error(`[Sync] bgUpsert failed for ${table}:`, e);
  });
}
function bgDelete(table: string, id: string, userId: string | undefined) {
  if (!userId) return;
  void deleteRow(table, id).catch((e) => {
    console.error(`[Sync] bgDelete failed for ${table}:`, e);
  });
}

// Recovery path: push all local records to Supabase when bgUpsert previously failed silently.
// Returns true only if every upsert succeeded — caller should only clear syncQueue on true.
// Tables are processed in FK dependency order (crops/inventory first, then referencing tables)
// so expenses/usage_logs never try to insert before their crop_id FK target exists.
async function pushAllLocalToSupabase(state: Partial<AppState>): Promise<boolean> {
  let allOk = true;
  const orderedTables: Array<{ name: string; rows: unknown[] }> = [
    { name: 'crops',        rows: state.crops        ?? [] },
    { name: 'inventory',    rows: state.inventory     ?? [] },
    { name: 'weather_logs', rows: state.weatherLogs   ?? [] },
    { name: 'usage_logs',   rows: state.usageLogs     ?? [] },
    { name: 'harvests',     rows: state.harvests      ?? [] },
    { name: 'expenses',     rows: state.expenses      ?? [] },
  ];
  for (const { name, rows } of orderedTables) {
    await Promise.all(
      rows.map(row =>
        upsertRow(name, row as Record<string, unknown>).catch(e => {
          console.error(`[Sync] Recovery upsert failed for ${name}:`, e);
          allOk = false;
        })
      )
    );
  }
  return allOk;
}

// ─── Store ─────────────────────────────────────────────────────────────────────
export const useAppStore = create<AppState>((set, get) => ({
  crops: [],
  inventory: [],
  usageLogs: [],
  harvests: [],
  expenses: [],
  weatherLogs: [],
  settings: defaultSettings,
  syncQueue: [],
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  isSyncing: false,
  activeCropId: null,
  authUser: null,
  authLoading: true,

  // ── Auth ──────────────────────────────────────────────────────────────────────
  checkSession: async () => {
    set({ authLoading: true });
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      set({ authUser: { id: session.user.id, email: session.user.email ?? '' }, authLoading: false });
    } else {
      set({ authUser: null, authLoading: false });
    }
  },

  signIn: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return error.message;
    if (data.user) {
      set({ authUser: { id: data.user.id, email: data.user.email ?? '' } });
      await get().pullFromSupabase();
    }
    return null;
  },

  signUp: async (email, password) => {
    const { error } = await supabase.auth.signUp({ email, password });
    return error ? error.message : null;
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ authUser: null, crops: [], inventory: [], usageLogs: [], harvests: [], expenses: [], weatherLogs: [], activeCropId: null, syncQueue: [] });
    localStorage.removeItem(LS_KEY);
  },

  pullFromSupabase: async () => {
    const { authUser, syncQueue } = get();
    if (!authUser) return;
    set({ isSyncing: true });
    try {
      const data = await pullAllData(authUser.id);

      if (data.errors.length > 0) {
        // Supabase returned errors — preserve local state unchanged to avoid data loss
        console.error('[Sync] pullFromSupabase errors:', data.errors);
        return;
      }

      const cloudTotal =
        data.crops.length + data.inventory.length + data.usageLogs.length +
        data.harvests.length + data.expenses.length + data.weatherLogs.length;

      const localState = get();
      const localTotal =
        (localState.crops?.length ?? 0) + (localState.inventory?.length ?? 0) +
        (localState.usageLogs?.length ?? 0) + (localState.harvests?.length ?? 0) +
        (localState.expenses?.length ?? 0) + (localState.weatherLogs?.length ?? 0);

      if (syncQueue.length > 0 && localTotal > 0) {
        // Local has pending changes AND actual data — local is authoritative.
        // Push everything up. Do NOT overwrite local with stale Supabase data.
        const ok = await pushAllLocalToSupabase(get());
        if (ok) {
          set({ syncQueue: [] });
          saveLocal(get());
        }
        // If push failed: leave syncQueue intact so the next refresh retries automatically.
      } else if (cloudTotal > 0) {
        // Supabase has records and local has nothing pending (or local is empty after logout).
        // Use Supabase as canonical source.
        const activeCropId = data.crops.find(c => c.status === 'active')?.id ?? null;
        set({
          crops: data.crops,
          inventory: data.inventory,
          usageLogs: data.usageLogs,
          harvests: data.harvests,
          expenses: data.expenses,
          weatherLogs: data.weatherLogs,
          activeCropId,
          syncQueue: [],
        });
        saveLocal(get());
      }
      // Both empty: new user or mock-only state — leave local untouched.
    } catch (err) {
      console.error('[Sync] pullFromSupabase threw:', err);
    } finally {
      set({ isSyncing: false });
    }
  },

  // ── Init ──────────────────────────────────────────────────────────────────────
  initializeStore: () => {
    try {
      const stored = localStorage.getItem(LS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        const active = parsed.crops?.find((c: Crop) => c.status === 'active')?.id ?? null;
        set({
          crops: parsed.crops ?? [],
          inventory: parsed.inventory ?? [],
          usageLogs: parsed.usageLogs ?? [],
          harvests: parsed.harvests ?? [],
          expenses: parsed.expenses ?? [],
          weatherLogs: parsed.weatherLogs ?? [],
          settings: parsed.settings ?? defaultSettings,
          syncQueue: parsed.syncQueue ?? [],
          activeCropId: active,
        });
      } else {
        // Seed with mock data on first ever run (before any Supabase pull)
        const active = mockCrops.find(c => c.status === 'active')?.id ?? null;
        set({
          crops: mockCrops, inventory: mockInventory, usageLogs: mockUsageLogs,
          harvests: mockHarvests, expenses: mockExpenses, weatherLogs: mockWeatherLogs,
          settings: defaultSettings, syncQueue: [], activeCropId: active,
        });
        saveLocal({ crops: mockCrops, inventory: mockInventory, usageLogs: mockUsageLogs, harvests: mockHarvests, expenses: mockExpenses, weatherLogs: mockWeatherLogs, settings: defaultSettings, syncQueue: [] });
      }
    } catch (e) {
      console.error('initializeStore failed:', e);
    }
  },

  setOnlineStatus: (status) => set({ isOnline: status }),

  resetAllData: () => {
    set({ crops: [], inventory: [], usageLogs: [], harvests: [], expenses: [], weatherLogs: [], settings: defaultSettings, syncQueue: [], activeCropId: null });
    localStorage.removeItem(LS_KEY);
  },

  importBackup: (backupStr) => {
    try {
      const parsed = JSON.parse(backupStr);
      if (parsed && typeof parsed === 'object') {
        const active = parsed.crops?.find((c: Crop) => c.status === 'active')?.id ?? null;
        const s = {
          crops: parsed.crops ?? [], inventory: parsed.inventory ?? [],
          usageLogs: parsed.usageLogs ?? [], harvests: parsed.harvests ?? [],
          expenses: parsed.expenses ?? [], weatherLogs: parsed.weatherLogs ?? [],
          settings: parsed.settings ?? defaultSettings, syncQueue: parsed.syncQueue ?? [],
          activeCropId: active,
        };
        set(s);
        saveLocal(s);
        return true;
      }
      return false;
    } catch { return false; }
  },

  // ── Crops ─────────────────────────────────────────────────────────────────────
  startCrop: (cropData) => {
    const { crops, syncQueue, authUser } = get();
    const today = new Date().toISOString().split('T')[0];
    const previouslyActive = crops.find(c => c.status === 'active');
    const updatedCrops = crops.map(c =>
      c.status === 'active' ? { ...c, status: 'archived' as const, end_date: today } : c
    );
    const newCrop: Crop = { ...cropData, id: newId('crop'), tenant_id: 'tenant-1', status: 'active', created_at: new Date().toISOString() };
    const finalCrops = [newCrop, ...updatedCrops];
    let newQueue = addToQueue(syncQueue, 'insert', 'crops', newCrop);
    // Also sync the crop that just got archived so Supabase status is updated.
    if (previouslyActive) {
      const archivedCrop = { ...previouslyActive, status: 'archived' as const, end_date: today };
      newQueue = addToQueue(newQueue, 'update', 'crops', archivedCrop);
      bgUpsert('crops', archivedCrop, authUser?.id);
    }
    set({ crops: finalCrops, activeCropId: newCrop.id, syncQueue: newQueue });
    saveLocal(get());
    bgUpsert('crops', newCrop, authUser?.id);
  },

  endCrop: (id) => {
    const { crops, syncQueue, authUser } = get();
    const today = new Date().toISOString().split('T')[0];
    const updatedCrops = crops.map(c => c.id === id ? { ...c, status: 'archived' as const, end_date: today } : c);
    const archived = updatedCrops.find(c => c.id === id);
    const newQueue = addToQueue(syncQueue, 'update', 'crops', archived);
    set({ crops: updatedCrops, activeCropId: null, syncQueue: newQueue });
    saveLocal(get());
    if (archived) bgUpsert('crops', archived, authUser?.id);
  },

  deleteCrop: (id) => {
    const { crops, syncQueue, authUser } = get();
    const updatedCrops = crops.filter(c => c.id !== id);
    const newQueue = addToQueue(syncQueue, 'delete', 'crops', { id });
    set({ crops: updatedCrops, activeCropId: updatedCrops.find(c => c.status === 'active')?.id ?? null, syncQueue: newQueue });
    saveLocal(get());
    bgDelete('crops', id, authUser?.id);
  },

  // ── Inventory ────────────────────────────────────────────────────────────────
  addInventory: (item) => {
    const { inventory, syncQueue, expenses, activeCropId, authUser } = get();
    const newItem: InventoryItem = { ...item, id: newId('inv'), tenant_id: 'tenant-1', created_at: new Date().toISOString() };
    const finalInventory = [newItem, ...inventory];
    let newQueue = addToQueue(syncQueue, 'insert', 'inventory', newItem);
    let finalExpenses = expenses;

    if (activeCropId) {
      const totalCost = newItem.price; // price field now stores total purchase price
      const newExpense: Expense = {
        id: newId('exp'), tenant_id: 'tenant-1', crop_id: activeCropId,
        date: newItem.purchase_date, category: 'inventory',
        amount: totalCost, notes: `Purchased ${newItem.purchased_qty} ${newItem.unit} of ${newItem.name} (${newItem.brand})`,
        created_at: new Date().toISOString(),
      };
      finalExpenses = [newExpense, ...expenses];
      newQueue = addToQueue(newQueue, 'insert', 'expenses', newExpense);
      bgUpsert('expenses', newExpense, authUser?.id);
    }

    set({ inventory: finalInventory, expenses: finalExpenses, syncQueue: newQueue });
    saveLocal(get());
    bgUpsert('inventory', newItem, authUser?.id);
  },

  updateInventory: (id, updates) => {
    const { inventory, syncQueue, authUser } = get();
    const existing = inventory.find(i => i.id === id);
    let finalUpdates = { ...updates };
    // When purchased_qty changes and remaining_qty is not explicitly provided,
    // shift remaining_qty by the same delta so relative stock level is preserved.
    if (existing && updates.purchased_qty !== undefined && updates.purchased_qty !== existing.purchased_qty && updates.remaining_qty === undefined) {
      const delta = updates.purchased_qty - existing.purchased_qty;
      finalUpdates.remaining_qty = parseFloat(Math.max(0, existing.remaining_qty + delta).toFixed(2));
    }
    const updated = inventory.map(i => i.id === id ? { ...i, ...finalUpdates } : i);
    const updatedItem = updated.find(i => i.id === id);
    const newQueue = addToQueue(syncQueue, 'update', 'inventory', updatedItem);
    set({ inventory: updated, syncQueue: newQueue });
    saveLocal(get());
    if (updatedItem) bgUpsert('inventory', updatedItem, authUser?.id);
  },

  deleteInventory: (id) => {
    const { inventory, syncQueue, authUser } = get();
    const newQueue = addToQueue(syncQueue, 'delete', 'inventory', { id });
    set({ inventory: inventory.filter(i => i.id !== id), syncQueue: newQueue });
    saveLocal(get());
    bgDelete('inventory', id, authUser?.id);
  },

  // ── Usage Logs ───────────────────────────────────────────────────────────────
  addUsageLog: (logData) => {
    const { usageLogs, inventory, syncQueue, authUser } = get();
    let calculatedCost = 0;
    let inventoryItemName = logData.product_name;
    let updatedInventory = inventory;

    if (logData.inventory_id) {
      const invItem = inventory.find(i => i.id === logData.inventory_id);
      if (!invItem) {
        alert(`Linked inventory item not found. It may have been deleted. Please re-select a product.`);
        return;
      }
      const perUnitCost = invItem.purchased_qty > 0 ? invItem.price / invItem.purchased_qty : 0;
      calculatedCost = parseFloat((logData.quantity_used * perUnitCost).toFixed(2));
      inventoryItemName = `${invItem.name} (${invItem.brand})`;
      updatedInventory = inventory.map(i =>
        i.id === logData.inventory_id
          ? { ...i, remaining_qty: Math.max(0, parseFloat((i.remaining_qty - logData.quantity_used).toFixed(2))) }
          : i
      );
    }

    const newLog: UsageLog = { ...logData, id: newId('use'), tenant_id: 'tenant-1', cost: calculatedCost, product_name: inventoryItemName, created_at: new Date().toISOString() };
    let newQueue = addToQueue(syncQueue, 'insert', 'usage_logs', newLog);

    if (logData.inventory_id) {
      const updatedItem = updatedInventory.find(i => i.id === logData.inventory_id);
      newQueue = addToQueue(newQueue, 'update', 'inventory', updatedItem);
      if (updatedItem) bgUpsert('inventory', updatedItem, authUser?.id);
    }

    set({ usageLogs: [newLog, ...usageLogs], inventory: updatedInventory, syncQueue: newQueue });
    saveLocal(get());
    bgUpsert('usage_logs', newLog, authUser?.id);
  },

  deleteUsageLog: (id) => {
    const { usageLogs, inventory, syncQueue, authUser } = get();
    const log = usageLogs.find(l => l.id === id);
    if (!log) return;
    let updatedInventory = inventory;
    let newQueue = syncQueue;

    if (log.inventory_id) {
      updatedInventory = inventory.map(i =>
        i.id === log.inventory_id
          ? { ...i, remaining_qty: parseFloat((i.remaining_qty + log.quantity_used).toFixed(2)) }
          : i
      );
      const refunded = updatedInventory.find(i => i.id === log.inventory_id);
      newQueue = addToQueue(newQueue, 'update', 'inventory', refunded);
      if (refunded) bgUpsert('inventory', refunded, authUser?.id);
    }

    newQueue = addToQueue(newQueue, 'delete', 'usage_logs', { id });
    set({ usageLogs: usageLogs.filter(l => l.id !== id), inventory: updatedInventory, syncQueue: newQueue });
    saveLocal(get());
    bgDelete('usage_logs', id, authUser?.id);
  },

  // ── Harvest ──────────────────────────────────────────────────────────────────
  addHarvest: (harvestData) => {
    const { harvests, syncQueue, authUser } = get();
    const revenue = parseFloat(harvestData.mandi_rate.toFixed(2));
    const newHarvest: Harvest = { ...harvestData, id: newId('har'), tenant_id: 'tenant-1', revenue, created_at: new Date().toISOString() };
    const newQueue = addToQueue(syncQueue, 'insert', 'harvests', newHarvest);
    set({ harvests: [newHarvest, ...harvests], syncQueue: newQueue });
    saveLocal(get());
    bgUpsert('harvests', newHarvest, authUser?.id);
  },

  deleteHarvest: (id) => {
    const { harvests, syncQueue, authUser } = get();
    const newQueue = addToQueue(syncQueue, 'delete', 'harvests', { id });
    set({ harvests: harvests.filter(h => h.id !== id), syncQueue: newQueue });
    saveLocal(get());
    bgDelete('harvests', id, authUser?.id);
  },

  // ── Expenses ─────────────────────────────────────────────────────────────────
  addExpense: (expenseData) => {
    const { expenses, syncQueue, authUser } = get();
    const newExpense: Expense = { ...expenseData, id: newId('exp'), tenant_id: 'tenant-1', created_at: new Date().toISOString() };
    const newQueue = addToQueue(syncQueue, 'insert', 'expenses', newExpense);
    set({ expenses: [newExpense, ...expenses], syncQueue: newQueue });
    saveLocal(get());
    bgUpsert('expenses', newExpense, authUser?.id);
  },

  updateExpense: (id, updates) => {
    const { expenses, syncQueue, authUser } = get();
    const updated = expenses.map(e => e.id === id ? { ...e, ...updates } : e);
    const updatedItem = updated.find(e => e.id === id);
    const newQueue = addToQueue(syncQueue, 'update', 'expenses', updatedItem);
    set({ expenses: updated, syncQueue: newQueue });
    saveLocal(get());
    if (updatedItem) bgUpsert('expenses', updatedItem, authUser?.id);
  },

  deleteExpense: (id) => {
    const { expenses, syncQueue, authUser } = get();
    const newQueue = addToQueue(syncQueue, 'delete', 'expenses', { id });
    set({ expenses: expenses.filter(e => e.id !== id), syncQueue: newQueue });
    saveLocal(get());
    bgDelete('expenses', id, authUser?.id);
  },

  // ── Weather ──────────────────────────────────────────────────────────────────
  addWeatherLog: (weatherData) => {
    const { weatherLogs, syncQueue, authUser } = get();
    const svp = 0.61078 * Math.exp((17.27 * weatherData.temp) / (weatherData.temp + 237.3));
    const calculatedVpd = parseFloat((svp - svp * (weatherData.humidity / 100)).toFixed(2));
    const existingIndex = weatherLogs.findIndex(l => l.date === weatherData.date);
    let updatedLogs = [...weatherLogs];
    let actionType: 'insert' | 'update' = 'insert';

    const newLog: WeatherLog = {
      ...weatherData,
      id: existingIndex >= 0 ? weatherLogs[existingIndex].id : newId('we'),
      tenant_id: 'tenant-1', vpd: calculatedVpd, created_at: new Date().toISOString(),
    };

    if (existingIndex >= 0) { updatedLogs[existingIndex] = newLog; actionType = 'update'; }
    else { updatedLogs = [newLog, ...updatedLogs]; }

    const newQueue = addToQueue(syncQueue, actionType, 'weather_logs', newLog);
    set({ weatherLogs: updatedLogs, syncQueue: newQueue });
    saveLocal(get());
    bgUpsert('weather_logs', newLog, authUser?.id);
  },

  deleteWeatherLog: (id) => {
    const { weatherLogs, syncQueue, authUser } = get();
    const updated = weatherLogs.filter(l => l.id !== id);
    const newQueue = addToQueue(syncQueue, 'delete', 'weather_logs', { id });
    set({ weatherLogs: updated, syncQueue: newQueue });
    saveLocal(get());
    bgDelete('weather_logs', id, authUser?.id);
  },

  // ── Settings ─────────────────────────────────────────────────────────────────
  updateSettings: (updates) => {
    const { settings, syncQueue } = get();
    const finalSettings = { ...settings, ...updates };
    const newQueue = addToQueue(syncQueue, 'update', 'settings', finalSettings);
    set({ settings: finalSettings, syncQueue: newQueue });
    saveLocal(get());
  },

  toggleModule: (moduleKey) => {
    const { settings } = get();
    get().updateSettings({ modules: { ...settings.modules, [moduleKey]: !settings.modules[moduleKey] } });
  },

  toggleFeature: (featureKey) => {
    const { settings } = get();
    get().updateSettings({ features: { ...settings.features, [featureKey]: !settings.features[featureKey] } });
  },

  updateWidgetOrder: (newOrder) => get().updateSettings({ widgetsOrder: newOrder }),

  updateActiveCropParams: (area, numPlants) => {
    const { crops, activeCropId, syncQueue, authUser } = get();
    if (!activeCropId) return;
    const updated = crops.map(c => c.id === activeCropId ? { ...c, area_covered: area, num_plants: numPlants } : c);
    const updatedCrop = updated.find(c => c.id === activeCropId);
    const newQueue = addToQueue(syncQueue, 'update', 'crops', updatedCrop);
    set({ crops: updated, syncQueue: newQueue });
    saveLocal(get());
    if (updatedCrop) bgUpsert('crops', updatedCrop, authUser?.id);
  },
}));
