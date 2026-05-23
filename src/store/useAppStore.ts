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
  deleteExpense: (id: string) => void;

  // Weather
  addWeatherLog: (weatherData: Omit<WeatherLog, 'id' | 'tenant_id' | 'created_at'>) => void;

  // Settings
  updateSettings: (updates: Partial<AppSettings>) => void;
  toggleModule: (moduleKey: keyof AppSettings['modules']) => void;
  toggleFeature: (featureKey: keyof AppSettings['features']) => void;
  updateWidgetOrder: (newOrder: string[]) => void;
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
  return [...queue, { id: newId(), action, table, data, timestamp: new Date().toISOString() }];
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

// Fire-and-forget Supabase upsert — never blocks the UI
function bgUpsert(table: string, obj: unknown, userId: string | undefined) {
  if (!userId) return;
  void Promise.resolve(upsertRow(table, obj as Record<string, unknown>, userId)).catch((e) => {
    console.error(`[Sync] bgUpsert failed for ${table}:`, e);
  });
}
function bgDelete(table: string, id: string, userId: string | undefined) {
  if (!userId) return;
  void Promise.resolve(deleteRow(table, id)).catch((e) => {
    console.error(`[Sync] bgDelete failed for ${table}:`, e);
  });
}

// Recovery path: push all local records to Supabase when bgUpsert previously failed silently
async function pushAllLocalToSupabase(state: Partial<AppState>, userId: string) {
  const tables: Array<{ name: string; rows: unknown[] }> = [
    { name: 'crops',        rows: state.crops        ?? [] },
    { name: 'inventory',    rows: state.inventory     ?? [] },
    { name: 'usage_logs',   rows: state.usageLogs     ?? [] },
    { name: 'harvests',     rows: state.harvests      ?? [] },
    { name: 'expenses',     rows: state.expenses      ?? [] },
    { name: 'weather_logs', rows: state.weatherLogs   ?? [] },
  ];
  await Promise.all(
    tables.flatMap(({ name, rows }) =>
      rows.map(row =>
        Promise.resolve(upsertRow(name, row as Record<string, unknown>, userId)).catch(e =>
          console.error(`[Sync] Recovery upsert failed for ${name}:`, e)
        )
      )
    )
  );
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
    set({ authUser: null, crops: [], inventory: [], usageLogs: [], harvests: [], expenses: [], weatherLogs: [], activeCropId: null });
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

      if (cloudTotal > 0) {
        // Supabase has records — use as canonical source
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
      } else if (syncQueue.length > 0) {
        // Supabase empty but local has pending changes — bgUpsert likely failed earlier.
        // Push all local state to Supabase as recovery, then clear the queue.
        await pushAllLocalToSupabase(get(), authUser.id);
        set({ syncQueue: [] });
        saveLocal(get());
      }
      // Supabase empty + no syncQueue = brand-new user or mock-only state; leave local untouched
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
    const updatedCrops = crops.map(c =>
      c.status === 'active' ? { ...c, status: 'archived' as const, end_date: new Date().toISOString().split('T')[0] } : c
    );
    const newCrop: Crop = { ...cropData, id: newId('crop'), tenant_id: 'tenant-1', status: 'active', created_at: new Date().toISOString() };
    const finalCrops = [newCrop, ...updatedCrops];
    const newQueue = addToQueue(syncQueue, 'insert', 'crops', newCrop);
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
    const updated = inventory.map(i => i.id === id ? { ...i, ...updates } : i);
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
      if (invItem) {
        const perUnitCost = invItem.purchased_qty > 0 ? invItem.price / invItem.purchased_qty : 0;
        calculatedCost = parseFloat((logData.quantity_used * perUnitCost).toFixed(2));
        inventoryItemName = `${invItem.name} (${invItem.brand})`;
        updatedInventory = inventory.map(i =>
          i.id === logData.inventory_id
            ? { ...i, remaining_qty: Math.max(0, parseFloat((i.remaining_qty - logData.quantity_used).toFixed(2))) }
            : i
        );
      }
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
    const revenue = parseFloat((harvestData.weight_total * harvestData.sale_rate).toFixed(2));
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
}));
