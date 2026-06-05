import { create } from 'zustand';
import type {
  Crop, InventoryItem, UsageLog, Harvest, Expense, WeatherLog, AppSettings, SyncQueueItem
} from '../db/types';
import {
  mockCrops, mockInventory, mockUsageLogs, mockHarvests, mockExpenses, mockWeatherLogs, defaultSettings
} from '../db/mockData';
import { supabase } from '../lib/supabase';
import { pullAllData, upsertRow, deleteRow, recordTimestamp } from '../lib/syncService';

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
  initializeStore: () => Promise<void>;
  checkSession: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  pullFromSupabase: () => Promise<void>;
  forceSync: () => Promise<boolean>;

  setOnlineStatus: (status: boolean) => void;
  resetAllData: () => void;
  importBackup: (backupStr: string) => boolean;

  // Crop Lifecycle
  startCrop: (cropData: Omit<Crop, 'id' | 'tenant_id' | 'status' | 'created_at'> & { confirmReplace?: boolean }) => void;
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
export const LS_KEY = 'polyhouse_farm_management_state';
export const USER_ID_KEY = 'antigravity_user_id';

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
  // Defense-in-depth: refuse undefined/null or anything lacking a string id
  // so a buggy caller can't poison the recovery push with garbage entries.
  if (!data || typeof (data as { id?: unknown }).id !== 'string') {
    console.warn('[Queue] Rejected entry with missing id:', table, action, data);
    return queue;
  }
  // Safe: the guard above proved `data` is an object carrying a string id,
  // which satisfies the SyncQueueItem['data'] union.
  const newEntry: SyncQueueItem = { id: newId(), action, table, data: data as SyncQueueItem['data'], timestamp: new Date().toISOString() };
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
  // Cap the queue to bound localStorage use on prolonged offline sessions.
  // Eviction is FIFO but preferentially KEEPS delete ops: a dropped delete
  // silently resurrects data on the next pull, whereas a dropped insert/update
  // is still recoverable from local state via forceSync. So we drop the oldest
  // non-delete entries first, and only drop deletes if the queue is somehow
  // still over cap after that (queue made up almost entirely of deletes).
  const QUEUE_CAP = 2000;
  if (result.length <= QUEUE_CAP) return result;
  let toDrop = result.length - QUEUE_CAP;
  const trimmed: SyncQueueItem[] = [];
  for (const item of result) {
    if (toDrop > 0 && item.action !== 'delete') { toDrop--; continue; }
    trimmed.push(item);
  }
  return trimmed.length > QUEUE_CAP ? trimmed.slice(trimmed.length - QUEUE_CAP) : trimmed;
}

// Remove a single queue entry by its unique entry id (NOT the record id) and
// persist. Called by bgUpsert/bgDelete on confirmed success so the queue
// drains entry-by-entry instead of being re-pushed wholesale. Race-safe:
// addToQueue dedups per (table, recordId), so a superseded write's entry id is
// already gone and this becomes a harmless no-op while the newer entry survives.
function removeQueueEntry(entryId: string | undefined) {
  if (!entryId) return;
  const st = useAppStore.getState();
  if (!st.syncQueue.some(e => e.id === entryId)) return;
  useAppStore.setState({ syncQueue: st.syncQueue.filter(e => e.id !== entryId) });
  saveLocal(useAppStore.getState());
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
// On SUCCESS the matching queue entry (entryId) is removed so the syncQueue
// drains entry-by-entry; on failure the entry stays and drainQueue retries it.
// upsertRow / deleteRow log structured Supabase errors themselves; the catches
// here just tag the failure source.
function bgUpsert(table: string, obj: unknown, userId: string | undefined, entryId?: string) {
  if (!userId) return;
  void upsertRow(table, obj as Record<string, unknown>)
    .then(() => removeQueueEntry(entryId))
    .catch((e: { message?: string }) => {
      console.error(`[Sync] bgUpsert(${table}) rejected:`, e?.message ?? e);
    });
}
function bgDelete(table: string, id: string, userId: string | undefined, entryId?: string) {
  if (!userId) return;
  void deleteRow(table, id)
    .then(() => removeQueueEntry(entryId))
    .catch((e: { message?: string }) => {
      console.error(`[Sync] bgDelete(${table}, ${id}) rejected:`, e?.message ?? e);
    });
}

// Resolve the queue entry id that addToQueue just created/replaced for a given
// (table, recordId). addToQueue dedups so there is at most one match.
function queueEntryIdFor(queue: SyncQueueItem[], table: SyncQueueItem['table'], recordId: string | undefined): string | undefined {
  if (!recordId) return undefined;
  for (let i = queue.length - 1; i >= 0; i--) {
    const item = queue[i];
    const itemId = item.data && typeof item.data === 'object' && 'id' in (item.data as object)
      ? (item.data as { id: string }).id : null;
    if (item.table === table && itemId === recordId) return item.id;
  }
  return undefined;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Names of the demo inventory items seeded by mockData for anonymous visitors.
// Used by pullFromSupabase to strip these rows if they leaked into an
// authenticated user's local state (see the cleanup there).
const MOCK_INVENTORY_NAMES = new Set(mockInventory.map(i => i.name));

// Enforce the "at most one active crop" invariant on a crop array.
// When a corrupted backup or stale hydration produces more than one,
// keep the most recently created as active and archive the rest with
// today's date so the UI never has to disambiguate.
function normalizeActiveCrops(crops: Crop[]): Crop[] {
  const actives = crops.filter(c => c.status === 'active');
  if (actives.length <= 1) return crops;
  const keepId = [...actives].sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))[0].id;
  const today = new Date().toISOString().split('T')[0];
  return crops.map(c =>
    c.status === 'active' && c.id !== keepId
      ? { ...c, status: 'archived' as const, end_date: today }
      : c
  );
}

// One-time data-repair: re-point TRULY orphaned children at the active crop.
// A harvest / expense / usage_log is an orphan ONLY if its crop_id matches NO
// crop at all — active OR archived (e.g. it was created against a temporary or
// mock crop id before the real Supabase crop id was assigned). A record whose
// crop_id belongs to an *archived* crop is NOT an orphan and is left untouched
// — `validIds` below includes every crop regardless of status, so archived
// history is never yanked into the active crop. Returns the corrected arrays
// plus the records that were changed so the caller can persist + queue them.
function reassignOrphanedChildren(s: {
  crops: Crop[]; harvests: Harvest[]; expenses: Expense[]; usageLogs: UsageLog[];
}): {
  harvests: Harvest[]; expenses: Expense[]; usageLogs: UsageLog[];
  changed: { harvests: Harvest[]; expenses: Expense[]; usageLogs: UsageLog[] };
} {
  const empty = { harvests: [] as Harvest[], expenses: [] as Expense[], usageLogs: [] as UsageLog[] };
  const activeCrop = s.crops.find(c => c.status === 'active');
  if (!activeCrop) {
    return { harvests: s.harvests, expenses: s.expenses, usageLogs: s.usageLogs, changed: empty };
  }
  // Includes ALL crops (active + archived) — so only true orphans get reassigned.
  const validIds = new Set(s.crops.map(c => c.id));
  const changedHarvests: Harvest[] = [];
  const changedExpenses: Expense[] = [];
  const changedUsageLogs: UsageLog[] = [];

  const harvests = s.harvests.map(h => {
    if (validIds.has(h.crop_id)) return h;
    const fixed = { ...h, crop_id: activeCrop.id };
    changedHarvests.push(fixed);
    return fixed;
  });
  const expenses = s.expenses.map(e => {
    if (validIds.has(e.crop_id)) return e;
    const fixed = { ...e, crop_id: activeCrop.id };
    changedExpenses.push(fixed);
    return fixed;
  });
  const usageLogs = s.usageLogs.map(u => {
    if (validIds.has(u.crop_id)) return u;
    const fixed = { ...u, crop_id: activeCrop.id };
    changedUsageLogs.push(fixed);
    return fixed;
  });

  return {
    harvests, expenses, usageLogs,
    changed: { harvests: changedHarvests, expenses: changedExpenses, usageLogs: changedUsageLogs },
  };
}

// Recovery path: push all local records to Supabase when bgUpsert previously failed silently.
// Returns true only if every upsert AND delete succeeded — caller should only clear syncQueue on true.
// Tables are processed in FK dependency order (crops/inventory first, then referencing tables)
// so expenses/usage_logs never try to insert before their crop_id FK target exists.
async function pushAllLocalToSupabase(state: Partial<AppState>): Promise<boolean> {
  let allOk = true;
  // Build the set of (table, id) pairs with a pending delete in the queue —
  // any matching upsert is skipped to avoid resurrecting a deleted record.
  const pendingDeleteKeys = new Set<string>(
    (state.syncQueue ?? [])
      .filter(e => e.action === 'delete')
      .map(e => `${e.table}::${(e.data as { id?: string })?.id ?? ''}`)
  );
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
      rows.map(row => {
        const id = (row as Record<string, unknown>).id;
        if (typeof id === 'string' && !UUID_RE.test(id)) {
          console.warn(`[Sync] Skipping recovery upsert for ${name}: non-UUID id "${id}"`);
          return Promise.resolve();
        }
        if (typeof id === 'string' && pendingDeleteKeys.has(`${name}::${id}`)) {
          console.warn(`[Sync] Skipping recovery upsert for ${name} ${id}: pending delete in queue`);
          return Promise.resolve();
        }
        return upsertRow(name, row as Record<string, unknown>).catch(e => {
          console.error(`[Sync] Recovery upsert failed for ${name}:`, e);
          allOk = false;
        });
      })
    );
  }
  // Process offline deletes that were queued but never reached Supabase.
  const pendingDeletes = (state.syncQueue ?? []).filter(e => e.action === 'delete');
  await Promise.all(
    pendingDeletes.map(entry =>
      deleteRow(entry.table, (entry.data as { id: string }).id).catch(e => {
        console.error(`[Sync] Recovery delete failed for ${entry.table}:`, e);
        allOk = false;
      })
    )
  );
  return allOk;
}

// FK dependency order: parents (crops/inventory) before children so an
// expense/usage_log/harvest never tries to insert before its crop_id target.
const FK_ORDER: SyncQueueItem['table'][] = ['crops', 'inventory', 'weather_logs', 'usage_logs', 'harvests', 'expenses'];

// Drain the sync queue entry-by-entry. Upserts run first in FK order, then
// deletes (children-before-parents not required — Supabase cascades). Each
// entry is removed ONLY on confirmed success, so a failure leaves it queued
// for the next drain. This replaces the old "re-push the entire dataset"
// recovery: only what is actually queued is sent.
async function drainQueue(): Promise<void> {
  const { syncQueue, authUser } = useAppStore.getState();
  if (!authUser || syncQueue.length === 0) return;

  const upserts = syncQueue
    .filter(e => e.action !== 'delete')
    .sort((a, b) => FK_ORDER.indexOf(a.table) - FK_ORDER.indexOf(b.table));
  const deletes = syncQueue.filter(e => e.action === 'delete');

  for (const entry of upserts) {
    const id = (entry.data as { id?: string })?.id;
    if (typeof id !== 'string') { removeQueueEntry(entry.id); continue; }
    if (!UUID_RE.test(id)) {
      // Mock/legacy non-UUID row — Supabase would reject it; drop it from the
      // queue so it can't block the drain forever (it still lives locally).
      console.warn(`[Sync] Dropping non-UUID queue entry for ${entry.table}: "${id}"`);
      removeQueueEntry(entry.id);
      continue;
    }
    try {
      await upsertRow(entry.table, entry.data as Record<string, unknown>);
      removeQueueEntry(entry.id);
    } catch {
      /* leave queued; logged in upsertRow */
    }
  }

  for (const entry of deletes) {
    const id = (entry.data as { id?: string })?.id;
    if (typeof id !== 'string') { removeQueueEntry(entry.id); continue; }
    try {
      await deleteRow(entry.table, id);
      removeQueueEntry(entry.id);
    } catch {
      /* leave queued; logged in deleteRow */
    }
  }
}

// Single-flight guard for pullFromSupabase. Concurrent callers (bootstrap,
// SIGNED_IN, the online listener, the 30s retry) all coalesce onto the one
// in-flight reconcile instead of racing.
let pullInFlight: Promise<void> | null = null;

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
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const newUserId = session.user.id;
        const storedUserId = localStorage.getItem(USER_ID_KEY);
        // If a different user previously used this device, wipe their local data
        // before this user's session resumes — prevents cross-account data leak.
        if (storedUserId && storedUserId !== newUserId) {
          localStorage.removeItem(LS_KEY);
          set({
            crops: [], inventory: [], usageLogs: [], harvests: [],
            expenses: [], weatherLogs: [], activeCropId: null, syncQueue: [],
          });
        }
        localStorage.setItem(USER_ID_KEY, newUserId);
        set({ authUser: { id: newUserId, email: session.user.email ?? '' } });
      } else {
        set({ authUser: null });
      }
    } catch (e) {
      // Network/SDK failure must not strand the app on the loading spinner.
      console.error('[Auth] checkSession failed:', e);
    } finally {
      // ALWAYS clear the loading flag so the UI can render (auth screen or app).
      set({ authLoading: false });
    }
  },

  signIn: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return error.message;
    if (data.user) {
      const newUserId = data.user.id;
      const storedUserId = localStorage.getItem(USER_ID_KEY);

      // Set authUser FIRST — initializeStore and pullFromSupabase below both
      // read get().authUser. Setting it before they run eliminates any
      // window where they see null while session is already confirmed.
      localStorage.setItem(USER_ID_KEY, newUserId);
      set({ authUser: { id: newUserId, email: data.user.email ?? '' } });

      if (storedUserId && storedUserId !== newUserId) {
        // Different user signing in on this device — wipe prior user's local
        // data and queue so no records leak across accounts. Supabase becomes
        // the sole source for the new user's data via pullFromSupabase below.
        localStorage.removeItem(LS_KEY);
        set({
          crops: [], inventory: [], usageLogs: [], harvests: [],
          expenses: [], weatherLogs: [], activeCropId: null, syncQueue: [],
        });
      } else {
        // Same user (or first-ever login) — re-hydrate from localStorage so
        // any records that didn't reach Supabase before the last logout are
        // visible to the recovery-push branch inside pullFromSupabase.
        if (!storedUserId) {
          // First-ever login on this device: clear any mock data seeded into LS
          // so initializeStore starts with empty arrays, not the demo dataset.
          localStorage.removeItem(LS_KEY);
        }
        await get().initializeStore();
      }

      await get().pullFromSupabase();
    }
    return null;
  },

  signUp: async (email, password) => {
    const { error } = await supabase.auth.signUp({ email, password });
    return error ? error.message : null;
  },

  signOut: async () => {
    const { syncQueue, authUser } = get();
    // 1. Drain pending writes BEFORE clearing local data. drainQueue removes
    //    each entry only on success, so a non-empty queue afterwards means
    //    something didn't reach the cloud and LS must be preserved.
    let pushOk = true;
    if (authUser && syncQueue.length > 0) {
      try {
        await drainQueue();
        pushOk = get().syncQueue.length === 0;
      } catch (e) {
        console.error('[Sync] Final drain on signOut threw:', e);
        pushOk = false;
      }
    }
    // 2. End the Supabase session regardless — sign-out is user-initiated.
    await supabase.auth.signOut();
    // 3. Conditionally wipe localStorage. If the push failed, preserve LS so
    //    the same user can recover their unsynced data on next login (the
    //    USER_ID_KEY mismatch check still prevents cross-user leak — if a
    //    different user signs in, signIn/checkSession will wipe LS then).
    if (pushOk) {
      localStorage.removeItem(LS_KEY);
      localStorage.removeItem(USER_ID_KEY);
    } else {
      alert('Some data could not be synced. Please reconnect and try again.');
    }
    // 4. Always clear in-memory Zustand state so the Auth screen renders.
    //    Reset settings to defaults too — otherwise the next user inherits the
    //    previous user's farmProfile, widgetOrder, and module toggles.
    set({
      authUser: null,
      crops: [], inventory: [], usageLogs: [], harvests: [],
      expenses: [], weatherLogs: [], activeCropId: null, syncQueue: [],
      settings: defaultSettings,
    });
  },

  // Single reconcile path. Single-flight (coalesces concurrent callers).
  // Order: (1) drain the queue — push pending ops, INDEPENDENT of reads so a
  // read failure never blocks the push; (2) fetch each table independently;
  // (3) per-record merge guarded by the queue + timestamps; (4) orphan repair.
  pullFromSupabase: () => {
    if (pullInFlight) return pullInFlight;
    pullInFlight = (async () => {
      const { authUser } = get();
      if (!authUser) return;
      set({ isSyncing: true });
      try {
        // Step 1 — push pending writes first. Runs regardless of read outcome.
        await drainQueue();

        // Step 2 — fetch every table independently (one failure ≠ total failure).
        const data = await pullAllData(authUser.id);

        // Step 3 — per-record merge, only for tables whose read succeeded.
        // Pending ids (any action) are protected: never overwritten/re-added.
        const local = get();
        const pendingByTable: Record<string, Set<string>> = {};
        for (const e of local.syncQueue) {
          const rid = (e.data as { id?: string })?.id;
          if (typeof rid !== 'string') continue;
          (pendingByTable[e.table] ??= new Set()).add(rid);
        }

        function mergeTable<T extends { id: string; created_at?: string }>(
          table: SyncQueueItem['table'], localRows: T[], result: { rows: T[]; ok: boolean },
        ): T[] {
          if (!result.ok) return localRows; // failed read → leave local untouched
          const pending = pendingByTable[table] ?? new Set<string>();
          const byId = new Map(localRows.map(r => [r.id, r]));
          for (const cloud of result.rows) {
            if (pending.has(cloud.id)) continue; // un-synced local change/delete wins
            const existing = byId.get(cloud.id);
            if (!existing) { byId.set(cloud.id, cloud); continue; } // cloud-only → add
            // Both exist, no pending local op → newer wins (cloud on tie).
            if (recordTimestamp(cloud as Record<string, unknown>) >= recordTimestamp(existing as Record<string, unknown>)) {
              byId.set(cloud.id, cloud);
            }
          }
          // Local-only rows are kept (a pull never deletes; deletes flow only
          // through the queue), so the Map already preserves them.
          return Array.from(byId.values());
        }

        const mergedCrops       = mergeTable('crops',        local.crops,       data.crops);
        const mergedInventory   = mergeTable('inventory',    local.inventory,   data.inventory);
        const mergedUsageLogs   = mergeTable('usage_logs',   local.usageLogs,   data.usageLogs);
        const mergedHarvests    = mergeTable('harvests',     local.harvests,    data.harvests);
        const mergedExpenses    = mergeTable('expenses',     local.expenses,    data.expenses);
        const mergedWeatherLogs = mergeTable('weather_logs', local.weatherLogs, data.weatherLogs);

        // One-time cleanup — strip leaked demo/mock inventory. These rows are
        // seeded for anonymous visitors (mock names + non-UUID ids like 'inv-1')
        // and can linger in localStorage after login; the union merge above
        // would otherwise keep them forever since their ids aren't in the cloud.
        // Remove an item ONLY when its name matches a known mock item AND its id
        // is absent from the cloud AND its id is not a real UUID. Real user items
        // always have UUID ids, so this can never delete a genuine item — even
        // one that happens to share a mock name. Runs only when the inventory
        // read succeeded, so the "absent from cloud" check is trustworthy.
        const cleanedInventory = data.inventory.ok
          ? mergedInventory.filter(item => {
              const inCloud = data.inventory.rows.some(r => r.id === item.id);
              const isLeakedMock = MOCK_INVENTORY_NAMES.has(item.name) && !inCloud && !UUID_RE.test(item.id);
              if (isLeakedMock) console.warn(`[Migration] Removing leaked mock inventory item: "${item.name}" (${item.id})`);
              return !isLeakedMock;
            })
          : mergedInventory;

        const normalizedCrops = normalizeActiveCrops(mergedCrops);
        const activeCropId = normalizedCrops.find(c => c.status === 'active')?.id ?? null;
        set({
          crops: normalizedCrops,
          inventory: cleanedInventory,
          usageLogs: mergedUsageLogs,
          harvests: mergedHarvests,
          expenses: mergedExpenses,
          weatherLogs: mergedWeatherLogs,
          activeCropId,
        });
        saveLocal(get());

        // Step 4 — repair true orphans (crop_id in NO crop). Reassign to the
        // active crop, persist, and queue + optimistically push the fixes.
        const cur = get();
        const repaired = reassignOrphanedChildren(cur);
        const changedCount =
          repaired.changed.harvests.length +
          repaired.changed.expenses.length +
          repaired.changed.usageLogs.length;
        if (changedCount > 0) {
          let q = cur.syncQueue;
          for (const h of repaired.changed.harvests) q = addToQueue(q, 'update', 'harvests', h);
          for (const e of repaired.changed.expenses) q = addToQueue(q, 'update', 'expenses', e);
          for (const u of repaired.changed.usageLogs) q = addToQueue(q, 'update', 'usage_logs', u);
          set({ harvests: repaired.harvests, expenses: repaired.expenses, usageLogs: repaired.usageLogs, syncQueue: q });
          saveLocal(get());
          for (const h of repaired.changed.harvests) bgUpsert('harvests', h, authUser.id, queueEntryIdFor(q, 'harvests', h.id));
          for (const e of repaired.changed.expenses) bgUpsert('expenses', e, authUser.id, queueEntryIdFor(q, 'expenses', e.id));
          for (const u of repaired.changed.usageLogs) bgUpsert('usage_logs', u, authUser.id, queueEntryIdFor(q, 'usage_logs', u.id));
          console.warn(`[Migration] Reassigned ${changedCount} orphaned record(s) to active crop ${activeCropId}`);
        }
      } catch (err) {
        console.error('[Sync] pullFromSupabase threw:', err);
      } finally {
        set({ isSyncing: false });
        pullInFlight = null;
      }
    })();
    return pullInFlight;
  },

  forceSync: async () => {
    const { crops, inventory, usageLogs, harvests, expenses, weatherLogs, syncQueue, authUser } = get();
    if (!authUser) return false;
    // Snapshot pending deletes BEFORE we queue any updates — otherwise
    // addToQueue would dedup them away and the deleted record would be
    // resurrected by the upsert that follows.
    const pendingDeleteKeys = new Set<string>(
      syncQueue
        .filter(e => e.action === 'delete')
        .map(e => `${e.table}::${(e.data as { id?: string })?.id ?? ''}`)
    );
    const tables: Array<{ table: SyncQueueItem['table']; records: unknown[] }> = [
      { table: 'crops',        records: crops },
      { table: 'inventory',    records: inventory },
      { table: 'usage_logs',   records: usageLogs },
      { table: 'harvests',     records: harvests },
      { table: 'expenses',     records: expenses },
      { table: 'weather_logs', records: weatherLogs },
    ];
    let queue = syncQueue;
    for (const { table, records } of tables) {
      for (const record of records) {
        const recordId = (record as { id?: string }).id;
        if (typeof recordId === 'string' && pendingDeleteKeys.has(`${table}::${recordId}`)) {
          console.warn(`[Sync] forceSync skipping ${table} ${recordId}: pending delete in queue`);
          continue;
        }
        queue = addToQueue(queue, 'update', table, record);
      }
    }
    set({ syncQueue: queue, isSyncing: true });
    saveLocal(get());
    // Snapshot the entry ids being pushed. After success we clear ONLY these —
    // entries a concurrent mutation adds during the await must survive.
    const queueSnapshot = get().syncQueue.map(e => e.id);
    try {
      const ok = await pushAllLocalToSupabase(get());
      if (ok) {
        set({ syncQueue: get().syncQueue.filter(e => !queueSnapshot.includes(e.id)) });
        saveLocal(get());
      }
      return ok;
    } catch {
      return false;
    } finally {
      set({ isSyncing: false });
    }
  },

  // ── Init ──────────────────────────────────────────────────────────────────────
  initializeStore: async () => {
    try {
      const stored = localStorage.getItem(LS_KEY);
      if (stored) {
        // localStorage has data — load it. Per-user safety is enforced by the
        // USER_ID_KEY mismatch check in signIn / checkSession.
        const parsed = JSON.parse(stored);
        const normalizedCrops = normalizeActiveCrops(parsed.crops ?? []);
        const active = normalizedCrops.find(c => c.status === 'active')?.id ?? null;
        set({
          crops: normalizedCrops,
          inventory: parsed.inventory ?? [],
          usageLogs: parsed.usageLogs ?? [],
          harvests: parsed.harvests ?? [],
          expenses: parsed.expenses ?? [],
          weatherLogs: parsed.weatherLogs ?? [],
          settings: parsed.settings ?? defaultSettings,
          syncQueue: parsed.syncQueue ?? [],
          activeCropId: active,
        });
        return;
      }

      // No localStorage. Only seed mock data for genuinely new visitors —
      // i.e. devices with NO authenticated session and NO prior login marker.
      // For users with an active session (Google OAuth redirect callback, or
      // refresh while logged in) we start with empty arrays so pullFromSupabase
      // can populate real data without leaving mock rows that the user might
      // edit and accidentally push into their own Supabase account.
      const storedUserId = localStorage.getItem(USER_ID_KEY);
      const { data: { session } } = await supabase.auth.getSession();
      const hasAuthContext = !!storedUserId || !!session?.user;

      if (hasAuthContext) {
        set({
          crops: [], inventory: [], usageLogs: [], harvests: [],
          expenses: [], weatherLogs: [], settings: defaultSettings,
          syncQueue: [], activeCropId: null,
        });
      } else {
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
        // Ownership guard: if the backup was tagged with a different user_id,
        // require explicit confirmation before clobbering local data.
        const backupOwner = parsed.exported_by_user_id;
        const currentUserId = get().authUser?.id;
        if (backupOwner && currentUserId && backupOwner !== currentUserId) {
          const proceed = window.confirm(
            'This backup was created by a different account. Importing it will replace all your current data. Are you sure?'
          );
          if (!proceed) return false;
        }
        const normalizedCrops = normalizeActiveCrops(parsed.crops ?? []);
        const active = normalizedCrops.find(c => c.status === 'active')?.id ?? null;
        const s = {
          crops: normalizedCrops, inventory: parsed.inventory ?? [],
          usageLogs: parsed.usageLogs ?? [], harvests: parsed.harvests ?? [],
          expenses: parsed.expenses ?? [], weatherLogs: parsed.weatherLogs ?? [],
          settings: parsed.settings ?? defaultSettings, syncQueue: parsed.syncQueue ?? [],
          activeCropId: active,
        };
        set(s);
        saveLocal(s);
        // Queue every imported record so the recovery-push branch syncs them
        // to Supabase — without this, the next pullFromSupabase would overwrite
        // the restored data with whatever is currently in the cloud.
        const importTables: Array<{ table: SyncQueueItem['table']; records: unknown[] }> = [
          { table: 'crops',        records: s.crops        },
          { table: 'inventory',    records: s.inventory     },
          { table: 'usage_logs',   records: s.usageLogs     },
          { table: 'harvests',     records: s.harvests      },
          { table: 'expenses',     records: s.expenses      },
          { table: 'weather_logs', records: s.weatherLogs   },
        ];
        let importQueue = s.syncQueue ?? [];
        for (const { table, records } of importTables) {
          for (const record of records) {
            importQueue = addToQueue(importQueue, 'update', table, record);
          }
        }
        set({ syncQueue: importQueue });
        saveLocal(get());
        return true;
      }
      return false;
    } catch { return false; }
  },

  // ── Crops ─────────────────────────────────────────────────────────────────────
  startCrop: (cropData) => {
    const { confirmReplace, ...cropFields } = cropData;
    const activeExists = get().crops.some(c => c.status === 'active');
    if (activeExists) {
      if (!confirmReplace) {
        // No confirmation given — refuse rather than silently archiving.
        alert('You already have an active crop. Please end the current crop before starting a new one.');
        return;
      }
      // User confirmed replace: archive the current active crop first (this
      // queues + syncs its archival), then fall through to create the new one.
      const active = get().crops.find(c => c.status === 'active');
      if (active) get().endCrop(active.id);
    }
    const { crops, syncQueue, authUser } = get();
    const newCrop: Crop = { ...cropFields, id: newId('crop'), tenant_id: 'tenant-1', status: 'active', created_at: new Date().toISOString() };
    const newQueue = addToQueue(syncQueue, 'insert', 'crops', newCrop);
    set({ crops: [newCrop, ...crops], activeCropId: newCrop.id, syncQueue: newQueue });
    saveLocal(get());
    bgUpsert('crops', newCrop, authUser?.id, queueEntryIdFor(newQueue, 'crops', newCrop.id));
  },

  endCrop: (id) => {
    const { crops, syncQueue, authUser } = get();
    const target = crops.find(c => c.id === id);
    if (!target) return;
    const today = new Date().toISOString().split('T')[0];
    const updatedCrops = crops.map(c => c.id === id ? { ...c, status: 'archived' as const, end_date: today } : c);
    const archived = updatedCrops.find(c => c.id === id);
    const newQueue = addToQueue(syncQueue, 'update', 'crops', archived);
    // Only clear activeCropId when the crop being ended is the active one —
    // ending some other (defensive) id must not wipe the real active pointer.
    const wasActive = get().activeCropId === id;
    set({ crops: updatedCrops, syncQueue: newQueue, ...(wasActive ? { activeCropId: null } : {}) });
    saveLocal(get());
    if (archived) bgUpsert('crops', archived, authUser?.id, queueEntryIdFor(newQueue, 'crops', archived.id));
  },

  deleteCrop: (id) => {
    const { crops, harvests, expenses, usageLogs, syncQueue, authUser } = get();
    const updatedCrops = crops.filter(c => c.id !== id);
    // Cascade: drop local children that referenced this crop and queue/fire
    // their deletes too — otherwise they become orphans whose totals leak
    // into "all crops" analytics and whose FKs may already be gone in cloud.
    const orphanHarvests = harvests.filter(h => h.crop_id === id);
    const orphanExpenses = expenses.filter(e => e.crop_id === id);
    const orphanUsageLogs = usageLogs.filter(u => u.crop_id === id);
    const updatedHarvests = harvests.filter(h => h.crop_id !== id);
    const updatedExpenses = expenses.filter(e => e.crop_id !== id);
    const updatedUsageLogs = usageLogs.filter(u => u.crop_id !== id);

    let newQueue = addToQueue(syncQueue, 'delete', 'crops', { id });
    for (const h of orphanHarvests) newQueue = addToQueue(newQueue, 'delete', 'harvests', { id: h.id });
    for (const e of orphanExpenses) newQueue = addToQueue(newQueue, 'delete', 'expenses', { id: e.id });
    for (const u of orphanUsageLogs) newQueue = addToQueue(newQueue, 'delete', 'usage_logs', { id: u.id });

    set({
      crops: updatedCrops,
      harvests: updatedHarvests,
      expenses: updatedExpenses,
      usageLogs: updatedUsageLogs,
      activeCropId: updatedCrops.find(c => c.status === 'active')?.id ?? null,
      syncQueue: newQueue,
    });
    saveLocal(get());
    bgDelete('crops', id, authUser?.id, queueEntryIdFor(newQueue, 'crops', id));
    for (const h of orphanHarvests) bgDelete('harvests', h.id, authUser?.id, queueEntryIdFor(newQueue, 'harvests', h.id));
    for (const e of orphanExpenses) bgDelete('expenses', e.id, authUser?.id, queueEntryIdFor(newQueue, 'expenses', e.id));
    for (const u of orphanUsageLogs) bgDelete('usage_logs', u.id, authUser?.id, queueEntryIdFor(newQueue, 'usage_logs', u.id));
  },

  // ── Inventory ────────────────────────────────────────────────────────────────
  addInventory: (item) => {
    const { inventory, syncQueue, expenses, activeCropId, authUser } = get();
    const newItem: InventoryItem = { ...item, id: newId('inv'), tenant_id: 'tenant-1', created_at: new Date().toISOString() };
    const finalInventory = [newItem, ...inventory];
    let newQueue = addToQueue(syncQueue, 'insert', 'inventory', newItem);
    let finalExpenses = expenses;
    let pairedExpense: Expense | null = null;

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
      pairedExpense = newExpense;
    }

    set({ inventory: finalInventory, expenses: finalExpenses, syncQueue: newQueue });
    saveLocal(get());
    bgUpsert('inventory', newItem, authUser?.id, queueEntryIdFor(newQueue, 'inventory', newItem.id));
    if (pairedExpense) bgUpsert('expenses', pairedExpense, authUser?.id, queueEntryIdFor(newQueue, 'expenses', pairedExpense.id));
  },

  updateInventory: (id, updates) => {
    const { inventory, expenses, syncQueue, authUser } = get();
    const existing = inventory.find(i => i.id === id);
    if (!existing) return;
    let finalUpdates = { ...updates };
    // When purchased_qty changes and remaining_qty is not explicitly provided,
    // shift remaining_qty by the same delta so relative stock level is preserved.
    if (existing && updates.purchased_qty !== undefined && updates.purchased_qty !== existing.purchased_qty && updates.remaining_qty === undefined) {
      const delta = updates.purchased_qty - existing.purchased_qty;
      finalUpdates.remaining_qty = parseFloat(Math.max(0, existing.remaining_qty + delta).toFixed(2));
    }
    const updated = inventory.map(i => i.id === id ? { ...i, ...finalUpdates } : i);
    const updatedItem = updated.find(i => i.id === id);
    let newQueue = addToQueue(syncQueue, 'update', 'inventory', updatedItem);

    // Keep the auto-generated 'inventory'-category expense (created by
    // addInventory) in sync when price or purchased_qty changed — otherwise
    // every report's cost figures drift permanently after an edit.
    let updatedExpenses = expenses;
    let refreshedExpense: Expense | null = null;
    const priceChanged = existing && updatedItem && updatedItem.price !== existing.price;
    const qtyChanged = existing && updatedItem && updatedItem.purchased_qty !== existing.purchased_qty;
    if (existing && updatedItem && (priceChanged || qtyChanged)) {
      const sameSecond = existing.created_at.substring(0, 19);
      const pairedExpense = expenses.find(e =>
        e.category === 'inventory' && (
          e.notes.includes(existing.name) ||
          e.created_at.substring(0, 19) === sameSecond
        )
      );
      if (pairedExpense) {
        refreshedExpense = {
          ...pairedExpense,
          amount: updatedItem.price,
          notes: `Purchased ${updatedItem.purchased_qty} ${updatedItem.unit} of ${updatedItem.name} (${updatedItem.brand})`,
        };
        updatedExpenses = expenses.map(e => e.id === pairedExpense.id ? refreshedExpense! : e);
        newQueue = addToQueue(newQueue, 'update', 'expenses', refreshedExpense);
      }
    }

    set({ inventory: updated, expenses: updatedExpenses, syncQueue: newQueue });
    saveLocal(get());
    if (updatedItem) bgUpsert('inventory', updatedItem, authUser?.id, queueEntryIdFor(newQueue, 'inventory', updatedItem.id));
    if (refreshedExpense) bgUpsert('expenses', refreshedExpense, authUser?.id, queueEntryIdFor(newQueue, 'expenses', refreshedExpense.id));
  },

  deleteInventory: (id) => {
    const { inventory, usageLogs, syncQueue, authUser } = get();
    let newQueue = addToQueue(syncQueue, 'delete', 'inventory', { id });
    // Null out the foreign-key reference in every usage_log that pointed at
    // this inventory item — otherwise the logs keep a dangling inventory_id
    // that the UI can't resolve and Supabase FK constraints would reject.
    const affectedLogs = usageLogs.filter(l => l.inventory_id === id);
    const cleanedLogs = affectedLogs.map(l => ({ ...l, inventory_id: null }));
    const updatedLogs = usageLogs.map(l =>
      l.inventory_id === id ? { ...l, inventory_id: null } : l
    );
    for (const cleaned of cleanedLogs) {
      newQueue = addToQueue(newQueue, 'update', 'usage_logs', cleaned);
    }
    set({ inventory: inventory.filter(i => i.id !== id), usageLogs: updatedLogs, syncQueue: newQueue });
    saveLocal(get());
    bgDelete('inventory', id, authUser?.id, queueEntryIdFor(newQueue, 'inventory', id));
    for (const cleaned of cleanedLogs) bgUpsert('usage_logs', cleaned, authUser?.id, queueEntryIdFor(newQueue, 'usage_logs', cleaned.id));
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

    let deductedItem: InventoryItem | undefined;
    if (logData.inventory_id) {
      deductedItem = updatedInventory.find(i => i.id === logData.inventory_id);
      newQueue = addToQueue(newQueue, 'update', 'inventory', deductedItem);
    }

    set({ usageLogs: [newLog, ...usageLogs], inventory: updatedInventory, syncQueue: newQueue });
    saveLocal(get());
    bgUpsert('usage_logs', newLog, authUser?.id, queueEntryIdFor(newQueue, 'usage_logs', newLog.id));
    if (deductedItem) bgUpsert('inventory', deductedItem, authUser?.id, queueEntryIdFor(newQueue, 'inventory', deductedItem.id));
  },

  deleteUsageLog: (id) => {
    const { usageLogs, inventory, syncQueue, authUser } = get();
    const log = usageLogs.find(l => l.id === id);
    if (!log) return;
    let updatedInventory = inventory;
    let newQueue = syncQueue;

    let refunded: InventoryItem | undefined;
    if (log.inventory_id) {
      updatedInventory = inventory.map(i =>
        i.id === log.inventory_id
          ? { ...i, remaining_qty: parseFloat((i.remaining_qty + log.quantity_used).toFixed(2)) }
          : i
      );
      refunded = updatedInventory.find(i => i.id === log.inventory_id);
      newQueue = addToQueue(newQueue, 'update', 'inventory', refunded);
    }

    newQueue = addToQueue(newQueue, 'delete', 'usage_logs', { id });
    set({ usageLogs: usageLogs.filter(l => l.id !== id), inventory: updatedInventory, syncQueue: newQueue });
    saveLocal(get());
    bgDelete('usage_logs', id, authUser?.id, queueEntryIdFor(newQueue, 'usage_logs', id));
    if (refunded) bgUpsert('inventory', refunded, authUser?.id, queueEntryIdFor(newQueue, 'inventory', refunded.id));
  },

  // ── Harvest ──────────────────────────────────────────────────────────────────
  addHarvest: (harvestData) => {
    const { harvests, syncQueue, authUser } = get();
    const revenue = parseFloat(harvestData.mandi_rate.toFixed(2));
    const newHarvest: Harvest = { ...harvestData, id: newId('har'), tenant_id: 'tenant-1', revenue, created_at: new Date().toISOString() };
    const newQueue = addToQueue(syncQueue, 'insert', 'harvests', newHarvest);
    set({ harvests: [newHarvest, ...harvests], syncQueue: newQueue });
    saveLocal(get());
    bgUpsert('harvests', newHarvest, authUser?.id, queueEntryIdFor(newQueue, 'harvests', newHarvest.id));
  },

  deleteHarvest: (id) => {
    const { harvests, syncQueue, authUser } = get();
    const newQueue = addToQueue(syncQueue, 'delete', 'harvests', { id });
    set({ harvests: harvests.filter(h => h.id !== id), syncQueue: newQueue });
    saveLocal(get());
    bgDelete('harvests', id, authUser?.id, queueEntryIdFor(newQueue, 'harvests', id));
  },

  // ── Expenses ─────────────────────────────────────────────────────────────────
  addExpense: (expenseData) => {
    const { expenses, syncQueue, authUser } = get();
    const newExpense: Expense = { ...expenseData, id: newId('exp'), tenant_id: 'tenant-1', created_at: new Date().toISOString() };
    const newQueue = addToQueue(syncQueue, 'insert', 'expenses', newExpense);
    set({ expenses: [newExpense, ...expenses], syncQueue: newQueue });
    saveLocal(get());
    bgUpsert('expenses', newExpense, authUser?.id, queueEntryIdFor(newQueue, 'expenses', newExpense.id));
  },

  updateExpense: (id, updates) => {
    const { expenses, syncQueue, authUser } = get();
    const target = expenses.find(e => e.id === id);
    if (!target) return;
    const updated = expenses.map(e => e.id === id ? { ...e, ...updates } : e);
    const updatedItem = updated.find(e => e.id === id);
    const newQueue = addToQueue(syncQueue, 'update', 'expenses', updatedItem);
    set({ expenses: updated, syncQueue: newQueue });
    saveLocal(get());
    if (updatedItem) bgUpsert('expenses', updatedItem, authUser?.id, queueEntryIdFor(newQueue, 'expenses', updatedItem.id));
  },

  deleteExpense: (id) => {
    const { expenses, syncQueue, authUser } = get();
    const newQueue = addToQueue(syncQueue, 'delete', 'expenses', { id });
    set({ expenses: expenses.filter(e => e.id !== id), syncQueue: newQueue });
    saveLocal(get());
    bgDelete('expenses', id, authUser?.id, queueEntryIdFor(newQueue, 'expenses', id));
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
      tenant_id: 'tenant-1', vpd: calculatedVpd,
      // Preserve the original created_at when updating an existing date's log so
      // its sort position / merge timestamp doesn't jump on every edit.
      created_at: existingIndex >= 0 ? weatherLogs[existingIndex].created_at : new Date().toISOString(),
    };

    if (existingIndex >= 0) { updatedLogs[existingIndex] = newLog; actionType = 'update'; }
    else { updatedLogs = [newLog, ...updatedLogs]; }

    const newQueue = addToQueue(syncQueue, actionType, 'weather_logs', newLog);
    set({ weatherLogs: updatedLogs, syncQueue: newQueue });
    saveLocal(get());
    bgUpsert('weather_logs', newLog, authUser?.id, queueEntryIdFor(newQueue, 'weather_logs', newLog.id));
  },

  deleteWeatherLog: (id) => {
    const { weatherLogs, syncQueue, authUser } = get();
    const updated = weatherLogs.filter(l => l.id !== id);
    const newQueue = addToQueue(syncQueue, 'delete', 'weather_logs', { id });
    set({ weatherLogs: updated, syncQueue: newQueue });
    saveLocal(get());
    bgDelete('weather_logs', id, authUser?.id, queueEntryIdFor(newQueue, 'weather_logs', id));
  },

  // ── Settings ─────────────────────────────────────────────────────────────────
  updateSettings: (updates) => {
    // Settings are intentionally local-only (no Supabase `settings` table).
    // farmProfile / widgetOrder / module toggles persist via localStorage and
    // are NOT queued for sync — that means they don't roam across devices, but
    // it avoids polluting syncQueue with entries the drain/pull path has no
    // table to write to.
    const { settings } = get();
    const finalSettings = { ...settings, ...updates };
    set({ settings: finalSettings });
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
    if (!Number.isFinite(area) || area <= 0) return;
    if (!Number.isFinite(numPlants) || numPlants <= 0) return;
    const { crops, activeCropId, syncQueue, authUser } = get();
    if (!activeCropId) return;
    const target = crops.find(c => c.id === activeCropId);
    if (!target) return;
    const updated = crops.map(c => c.id === activeCropId ? { ...c, area_covered: area, num_plants: numPlants } : c);
    const updatedCrop = updated.find(c => c.id === activeCropId);
    const newQueue = addToQueue(syncQueue, 'update', 'crops', updatedCrop);
    set({ crops: updated, syncQueue: newQueue });
    saveLocal(get());
    if (updatedCrop) bgUpsert('crops', updatedCrop, authUser?.id, queueEntryIdFor(newQueue, 'crops', updatedCrop.id));
  },
}));
