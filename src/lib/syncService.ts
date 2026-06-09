// ─────────────────────────────────────────────────────────────────────────────
// SYNC ARCHITECTURE — read this before changing anything in the sync layer.
//
// This file is the low-level Supabase I/O layer. The high-level orchestration
// lives in src/store/useAppStore.ts. Together they implement an offline-first,
// queue-drained, single-flight reconcile model. The pieces:
//
// 1. MUTATIONS (store actions) are the only writers of local state. Each one:
//      a. updates Zustand + localStorage immediately (optimistic),
//      b. appends ONE op to `syncQueue` (the durable record of un-confirmed
//         writes), capturing that entry's id,
//      c. fires an optimistic bgUpsert/bgDelete that, on SUCCESS, removes its
//         own queue entry. The queue therefore drains entry-by-entry — there is
//         no periodic "push the whole dataset" anymore.
//
// 2. THE SYNC QUEUE is the source of truth for "what still needs to reach the
//    cloud". It is capped (FIFO) but eviction keeps delete ops preferentially,
//    because a dropped delete silently resurrects data while a dropped
//    insert/update is re-derivable from local state via forceSync.
//
// 3. pullFromSupabase IS THE SINGLE RECONCILE PATH. It is single-flight (a
//    module-level in-flight promise coalesces concurrent callers — bootstrap,
//    SIGNED_IN, the online listener, and the 30s retry can all call it safely).
//    Order matters:
//      Step 1: drainQueue() — push pending ops. This runs INDEPENDENTLY of the
//              read step, so a failed table read can never block the push.
//      Step 2: pullAllData() — fetches every table INDEPENDENTLY via
//              Promise.allSettled; each table reports its own `ok` flag.
//      Step 3: per-record merge, only for tables whose read succeeded:
//                - cloud-only id      → add it, unless a local delete is pending
//                - id in both         → if the id has ANY pending queue op, keep
//                                       local (un-synced edit wins); otherwise
//                                       the newer recordTimestamp() wins
//                - local-only id      → keep (pulls never delete; deletes flow
//                                       only through the queue)
//              Tables whose read failed are left entirely untouched.
//
// 4. CONFLICTS use recordTimestamp() = updated_at ?? created_at. NOTE: the
//    schema currently has no `updated_at` column, so this degrades to
//    created_at (which does not change on update). The pending-queue guard
//    above is what actually prevents un-synced local edits from being
//    clobbered today. Adding an `updated_at` column (DB migration + type +
//    setting it on every write) would make multi-device newer-wins fully
//    effective with NO change to this merge logic.
//
// Invariants to preserve:
//   - A read error must never abort the push (Step 1 before Step 2).
//   - Never overwrite/remove a local record that has a pending queue op.
//   - Never delete a local record during a pull.
//   - pullFromSupabase must remain single-flight.
// ─────────────────────────────────────────────────────────────────────────────
import type { Crop, InventoryItem, UsageLog, Harvest, Expense, WeatherLog } from '../db/types';
import { supabase } from './supabase';

type AnyRecord = Record<string, unknown>;

// Conflict-resolution timestamp for a record. Prefers updated_at (not yet in
// the schema — see architecture note) and falls back to created_at.
export function recordTimestamp(r: AnyRecord): string {
  const updated = r.updated_at;
  const created = r.created_at;
  if (typeof updated === 'string') return updated;
  if (typeof created === 'string') return created;
  return '';
}

// Per-table column allowlist — must match the Supabase table schemas. Any key
// present on the local object but missing from this list is stripped before
// the upsert so it can't trigger a 400 ("column does not exist"). When you add
// a column to a Supabase table via migration, add it here too.
const TABLE_COLUMNS: Record<string, ReadonlyArray<string>> = {
  crops:        ['id', 'user_id', 'name', 'variety', 'seed_company', 'start_date', 'transplant_date', 'expected_end_date', 'end_date', 'area_covered', 'num_plants', 'seed_nursery_cost', 'target_yield_kg', 'notes', 'status', 'created_at'],
  inventory:    ['id', 'user_id', 'name', 'brand', 'category', 'unit', 'purchased_qty', 'remaining_qty', 'price', 'purchase_date', 'supplier', 'low_stock_threshold', 'notes', 'image_url', 'created_at'],
  usage_logs:   ['id', 'user_id', 'crop_id', 'date', 'inventory_id', 'product_name', 'quantity_used', 'unit', 'area_treated', 'cost', 'type', 'notes', 'repeat_schedule', 'repeat_interval_days', 'created_at'],
  harvests:     ['id', 'user_id', 'crop_id', 'date', 'weight_total', 'weight_grade_a', 'weight_grade_b', 'weight_grade_c', 'wastage', 'buyer_name', 'mandi_rate', 'sale_rate', 'revenue', 'notes', 'image_url', 'created_at'],
  expenses:     ['id', 'user_id', 'crop_id', 'date', 'category', 'amount', 'notes', 'created_at'],
  weather_logs: ['id', 'user_id', 'date', 'temp', 'humidity', 'rainfall', 'wind', 'aqi', 'uv_index', 'sunrise', 'sunset', 'vpd', 'dew_point', 'temp_min', 'temp_max', 'created_at'],
  photo_journal: ['id', 'user_id', 'storage_path', 'public_url', 'caption', 'category', 'photo_date', 'crop_id', 'created_at', 'updated_at'],
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toDbRow(obj: AnyRecord, table: string, userId: string): AnyRecord {
  // Strip tenant_id (client-only synthetic field), add user_id, then restrict
  // to the column allowlist for this table. Also drops undefined values so
  // optional fields don't end up as JSON `null` in unexpected places.
  const { tenant_id: _t, ...rest } = obj;
  const withUser: AnyRecord = { ...rest, user_id: userId };

  const allowed = TABLE_COLUMNS[table];
  const out: AnyRecord = {};
  const source = allowed ?? Object.keys(withUser);
  for (const key of source) {
    const v = withUser[key];
    if (v !== undefined) out[key] = v;
  }
  return out;
}

function fromDbRow<T>(row: AnyRecord): T {
  const { user_id: _u, ...rest } = row;
  return { ...rest, tenant_id: 'tenant-1' } as T;
}

function logSupabaseError(op: 'upsert' | 'delete' | 'pull', table: string, error: { message?: string; code?: string; details?: string; hint?: string }, extra: AnyRecord): void {
  console.error(
    `[Sync] Supabase ${op} failed for ${table}:`,
    `\n  message: ${error.message ?? '(none)'}`,
    `\n  code:    ${error.code ?? '(none)'}`,
    `\n  details: ${error.details ?? '(none)'}`,
    `\n  hint:    ${error.hint ?? '(none)'}`,
    extra,
  );
}

// Per-table fetch result. `ok` is false when that table's read errored OR the
// network rejected — callers must skip merging a table whose ok is false so a
// single failing table never wipes or blocks the others.
export interface TableResult<T> {
  rows: T[];
  ok: boolean;
}

// Fetch one table independently. supabase-js resolves with { data, error }
// rather than rejecting, but we also guard against a thrown/rejected network
// error so a single table can fail in isolation.
async function fetchTable<T>(table: string, userId: string): Promise<TableResult<T>> {
  try {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) {
      logSupabaseError('pull', table, error, {});
      return { rows: [], ok: false };
    }
    return { rows: (data ?? []).map(r => fromDbRow<T>(r as AnyRecord)), ok: true };
  } catch (e) {
    console.error(`[Sync] Network error fetching ${table}:`, e);
    return { rows: [], ok: false };
  }
}

export interface PullResult {
  crops: TableResult<Crop>;
  inventory: TableResult<InventoryItem>;
  usageLogs: TableResult<UsageLog>;
  harvests: TableResult<Harvest>;
  expenses: TableResult<Expense>;
  weatherLogs: TableResult<WeatherLog>;
}

// Fetch every table INDEPENDENTLY (Promise.allSettled). One table failing
// leaves its result as { rows: [], ok: false } and never affects the others.
export async function pullAllData(userId: string): Promise<PullResult> {
  const [crops, inventory, usageLogs, harvests, expenses, weatherLogs] = await Promise.allSettled([
    fetchTable<Crop>('crops', userId),
    fetchTable<InventoryItem>('inventory', userId),
    fetchTable<UsageLog>('usage_logs', userId),
    fetchTable<Harvest>('harvests', userId),
    fetchTable<Expense>('expenses', userId),
    fetchTable<WeatherLog>('weather_logs', userId),
  ]);

  const unwrap = <T>(r: PromiseSettledResult<TableResult<T>>): TableResult<T> =>
    r.status === 'fulfilled' ? r.value : { rows: [], ok: false };

  return {
    crops: unwrap(crops),
    inventory: unwrap(inventory),
    usageLogs: unwrap(usageLogs),
    harvests: unwrap(harvests),
    expenses: unwrap(expenses),
    weatherLogs: unwrap(weatherLogs),
  };
}

export async function upsertRow(table: string, obj: AnyRecord): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error(`[Sync] No active session — cannot write to ${table}`);
  const row = toDbRow(obj, table, user.id);

  // Surface non-UUID ids early — Supabase rejects them on uuid columns with a
  // cryptic 400 ("invalid input syntax for type uuid"). This usually means a
  // mock-data row (e.g. 'crop-active-1') leaked into the sync queue.
  const id = row.id;
  if (typeof id === 'string' && !UUID_RE.test(id)) {
    console.warn(`[Sync] Row id for ${table} is not a UUID: "${id}". This will likely be rejected by Supabase.`);
  }

  const { error } = await supabase.from(table).upsert(row, { onConflict: 'id' });
  if (error) {
    logSupabaseError('upsert', table, error, { payload: row });
    throw error;
  }
}

export async function deleteRow(table: string, id: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error(`[Sync] No active session — cannot delete from ${table}`);
  // Scope the delete to BOTH id and user_id — defense-in-depth so a single RLS
  // policy gap can never let one user delete another user's row by id.
  const { error } = await supabase.from(table).delete().eq('id', id).eq('user_id', user.id);
  if (error) {
    logSupabaseError('delete', table, error, { id });
    throw error;
  }
}
